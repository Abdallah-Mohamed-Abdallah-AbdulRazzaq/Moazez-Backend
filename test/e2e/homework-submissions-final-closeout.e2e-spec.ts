import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  HomeworkAssignmentMode,
  HomeworkAssignmentStatus,
  HomeworkTargetMode,
  MembershipStatus,
  OrganizationStatus,
  Prisma,
  PrismaClient,
  SchoolStatus,
  StudentEnrollmentStatus,
  StudentStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { BullmqService } from '../../src/infrastructure/queue/bullmq.service';

const GLOBAL_PREFIX = '/api/v1';
const PASSWORD = 'Sprint14E123!';
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

type ExpressLayer = {
  route?: {
    path?: string | string[];
    methods?: Record<string, boolean>;
  };
  handle?: {
    stack?: ExpressLayer[];
  };
};

type AuthTokens = {
  accessToken: string;
  refreshToken: string;
};

type AcademicBase = {
  academicYearId: string;
  termId: string;
  stageId: string;
  gradeId: string;
  sectionId: string;
};

type ClassroomPlacement = {
  classroomId: string;
  subjectId: string;
  allocationId: string;
};

type SideEffectCounts = {
  gradeAssessments: number;
  gradeItems: number;
  gradeSubmissions: number;
  gradeSubmissionAnswers: number;
  communicationNotifications: number;
  xpLedgerEntries: number;
  rewardRedemptions: number;
  files: number;
  attachments: number;
};

jest.setTimeout(180000);

