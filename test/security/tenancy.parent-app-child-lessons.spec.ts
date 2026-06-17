import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  CurriculumStatus,
  LessonContentItemType,
  LessonPlanItemStatus,
  LessonPlanStatus,
  MembershipStatus,
  OrganizationStatus,
  PrismaClient,
  SchoolStatus,
  StudentEnrollmentStatus,
  StudentStatus,
  TimetableConfigStatus,
  TimetableEntryStatus,
  TimetablePeriodType,
  TimetablePublicationStatus,
  TimetableScopeType,
  UserStatus,
  UserType,
} from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';

const GLOBAL_PREFIX = '/api/v1';
const PASSWORD = 'ParentChildLessonsSecurity123!';
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
};

type AcademicContext = {
  academicYearId: string;
  termId: string;
};

type LessonFixture = {
  allocationId: string;
  classroomId: string;
  subjectId: string;
  lessonPlanItemId: string;
  timetableEntryId: string;
};

jest.setTimeout(120000);

describe('Parent App child lesson content tenancy/security (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;

  let organizationId = '';
  let crossOrganizationId = '';
  let schoolId = '';
  let crossSchoolId = '';
  let teacherUserId = '';
  let studentAUserId = '';
  let childStudentId = '';
  let parentUserId = '';
  let studentAEmail = '';
  let studentBEmail = '';
  let teacherEmail = '';
  let parentEmail = '';
  let adminEmail = '';
  let academic: AcademicContext;
  let ownFixture: LessonFixture;
  let otherClassroomFixture: LessonFixture;
  let crossSchoolFixture: LessonFixture;
  let archivedPlanItemId = '';

  let studentAAuth: AuthTokens;
  let teacherAuth: AuthTokens;
  let parentAuth: AuthTokens;
  let adminAuth: AuthTokens;

  const suffix = randomUUID().split('-')[0];
  const marker = `s22i-sec-${suffix}`;
  const cleanup = createCleanupState();

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const [teacherRole, studentRole, parentRole, adminRole] = await Promise.all([
      findSystemRole('teacher'),
      findSystemRole('student'),
      findSystemRole('parent'),
      findSystemRole('school_admin'),
    ]);

    organizationId = await createOrganization('main');
    crossOrganizationId = await createOrganization('cross');
    schoolId = await createSchool(organizationId, 'main');
    crossSchoolId = await createSchool(crossOrganizationId, 'cross');
    academic = await createAcademicContext(schoolId);

    teacherEmail = `${marker}-teacher@example.test`;
    teacherUserId = await createUserWithMembership({
      email: teacherEmail,
      firstName: 'Teacher',
      lastName: 'User',
      userType: UserType.TEACHER,
      roleId: teacherRole.id,
      organizationId,
      schoolId,
    });
    studentAEmail = `${marker}-student-a@example.test`;
    studentAUserId = await createUserWithMembership({
      email: studentAEmail,
      firstName: 'Student',
      lastName: 'A',
      userType: UserType.STUDENT,
      roleId: studentRole.id,
      organizationId,
      schoolId,
    });
    studentBEmail = `${marker}-student-b@example.test`;
    const studentBUserId = await createUserWithMembership({
      email: studentBEmail,
      firstName: 'Student',
      lastName: 'B',
      userType: UserType.STUDENT,
      roleId: studentRole.id,
      organizationId,
      schoolId,
    });
    parentEmail = `${marker}-parent@example.test`;
    parentUserId = await createUserWithMembership({
      email: parentEmail,
      firstName: 'Parent',
      lastName: 'User',
      userType: UserType.PARENT,
      roleId: parentRole.id,
      organizationId,
      schoolId,
    });
    adminEmail = `${marker}-admin@example.test`;
    await createUserWithMembership({
      email: adminEmail,
      firstName: 'School',
      lastName: 'Admin',
      userType: UserType.SCHOOL_USER,
      roleId: adminRole.id,
      organizationId,
      schoolId,
    });

    ownFixture = await createLessonFixture({
      organizationId,
      schoolId,
      academicYearId: academic.academicYearId,
      termId: academic.termId,
      teacherUserId,
      marker: 'own',
      itemNotes: 'teacher private note',
    });
    const ownedEnrollment = await createStudentEnrollment({
      organizationId,
      schoolId,
      userId: studentAUserId,
      academicYearId: academic.academicYearId,
      termId: academic.termId,
      classroomId: ownFixture.classroomId,
      marker: 'student-a',
    });
    childStudentId = ownedEnrollment.studentId;
    const guardianId = await createGuardian({
      organizationId,
      schoolId,
      userId: parentUserId,
      marker: 'own',
    });
    await linkGuardianToStudent({
      schoolId,
      studentId: childStudentId,
      guardianId,
    });

    otherClassroomFixture = await createLessonFixture({
      organizationId,
      schoolId,
      academicYearId: academic.academicYearId,
      termId: academic.termId,
      teacherUserId,
      marker: 'other-class',
    });
    await createStudentEnrollment({
      organizationId,
      schoolId,
      userId: studentBUserId,
      academicYearId: academic.academicYearId,
      termId: academic.termId,
      classroomId: otherClassroomFixture.classroomId,
      marker: 'student-b',
    });

    archivedPlanItemId = await createArchivedPlanItem({
      source: ownFixture,
      schoolId,
      academicYearId: academic.academicYearId,
      termId: academic.termId,
      teacherUserId,
      marker: 'archived',
    });

    const crossAcademic = await createAcademicContext(crossSchoolId);
    const crossTeacherId = await createUserWithMembership({
      email: `${marker}-cross-teacher@example.test`,
      firstName: 'Cross',
      lastName: 'Teacher',
      userType: UserType.TEACHER,
      roleId: teacherRole.id,
      organizationId: crossOrganizationId,
      schoolId: crossSchoolId,
    });
    crossSchoolFixture = await createLessonFixture({
      organizationId: crossOrganizationId,
      schoolId: crossSchoolId,
      academicYearId: crossAcademic.academicYearId,
      termId: crossAcademic.termId,
      teacherUserId: crossTeacherId,
      marker: 'cross',
    });

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    studentAAuth = await login(studentAEmail);
    teacherAuth = await login(teacherEmail);
    parentAuth = await login(parentEmail);
    adminAuth = await login(adminEmail);
  });

  afterAll(async () => {
    try {
      if (app) await app.close();
      await cleanupData();
    } finally {
      if (prisma) await prisma.$disconnect();
    }
  });

  it('denies non-parent actors from Parent App child lesson routes', async () => {
    for (const auth of [studentAAuth, teacherAuth, adminAuth]) {
      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/parent/children/${childStudentId}/lessons/today`)
        .query({ date: '2026-09-14' })
        .set('Authorization', bearer(auth))
        .expect(403);

      await request(app.getHttpServer())
        .get(
          `${GLOBAL_PREFIX}/parent/children/${childStudentId}/lessons/${ownFixture.lessonPlanItemId}`,
        )
        .set('Authorization', bearer(auth))
        .expect(403);
    }
  });

  it('hides another classroom, cross-school, and archived lesson items', async () => {
    for (const hiddenItemId of [
      otherClassroomFixture.lessonPlanItemId,
      crossSchoolFixture.lessonPlanItemId,
      archivedPlanItemId,
    ]) {
      const response = await request(app.getHttpServer())
        .get(
          `${GLOBAL_PREFIX}/parent/children/${childStudentId}/lessons/${hiddenItemId}`,
        )
        .set('Authorization', bearer(parentAuth))
        .expect(404);

      expect(JSON.stringify(response.body)).not.toContain(hiddenItemId);
    }
  });

  it('does not leak hidden lesson existence through list routes', async () => {
    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/parent/children/${childStudentId}/lessons/today`)
      .query({ date: '2026-09-14' })
      .set('Authorization', bearer(parentAuth))
      .expect(200);
    const json = JSON.stringify(response.body);

    expect(json).toContain(ownFixture.lessonPlanItemId);
    expect(json).not.toContain(otherClassroomFixture.lessonPlanItemId);
    expect(json).not.toContain(crossSchoolFixture.lessonPlanItemId);
    expect(json).not.toContain(archivedPlanItemId);
  });

  it('returns safe lesson content without tenant, storage, or teacher-only fields', async () => {
    const response = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/parent/children/${childStudentId}/lessons/${ownFixture.lessonPlanItemId}`,
      )
      .set('Authorization', bearer(parentAuth))
      .expect(200);
    const json = JSON.stringify(response.body);

    expect(json).not.toContain('teacher private note');
    expect(json).not.toContain('hidden deleted content');
    for (const forbiddenKey of [
      'schoolId',
      'organizationId',
      'membershipId',
      'roleId',
      'email',
      'passwordHash',
      'deletedAt',
      'objectKey',
      'bucket',
      'uploaderId',
      'createdByUserId',
      'updatedByUserId',
      'notes',
    ]) {
      expectNoObjectKey(response.body, forbiddenKey);
    }
  });

  it('registers Parent App child lesson routes', () => {
    expect(listRegisteredRoutes()).toEqual(
      expect.arrayContaining([
        'GET /api/v1/parent/children/:studentId/lessons/today',
        'GET /api/v1/parent/children/:studentId/lessons/week',
        'GET /api/v1/parent/children/:studentId/lessons/:lessonPlanItemId',
      ]),
    );
  });

  async function findSystemRole(key: string) {
    const role = await prisma.role.findFirst({
      where: { key, schoolId: null, isSystem: true },
      select: { id: true },
    });
    if (!role) throw new Error(`${key} system role not found - run seed.`);
    return role;
  }

  async function createOrganization(label: string): Promise<string> {
    const organization = await prisma.organization.create({
      data: {
        slug: `${marker}-${label}-org`,
        name: `${marker} ${label} Org`,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    cleanup.organizationIds.add(organization.id);
    return organization.id;
  }

  async function createSchool(
    organizationIdForSchool: string,
    label: string,
  ): Promise<string> {
    const school = await prisma.school.create({
      data: {
        organizationId: organizationIdForSchool,
        slug: `${marker}-${label}-school`,
        name: `${marker} ${label} School`,
        status: SchoolStatus.ACTIVE,
      },
      select: { id: true },
    });
    cleanup.schoolIds.add(school.id);
    return school.id;
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
    cleanup.userIds.add(user.id);

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

  async function createAcademicContext(
    schoolIdForContext: string,
  ): Promise<AcademicContext> {
    const academicYear = await prisma.academicYear.create({
      data: {
        schoolId: schoolIdForContext,
        nameAr: `${marker}-${schoolIdForContext}-year-ar`,
        nameEn: `${marker}-${schoolIdForContext}-year`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2027-06-30T00:00:00.000Z'),
        isActive: true,
      },
      select: { id: true },
    });
    cleanup.academicYearIds.add(academicYear.id);

    const term = await prisma.term.create({
      data: {
        schoolId: schoolIdForContext,
        academicYearId: academicYear.id,
        nameAr: `${marker}-${schoolIdForContext}-term-ar`,
        nameEn: `${marker}-${schoolIdForContext}-term`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2026-12-31T00:00:00.000Z'),
        isActive: true,
      },
      select: { id: true },
    });
    cleanup.termIds.add(term.id);

    return {
      academicYearId: academicYear.id,
      termId: term.id,
    };
  }

  async function createStudentEnrollment(params: {
    organizationId: string;
    schoolId: string;
    userId: string;
    academicYearId: string;
    termId: string;
    classroomId: string;
    marker: string;
  }): Promise<{ studentId: string; enrollmentId: string }> {
    const student = await prisma.student.create({
      data: {
        organizationId: params.organizationId,
        schoolId: params.schoolId,
        userId: params.userId,
        firstName: `${marker}-${params.marker}-student`,
        lastName: 'Learner',
        status: StudentStatus.ACTIVE,
      },
      select: { id: true },
    });
    cleanup.studentIds.add(student.id);

    const enrollment = await prisma.enrollment.create({
      data: {
        schoolId: params.schoolId,
        studentId: student.id,
        academicYearId: params.academicYearId,
        termId: params.termId,
        classroomId: params.classroomId,
        status: StudentEnrollmentStatus.ACTIVE,
        enrolledAt: new Date('2026-09-01T00:00:00.000Z'),
      },
      select: { id: true },
    });
    cleanup.enrollmentIds.add(enrollment.id);

    return {
      studentId: student.id,
      enrollmentId: enrollment.id,
    };
  }

  async function createGuardian(params: {
    organizationId: string;
    schoolId: string;
    userId: string;
    marker: string;
  }): Promise<string> {
    const guardian = await prisma.guardian.create({
      data: {
        organizationId: params.organizationId,
        schoolId: params.schoolId,
        userId: params.userId,
        firstName: `${marker}-${params.marker}-guardian`,
        lastName: 'Parent',
        phone: `${marker}-${params.marker}-phone`,
        email: `${marker}-${params.marker}-guardian@example.test`,
        relation: 'parent',
        isPrimary: true,
      },
      select: { id: true },
    });
    cleanup.guardianIds.add(guardian.id);

    return guardian.id;
  }

  async function linkGuardianToStudent(params: {
    schoolId: string;
    studentId: string;
    guardianId: string;
  }): Promise<void> {
    const link = await prisma.studentGuardian.create({
      data: {
        schoolId: params.schoolId,
        studentId: params.studentId,
        guardianId: params.guardianId,
        isPrimary: true,
      },
      select: { id: true },
    });
    cleanup.studentGuardianIds.add(link.id);
  }

  async function createLessonFixture(params: {
    organizationId: string;
    schoolId: string;
    academicYearId: string;
    termId: string;
    teacherUserId: string;
    marker: string;
    itemNotes?: string;
  }): Promise<LessonFixture> {
    const stage = await prisma.stage.create({
      data: {
        schoolId: params.schoolId,
        nameAr: `${marker}-${params.marker}-stage-ar`,
        nameEn: `${marker}-${params.marker}-stage`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    cleanup.stageIds.add(stage.id);

    const grade = await prisma.grade.create({
      data: {
        schoolId: params.schoolId,
        stageId: stage.id,
        nameAr: `${marker}-${params.marker}-grade-ar`,
        nameEn: `${marker}-${params.marker}-grade`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    cleanup.gradeIds.add(grade.id);

    const section = await prisma.section.create({
      data: {
        schoolId: params.schoolId,
        gradeId: grade.id,
        nameAr: `${marker}-${params.marker}-section-ar`,
        nameEn: `${marker}-${params.marker}-section`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    cleanup.sectionIds.add(section.id);

    const room = await prisma.room.create({
      data: {
        schoolId: params.schoolId,
        nameAr: `${marker}-${params.marker}-room-ar`,
        nameEn: `${marker}-${params.marker}-room`,
        isActive: true,
      },
      select: { id: true },
    });
    cleanup.roomIds.add(room.id);

    const classroom = await prisma.classroom.create({
      data: {
        schoolId: params.schoolId,
        sectionId: section.id,
        roomId: room.id,
        nameAr: `${marker}-${params.marker}-classroom-ar`,
        nameEn: `${marker}-${params.marker}-classroom`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    cleanup.classroomIds.add(classroom.id);

    const subject = await prisma.subject.create({
      data: {
        schoolId: params.schoolId,
        nameAr: `${marker}-${params.marker}-subject-ar`,
        nameEn: `${marker}-${params.marker}-subject`,
        code: `${suffix}-${params.marker}`.slice(0, 30).toUpperCase(),
        color: '#3366ff',
        isActive: true,
      },
      select: { id: true },
    });
    cleanup.subjectIds.add(subject.id);

    const allocation = await prisma.teacherSubjectAllocation.create({
      data: {
        schoolId: params.schoolId,
        teacherUserId: params.teacherUserId,
        subjectId: subject.id,
        classroomId: classroom.id,
        termId: params.termId,
      },
      select: { id: true },
    });
    cleanup.allocationIds.add(allocation.id);

    const config = await prisma.timetableConfig.create({
      data: {
        schoolId: params.schoolId,
        academicYearId: params.academicYearId,
        termId: params.termId,
        name: `${marker}-${params.marker}-config`,
        weekStartDay: 1,
        activeDays: [1, 2, 3, 4, 5],
        scopeType: TimetableScopeType.CLASSROOM,
        scopeKey: classroom.id,
        gradeId: grade.id,
        sectionId: section.id,
        classroomId: classroom.id,
        status: TimetableConfigStatus.ACTIVE,
      },
      select: { id: true },
    });
    cleanup.timetableConfigIds.add(config.id);

    const period = await prisma.timetablePeriod.create({
      data: {
        schoolId: params.schoolId,
        timetableConfigId: config.id,
        periodIndex: 1,
        label: 'Period 1',
        startTime: '08:00',
        endTime: '08:45',
        type: TimetablePeriodType.CLASS,
        isInstructional: true,
      },
      select: { id: true },
    });
    cleanup.timetablePeriodIds.add(period.id);

    const entry = await prisma.timetableEntry.create({
      data: {
        schoolId: params.schoolId,
        academicYearId: params.academicYearId,
        termId: params.termId,
        timetableConfigId: config.id,
        periodId: period.id,
        dayOfWeek: 1,
        gradeId: grade.id,
        sectionId: section.id,
        classroomId: classroom.id,
        subjectId: subject.id,
        teacherUserId: params.teacherUserId,
        teacherSubjectAllocationId: allocation.id,
        roomId: room.id,
        status: TimetableEntryStatus.ACTIVE,
      },
      select: { id: true },
    });
    cleanup.timetableEntryIds.add(entry.id);

    const publication = await prisma.timetablePublication.create({
      data: {
        schoolId: params.schoolId,
        academicYearId: params.academicYearId,
        termId: params.termId,
        timetableConfigId: config.id,
        status: TimetablePublicationStatus.PUBLISHED,
        publishedAt: new Date('2026-09-01T00:00:00.000Z'),
        publishedByUserId: params.teacherUserId,
      },
      select: { id: true },
    });
    cleanup.timetablePublicationIds.add(publication.id);

    const curriculum = await prisma.curriculum.create({
      data: {
        schoolId: params.schoolId,
        academicYearId: params.academicYearId,
        termId: params.termId,
        gradeId: grade.id,
        subjectId: subject.id,
        title: `${marker}-${params.marker}-curriculum`,
        status: CurriculumStatus.ACTIVE,
        createdByUserId: params.teacherUserId,
      },
      select: { id: true },
    });
    cleanup.curriculumIds.add(curriculum.id);

    const unit = await prisma.curriculumUnit.create({
      data: {
        schoolId: params.schoolId,
        curriculumId: curriculum.id,
        title: `${marker}-${params.marker}-unit`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    cleanup.curriculumUnitIds.add(unit.id);

    const lesson = await prisma.curriculumLesson.create({
      data: {
        schoolId: params.schoolId,
        curriculumId: curriculum.id,
        unitId: unit.id,
        title: `${marker}-${params.marker}-lesson`,
        objectives: ['objective'],
        sortOrder: 1,
      },
      select: { id: true },
    });
    cleanup.curriculumLessonIds.add(lesson.id);

    await prisma.lessonContentItem.create({
      data: {
        schoolId: params.schoolId,
        curriculumId: curriculum.id,
        unitId: unit.id,
        lessonId: lesson.id,
        type: LessonContentItemType.TEXT,
        title: `${marker}-${params.marker}-text`,
        bodyText: 'Parent-visible content',
        sortOrder: 1,
        isRequired: true,
        estimatedMinutes: 10,
        createdByUserId: params.teacherUserId,
      },
    });

    const file = await prisma.file.create({
      data: {
        organizationId: params.organizationId,
        schoolId: params.schoolId,
        uploaderId: params.teacherUserId,
        bucket: `${marker}-${params.marker}-bucket`,
        objectKey: `${marker}-${params.marker}-object-key`,
        originalName: `${marker}-${params.marker}.pdf`,
        mimeType: 'application/pdf',
        sizeBytes: BigInt(2048),
      },
      select: { id: true },
    });
    cleanup.fileIds.add(file.id);

    await prisma.lessonContentItem.create({
      data: {
        schoolId: params.schoolId,
        curriculumId: curriculum.id,
        unitId: unit.id,
        lessonId: lesson.id,
        type: LessonContentItemType.FILE,
        title: `${marker}-${params.marker}-file`,
        fileId: file.id,
        sortOrder: 2,
        createdByUserId: params.teacherUserId,
      },
    });

    await prisma.lessonContentItem.create({
      data: {
        schoolId: params.schoolId,
        curriculumId: curriculum.id,
        unitId: unit.id,
        lessonId: lesson.id,
        type: LessonContentItemType.TEXT,
        title: `${marker}-${params.marker}-deleted`,
        bodyText: 'hidden deleted content',
        sortOrder: 3,
        createdByUserId: params.teacherUserId,
        deletedAt: new Date(),
      },
    });

    const lessonPlan = await prisma.lessonPlan.create({
      data: {
        schoolId: params.schoolId,
        academicYearId: params.academicYearId,
        termId: params.termId,
        teacherSubjectAllocationId: allocation.id,
        teacherUserId: params.teacherUserId,
        classroomId: classroom.id,
        subjectId: subject.id,
        curriculumId: curriculum.id,
        title: `${marker}-${params.marker}-plan`,
        status: LessonPlanStatus.ACTIVE,
        weekStartDate: new Date('2026-09-14T00:00:00.000Z'),
        weekEndDate: new Date('2026-09-20T00:00:00.000Z'),
        createdByUserId: params.teacherUserId,
      },
      select: { id: true },
    });
    cleanup.lessonPlanIds.add(lessonPlan.id);

    const item = await prisma.lessonPlanItem.create({
      data: {
        schoolId: params.schoolId,
        lessonPlanId: lessonPlan.id,
        curriculumId: curriculum.id,
        unitId: unit.id,
        lessonId: lesson.id,
        timetableEntryId: entry.id,
        plannedDate: new Date('2026-09-14T00:00:00.000Z'),
        dayOfWeek: 1,
        periodId: period.id,
        periodLabel: 'Period 1',
        title: `${marker}-${params.marker}-item`,
        notes: params.itemNotes ?? null,
        status: LessonPlanItemStatus.PLANNED,
        sortOrder: 1,
        createdByUserId: params.teacherUserId,
      },
      select: { id: true },
    });
    cleanup.lessonPlanItemIds.add(item.id);

    return {
      allocationId: allocation.id,
      classroomId: classroom.id,
      subjectId: subject.id,
      lessonPlanItemId: item.id,
      timetableEntryId: entry.id,
    };
  }

  async function createArchivedPlanItem(params: {
    source: LessonFixture;
    schoolId: string;
    academicYearId: string;
    termId: string;
    teacherUserId: string;
    marker: string;
  }): Promise<string> {
    const classroom = await prisma.classroom.findUniqueOrThrow({
      where: {
        id_schoolId: {
          id: params.source.classroomId,
          schoolId: params.schoolId,
        },
      },
      select: { section: { select: { gradeId: true } } },
    });
    const subject = await prisma.subject.create({
      data: {
        schoolId: params.schoolId,
        nameAr: `${marker}-${params.marker}-subject-ar`,
        nameEn: `${marker}-${params.marker}-subject`,
        code: `${suffix}-${params.marker}`.slice(0, 30).toUpperCase(),
        color: '#6633ff',
        isActive: true,
      },
      select: { id: true },
    });
    cleanup.subjectIds.add(subject.id);

    const allocation = await prisma.teacherSubjectAllocation.create({
      data: {
        schoolId: params.schoolId,
        teacherUserId: params.teacherUserId,
        subjectId: subject.id,
        classroomId: params.source.classroomId,
        termId: params.termId,
      },
      select: { id: true },
    });
    cleanup.allocationIds.add(allocation.id);

    const curriculum = await prisma.curriculum.create({
      data: {
        schoolId: params.schoolId,
        academicYearId: params.academicYearId,
        termId: params.termId,
        gradeId: classroom.section.gradeId,
        subjectId: subject.id,
        title: `${marker}-${params.marker}-curriculum`,
        status: CurriculumStatus.ACTIVE,
        createdByUserId: params.teacherUserId,
      },
      select: { id: true },
    });
    cleanup.curriculumIds.add(curriculum.id);

    const unit = await prisma.curriculumUnit.create({
      data: {
        schoolId: params.schoolId,
        curriculumId: curriculum.id,
        title: `${marker}-${params.marker}-unit`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    cleanup.curriculumUnitIds.add(unit.id);

    const lesson = await prisma.curriculumLesson.create({
      data: {
        schoolId: params.schoolId,
        curriculumId: curriculum.id,
        unitId: unit.id,
        title: `${marker}-${params.marker}-lesson`,
        objectives: ['objective'],
        sortOrder: 1,
      },
      select: { id: true },
    });
    cleanup.curriculumLessonIds.add(lesson.id);

    const plan = await prisma.lessonPlan.create({
      data: {
        schoolId: params.schoolId,
        academicYearId: params.academicYearId,
        termId: params.termId,
        teacherSubjectAllocationId: allocation.id,
        teacherUserId: params.teacherUserId,
        classroomId: params.source.classroomId,
        subjectId: subject.id,
        curriculumId: curriculum.id,
        title: `${marker}-${params.marker}-plan`,
        status: LessonPlanStatus.ARCHIVED,
        weekStartDate: new Date('2026-09-14T00:00:00.000Z'),
        weekEndDate: new Date('2026-09-20T00:00:00.000Z'),
        createdByUserId: params.teacherUserId,
      },
      select: { id: true },
    });
    cleanup.lessonPlanIds.add(plan.id);

    const item = await prisma.lessonPlanItem.create({
      data: {
        schoolId: params.schoolId,
        lessonPlanId: plan.id,
        curriculumId: curriculum.id,
        unitId: unit.id,
        lessonId: lesson.id,
        timetableEntryId: null,
        plannedDate: new Date('2026-09-14T00:00:00.000Z'),
        dayOfWeek: 1,
        title: `${marker}-${params.marker}-item`,
        status: LessonPlanItemStatus.PLANNED,
        sortOrder: 2,
        createdByUserId: params.teacherUserId,
      },
      select: { id: true },
    });
    cleanup.lessonPlanItemIds.add(item.id);
    return item.id;
  }

  async function login(email: string): Promise<AuthTokens> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email, password: PASSWORD })
      .expect(200);

    return { accessToken: response.body.accessToken };
  }

  function bearer(tokens: AuthTokens): string {
    return `Bearer ${tokens.accessToken}`;
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

  async function cleanupData(): Promise<void> {
    await prisma.session.deleteMany({
      where: { userId: { in: [...cleanup.userIds] } },
    });
    await prisma.lessonPlanItem.deleteMany({
      where: { id: { in: [...cleanup.lessonPlanItemIds] } },
    });
    await prisma.lessonPlan.deleteMany({
      where: { id: { in: [...cleanup.lessonPlanIds] } },
    });
    await prisma.lessonContentItem.deleteMany({
      where: { schoolId: { in: [...cleanup.schoolIds] } },
    });
    await prisma.curriculumLesson.deleteMany({
      where: { id: { in: [...cleanup.curriculumLessonIds] } },
    });
    await prisma.curriculumUnit.deleteMany({
      where: { id: { in: [...cleanup.curriculumUnitIds] } },
    });
    await prisma.curriculum.deleteMany({
      where: { id: { in: [...cleanup.curriculumIds] } },
    });
    await prisma.timetablePublication.deleteMany({
      where: { id: { in: [...cleanup.timetablePublicationIds] } },
    });
    await prisma.timetableEntry.deleteMany({
      where: { id: { in: [...cleanup.timetableEntryIds] } },
    });
    await prisma.timetablePeriod.deleteMany({
      where: { id: { in: [...cleanup.timetablePeriodIds] } },
    });
    await prisma.timetableConfig.deleteMany({
      where: { id: { in: [...cleanup.timetableConfigIds] } },
    });
    await prisma.file.deleteMany({
      where: { id: { in: [...cleanup.fileIds] } },
    });
    await prisma.teacherSubjectAllocation.deleteMany({
      where: { id: { in: [...cleanup.allocationIds] } },
    });
    await prisma.subject.deleteMany({
      where: { id: { in: [...cleanup.subjectIds] } },
    });
    await prisma.enrollment.deleteMany({
      where: { id: { in: [...cleanup.enrollmentIds] } },
    });
    await prisma.studentGuardian.deleteMany({
      where: { id: { in: [...cleanup.studentGuardianIds] } },
    });
    await prisma.student.deleteMany({
      where: { id: { in: [...cleanup.studentIds] } },
    });
    await prisma.classroom.deleteMany({
      where: { id: { in: [...cleanup.classroomIds] } },
    });
    await prisma.room.deleteMany({
      where: { id: { in: [...cleanup.roomIds] } },
    });
    await prisma.section.deleteMany({
      where: { id: { in: [...cleanup.sectionIds] } },
    });
    await prisma.grade.deleteMany({
      where: { id: { in: [...cleanup.gradeIds] } },
    });
    await prisma.stage.deleteMany({
      where: { id: { in: [...cleanup.stageIds] } },
    });
    await prisma.term.deleteMany({
      where: { id: { in: [...cleanup.termIds] } },
    });
    await prisma.academicYear.deleteMany({
      where: { id: { in: [...cleanup.academicYearIds] } },
    });
    await prisma.guardian.deleteMany({
      where: { id: { in: [...cleanup.guardianIds] } },
    });
    await prisma.membership.deleteMany({
      where: { userId: { in: [...cleanup.userIds] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [...cleanup.userIds] } },
    });
    await prisma.school.deleteMany({
      where: { id: { in: [...cleanup.schoolIds] } },
    });
    await prisma.organization.deleteMany({
      where: { id: { in: [...cleanup.organizationIds] } },
    });
  }
});

function createCleanupState() {
  return {
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
    timetableConfigIds: new Set<string>(),
    timetablePeriodIds: new Set<string>(),
    timetableEntryIds: new Set<string>(),
    timetablePublicationIds: new Set<string>(),
    curriculumIds: new Set<string>(),
    curriculumUnitIds: new Set<string>(),
    curriculumLessonIds: new Set<string>(),
    lessonPlanIds: new Set<string>(),
    lessonPlanItemIds: new Set<string>(),
    fileIds: new Set<string>(),
    studentIds: new Set<string>(),
    enrollmentIds: new Set<string>(),
    guardianIds: new Set<string>(),
    studentGuardianIds: new Set<string>(),
  };
}
