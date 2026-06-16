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
const PASSWORD = 'StudentLessons123!';
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
  curriculumId: string;
  unitId: string;
  lessonId: string;
  lessonPlanId: string;
  lessonPlanItemId: string;
  timetableEntryId: string;
};

jest.setTimeout(120000);

describe('Student App lesson content workflows (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;

  let organizationId = '';
  let crossOrganizationId = '';
  let schoolId = '';
  let crossSchoolId = '';
  let teacherUserId = '';
  let studentUserId = '';
  let studentEmail = '';
  let academic: AcademicContext;
  let fixture: LessonFixture;
  let otherClassroomFixture: LessonFixture;
  let archivedPlanItemId = '';
  let archivedCurriculumItemId = '';
  let studentAuth: AuthTokens;

  const suffix = randomUUID().split('-')[0];
  const marker = `s22h-e2e-${suffix}`;
  const cleanup = createCleanupState();

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const [teacherRole, studentRole] = await Promise.all([
      findSystemRole('teacher'),
      findSystemRole('student'),
    ]);

    organizationId = await createOrganization('main');
    crossOrganizationId = await createOrganization('cross');
    schoolId = await createSchool(organizationId, 'main');
    crossSchoolId = await createSchool(crossOrganizationId, 'cross');
    academic = await createAcademicContext(schoolId);

    teacherUserId = await createUserWithMembership({
      email: `${marker}-teacher@example.test`,
      firstName: 'Teacher',
      lastName: 'User',
      userType: UserType.TEACHER,
      roleId: teacherRole.id,
      organizationId,
      schoolId,
    });
    studentEmail = `${marker}-student@example.test`;
    studentUserId = await createUserWithMembership({
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
      teacherUserId,
      marker: 'own',
      plannedDate: '2026-09-14',
      deletedContent: true,
      itemNotes: 'teacher-only note',
    });
    await createStudentEnrollment({
      organizationId,
      schoolId,
      userId: studentUserId,
      academicYearId: academic.academicYearId,
      termId: academic.termId,
      classroomId: fixture.classroomId,
      marker: 'own',
    });

    otherClassroomFixture = await createLessonFixture({
      organizationId,
      schoolId,
      academicYearId: academic.academicYearId,
      termId: academic.termId,
      teacherUserId,
      marker: 'other-class',
      plannedDate: '2026-09-14',
    });

    archivedPlanItemId = await createExistingScopeLessonPlanItem({
      source: fixture,
      schoolId,
      academicYearId: academic.academicYearId,
      termId: academic.termId,
      teacherUserId,
      marker: 'archived-plan',
      planStatus: LessonPlanStatus.ARCHIVED,
    });
    archivedCurriculumItemId = await createExistingScopeLessonPlanItem({
      source: fixture,
      schoolId,
      academicYearId: academic.academicYearId,
      termId: academic.termId,
      teacherUserId,
      marker: 'archived-curriculum',
      curriculumStatus: CurriculumStatus.ARCHIVED,
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

    studentAuth = await login(studentEmail);
  });

  afterAll(async () => {
    try {
      if (app) await app.close();
      await cleanupData();
    } finally {
      if (prisma) await prisma.$disconnect();
    }
  });

  it('registers Student App lesson routes and keeps Parent lesson routes absent', () => {
    const routes = listRegisteredRoutes();

    expect(routes).toEqual(
      expect.arrayContaining([
        'GET /api/v1/student/lessons/today',
        'GET /api/v1/student/lessons/week',
        'GET /api/v1/student/lessons/:lessonPlanItemId',
        'GET /api/v1/student/schedule',
        'GET /api/v1/student/subjects',
        'GET /api/v1/teacher/lesson-preparation/today',
        'GET /api/v1/academics/lesson-plans',
      ]),
    );
    expect(routes).not.toContain(
      'GET /api/v1/parent/children/:studentId/lessons/today',
    );
  });

  it('lists today and week visible lessons for the current student classroom', async () => {
    const today = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/lessons/today`)
      .query({ date: '2026-09-14' })
      .set('Authorization', bearer(studentAuth))
      .expect(200);

    expect(today.body).toMatchObject({
      date: '2026-09-14',
      dayOfWeek: 1,
      items: [
        expect.objectContaining({
          lessonPlanItemId: fixture.lessonPlanItemId,
          lessonPlanId: fixture.lessonPlanId,
          timetableEntryId: fixture.timetableEntryId,
          plannedDate: '2026-09-14',
          status: 'planned',
        }),
      ],
    });
    expect(JSON.stringify(today.body)).not.toContain(
      otherClassroomFixture.lessonPlanItemId,
    );

    const week = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/lessons/week`)
      .query({ date: '2026-09-16' })
      .set('Authorization', bearer(studentAuth))
      .expect(200);

    expect(week.body.weekStartDate).toBe('2026-09-14');
    expect(week.body.days).toHaveLength(7);
    expect(
      week.body.days.find((day: { date: string }) => day.date === '2026-09-14')
        ?.items,
    ).toEqual([
      expect.objectContaining({
        lessonPlanItemId: fixture.lessonPlanItemId,
      }),
    ]);
  });

  it('returns safe lesson detail with curriculum content and no teacher-only fields', async () => {
    const detail = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/lessons/${fixture.lessonPlanItemId}`)
      .set('Authorization', bearer(studentAuth))
      .expect(200);

    expect(detail.body).toMatchObject({
      lessonPlanItemId: fixture.lessonPlanItemId,
      subject: expect.objectContaining({ id: fixture.subjectId }),
      classroom: expect.objectContaining({ id: fixture.classroomId }),
      period: expect.objectContaining({
        label: 'Period 1',
        periodIndex: 1,
      }),
      curriculum: expect.objectContaining({ id: fixture.curriculumId }),
      unit: expect.objectContaining({ id: fixture.unitId }),
      lesson: expect.objectContaining({ id: fixture.lessonId }),
    });
    expect(detail.body.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'text',
          bodyText: 'Student-visible content',
          file: null,
          isRequired: true,
          estimatedMinutes: 10,
        }),
        expect.objectContaining({
          type: 'file',
          file: expect.objectContaining({
            filename: expect.stringContaining('.pdf'),
            mimeType: 'application/pdf',
            sizeBytes: '2048',
          }),
        }),
      ]),
    );
    const json = JSON.stringify(detail.body);
    expect(json).not.toContain('teacher-only note');
    expect(json).not.toContain('Should stay hidden');
    expectNoObjectKey(detail.body, 'schoolId');
    expectNoObjectKey(detail.body, 'organizationId');
    expectNoObjectKey(detail.body, 'deletedAt');
    expectNoObjectKey(detail.body, 'objectKey');
    expectNoObjectKey(detail.body, 'bucket');
    expectNoObjectKey(detail.body, 'uploaderId');
    expectNoObjectKey(detail.body, 'notes');
  });

  it('does not expose another classroom, archived plan, or archived curriculum lessons', async () => {
    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/student/lessons/${otherClassroomFixture.lessonPlanItemId}`,
      )
      .set('Authorization', bearer(studentAuth))
      .expect(404);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/lessons/${archivedPlanItemId}`)
      .set('Authorization', bearer(studentAuth))
      .expect(404);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/lessons/${archivedCurriculumItemId}`)
      .set('Authorization', bearer(studentAuth))
      .expect(404);
  });

  it('keeps existing Student schedule and subject routes working', async () => {
    const schedule = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/schedule`)
      .query({ date: '2026-09-14' })
      .set('Authorization', bearer(studentAuth))
      .expect(200);
    expect(schedule.body.items).toEqual([
      expect.objectContaining({
        timetableEntryId: fixture.timetableEntryId,
      }),
    ]);

    const subjects = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/subjects`)
      .set('Authorization', bearer(studentAuth))
      .expect(200);
    expect(JSON.stringify(subjects.body)).toContain(fixture.subjectId);
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
  }): Promise<void> {
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
        bodyText: 'Student-visible content',
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
        plannedDate: new Date(`${params.plannedDate}T00:00:00.000Z`),
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
      curriculumId: curriculum.id,
      unitId: unit.id,
      lessonId: lesson.id,
      lessonPlanId: lessonPlan.id,
      lessonPlanItemId: item.id,
      timetableEntryId: entry.id,
    };
  }

  async function createExistingScopeLessonPlanItem(params: {
    source: LessonFixture;
    schoolId: string;
    academicYearId: string;
    termId: string;
    teacherUserId: string;
    marker: string;
    planStatus?: LessonPlanStatus;
    curriculumStatus?: CurriculumStatus;
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
    const classroomGradeId = classroom.section.gradeId;
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
        gradeId: classroomGradeId,
        subjectId: subject.id,
        title: `${marker}-${params.marker}-curriculum`,
        status: params.curriculumStatus ?? CurriculumStatus.ACTIVE,
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
        bodyText: `${params.marker} hidden`,
        sortOrder: 1,
        createdByUserId: params.teacherUserId,
      },
    });

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
        status: params.planStatus ?? LessonPlanStatus.ACTIVE,
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
  };
}