describe('Sprint 14E Homework Submissions final closeout (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;

  let organizationId = '';
  let schoolId = '';
  let teacherUserId = '';
  let studentUserId = '';
  let parentUserId = '';
  let teacherEmail = '';
  let studentEmail = '';
  let parentEmail = '';
  let academic: AcademicBase;
  let placement: ClassroomPlacement;
  let studentId = '';
  let enrollmentId = '';
  let guardianId = '';
  let reviewedHomeworkId = '';
  let reviewedTargetId = '';
  let lateHomeworkId = '';
  let lateTargetId = '';
  let reviewedSubmissionId = '';
  let lateSubmissionId = '';
  let teacherAuth: AuthTokens;
  let studentAuth: AuthTokens;
  let parentAuth: AuthTokens;

  const suffix = randomUUID().split('-')[0];
  const marker = `s14e-${suffix}`;
  const createdOrganizationIds: string[] = [];
  const createdSchoolIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdHomeworkAssignmentIds: string[] = [];
  const createdHomeworkTargetIds: string[] = [];
  const createdHomeworkSubmissionIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const [teacherRole, studentRole, parentRole] = await Promise.all([
      findSystemRole('teacher'),
      findSystemRole('student'),
      findSystemRole('parent'),
    ]);

    organizationId = await createOrganization();
    schoolId = await createSchool(organizationId);
    academic = await createAcademicBase(schoolId);

    teacherEmail = `${marker}-teacher@example.test`;
    studentEmail = `${marker}-student@example.test`;
    parentEmail = `${marker}-parent@example.test`;

    teacherUserId = await createUserWithMembership({
      email: teacherEmail,
      firstName: 'Sprint14E',
      lastName: 'Teacher',
      userType: UserType.TEACHER,
      roleId: teacherRole.id,
    });
    studentUserId = await createUserWithMembership({
      email: studentEmail,
      firstName: 'Sprint14E',
      lastName: 'Student',
      userType: UserType.STUDENT,
      roleId: studentRole.id,
    });
    parentUserId = await createUserWithMembership({
      email: parentEmail,
      firstName: 'Sprint14E',
      lastName: 'Parent',
      userType: UserType.PARENT,
      roleId: parentRole.id,
    });

    placement = await createClassroomPlacement({
      schoolId,
      academic,
      teacherUserId,
    });

    const student = await createStudentWithEnrollment({
      schoolId,
      organizationId,
      academic,
      classroomId: placement.classroomId,
      studentUserId,
    });
    studentId = student.studentId;
    enrollmentId = student.enrollmentId;

    guardianId = await createGuardian();
    await linkGuardian(guardianId, studentId);

    const reviewedHomework = await createPublishedHomework({
      marker: 'reviewed-flow',
      dueAt: new Date('2030-05-25T12:00:00.000Z'),
      isGraded: true,
      totalMarks: new Prisma.Decimal(10),
    });
    reviewedHomeworkId = reviewedHomework.homeworkId;
    reviewedTargetId = reviewedHomework.targetId;

    const lateHomework = await createPublishedHomework({
      marker: 'late-flow',
      dueAt: new Date('2026-01-01T12:00:00.000Z'),
      isGraded: false,
      totalMarks: null,
    });
    lateHomeworkId = lateHomework.homeworkId;
    lateTargetId = lateHomework.targetId;

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(BullmqService)
      .useValue(createNoopBullmqService())
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: false },
      }),
    );
    await app.init();

    teacherAuth = await login(teacherEmail);
    studentAuth = await login(studentEmail);
    parentAuth = await login(parentEmail);
  });

  afterAll(async () => {
    try {
      if (app) await app.close();
      await cleanupCloseoutData();
    } finally {
      if (prisma) await prisma.$disconnect();
    }
  });

  it('registers completed submission routes and keeps deferred Homework routes absent', () => {
    const routes = listRegisteredRoutes();

    expect(routes).toEqual(
      expect.arrayContaining([
        'GET /api/v1/student/homeworks/:homeworkId/submission',
        'PUT /api/v1/student/homeworks/:homeworkId/submission',
        'POST /api/v1/student/homeworks/:homeworkId/submit',
        'GET /api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/submissions',
        'GET /api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/submissions/:submissionId',
        'POST /api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/submissions/:submissionId/review',
        'GET /api/v1/parent/children/:studentId/homeworks/:homeworkId',
      ]),
    );

    for (const absentRoute of [
      'POST /api/v1/parent/children/:studentId/homeworks/:homeworkId/submit',
      'POST /api/v1/parent/children/:studentId/homeworks/:homeworkId/submission/submit',
      'PUT /api/v1/parent/children/:studentId/homeworks/:homeworkId/submission',
      'PATCH /api/v1/parent/children/:studentId/homeworks/:homeworkId/submission',
      'POST /api/v1/student/homeworks/:homeworkId/files',
      'POST /api/v1/student/homeworks/:homeworkId/attachments',
      'POST /api/v1/student/homeworks/:homeworkId/proof',
      'GET /api/v1/student/homeworks/:homeworkId/questions',
      'POST /api/v1/student/homeworks/:homeworkId/answers',
      'GET /api/v1/parent/children/:studentId/homeworks/:homeworkId/questions',
      'GET /api/v1/parent/children/:studentId/homeworks/:homeworkId/attachments',
      'POST /api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/questions',
      'POST /api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/attachments',
      'GET /api/v1/homework/assignments/:homeworkId/submissions',
      'GET /api/v1/homework/assignments/:homeworkId/submissions/:submissionId',
      'POST /api/v1/homework/assignments/:homeworkId/submissions/:submissionId/review',
      'POST /api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/submissions/:submissionId/sync-grade-item',
      'POST /api/v1/homework/assignments/:homeworkId/submissions/:submissionId/sync-grade-item',
      'POST /api/v1/homework/assignments/:homeworkId/notifications',
      'POST /api/v1/homework/assignments/:homeworkId/xp',
      'POST /api/v1/homework/assignments/:homeworkId/rewards',
      'GET /api/v1/student/pickup',
      'GET /api/v1/parent/pickup',
      'GET /api/v1/parent/smart-pickup',
    ]) {
      expect(routes).not.toContain(absentRoute);
    }

    for (const route of routes) {
      expect(route).not.toMatch(
        /^.+ \/api\/v1\/homework\/.*(question|answer|attachment|file|proof|upload|grade-sync|sync-grade|notification|xp|reward)/,
      );
      expect(route).not.toMatch(
        /^.+ \/api\/v1\/student\/homeworks\/.*(question|answer|attachment|file|proof|upload|grade-sync|sync-grade|notification|xp|reward|pickup|smart-pickup)/,
      );
      expect(route).not.toMatch(
        /^.+ \/api\/v1\/parent\/children\/:studentId\/homeworks\/.*(submit|submission\/submit|question|answer|attachment|file|proof|upload|grade-sync|sync-grade|notification|xp|reward|pickup|smart-pickup)/,
      );
      expect(route).not.toMatch(
        /^.+ \/api\/v1\/teacher\/homeworks\/.*(question|answer|attachment|file|proof|upload|grade-sync|sync-grade|notification|xp|reward|pickup|smart-pickup)/,
      );
    }
  });

  it('covers student submit, teacher review, parent visibility, sanitization, and deferred side effects', async () => {
    const beforeSideEffects = await countDeferredSideEffects();

    const draft = await request(app.getHttpServer())
      .put(
        `${GLOBAL_PREFIX}/student/homeworks/${reviewedHomeworkId}/submission`,
      )
      .set('Authorization', bearer(studentAuth))
      .send({ bodyText: '  Student draft answer for Sprint 14E.  ' })
      .expect(200);

    expect(draft.body.submission).toMatchObject({
      homeworkId: reviewedHomeworkId,
      status: 'draft',
      bodyText: 'Student draft answer for Sprint 14E.',
      submittedAt: null,
      reviewedAt: null,
      reviewNote: null,
      awardedMarks: null,
    });
    expectSafeAppPayload(draft.body);

    const currentDraft = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/student/homeworks/${reviewedHomeworkId}/submission`,
      )
      .set('Authorization', bearer(studentAuth))
      .expect(200);

    expect(currentDraft.body.submission).toMatchObject({
      id: draft.body.submission.id,
      status: 'draft',
      bodyText: 'Student draft answer for Sprint 14E.',
    });
    expectSafeAppPayload(currentDraft.body);

    const submitted = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/student/homeworks/${reviewedHomeworkId}/submit`)
      .set('Authorization', bearer(studentAuth))
      .send({})
      .expect(200);

    reviewedSubmissionId = submitted.body.submission.id;
    createdHomeworkSubmissionIds.push(reviewedSubmissionId);
    expect(submitted.body.submission).toMatchObject({
      id: reviewedSubmissionId,
      homeworkId: reviewedHomeworkId,
      status: 'submitted',
      bodyText: 'Student draft answer for Sprint 14E.',
      reviewNote: null,
      awardedMarks: null,
    });
    expect(submitted.body.submission.submittedAt).toEqual(expect.any(String));
    expectSafeAppPayload(submitted.body);

    const late = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/student/homeworks/${lateHomeworkId}/submit`)
      .set('Authorization', bearer(studentAuth))
      .send({ bodyText: 'Late closeout answer.' })
      .expect(200);

    lateSubmissionId = late.body.submission.id;
    createdHomeworkSubmissionIds.push(lateSubmissionId);
    expect(late.body.submission).toMatchObject({
      id: lateSubmissionId,
      homeworkId: lateHomeworkId,
      status: 'late',
      bodyText: 'Late closeout answer.',
    });
    expectSafeAppPayload(late.body);

    const submissions = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/teacher/homeworks/classes/${placement.allocationId}/assignments/${reviewedHomeworkId}/submissions`,
      )
      .set('Authorization', bearer(teacherAuth))
      .expect(200);

    expect(submissions.body.submissions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: reviewedSubmissionId,
          homeworkId: reviewedHomeworkId,
          targetId: reviewedTargetId,
          status: 'submitted',
          bodyText: 'Student draft answer for Sprint 14E.',
          student: expect.objectContaining({
            id: studentId,
            displayName: 'Sprint14E Student',
          }),
        }),
      ]),
    );
    expectSafeAppPayload(submissions.body);

    const lateSubmissions = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/teacher/homeworks/classes/${placement.allocationId}/assignments/${lateHomeworkId}/submissions`,
      )
      .query({ status: 'late' })
      .set('Authorization', bearer(teacherAuth))
      .expect(200);

    expect(lateSubmissions.body.submissions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: lateSubmissionId,
          homeworkId: lateHomeworkId,
          targetId: lateTargetId,
          status: 'late',
          isLate: true,
        }),
      ]),
    );
    expectSafeAppPayload(lateSubmissions.body);

    const submissionDetail = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/teacher/homeworks/classes/${placement.allocationId}/assignments/${reviewedHomeworkId}/submissions/${reviewedSubmissionId}`,
      )
      .set('Authorization', bearer(teacherAuth))
      .expect(200);

    expect(submissionDetail.body.submission).toMatchObject({
      id: reviewedSubmissionId,
      status: 'submitted',
      totalMarks: 10,
      awardedMarks: null,
      isLate: false,
    });
    expectSafeAppPayload(submissionDetail.body);

    await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/teacher/homeworks/classes/${placement.allocationId}/assignments/${reviewedHomeworkId}/submissions/${reviewedSubmissionId}/review`,
      )
      .set('Authorization', bearer(studentAuth))
      .send({ reviewNote: 'Students cannot review homework.', awardedMarks: 8 })
      .expect(403);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/student/homeworks/${reviewedHomeworkId}/submit`)
      .set('Authorization', bearer(teacherAuth))
      .send({ bodyText: 'Teachers cannot submit as students.' })
      .expect(403);

    const reviewed = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/teacher/homeworks/classes/${placement.allocationId}/assignments/${reviewedHomeworkId}/submissions/${reviewedSubmissionId}/review`,
      )
      .set('Authorization', bearer(teacherAuth))
      .send({ reviewNote: 'Solid closeout answer.', awardedMarks: 8 })
      .expect(200);

    expect(reviewed.body.submission).toMatchObject({
      id: reviewedSubmissionId,
      homeworkId: reviewedHomeworkId,
      targetId: reviewedTargetId,
      status: 'reviewed',
      bodyText: 'Student draft answer for Sprint 14E.',
      reviewNote: 'Solid closeout answer.',
      awardedMarks: 8,
      totalMarks: 10,
    });
    expect(reviewed.body.submission.reviewedAt).toEqual(expect.any(String));
    expectSafeAppPayload(reviewed.body);

    const studentDetail = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/homeworks/${reviewedHomeworkId}`)
      .set('Authorization', bearer(studentAuth))
      .expect(200);

    expect(studentDetail.body.homework).toMatchObject({
      homeworkId: reviewedHomeworkId,
      targetStatus: 'reviewed',
      submission: {
        id: reviewedSubmissionId,
        homeworkId: reviewedHomeworkId,
        status: 'reviewed',
        bodyText: 'Student draft answer for Sprint 14E.',
        reviewNote: 'Solid closeout answer.',
        awardedMarks: 8,
      },
    });
    expect(studentDetail.body.homework.submission.reviewedAt).toEqual(
      expect.any(String),
    );
    expectSafeStudentOrParentPayload(studentDetail.body);

    const parentDetail = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/parent/children/${studentId}/homeworks/${reviewedHomeworkId}`,
      )
      .set('Authorization', bearer(parentAuth))
      .expect(200);

    expect(parentDetail.body.homework).toMatchObject({
      homeworkId: reviewedHomeworkId,
      child: {
        studentId,
        displayName: 'Sprint14E Student',
      },
      targetStatus: 'reviewed',
      submission: {
        id: reviewedSubmissionId,
        status: 'reviewed',
        bodyText: 'Student draft answer for Sprint 14E.',
        reviewNote: 'Solid closeout answer.',
        awardedMarks: 8,
        totalMarks: 10,
      },
    });
    expect(parentDetail.body.homework.submission.reviewedAt).toEqual(
      expect.any(String),
    );
    expectSafeStudentOrParentPayload(parentDetail.body);

    for (const method of ['post', 'put', 'patch'] as const) {
      await request(app.getHttpServer())
        [
          method
        ](`${GLOBAL_PREFIX}/parent/children/${studentId}/homeworks/${reviewedHomeworkId}/submission`)
        .set('Authorization', bearer(parentAuth))
        .send({ bodyText: 'Parent submit remains deferred.' })
        .expect(404);
    }

    await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/parent/children/${studentId}/homeworks/${reviewedHomeworkId}/submit`,
      )
      .set('Authorization', bearer(parentAuth))
      .send({ bodyText: 'Parent submit remains deferred.' })
      .expect(404);

    const afterSideEffects = await countDeferredSideEffects();
    expect(afterSideEffects).toEqual(beforeSideEffects);
    expect(afterSideEffects).toEqual({
      gradeAssessments: 0,
      gradeItems: 0,
      gradeSubmissions: 0,
      gradeSubmissionAnswers: 0,
      communicationNotifications: 0,
      xpLedgerEntries: 0,
      rewardRedemptions: 0,
      files: 0,
      attachments: 0,
    });
  });

  async function findSystemRole(key: string): Promise<{ id: string }> {
    const role = await prisma.role.findFirst({
      where: { key, schoolId: null, isSystem: true, deletedAt: null },
      select: { id: true },
    });
    if (!role) throw new Error(`Missing system role: ${key}`);
    return role;
  }

  async function createOrganization(): Promise<string> {
    const organization = await prisma.organization.create({
      data: {
        slug: `${marker}-org`,
        name: `Sprint 14E Org ${suffix}`,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdOrganizationIds.push(organization.id);
    return organization.id;
  }

  async function createSchool(inputOrganizationId: string): Promise<string> {
    const school = await prisma.school.create({
      data: {
        organizationId: inputOrganizationId,
        slug: `${marker}-school`,
        name: `Sprint 14E School ${suffix}`,
        status: SchoolStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdSchoolIds.push(school.id);
    return school.id;
  }

  async function createUserWithMembership(params: {
    email: string;
    firstName: string;
    lastName: string;
    userType: UserType;
    roleId: string;
  }): Promise<string> {
    const user = await prisma.user.create({
      data: {
        email: params.email,
        firstName: params.firstName,
        lastName: params.lastName,
        userType: params.userType,
        status: UserStatus.ACTIVE,
        passwordHash: await argon2.hash(PASSWORD, ARGON2_OPTIONS),
      },
      select: { id: true },
    });
    createdUserIds.push(user.id);

    await prisma.membership.create({
      data: {
        userId: user.id,
        organizationId,
        schoolId,
        roleId: params.roleId,
        userType: params.userType,
        status: MembershipStatus.ACTIVE,
      },
    });

    return user.id;
  }

  async function createAcademicBase(
    inputSchoolId: string,
  ): Promise<AcademicBase> {
    const academicYear = await prisma.academicYear.create({
      data: {
        schoolId: inputSchoolId,
        nameAr: `${marker}-year-ar`,
        nameEn: `${marker}-year`,
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        endDate: new Date('2030-12-31T00:00:00.000Z'),
        isActive: true,
      },
      select: { id: true },
    });
    const term = await prisma.term.create({
      data: {
        schoolId: inputSchoolId,
        academicYearId: academicYear.id,
        nameAr: `${marker}-term-ar`,
        nameEn: `${marker}-term`,
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        endDate: new Date('2030-12-31T00:00:00.000Z'),
        isActive: true,
      },
      select: { id: true },
    });
    const stage = await prisma.stage.create({
      data: {
        schoolId: inputSchoolId,
        nameAr: `${marker}-stage-ar`,
        nameEn: `${marker}-stage`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    const grade = await prisma.grade.create({
      data: {
        schoolId: inputSchoolId,
        stageId: stage.id,
        nameAr: `${marker}-grade-ar`,
        nameEn: `${marker}-grade`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    const section = await prisma.section.create({
      data: {
        schoolId: inputSchoolId,
        gradeId: grade.id,
        nameAr: `${marker}-section-ar`,
        nameEn: `${marker}-section`,
        sortOrder: 1,
      },
      select: { id: true },
    });

    return {
      academicYearId: academicYear.id,
      termId: term.id,
      stageId: stage.id,
      gradeId: grade.id,
      sectionId: section.id,
    };
  }

  async function createClassroomPlacement(params: {
    schoolId: string;
    academic: AcademicBase;
    teacherUserId: string;
  }): Promise<ClassroomPlacement> {
    const classroom = await prisma.classroom.create({
      data: {
        schoolId: params.schoolId,
        sectionId: params.academic.sectionId,
        nameAr: `${marker}-classroom-ar`,
        nameEn: `${marker}-classroom`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    const subject = await prisma.subject.create({
      data: {
        schoolId: params.schoolId,
        nameAr: `${marker}-subject-ar`,
        nameEn: `${marker}-subject`,
        code: `S14E-${suffix}`,
        isActive: true,
      },
      select: { id: true },
    });
    const allocation = await prisma.teacherSubjectAllocation.create({
      data: {
        schoolId: params.schoolId,
        teacherUserId: params.teacherUserId,
        subjectId: subject.id,
        classroomId: classroom.id,
        termId: params.academic.termId,
      },
      select: { id: true },
    });

    return {
      classroomId: classroom.id,
      subjectId: subject.id,
      allocationId: allocation.id,
    };
  }

  async function createStudentWithEnrollment(params: {
    schoolId: string;
    organizationId: string;
    academic: AcademicBase;
    classroomId: string;
    studentUserId: string;
  }): Promise<{ studentId: string; enrollmentId: string }> {
    const student = await prisma.student.create({
      data: {
        schoolId: params.schoolId,
        organizationId: params.organizationId,
        userId: params.studentUserId,
        firstName: 'Sprint14E',
        lastName: 'Student',
        status: StudentStatus.ACTIVE,
      },
      select: { id: true },
    });
    const enrollment = await prisma.enrollment.create({
      data: {
        schoolId: params.schoolId,
        studentId: student.id,
        academicYearId: params.academic.academicYearId,
        termId: params.academic.termId,
        classroomId: params.classroomId,
        status: StudentEnrollmentStatus.ACTIVE,
        enrolledAt: new Date('2026-01-01T00:00:00.000Z'),
      },
      select: { id: true },
    });

    return { studentId: student.id, enrollmentId: enrollment.id };
  }

  async function createGuardian(): Promise<string> {
    const guardian = await prisma.guardian.create({
      data: {
        schoolId,
        organizationId,
        userId: parentUserId,
        firstName: 'Sprint14E',
        lastName: 'Guardian',
        phone: `${marker}-guardian-phone`,
        email: `${marker}-guardian@example.test`,
        relation: 'mother',
        isPrimary: true,
      },
      select: { id: true },
    });
    return guardian.id;
  }

  async function linkGuardian(
    inputGuardianId: string,
    inputStudentId: string,
  ): Promise<void> {
    await prisma.studentGuardian.create({
      data: {
        schoolId,
        guardianId: inputGuardianId,
        studentId: inputStudentId,
        isPrimary: true,
      },
    });
  }

  async function createPublishedHomework(params: {
    marker: string;
    dueAt: Date;
    isGraded: boolean;
    totalMarks: Prisma.Decimal | null;
  }): Promise<{ homeworkId: string; targetId: string }> {
    const homework = await prisma.homeworkAssignment.create({
      data: {
        schoolId,
        academicYearId: academic.academicYearId,
        termId: academic.termId,
        classroomId: placement.classroomId,
        subjectId: placement.subjectId,
        teacherUserId,
        teacherSubjectAllocationId: placement.allocationId,
        title: `${marker}-${params.marker}`,
        description: `${marker}-${params.marker}-description`,
        mode: HomeworkAssignmentMode.HOMEWORK,
        status: HomeworkAssignmentStatus.PUBLISHED,
        targetMode: HomeworkTargetMode.CLASSROOM,
        publishedAt: new Date('2026-05-01T08:00:00.000Z'),
        publishedByUserId: teacherUserId,
        dueAt: params.dueAt,
        totalMarks: params.totalMarks,
        isGraded: params.isGraded,
        createdByUserId: teacherUserId,
      },
      select: { id: true },
    });
    createdHomeworkAssignmentIds.push(homework.id);

    const target = await prisma.homeworkTarget.create({
      data: {
        schoolId,
        homeworkAssignmentId: homework.id,
        studentId,
        enrollmentId,
      },
      select: { id: true },
    });
    createdHomeworkTargetIds.push(target.id);

    return { homeworkId: homework.id, targetId: target.id };
  }

  async function login(email: string): Promise<AuthTokens> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email, password: PASSWORD })
      .expect(200);

    return {
      accessToken: response.body.accessToken,
      refreshToken: response.body.refreshToken,
    };
  }

  async function countDeferredSideEffects(): Promise<SideEffectCounts> {
    const [
      gradeAssessments,
      gradeItems,
      gradeSubmissions,
      gradeSubmissionAnswers,
      communicationNotifications,
      xpLedgerEntries,
      rewardRedemptions,
      files,
      attachments,
    ] = await Promise.all([
      prisma.gradeAssessment.count({ where: { schoolId } }),
      prisma.gradeItem.count({ where: { schoolId } }),
      prisma.gradeSubmission.count({ where: { schoolId } }),
      prisma.gradeSubmissionAnswer.count({ where: { schoolId } }),
      prisma.communicationNotification.count({ where: { schoolId } }),
      prisma.xpLedger.count({ where: { schoolId } }),
      prisma.rewardRedemption.count({ where: { schoolId } }),
      prisma.file.count({ where: { schoolId } }),
      prisma.attachment.count({ where: { schoolId } }),
    ]);

    return {
      gradeAssessments,
      gradeItems,
      gradeSubmissions,
      gradeSubmissionAnswers,
      communicationNotifications,
      xpLedgerEntries,
      rewardRedemptions,
      files,
      attachments,
    };
  }

  function listRegisteredRoutes(): string[] {
    const expressApp = app.getHttpAdapter().getInstance() as {
      _router?: { stack?: ExpressLayer[] };
      router?: { stack?: ExpressLayer[] };
    };
    const stack = expressApp._router?.stack ?? expressApp.router?.stack ?? [];
    const routes: string[] = [];

    collectRoutes(stack, routes);

    return routes.sort();
  }

  function collectRoutes(layers: ExpressLayer[], routes: string[]): void {
    for (const layer of layers) {
      if (layer.route?.path && layer.route.methods) {
        const paths = Array.isArray(layer.route.path)
          ? layer.route.path
          : [layer.route.path];
        const methods = Object.entries(layer.route.methods)
          .filter(([, enabled]) => enabled)
          .map(([method]) => method.toUpperCase());

        for (const path of paths) {
          for (const method of methods) {
            routes.push(`${method} ${normalizeRoutePath(path)}`);
          }
        }
      }

      if (layer.handle?.stack) {
        collectRoutes(layer.handle.stack, routes);
      }
    }
  }

  function normalizeRoutePath(path: string): string {
    return `/${path}`.replace(/\/{2,}/g, '/');
  }

  function bearer(tokens: AuthTokens): string {
    return `Bearer ${tokens.accessToken}`;
  }

  function expectSafeAppPayload(value: unknown): void {
    for (const key of [
      'schoolId',
      'organizationId',
      'enrollmentId',
      'reviewedByUserId',
    ]) {
      expectNoObjectKey(value, key);
    }
  }

  function expectSafeStudentOrParentPayload(value: unknown): void {
    expectSafeAppPayload(value);
  }

  function expectNoObjectKey(value: unknown, forbiddenKey: string): void {
    if (!value || typeof value !== 'object') return;

    if (Array.isArray(value)) {
      for (const item of value) expectNoObjectKey(item, forbiddenKey);
      return;
    }

    for (const [key, nested] of Object.entries(value)) {
      expect(key).not.toBe(forbiddenKey);
      expectNoObjectKey(nested, forbiddenKey);
    }
  }

  function createNoopBullmqService(): Pick<
    BullmqService,
    'addJob' | 'createWorker' | 'getQueue'
  > {
    return {
      getQueue: jest.fn(() => ({
        add: jest.fn().mockResolvedValue({ id: 'noop-job' }),
        close: jest.fn().mockResolvedValue(undefined),
      })),
      addJob: jest.fn().mockResolvedValue({ id: 'noop-job' }),
      createWorker: jest.fn(() => ({
        close: jest.fn().mockResolvedValue(undefined),
        on: jest.fn(),
      })),
    } as unknown as Pick<BullmqService, 'addJob' | 'createWorker' | 'getQueue'>;
  }

  async function cleanupCloseoutData(): Promise<void> {
    if (!prisma) return;

    await prisma.session.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { actorId: { in: createdUserIds } },
          { schoolId: { in: createdSchoolIds } },
          { organizationId: { in: createdOrganizationIds } },
        ],
      },
    });
    await prisma.homeworkSubmission.deleteMany({
      where: {
        OR: [
          { id: { in: createdHomeworkSubmissionIds } },
          { schoolId: { in: createdSchoolIds } },
        ],
      },
    });
    await prisma.homeworkTarget.deleteMany({
      where: {
        OR: [
          { id: { in: createdHomeworkTargetIds } },
          { schoolId: { in: createdSchoolIds } },
        ],
      },
    });
    await prisma.homeworkAssignment.deleteMany({
      where: {
        OR: [
          { id: { in: createdHomeworkAssignmentIds } },
          { schoolId: { in: createdSchoolIds } },
        ],
      },
    });
    await prisma.studentGuardian.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.enrollment.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.guardian.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.student.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.teacherSubjectAllocation.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.subject.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.classroom.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.section.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.grade.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.stage.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.term.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.academicYear.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.membership.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: createdUserIds } },
    });
    await prisma.school.deleteMany({
      where: { id: { in: createdSchoolIds } },
    });
    await prisma.organization.deleteMany({
      where: { id: { in: createdOrganizationIds } },
    });
  }
});
