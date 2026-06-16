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
const PASSWORD = 'TeacherLessonPrep123!';
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
  closedTermId: string;
};

type LessonFixture = {
  allocationId: string;
  classroomId: string;
  subjectId: string;
  curriculumId: string;
  unitId: string;
  lessonId: string;
  lessonPlanId: string;
  lessonPlanItemId: string;
  timetableEntryId: string;
};

jest.setTimeout(120000);

describe('Teacher App lesson preparation workflows (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;

  let organizationId = '';
  let crossOrganizationId = '';
  let schoolId = '';
  let crossSchoolId = '';
  let teacherAId = '';
  let teacherBId = '';
  let teacherAEmail = '';
  let teacherBEmail = '';
  let adminEmail = '';
  let parentEmail = '';
  let studentEmail = '';
  let academic: AcademicContext;
  let fixture: LessonFixture;
  let otherTeacherFixture: LessonFixture;
  let closedTermFixture: LessonFixture;
  let teacherAuth: AuthTokens;

  const suffix = randomUUID().split('-')[0];
  const marker = `s22g-e2e-${suffix}`;
  const cleanup = createCleanupState();

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

    organizationId = await createOrganization('main');
    crossOrganizationId = await createOrganization('cross');
    schoolId = await createSchool(organizationId, 'main');
    crossSchoolId = await createSchool(crossOrganizationId, 'cross');
    academic = await createAcademicContext(schoolId);

    teacherAEmail = `${marker}-teacher-a@example.test`;
    teacherBEmail = `${marker}-teacher-b@example.test`;
    adminEmail = `${marker}-admin@example.test`;
    parentEmail = `${marker}-parent@example.test`;
    studentEmail = `${marker}-student@example.test`;

    teacherAId = await createUserWithMembership({
      email: teacherAEmail,
      firstName: 'Teacher',
      lastName: 'A',
      userType: UserType.TEACHER,
      roleId: teacherRole.id,
      organizationId,
      schoolId,
    });
    teacherBId = await createUserWithMembership({
      email: teacherBEmail,
      firstName: 'Teacher',
      lastName: 'B',
      userType: UserType.TEACHER,
      roleId: teacherRole.id,
      organizationId,
      schoolId,
    });
    await createUserWithMembership({
      email: adminEmail,
      firstName: 'School',
      lastName: 'Admin',
      userType: UserType.SCHOOL_USER,
      roleId: schoolAdminRole.id,
      organizationId,
      schoolId,
    });
    await createUserWithMembership({
      email: parentEmail,
      firstName: 'Parent',
      lastName: 'User',
      userType: UserType.PARENT,
      roleId: parentRole.id,
      organizationId,
      schoolId,
    });
    await createUserWithMembership({
      email: studentEmail,
      firstName: 'Student',
      lastName: 'User',
      userType: UserType.STUDENT,
      roleId: studentRole.id,
      organizationId,
      schoolId,
    });

    fixture = await createLessonFixture({
      organizationId,
      schoolId,
      academicYearId: academic.academicYearId,
      termId: academic.termId,
      teacherUserId: teacherAId,
      marker: 'own',
      plannedDate: '2026-09-14',
      deletedContent: true,
    });
    otherTeacherFixture = await createLessonFixture({
      organizationId,
      schoolId,
      academicYearId: academic.academicYearId,
      termId: academic.termId,
      teacherUserId: teacherBId,
      marker: 'other',
      plannedDate: '2026-09-14',
    });
    closedTermFixture = await createLessonFixture({
      organizationId,
      schoolId,
      academicYearId: academic.academicYearId,
      termId: academic.closedTermId,
      teacherUserId: teacherAId,
      marker: 'closed',
      plannedDate: '2026-10-05',
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
    await createLessonFixture({
      organizationId: crossOrganizationId,
      schoolId: crossSchoolId,
      academicYearId: crossAcademic.academicYearId,
      termId: crossAcademic.termId,
      teacherUserId: crossTeacherId,
      marker: 'cross',
      plannedDate: '2026-09-14',
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

    teacherAuth = await login(teacherAEmail);
  });

  afterAll(async () => {
    try {
      if (app) await app.close();
      await cleanupData();
    } finally {
      if (prisma) await prisma.$disconnect();
    }
  });

  it('registers Teacher App lesson-preparation routes and keeps Student/Parent lesson routes absent', () => {
    const routes = listRegisteredRoutes();

    expect(routes).toEqual(
      expect.arrayContaining([
        'GET /api/v1/teacher/lesson-preparation/today',
        'GET /api/v1/teacher/lesson-preparation/week',
        'GET /api/v1/teacher/lesson-preparation/:lessonPlanItemId',
        'PATCH /api/v1/teacher/lesson-preparation/:lessonPlanItemId/status',
        'GET /api/v1/teacher/schedule',
        'GET /api/v1/teacher/my-classes',
        'GET /api/v1/academics/lesson-plans',
      ]),
    );
    expect(routes).not.toContain('GET /api/v1/student/lessons/today');
    expect(routes).not.toContain('GET /api/v1/parent/children/:studentId/lessons/today');
  });

  it('lists today and week lesson-preparation items for the teacher only', async () => {
    const today = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/lesson-preparation/today`)
      .query({ date: '2026-09-14' })
      .set('Authorization', bearer(teacherAuth))
      .expect(200);

    expect(today.body).toMatchObject({
      date: '2026-09-14',
      dayOfWeek: 1,
      items: [
        expect.objectContaining({
          lessonPlanItemId: fixture.lessonPlanItemId,
          lessonPlanId: fixture.lessonPlanId,
          teacherSubjectAllocationId: fixture.allocationId,
          timetableEntryId: fixture.timetableEntryId,
          plannedDate: '2026-09-14',
          status: 'planned',
        }),
      ],
    });
    expect(JSON.stringify(today.body)).not.toContain(
      otherTeacherFixture.lessonPlanItemId,
    );
    expectNoObjectKey(today.body, 'schoolId');
    expectNoObjectKey(today.body, 'organizationId');
    expectNoObjectKey(today.body, 'deletedAt');

    const week = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/lesson-preparation/week`)
      .query({ date: '2026-09-16' })
      .set('Authorization', bearer(teacherAuth))
      .expect(200);

    expect(week.body.weekStartDate).toBe('2026-09-13');
    expect(week.body.weekEndDate).toBe('2026-09-19');
    expect(week.body.days).toHaveLength(7);
    expect(
      week.body.days.find((day: { date: string }) => day.date === '2026-09-14')
        .items,
    ).toEqual([
      expect.objectContaining({
        lessonPlanItemId: fixture.lessonPlanItemId,
      }),
    ]);
  });

  it('returns detail with safe curriculum lesson content metadata only', async () => {
    const detail = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/teacher/lesson-preparation/${fixture.lessonPlanItemId}`,
      )
      .set('Authorization', bearer(teacherAuth))
      .expect(200);

    expect(detail.body).toMatchObject({
      lessonPlanItemId: fixture.lessonPlanItemId,
      subject: { id: fixture.subjectId, code: expect.any(String) },
      classroom: { id: fixture.classroomId },
      period: {
        id: expect.any(String),
        periodIndex: 1,
        startTime: '08:00',
        endTime: '08:45',
      },
      curriculum: { id: fixture.curriculumId },
      unit: { id: fixture.unitId },
      lesson: { id: fixture.lessonId, objectives: ['objective'] },
    });
    expect(detail.body.content).toEqual([
      expect.objectContaining({
        type: 'text',
        title: `${marker}-own-text`,
        file: null,
      }),
      expect.objectContaining({
        type: 'file',
        title: `${marker}-own-file`,
        file: {
          fileId: expect.any(String),
          filename: `${marker}-own.pdf`,
          mimeType: 'application/pdf',
          sizeBytes: '2048',
        },
      }),
    ]);
    expect(JSON.stringify(detail.body)).not.toContain('object_key');
    expect(JSON.stringify(detail.body)).not.toContain('objectKey');
    expect(JSON.stringify(detail.body)).not.toContain(`${marker}-own-deleted`);
    expectNoObjectKey(detail.body, 'schoolId');
    expectNoObjectKey(detail.body, 'organizationId');
    expectNoObjectKey(detail.body, 'email');
    expectNoObjectKey(detail.body, 'deletedAt');
  });

  it('updates status and notes without adding prepared or app-facing side effects', async () => {
    const updated = await request(app.getHttpServer())
      .patch(
        `${GLOBAL_PREFIX}/teacher/lesson-preparation/${fixture.lessonPlanItemId}/status`,
      )
      .set('Authorization', bearer(teacherAuth))
      .send({ status: 'in_progress', notes: 'Prepared with worksheet' })
      .expect(200);

    expect(updated.body).toMatchObject({
      lessonPlanItemId: fixture.lessonPlanItemId,
      status: 'in_progress',
      notes: 'Prepared with worksheet',
    });
    await expect(
      prisma.lessonPlanItem.findUniqueOrThrow({
        where: { id: fixture.lessonPlanItemId },
        select: { status: true, notes: true, updatedByUserId: true },
      }),
    ).resolves.toMatchObject({
      status: LessonPlanItemStatus.IN_PROGRESS,
      notes: 'Prepared with worksheet',
      updatedByUserId: teacherAId,
    });

    await request(app.getHttpServer())
      .patch(
        `${GLOBAL_PREFIX}/teacher/lesson-preparation/${fixture.lessonPlanItemId}/status`,
      )
      .set('Authorization', bearer(teacherAuth))
      .send({ status: 'done' })
      .expect(200)
      .expect((response) => {
        expect(response.body.status).toBe('done');
      });

    await request(app.getHttpServer())
      .patch(
        `${GLOBAL_PREFIX}/teacher/lesson-preparation/${fixture.lessonPlanItemId}/status`,
      )
      .set('Authorization', bearer(teacherAuth))
      .send({ status: 'prepared' })
      .expect(400);
  });

  it('denies closed-term status writes and preserves existing Teacher App reads', async () => {
    await request(app.getHttpServer())
      .patch(
        `${GLOBAL_PREFIX}/teacher/lesson-preparation/${closedTermFixture.lessonPlanItemId}/status`,
      )
      .set('Authorization', bearer(teacherAuth))
      .send({ status: 'in_progress' })
      .expect(409)
      .expect((response) => {
        expect(response.body.error.code).toBe(
          'teacher_app.lesson_preparation.closed_term',
        );
      });

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/schedule`)
      .query({ date: '2026-09-14' })
      .set('Authorization', bearer(teacherAuth))
      .expect(200);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/my-classes`)
      .set('Authorization', bearer(teacherAuth))
      .expect(200)
      .expect((response) => {
        expect(JSON.stringify(response.body)).toContain(fixture.allocationId);
      });
  });

  async function findSystemRole(key: string): Promise<{ id: string }> {
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

    const closedTerm = await prisma.term.create({
      data: {
        schoolId: schoolIdForContext,
        academicYearId: academicYear.id,
        nameAr: `${marker}-${schoolIdForContext}-closed-term-ar`,
        nameEn: `${marker}-${schoolIdForContext}-closed-term`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2026-12-31T00:00:00.000Z'),
        isActive: false,
      },
      select: { id: true },
    });
    cleanup.termIds.add(closedTerm.id);

    return {
      academicYearId: academicYear.id,
      termId: term.id,
      closedTermId: closedTerm.id,
    };
  }

  async function createLessonFixture(params: {
    organizationId: string;
    schoolId: string;
    academicYearId: string;
    termId: string;
    teacherUserId: string;
    marker: string;
    plannedDate: string;
    deletedContent?: boolean;
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
        code: `${suffix}-${params.marker}`.toUpperCase(),
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
        weekStartDay: 0,
        activeDays: [0, 1, 2, 3, 4],
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
        bodyText: 'Teacher-facing content',
        sortOrder: 1,
        isRequired: true,
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

    if (params.deletedContent) {
      await prisma.lessonContentItem.create({
        data: {
          schoolId: params.schoolId,
          curriculumId: curriculum.id,
          unitId: unit.id,
          lessonId: lesson.id,
          type: LessonContentItemType.TEXT,
          title: `${marker}-${params.marker}-deleted`,
          bodyText: 'Should stay hidden',
          sortOrder: 3,
          createdByUserId: params.teacherUserId,
          deletedAt: new Date(),
        },
      });
    }

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
        weekStartDate: new Date('2026-09-13T00:00:00.000Z'),
        weekEndDate: new Date('2026-09-19T00:00:00.000Z'),
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
        plannedDate: new Date(`${params.plannedDate}T00:00:00.000Z`),
        dayOfWeek: 1,
        periodId: period.id,
        periodLabel: 'Period 1',
        title: `${marker}-${params.marker}-item`,
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
      curriculumId: curriculum.id,
      unitId: unit.id,
      lessonId: lesson.id,
      lessonPlanId: lessonPlan.id,
      lessonPlanItemId: item.id,
      timetableEntryId: entry.id,
    };
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
  };
}
