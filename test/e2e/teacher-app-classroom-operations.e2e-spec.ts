import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  GradeAnswerCorrectionStatus,
  GradeAssessmentApprovalStatus,
  GradeAssessmentDeliveryMode,
  GradeAssessmentType,
  GradeItemStatus,
  GradeQuestionType,
  GradeScopeType,
  GradeSubmissionStatus,
  MembershipStatus,
  OrganizationStatus,
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

const GLOBAL_PREFIX = '/api/v1';
const PASSWORD = 'TeacherApp123!';
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

type AcademicContext = {
  academicYearId: string;
  termId: string;
  termName: string;
};

type AcademicFixture = AcademicContext & {
  allocationId: string;
  classroomId: string;
  classroomName: string;
  subjectId: string;
  subjectName: string;
  stageId: string;
  stageName: string;
  gradeId: string;
  gradeName: string;
  sectionId: string;
  sectionName: string;
  studentIds: string[];
  enrollmentIds: string[];
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

jest.setTimeout(90000);

describe('Sprint 7C Teacher Classroom Operations closeout flow (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;

  let organizationAId = '';
  let organizationBId = '';
  let schoolAId = '';
  let schoolBId = '';
  let teacherAId = '';
  let teacherAEmail = '';
  let teacherBEmail = '';
  let teacherCrossSchoolEmail = '';
  let adminEmail = '';
  let parentEmail = '';
  let studentEmail = '';
  let ownFixture: AcademicFixture;
  let otherTeacherFixture: AcademicFixture;
  let crossSchoolFixture: AcademicFixture;
  let ownAssessmentId = '';
  let ownAssignmentId = '';
  let ownAssignmentQuestionOneId = '';
  let ownAssignmentQuestionTwoId = '';
  let ownAssignmentSubmissionId = '';
  let ownAssignmentAnswerOneId = '';
  let ownAssignmentAnswerTwoId = '';
  let otherClassroomAssignmentId = '';
  let otherSubjectAssignmentId = '';
  let otherTermAssignmentId = '';
  let outsideStudentSubmissionId = '';
  let outsideStudentAnswerId = '';

  const suffix = randomUUID().split('-')[0];
  const privateMarkers = new Set<string>();
  const cleanupState = {
    organizationIds: new Set<string>(),
    schoolIds: new Set<string>(),
    userIds: new Set<string>(),
    academicYearIds: new Set<string>(),
    termIds: new Set<string>(),
    stageIds: new Set<string>(),
    gradeIds: new Set<string>(),
    sectionIds: new Set<string>(),
    roomIds: new Set<string>(),
    classroomIds: new Set<string>(),
    subjectIds: new Set<string>(),
    allocationIds: new Set<string>(),
    studentIds: new Set<string>(),
    enrollmentIds: new Set<string>(),
    guardianIds: new Set<string>(),
    studentGuardianIds: new Set<string>(),
    medicalProfileIds: new Set<string>(),
    gradeAssessmentIds: new Set<string>(),
    gradeQuestionIds: new Set<string>(),
    gradeSubmissionIds: new Set<string>(),
    gradeSubmissionAnswerIds: new Set<string>(),
    gradeItemIds: new Set<string>(),
  };

  let phoneSequence = 80_000_000;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const [teacherRole, schoolAdminRole, parentRole, studentRole] =
      await Promise.all([
        findSystemRole('teacher'),
        findSystemRole('school_admin'),
        findSystemRole('parent'),
        findSystemRole('student'),
      ]);

    const orgA = await prisma.organization.create({
      data: {
        slug: `s7c-${suffix}-org-a`,
        name: `Sprint 7C Org A ${suffix}`,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    organizationAId = orgA.id;
    cleanupState.organizationIds.add(orgA.id);

    const orgB = await prisma.organization.create({
      data: {
        slug: `s7c-${suffix}-org-b`,
        name: `Sprint 7C Org B ${suffix}`,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    organizationBId = orgB.id;
    cleanupState.organizationIds.add(orgB.id);

    const schoolA = await prisma.school.create({
      data: {
        organizationId: organizationAId,
        slug: `s7c-${suffix}-school-a`,
        name: `Sprint 7C School A ${suffix}`,
        status: SchoolStatus.ACTIVE,
      },
      select: { id: true },
    });
    schoolAId = schoolA.id;
    cleanupState.schoolIds.add(schoolA.id);

    const schoolB = await prisma.school.create({
      data: {
        organizationId: organizationBId,
        slug: `s7c-${suffix}-school-b`,
        name: `Sprint 7C School B ${suffix}`,
        status: SchoolStatus.ACTIVE,
      },
      select: { id: true },
    });
    schoolBId = schoolB.id;
    cleanupState.schoolIds.add(schoolB.id);

    teacherAEmail = `s7c-${suffix}-teacher-a@e2e.moazez.local`;
    teacherBEmail = `s7c-${suffix}-teacher-b@e2e.moazez.local`;
    teacherCrossSchoolEmail = `s7c-${suffix}-teacher-cross@e2e.moazez.local`;
    adminEmail = `s7c-${suffix}-admin@e2e.moazez.local`;
    parentEmail = `s7c-${suffix}-parent@e2e.moazez.local`;
    studentEmail = `s7c-${suffix}-student@e2e.moazez.local`;

    teacherAId = await createUserWithMembership({
      email: teacherAEmail,
      firstName: 'Sprint7C',
      lastName: 'TeacherA',
      userType: UserType.TEACHER,
      roleId: teacherRole.id,
      organizationId: organizationAId,
      schoolId: schoolAId,
    });
    const teacherBId = await createUserWithMembership({
      email: teacherBEmail,
      firstName: 'Sprint7C',
      lastName: 'TeacherB',
      userType: UserType.TEACHER,
      roleId: teacherRole.id,
      organizationId: organizationAId,
      schoolId: schoolAId,
    });
    const teacherCrossSchoolId = await createUserWithMembership({
      email: teacherCrossSchoolEmail,
      firstName: 'Sprint7C',
      lastName: 'TeacherCross',
      userType: UserType.TEACHER,
      roleId: teacherRole.id,
      organizationId: organizationBId,
      schoolId: schoolBId,
    });

    await createUserWithMembership({
      email: adminEmail,
      firstName: 'Sprint7C',
      lastName: 'Admin',
      userType: UserType.SCHOOL_USER,
      roleId: schoolAdminRole.id,
      organizationId: organizationAId,
      schoolId: schoolAId,
    });
    await createUserWithMembership({
      email: parentEmail,
      firstName: 'Sprint7C',
      lastName: 'Parent',
      userType: UserType.PARENT,
      roleId: parentRole.id,
      organizationId: organizationAId,
      schoolId: schoolAId,
    });
    await createUserWithMembership({
      email: studentEmail,
      firstName: 'Sprint7C',
      lastName: 'StudentUser',
      userType: UserType.STUDENT,
      roleId: studentRole.id,
      organizationId: organizationAId,
      schoolId: schoolAId,
    });

    const schoolAContext = await createActiveAcademicContext({
      schoolId: schoolAId,
      marker: 'school-a',
    });
    const schoolBContext = await createActiveAcademicContext({
      schoolId: schoolBId,
      marker: 'school-b',
    });
    const otherTermContext = await createActiveAcademicContext({
      schoolId: schoolAId,
      marker: 'other-term',
      isActive: false,
    });

    ownFixture = await createAcademicFixture({
      organizationId: organizationAId,
      schoolId: schoolAId,
      context: schoolAContext,
      teacherUserId: teacherAId,
      marker: 'own',
      studentCount: 2,
    });
    otherTeacherFixture = await createAcademicFixture({
      organizationId: organizationAId,
      schoolId: schoolAId,
      context: schoolAContext,
      teacherUserId: teacherBId,
      marker: 'other',
      studentCount: 1,
    });
    crossSchoolFixture = await createAcademicFixture({
      organizationId: organizationBId,
      schoolId: schoolBId,
      context: schoolBContext,
      teacherUserId: teacherCrossSchoolId,
      marker: 'cross',
      studentCount: 1,
    });

    await createPrivateStudentData({
      organizationId: organizationAId,
      schoolId: schoolAId,
      studentId: ownFixture.studentIds[0],
    });

    ownAssessmentId = await createGradeAssessmentFixture({
      schoolId: schoolAId,
      fixture: ownFixture,
      title: `S7C ${suffix} Owned Quiz`,
      type: GradeAssessmentType.QUIZ,
      approvalStatus: GradeAssessmentApprovalStatus.PUBLISHED,
      maxScore: 20,
      weight: 10,
    });
    ownAssignmentId = await createGradeAssessmentFixture({
      schoolId: schoolAId,
      fixture: ownFixture,
      title: `S7C ${suffix} Grade-backed Assignment`,
      type: GradeAssessmentType.ASSIGNMENT,
      deliveryMode: GradeAssessmentDeliveryMode.QUESTION_BASED,
      approvalStatus: GradeAssessmentApprovalStatus.APPROVED,
      maxScore: 10,
      weight: 5,
    });
    ownAssignmentQuestionOneId = await createGradeQuestionFixture({
      schoolId: schoolAId,
      assessmentId: ownAssignmentId,
      prompt: `S7C ${suffix} visible prompt one`,
      points: 6,
      sortOrder: 1,
    });
    ownAssignmentQuestionTwoId = await createGradeQuestionFixture({
      schoolId: schoolAId,
      assessmentId: ownAssignmentId,
      prompt: `S7C ${suffix} visible prompt two`,
      points: 4,
      sortOrder: 2,
    });
    ownAssignmentSubmissionId = await createGradeSubmissionFixture({
      schoolId: schoolAId,
      assessmentId: ownAssignmentId,
      termId: ownFixture.termId,
      studentId: ownFixture.studentIds[0],
      enrollmentId: ownFixture.enrollmentIds[0],
      status: GradeSubmissionStatus.SUBMITTED,
      submittedAt: new Date('2026-09-15T10:00:00.000Z'),
      maxScore: 10,
    });
    ownAssignmentAnswerOneId = await createGradeSubmissionAnswerFixture({
      schoolId: schoolAId,
      submissionId: ownAssignmentSubmissionId,
      assessmentId: ownAssignmentId,
      questionId: ownAssignmentQuestionOneId,
      studentId: ownFixture.studentIds[0],
      answerText: `S7C ${suffix} student visible answer one`,
      maxPoints: 6,
    });
    ownAssignmentAnswerTwoId = await createGradeSubmissionAnswerFixture({
      schoolId: schoolAId,
      submissionId: ownAssignmentSubmissionId,
      assessmentId: ownAssignmentId,
      questionId: ownAssignmentQuestionTwoId,
      studentId: ownFixture.studentIds[0],
      answerText: `S7C ${suffix} student visible answer two`,
      maxPoints: 4,
    });

    outsideStudentSubmissionId = await createGradeSubmissionFixture({
      schoolId: schoolAId,
      assessmentId: ownAssignmentId,
      termId: ownFixture.termId,
      studentId: otherTeacherFixture.studentIds[0],
      enrollmentId: otherTeacherFixture.enrollmentIds[0],
      status: GradeSubmissionStatus.SUBMITTED,
      submittedAt: new Date('2026-09-15T11:00:00.000Z'),
      maxScore: 10,
    });
    outsideStudentAnswerId = await createGradeSubmissionAnswerFixture({
      schoolId: schoolAId,
      submissionId: outsideStudentSubmissionId,
      assessmentId: ownAssignmentId,
      questionId: ownAssignmentQuestionOneId,
      studentId: otherTeacherFixture.studentIds[0],
      answerText: `S7C ${suffix} outside student answer`,
      maxPoints: 6,
    });

    otherClassroomAssignmentId = await createGradeAssessmentFixture({
      schoolId: schoolAId,
      fixture: {
        ...ownFixture,
        classroomId: otherTeacherFixture.classroomId,
      },
      title: `S7C ${suffix} Other Classroom Assignment`,
      type: GradeAssessmentType.ASSIGNMENT,
      approvalStatus: GradeAssessmentApprovalStatus.APPROVED,
      maxScore: 10,
      weight: 5,
    });
    otherSubjectAssignmentId = await createGradeAssessmentFixture({
      schoolId: schoolAId,
      fixture: {
        ...ownFixture,
        subjectId: otherTeacherFixture.subjectId,
      },
      title: `S7C ${suffix} Other Subject Assignment`,
      type: GradeAssessmentType.ASSIGNMENT,
      approvalStatus: GradeAssessmentApprovalStatus.APPROVED,
      maxScore: 10,
      weight: 5,
    });
    otherTermAssignmentId = await createGradeAssessmentFixture({
      schoolId: schoolAId,
      fixture: {
        ...ownFixture,
        academicYearId: otherTermContext.academicYearId,
        termId: otherTermContext.termId,
      },
      title: `S7C ${suffix} Other Term Assignment`,
      type: GradeAssessmentType.ASSIGNMENT,
      approvalStatus: GradeAssessmentApprovalStatus.APPROVED,
      maxScore: 10,
      weight: 5,
    });

    const gradeItem = await prisma.gradeItem.create({
      data: {
        schoolId: schoolAId,
        termId: ownFixture.termId,
        assessmentId: ownAssessmentId,
        studentId: ownFixture.studentIds[0],
        enrollmentId: ownFixture.enrollmentIds[0],
        score: 18,
        status: GradeItemStatus.ENTERED,
        enteredById: teacherAId,
        enteredAt: new Date('2026-09-15T09:00:00.000Z'),
      },
      select: { id: true },
    });
    cleanupState.gradeItemIds.add(gradeItem.id);

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix(GLOBAL_PREFIX.replace(/^\//, ''));
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    try {
      if (prisma) {
        await cleanupCloseoutData();
      }
    } finally {
      if (app) {
        await app.close();
      }
      if (prisma) {
        await prisma.$disconnect();
      }
    }
  });

  it('registers the Sprint 7C Teacher App route set and keeps deferred routes absent', async () => {
    expect(listRegisteredTeacherRoutes()).toEqual([
      'GET /api/v1/teacher/classroom/:classId',
      'GET /api/v1/teacher/classroom/:classId/assignments',
      'GET /api/v1/teacher/classroom/:classId/assignments/:assignmentId',
      'GET /api/v1/teacher/classroom/:classId/assignments/:assignmentId/submissions',
      'GET /api/v1/teacher/classroom/:classId/assignments/:assignmentId/submissions/:submissionId',
      'GET /api/v1/teacher/classroom/:classId/attendance/roster',
      'GET /api/v1/teacher/classroom/:classId/attendance/sessions/:sessionId',
      'GET /api/v1/teacher/classroom/:classId/grades/assessments',
      'GET /api/v1/teacher/classroom/:classId/grades/assessments/:assessmentId',
      'GET /api/v1/teacher/classroom/:classId/grades/gradebook',
      'GET /api/v1/teacher/classroom/:classId/roster',
      'GET /api/v1/teacher/home',
      'GET /api/v1/teacher/my-classes',
      'GET /api/v1/teacher/my-classes/:classId',
      'PATCH /api/v1/teacher/classroom/:classId/assignments/:assignmentId/submissions/:submissionId/answers/:answerId/review',
      'POST /api/v1/teacher/classroom/:classId/assignments/:assignmentId/submissions/:submissionId/review/finalize',
      'POST /api/v1/teacher/classroom/:classId/assignments/:assignmentId/submissions/:submissionId/sync-grade-item',
      'POST /api/v1/teacher/classroom/:classId/attendance/session/resolve',
      'POST /api/v1/teacher/classroom/:classId/attendance/sessions/:sessionId/submit',
      'PUT /api/v1/teacher/classroom/:classId/assignments/:assignmentId/submissions/:submissionId/answers/review',
      'PUT /api/v1/teacher/classroom/:classId/attendance/sessions/:sessionId/entries',
    ]);

    const teacher = await login(teacherAEmail);
    for (const deferredRoute of [
      '/teacher/schedule',
      '/teacher/schedule/week',
      `/teacher/classroom/${ownFixture.allocationId}/schedule`,
      `/teacher/classroom/${ownFixture.allocationId}/timetable`,
      `/teacher/classroom/${ownFixture.allocationId}/attendance/scheduleId`,
      '/teacher/homeworks',
      `/teacher/homeworks/${ownAssignmentId}`,
      '/teacher/tasks',
      '/teacher/messages',
      '/teacher/profile',
      '/teacher/settings',
      '/teacher/xp',
    ]) {
      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}${deferredRoute}`)
        .set('Authorization', `Bearer ${teacher.accessToken}`)
        .expect(404);
    }

    await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/teacher/classroom/${ownFixture.allocationId}/assignments`,
      )
      .set('Authorization', `Bearer ${teacher.accessToken}`)
      .send({})
      .expect(404);
  });

  it('covers classroom read, attendance, grade-backed assignments, submission review, and boundaries', async () => {
    const teacher = await login(teacherAEmail);

    const classroom = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/classroom/${ownFixture.allocationId}`)
      .set('Authorization', `Bearer ${teacher.accessToken}`)
      .expect(200);
    expect(classroom.body).toMatchObject({
      classId: ownFixture.allocationId,
      classroom: {
        id: ownFixture.classroomId,
        name: ownFixture.classroomName,
      },
      subject: {
        id: ownFixture.subjectId,
        name: ownFixture.subjectName,
      },
      term: {
        id: ownFixture.termId,
        name: ownFixture.termName,
      },
      academicHierarchy: {
        stageName: ownFixture.stageName,
        gradeName: ownFixture.gradeName,
        sectionName: ownFixture.sectionName,
      },
      schedule: {
        available: false,
        reason: 'timetable_not_available',
      },
    });
    expect(classroom.body.classId).toBe(ownFixture.allocationId);
    expectSafeTeacherPayload(classroom.body);

    const roster = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/teacher/classroom/${ownFixture.allocationId}/roster`,
      )
      .query({ limit: 10 })
      .set('Authorization', `Bearer ${teacher.accessToken}`)
      .expect(200);
    expect(roster.body.classId).toBe(ownFixture.allocationId);
    expect(
      roster.body.students.map((student: { id: string }) => student.id),
    ).toEqual(ownFixture.studentIds);
    expectSafeTeacherPayload(roster.body);
    expectNoPrivateStudentData(roster.body);

    const attendanceDate = '2026-09-10';
    const attendanceRoster = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/teacher/classroom/${ownFixture.allocationId}/attendance/roster`,
      )
      .query({ date: attendanceDate, limit: 10 })
      .set('Authorization', `Bearer ${teacher.accessToken}`)
      .expect(200);
    expect(attendanceRoster.body).toMatchObject({
      classId: ownFixture.allocationId,
      date: attendanceDate,
      session: null,
      pagination: { total: ownFixture.studentIds.length },
    });
    expectSafeTeacherPayload(attendanceRoster.body);

    const resolvedSession = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/teacher/classroom/${ownFixture.allocationId}/attendance/session/resolve`,
      )
      .set('Authorization', `Bearer ${teacher.accessToken}`)
      .send({ date: attendanceDate })
      .expect(201);
    const sessionId = resolvedSession.body.session.id as string;
    expect(resolvedSession.body).toMatchObject({
      classId: ownFixture.allocationId,
      date: attendanceDate,
      session: {
        id: sessionId,
        status: 'draft',
        submittedAt: null,
      },
      entries: [],
    });
    expectSafeTeacherPayload(resolvedSession.body);

    const emptySession = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/teacher/classroom/${ownFixture.allocationId}/attendance/sessions/${sessionId}`,
      )
      .set('Authorization', `Bearer ${teacher.accessToken}`)
      .expect(200);
    expect(emptySession.body.session.status).toBe('draft');
    expect(emptySession.body.entries).toEqual([]);
    expectSafeTeacherPayload(emptySession.body);

    const updatedAttendance = await request(app.getHttpServer())
      .put(
        `${GLOBAL_PREFIX}/teacher/classroom/${ownFixture.allocationId}/attendance/sessions/${sessionId}/entries`,
      )
      .set('Authorization', `Bearer ${teacher.accessToken}`)
      .send({
        entries: [
          {
            studentId: ownFixture.studentIds[0],
            status: 'present',
            note: 'Here',
          },
          {
            studentId: ownFixture.studentIds[1],
            status: 'absent',
            note: 'Family call pending',
          },
        ],
      })
      .expect(200);
    expect(updatedAttendance.body.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          studentId: ownFixture.studentIds[0],
          attendanceStatus: 'present',
          note: 'Here',
        }),
        expect.objectContaining({
          studentId: ownFixture.studentIds[1],
          attendanceStatus: 'absent',
          note: 'Family call pending',
        }),
      ]),
    );
    expectSafeTeacherPayload(updatedAttendance.body);

    const submittedAttendance = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/teacher/classroom/${ownFixture.allocationId}/attendance/sessions/${sessionId}/submit`,
      )
      .set('Authorization', `Bearer ${teacher.accessToken}`)
      .expect(201);
    expect(submittedAttendance.body.session).toMatchObject({
      id: sessionId,
      status: 'submitted',
    });
    expect(submittedAttendance.body.session.submittedAt).toEqual(
      expect.any(String),
    );
    expectSafeTeacherPayload(submittedAttendance.body);

    const submittedMutation = await request(app.getHttpServer())
      .put(
        `${GLOBAL_PREFIX}/teacher/classroom/${ownFixture.allocationId}/attendance/sessions/${sessionId}/entries`,
      )
      .set('Authorization', `Bearer ${teacher.accessToken}`)
      .send({
        entries: [{ studentId: ownFixture.studentIds[0], status: 'late' }],
      })
      .expect(409);
    expect(submittedMutation.body?.error?.code).toBe(
      'attendance.session.already_submitted',
    );

    const assessments = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/teacher/classroom/${ownFixture.allocationId}/grades/assessments`,
      )
      .set('Authorization', `Bearer ${teacher.accessToken}`)
      .expect(200);
    expect(
      assessments.body.assessments.map(
        (assessment: { assessmentId: string }) => assessment.assessmentId,
      ),
    ).toEqual(expect.arrayContaining([ownAssessmentId, ownAssignmentId]));
    expect(JSON.stringify(assessments.body)).not.toContain(
      otherClassroomAssignmentId,
    );
    expectSafeTeacherPayload(assessments.body);

    const assessmentDetail = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/teacher/classroom/${ownFixture.allocationId}/grades/assessments/${ownAssessmentId}`,
      )
      .set('Authorization', `Bearer ${teacher.accessToken}`)
      .expect(200);
    expect(assessmentDetail.body).toMatchObject({
      classId: ownFixture.allocationId,
      assessment: {
        assessmentId: ownAssessmentId,
        title: `S7C ${suffix} Owned Quiz`,
        type: 'quiz',
        status: 'published',
        maxScore: 20,
      },
    });
    expectSafeTeacherPayload(assessmentDetail.body);
    expectNoGradePrivateData(assessmentDetail.body);

    const gradebook = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/teacher/classroom/${ownFixture.allocationId}/grades/gradebook`,
      )
      .set('Authorization', `Bearer ${teacher.accessToken}`)
      .expect(200);
    expect(gradebook.body.classId).toBe(ownFixture.allocationId);
    expect(
      gradebook.body.students.map(
        (student: { studentId: string }) => student.studentId,
      ),
    ).toEqual(ownFixture.studentIds);
    expect(JSON.stringify(gradebook.body)).not.toContain(
      otherTeacherFixture.studentIds[0],
    );
    expectSafeTeacherPayload(gradebook.body);

    const assignments = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/teacher/classroom/${ownFixture.allocationId}/assignments`,
      )
      .set('Authorization', `Bearer ${teacher.accessToken}`)
      .expect(200);
    expect(assignments.body.assignments).toEqual([
      expect.objectContaining({
        assignmentId: ownAssignmentId,
        source: 'grades_assessment',
        title: `S7C ${suffix} Grade-backed Assignment`,
        type: 'assignment',
        status: 'approved',
        dueAt: null,
        submissionsCount: 1,
      }),
    ]);
    expect(JSON.stringify(assignments.body)).not.toContain(
      outsideStudentSubmissionId,
    );
    expectSafeTeacherPayload(assignments.body);

    const assignmentDetail = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/teacher/classroom/${ownFixture.allocationId}/assignments/${ownAssignmentId}`,
      )
      .set('Authorization', `Bearer ${teacher.accessToken}`)
      .expect(200);
    expect(assignmentDetail.body).toMatchObject({
      classId: ownFixture.allocationId,
      assignment: {
        assignmentId: ownAssignmentId,
        source: 'grades_assessment',
        title: `S7C ${suffix} Grade-backed Assignment`,
        type: 'assignment',
        maxScore: 10,
        questionSummary: {
          available: true,
          questionsCount: 2,
          requiredQuestionsCount: 2,
          totalPoints: 10,
          types: ['short_answer'],
        },
      },
    });
    expectSafeTeacherPayload(assignmentDetail.body);
    expectNoGradePrivateData(assignmentDetail.body);

    const submissions = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/teacher/classroom/${ownFixture.allocationId}/assignments/${ownAssignmentId}/submissions`,
      )
      .set('Authorization', `Bearer ${teacher.accessToken}`)
      .expect(200);
    expect(submissions.body).toMatchObject({
      classId: ownFixture.allocationId,
      assignmentId: ownAssignmentId,
      source: 'grades_assessment',
      pagination: { total: 1 },
    });
    expect(submissions.body.submissions).toEqual([
      expect.objectContaining({
        submissionId: ownAssignmentSubmissionId,
        status: 'submitted',
        answersCount: 2,
        reviewedAnswersCount: 0,
      }),
    ]);
    expect(JSON.stringify(submissions.body)).not.toContain(
      outsideStudentSubmissionId,
    );
    expectSafeTeacherPayload(submissions.body);
    expectNoGradePrivateData(submissions.body);

    const submissionDetail = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/teacher/classroom/${ownFixture.allocationId}/assignments/${ownAssignmentId}/submissions/${ownAssignmentSubmissionId}`,
      )
      .set('Authorization', `Bearer ${teacher.accessToken}`)
      .expect(200);
    expect(submissionDetail.body).toMatchObject({
      classId: ownFixture.allocationId,
      assignmentId: ownAssignmentId,
      source: 'grades_assessment',
      submission: {
        submissionId: ownAssignmentSubmissionId,
        status: 'submitted',
        answersCount: 2,
        reviewedAnswersCount: 0,
      },
    });
    expect(JSON.stringify(submissionDetail.body)).toContain(
      `S7C ${suffix} student visible answer one`,
    );
    expectSafeTeacherPayload(submissionDetail.body);
    expectNoGradePrivateData(submissionDetail.body);

    const reviewedAnswer = await request(app.getHttpServer())
      .patch(
        `${GLOBAL_PREFIX}/teacher/classroom/${ownFixture.allocationId}/assignments/${ownAssignmentId}/submissions/${ownAssignmentSubmissionId}/answers/${ownAssignmentAnswerOneId}/review`,
      )
      .set('Authorization', `Bearer ${teacher.accessToken}`)
      .send({ awardedPoints: 5, reviewerComment: 'Solid work' })
      .expect(200);
    expect(reviewedAnswer.body).toMatchObject({
      classId: ownFixture.allocationId,
      assignmentId: ownAssignmentId,
      submissionId: ownAssignmentSubmissionId,
      source: 'grades_assessment',
      answer: {
        answerId: ownAssignmentAnswerOneId,
        questionId: ownAssignmentQuestionOneId,
        correctionStatus: 'corrected',
        score: 5,
        maxScore: 6,
        feedback: 'Solid work',
      },
    });
    expectSafeTeacherPayload(reviewedAnswer.body);
    expectNoGradePrivateData(reviewedAnswer.body);

    const bulkReviewed = await request(app.getHttpServer())
      .put(
        `${GLOBAL_PREFIX}/teacher/classroom/${ownFixture.allocationId}/assignments/${ownAssignmentId}/submissions/${ownAssignmentSubmissionId}/answers/review`,
      )
      .set('Authorization', `Bearer ${teacher.accessToken}`)
      .send({
        reviews: [
          {
            answerId: ownAssignmentAnswerTwoId,
            awardedPoints: 4,
            reviewerComment: 'Complete',
          },
        ],
      })
      .expect(200);
    expect(bulkReviewed.body).toMatchObject({
      classId: ownFixture.allocationId,
      assignmentId: ownAssignmentId,
      submissionId: ownAssignmentSubmissionId,
      source: 'grades_assessment',
      reviewedCount: 1,
      answers: [
        expect.objectContaining({
          answerId: ownAssignmentAnswerTwoId,
          score: 4,
          maxScore: 4,
          feedback: 'Complete',
        }),
      ],
    });
    expectSafeTeacherPayload(bulkReviewed.body);
    expectNoGradePrivateData(bulkReviewed.body);

    const finalized = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/teacher/classroom/${ownFixture.allocationId}/assignments/${ownAssignmentId}/submissions/${ownAssignmentSubmissionId}/review/finalize`,
      )
      .set('Authorization', `Bearer ${teacher.accessToken}`)
      .expect(201);
    expect(finalized.body).toMatchObject({
      classId: ownFixture.allocationId,
      assignmentId: ownAssignmentId,
      source: 'grades_assessment',
      submission: {
        submissionId: ownAssignmentSubmissionId,
        status: 'corrected',
        score: 9,
        maxScore: 10,
        reviewedAnswersCount: 2,
      },
    });
    expect(finalized.body.submission.finalizedAt).toEqual(expect.any(String));
    expectSafeTeacherPayload(finalized.body);
    expectNoGradePrivateData(finalized.body);

    const synced = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/teacher/classroom/${ownFixture.allocationId}/assignments/${ownAssignmentId}/submissions/${ownAssignmentSubmissionId}/sync-grade-item`,
      )
      .set('Authorization', `Bearer ${teacher.accessToken}`)
      .expect(201);
    expect(synced.body).toMatchObject({
      classId: ownFixture.allocationId,
      assignmentId: ownAssignmentId,
      submissionId: ownAssignmentSubmissionId,
      source: 'grades_assessment',
      synced: true,
      idempotent: false,
      submission: {
        submissionId: ownAssignmentSubmissionId,
        assignmentId: ownAssignmentId,
        totalScore: 9,
        maxScore: 10,
      },
      gradeItem: {
        assignmentId: ownAssignmentId,
        studentId: ownFixture.studentIds[0],
        enrollmentId: ownFixture.enrollmentIds[0],
        status: 'entered',
        score: 9,
      },
    });
    cleanupState.gradeItemIds.add(synced.body.gradeItem.gradeItemId);
    expectSafeTeacherPayload(synced.body);
    expectNoGradePrivateData(synced.body);

    for (const allocationId of [
      otherTeacherFixture.allocationId,
      crossSchoolFixture.allocationId,
    ]) {
      const response = await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/teacher/classroom/${allocationId}`)
        .set('Authorization', `Bearer ${teacher.accessToken}`)
        .expect(404);
      expect(response.body?.error?.code).toBe(
        'teacher_app.allocation.not_found',
      );
    }

    for (const assessmentId of [
      otherClassroomAssignmentId,
      otherSubjectAssignmentId,
      otherTermAssignmentId,
    ]) {
      const assessmentResponse = await request(app.getHttpServer())
        .get(
          `${GLOBAL_PREFIX}/teacher/classroom/${ownFixture.allocationId}/grades/assessments/${assessmentId}`,
        )
        .set('Authorization', `Bearer ${teacher.accessToken}`)
        .expect(404);
      expect(assessmentResponse.body?.error?.code).toBe('not_found');

      const assignmentResponse = await request(app.getHttpServer())
        .get(
          `${GLOBAL_PREFIX}/teacher/classroom/${ownFixture.allocationId}/assignments/${assessmentId}`,
        )
        .set('Authorization', `Bearer ${teacher.accessToken}`)
        .expect(404);
      expect(assignmentResponse.body?.error?.code).toBe('not_found');
    }

    const outsideSubmissionRead = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/teacher/classroom/${ownFixture.allocationId}/assignments/${ownAssignmentId}/submissions/${outsideStudentSubmissionId}`,
      )
      .set('Authorization', `Bearer ${teacher.accessToken}`)
      .expect(404);
    expect(outsideSubmissionRead.body?.error?.code).toBe('not_found');

    const outsideSubmissionReview = await request(app.getHttpServer())
      .patch(
        `${GLOBAL_PREFIX}/teacher/classroom/${ownFixture.allocationId}/assignments/${ownAssignmentId}/submissions/${outsideStudentSubmissionId}/answers/${outsideStudentAnswerId}/review`,
      )
      .set('Authorization', `Bearer ${teacher.accessToken}`)
      .send({ awardedPoints: 1 })
      .expect(404);
    expect(outsideSubmissionReview.body?.error?.code).toBe('not_found');

    for (const email of [adminEmail, parentEmail, studentEmail]) {
      const actor = await login(email);
      const response = await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/teacher/classroom/${ownFixture.allocationId}`)
        .set('Authorization', `Bearer ${actor.accessToken}`)
        .expect(403);
      expect(response.body?.error?.code).toBe(
        'teacher_app.actor.required_teacher',
      );
    }
  });

  async function findSystemRole(key: string): Promise<{ id: string }> {
    const role = await prisma.role.findFirst({
      where: { key, schoolId: null, isSystem: true },
      select: { id: true },
    });
    if (!role) throw new Error(`${key} system role not found - run seed.`);
    return role;
  }

  async function createUserWithMembership(params: {
    email: string;
    firstName: string;
    lastName: string;
    userType: UserType;
    roleId: string;
    organizationId: string;
    schoolId: string;
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
    cleanupState.userIds.add(user.id);

    await prisma.membership.create({
      data: {
        userId: user.id,
        organizationId: params.organizationId,
        schoolId: params.schoolId,
        roleId: params.roleId,
        userType: params.userType,
        status: MembershipStatus.ACTIVE,
      },
    });

    return user.id;
  }

  async function createActiveAcademicContext(params: {
    schoolId: string;
    marker: string;
    isActive?: boolean;
  }): Promise<AcademicContext> {
    const academicYear = await prisma.academicYear.create({
      data: {
        schoolId: params.schoolId,
        nameAr: `S7C ${suffix} ${params.marker} Year AR`,
        nameEn: `S7C ${suffix} ${params.marker} Year`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2027-06-30T00:00:00.000Z'),
        isActive: params.isActive ?? true,
      },
      select: { id: true },
    });
    cleanupState.academicYearIds.add(academicYear.id);

    const termName = `S7C ${suffix} ${params.marker} Term`;
    const term = await prisma.term.create({
      data: {
        schoolId: params.schoolId,
        academicYearId: academicYear.id,
        nameAr: `${termName} AR`,
        nameEn: termName,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2026-12-31T00:00:00.000Z'),
        isActive: params.isActive ?? true,
      },
      select: { id: true },
    });
    cleanupState.termIds.add(term.id);

    return {
      academicYearId: academicYear.id,
      termId: term.id,
      termName,
    };
  }

  async function createAcademicFixture(params: {
    organizationId: string;
    schoolId: string;
    context: AcademicContext;
    teacherUserId: string;
    marker: string;
    studentCount: number;
  }): Promise<AcademicFixture> {
    const stageName = `S7C ${suffix} ${params.marker} Stage`;
    const stage = await prisma.stage.create({
      data: {
        schoolId: params.schoolId,
        nameAr: `${stageName} AR`,
        nameEn: stageName,
        sortOrder: 1,
      },
      select: { id: true },
    });
    cleanupState.stageIds.add(stage.id);

    const gradeName = `S7C ${suffix} ${params.marker} Grade`;
    const grade = await prisma.grade.create({
      data: {
        schoolId: params.schoolId,
        stageId: stage.id,
        nameAr: `${gradeName} AR`,
        nameEn: gradeName,
        sortOrder: 1,
        capacity: 30,
      },
      select: { id: true },
    });
    cleanupState.gradeIds.add(grade.id);

    const sectionName = `S7C ${suffix} ${params.marker} Section`;
    const section = await prisma.section.create({
      data: {
        schoolId: params.schoolId,
        gradeId: grade.id,
        nameAr: `${sectionName} AR`,
        nameEn: sectionName,
        sortOrder: 1,
        capacity: 30,
      },
      select: { id: true },
    });
    cleanupState.sectionIds.add(section.id);

    const roomName = `S7C ${suffix} ${params.marker} Room`;
    const room = await prisma.room.create({
      data: {
        schoolId: params.schoolId,
        nameAr: `${roomName} AR`,
        nameEn: roomName,
        building: 'Main',
        floor: '1',
        capacity: 30,
        isActive: true,
      },
      select: { id: true },
    });
    cleanupState.roomIds.add(room.id);

    const classroomName = `S7C ${suffix} ${params.marker} Classroom`;
    const classroom = await prisma.classroom.create({
      data: {
        schoolId: params.schoolId,
        sectionId: section.id,
        roomId: room.id,
        nameAr: `${classroomName} AR`,
        nameEn: classroomName,
        sortOrder: 1,
        capacity: 30,
      },
      select: { id: true },
    });
    cleanupState.classroomIds.add(classroom.id);

    const subjectName = `S7C ${suffix} ${params.marker} Subject`;
    const subject = await prisma.subject.create({
      data: {
        schoolId: params.schoolId,
        nameAr: `${subjectName} AR`,
        nameEn: subjectName,
        code: `S7C-${suffix}-${params.marker}`.toUpperCase(),
        isActive: true,
      },
      select: { id: true },
    });
    cleanupState.subjectIds.add(subject.id);

    const allocation = await prisma.teacherSubjectAllocation.create({
      data: {
        schoolId: params.schoolId,
        teacherUserId: params.teacherUserId,
        subjectId: subject.id,
        classroomId: classroom.id,
        termId: params.context.termId,
      },
      select: { id: true },
    });
    cleanupState.allocationIds.add(allocation.id);

    const studentIds: string[] = [];
    const enrollmentIds: string[] = [];
    for (let index = 0; index < params.studentCount; index += 1) {
      const student = await prisma.student.create({
        data: {
          schoolId: params.schoolId,
          organizationId: params.organizationId,
          firstName: `S7C ${params.marker} Student`,
          lastName: String(index + 1),
          status: StudentStatus.ACTIVE,
        },
        select: { id: true },
      });
      cleanupState.studentIds.add(student.id);
      studentIds.push(student.id);

      const enrollment = await prisma.enrollment.create({
        data: {
          schoolId: params.schoolId,
          studentId: student.id,
          academicYearId: params.context.academicYearId,
          termId: params.context.termId,
          classroomId: classroom.id,
          status: StudentEnrollmentStatus.ACTIVE,
          enrolledAt: new Date('2026-09-01T00:00:00.000Z'),
        },
        select: { id: true },
      });
      cleanupState.enrollmentIds.add(enrollment.id);
      enrollmentIds.push(enrollment.id);
    }

    return {
      ...params.context,
      allocationId: allocation.id,
      classroomId: classroom.id,
      classroomName,
      subjectId: subject.id,
      subjectName,
      stageId: stage.id,
      stageName,
      gradeId: grade.id,
      gradeName,
      sectionId: section.id,
      sectionName,
      studentIds,
      enrollmentIds,
    };
  }

  async function createPrivateStudentData(params: {
    organizationId: string;
    schoolId: string;
    studentId: string;
  }): Promise<void> {
    const guardianEmail = `private-s7c-${suffix}@e2e.moazez.local`;
    const guardianPhone = nextPhone();
    const allergy = `private-s7c-allergy-${suffix}`;
    const condition = `private-s7c-condition-${suffix}`;
    const medication = `private-s7c-medication-${suffix}`;
    const emergencyNote = `private-s7c-emergency-note-${suffix}`;
    privateMarkers.add(guardianEmail);
    privateMarkers.add(guardianPhone);
    privateMarkers.add(allergy);
    privateMarkers.add(condition);
    privateMarkers.add(medication);
    privateMarkers.add(emergencyNote);

    const guardian = await prisma.guardian.create({
      data: {
        schoolId: params.schoolId,
        organizationId: params.organizationId,
        firstName: 'Private',
        lastName: 'Guardian',
        phone: guardianPhone,
        email: guardianEmail,
        relation: 'guardian',
        isPrimary: true,
      },
      select: { id: true },
    });
    cleanupState.guardianIds.add(guardian.id);

    const link = await prisma.studentGuardian.create({
      data: {
        schoolId: params.schoolId,
        studentId: params.studentId,
        guardianId: guardian.id,
        isPrimary: true,
      },
      select: { id: true },
    });
    cleanupState.studentGuardianIds.add(link.id);

    const medical = await prisma.studentMedicalProfile.create({
      data: {
        schoolId: params.schoolId,
        studentId: params.studentId,
        bloodType: 'O+',
        allergies: allergy,
        conditions: [condition],
        medications: [medication],
        emergencyNotes: emergencyNote,
      },
      select: { id: true },
    });
    cleanupState.medicalProfileIds.add(medical.id);
  }

  async function createGradeAssessmentFixture(params: {
    schoolId: string;
    fixture: Pick<
      AcademicFixture,
      'academicYearId' | 'termId' | 'classroomId' | 'subjectId'
    >;
    title: string;
    type: GradeAssessmentType;
    approvalStatus: GradeAssessmentApprovalStatus;
    deliveryMode?: GradeAssessmentDeliveryMode;
    maxScore: number;
    weight: number;
  }): Promise<string> {
    const assessment = await prisma.gradeAssessment.create({
      data: {
        schoolId: params.schoolId,
        academicYearId: params.fixture.academicYearId,
        termId: params.fixture.termId,
        subjectId: params.fixture.subjectId,
        scopeType: GradeScopeType.CLASSROOM,
        scopeKey: params.fixture.classroomId,
        classroomId: params.fixture.classroomId,
        titleEn: params.title,
        type: params.type,
        deliveryMode:
          params.deliveryMode ?? GradeAssessmentDeliveryMode.SCORE_ONLY,
        date: new Date('2026-09-15T00:00:00.000Z'),
        weight: params.weight,
        maxScore: params.maxScore,
        approvalStatus: params.approvalStatus,
        publishedAt:
          params.approvalStatus === GradeAssessmentApprovalStatus.DRAFT
            ? null
            : new Date('2026-09-14T08:00:00.000Z'),
        approvedAt:
          params.approvalStatus === GradeAssessmentApprovalStatus.APPROVED
            ? new Date('2026-09-14T09:00:00.000Z')
            : null,
        createdById: teacherAId || null,
      },
      select: { id: true },
    });
    cleanupState.gradeAssessmentIds.add(assessment.id);

    return assessment.id;
  }

  async function createGradeQuestionFixture(params: {
    schoolId: string;
    assessmentId: string;
    prompt: string;
    points: number;
    sortOrder: number;
  }): Promise<string> {
    const answerKeySentinel = `private-s7c-answer-key-${suffix}-${params.sortOrder}`;
    const metadataSentinel = `private-s7c-question-metadata-${suffix}-${params.sortOrder}`;
    privateMarkers.add(answerKeySentinel);
    privateMarkers.add(metadataSentinel);

    const question = await prisma.gradeAssessmentQuestion.create({
      data: {
        schoolId: params.schoolId,
        assessmentId: params.assessmentId,
        type: GradeQuestionType.SHORT_ANSWER,
        prompt: params.prompt,
        points: params.points,
        sortOrder: params.sortOrder,
        required: true,
        answerKey: { sentinel: answerKeySentinel },
        metadata: { sentinel: metadataSentinel },
      },
      select: { id: true },
    });
    cleanupState.gradeQuestionIds.add(question.id);

    return question.id;
  }

  async function createGradeSubmissionFixture(params: {
    schoolId: string;
    assessmentId: string;
    termId: string;
    studentId: string;
    enrollmentId: string;
    status: GradeSubmissionStatus;
    submittedAt: Date | null;
    maxScore: number;
  }): Promise<string> {
    const metadataSentinel = `private-s7c-submission-metadata-${suffix}-${params.studentId}`;
    privateMarkers.add(metadataSentinel);

    const submission = await prisma.gradeSubmission.create({
      data: {
        schoolId: params.schoolId,
        assessmentId: params.assessmentId,
        termId: params.termId,
        studentId: params.studentId,
        enrollmentId: params.enrollmentId,
        status: params.status,
        submittedAt: params.submittedAt,
        maxScore: params.maxScore,
        metadata: { sentinel: metadataSentinel },
      },
      select: { id: true },
    });
    cleanupState.gradeSubmissionIds.add(submission.id);

    return submission.id;
  }

  async function createGradeSubmissionAnswerFixture(params: {
    schoolId: string;
    submissionId: string;
    assessmentId: string;
    questionId: string;
    studentId: string;
    answerText: string;
    maxPoints: number;
  }): Promise<string> {
    const answer = await prisma.gradeSubmissionAnswer.create({
      data: {
        schoolId: params.schoolId,
        submissionId: params.submissionId,
        assessmentId: params.assessmentId,
        questionId: params.questionId,
        studentId: params.studentId,
        answerText: params.answerText,
        correctionStatus: GradeAnswerCorrectionStatus.PENDING,
        maxPoints: params.maxPoints,
      },
      select: { id: true },
    });
    cleanupState.gradeSubmissionAnswerIds.add(answer.id);

    return answer.id;
  }

  async function login(email: string): Promise<{ accessToken: string }> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email, password: PASSWORD })
      .expect(200);

    return { accessToken: response.body.accessToken };
  }

  function listRegisteredTeacherRoutes(): string[] {
    const expressApp = app.getHttpAdapter().getInstance() as {
      _router?: { stack?: ExpressLayer[] };
      router?: { stack?: ExpressLayer[] };
    };
    const stack = expressApp._router?.stack ?? expressApp.router?.stack ?? [];
    const routes: string[] = [];

    collectRoutes(stack, routes);

    return routes.filter((route) => route.includes('/api/v1/teacher')).sort();
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

  function expectSafeTeacherPayload(value: unknown): void {
    expectNoObjectKey(value, 'schoolId');
    expectNoObjectKey(value, 'scheduleId');
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

  function expectNoPrivateStudentData(value: unknown): void {
    for (const key of [
      'guardian',
      'guardianId',
      'medical',
      'medicalProfile',
      'bloodType',
      'allergies',
      'conditions',
      'medications',
      'emergencyNotes',
    ]) {
      expectNoObjectKey(value, key);
    }

    assertNoPrivateMarkers(value);
  }

  function expectNoGradePrivateData(value: unknown): void {
    const json = JSON.stringify(value);
    for (const key of [
      'answerKey',
      'correctAnswer',
      'isCorrect',
      'metadata',
      'reviewedById',
      'enteredById',
    ]) {
      expectNoObjectKey(value, key);
      expect(json).not.toContain(key);
    }

    assertNoPrivateMarkers(value);
  }

  function assertNoPrivateMarkers(value: unknown): void {
    const json = JSON.stringify(value);
    for (const marker of privateMarkers) {
      expect(json).not.toContain(marker);
    }
  }

  function nextPhone(): string {
    phoneSequence += 1;
    return `+2011${String(phoneSequence).padStart(8, '0')}`;
  }

  async function cleanupCloseoutData(): Promise<void> {
    await prisma.session.deleteMany({
      where: { userId: { in: [...cleanupState.userIds] } },
    });
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { actorId: { in: [...cleanupState.userIds] } },
          { schoolId: { in: [...cleanupState.schoolIds] } },
          { organizationId: { in: [...cleanupState.organizationIds] } },
        ],
      },
    });
    await prisma.gradeSubmissionAnswerOption.deleteMany({
      where: { schoolId: { in: [...cleanupState.schoolIds] } },
    });
    await prisma.gradeSubmissionAnswer.deleteMany({
      where: { id: { in: [...cleanupState.gradeSubmissionAnswerIds] } },
    });
    await prisma.gradeSubmission.deleteMany({
      where: { id: { in: [...cleanupState.gradeSubmissionIds] } },
    });
    await prisma.gradeAssessmentQuestionOption.deleteMany({
      where: { schoolId: { in: [...cleanupState.schoolIds] } },
    });
    await prisma.gradeAssessmentQuestion.deleteMany({
      where: { id: { in: [...cleanupState.gradeQuestionIds] } },
    });
    await prisma.gradeItem.deleteMany({
      where: {
        OR: [
          { id: { in: [...cleanupState.gradeItemIds] } },
          { assessmentId: { in: [...cleanupState.gradeAssessmentIds] } },
        ],
      },
    });
    await prisma.gradeAssessment.deleteMany({
      where: { id: { in: [...cleanupState.gradeAssessmentIds] } },
    });
    await prisma.attendanceEntry.deleteMany({
      where: { schoolId: { in: [...cleanupState.schoolIds] } },
    });
    await prisma.attendanceSession.deleteMany({
      where: { schoolId: { in: [...cleanupState.schoolIds] } },
    });
    await prisma.studentMedicalProfile.deleteMany({
      where: { id: { in: [...cleanupState.medicalProfileIds] } },
    });
    await prisma.studentGuardian.deleteMany({
      where: { id: { in: [...cleanupState.studentGuardianIds] } },
    });
    await prisma.guardian.deleteMany({
      where: { id: { in: [...cleanupState.guardianIds] } },
    });
    await prisma.enrollment.deleteMany({
      where: { id: { in: [...cleanupState.enrollmentIds] } },
    });
    await prisma.student.deleteMany({
      where: { id: { in: [...cleanupState.studentIds] } },
    });
    await prisma.teacherSubjectAllocation.deleteMany({
      where: { id: { in: [...cleanupState.allocationIds] } },
    });
    await prisma.subject.deleteMany({
      where: { id: { in: [...cleanupState.subjectIds] } },
    });
    await prisma.classroom.deleteMany({
      where: { id: { in: [...cleanupState.classroomIds] } },
    });
    await prisma.room.deleteMany({
      where: { id: { in: [...cleanupState.roomIds] } },
    });
    await prisma.section.deleteMany({
      where: { id: { in: [...cleanupState.sectionIds] } },
    });
    await prisma.grade.deleteMany({
      where: { id: { in: [...cleanupState.gradeIds] } },
    });
    await prisma.stage.deleteMany({
      where: { id: { in: [...cleanupState.stageIds] } },
    });
    await prisma.term.deleteMany({
      where: { id: { in: [...cleanupState.termIds] } },
    });
    await prisma.academicYear.deleteMany({
      where: { id: { in: [...cleanupState.academicYearIds] } },
    });
    await prisma.schoolProfile.deleteMany({
      where: { schoolId: { in: [...cleanupState.schoolIds] } },
    });
    await prisma.membership.deleteMany({
      where: { userId: { in: [...cleanupState.userIds] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [...cleanupState.userIds] } },
    });
    await prisma.school.deleteMany({
      where: { id: { in: [...cleanupState.schoolIds] } },
    });
    await prisma.organization.deleteMany({
      where: { id: { in: [...cleanupState.organizationIds] } },
    });
  }
});
