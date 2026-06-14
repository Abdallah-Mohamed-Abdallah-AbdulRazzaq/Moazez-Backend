import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AcademicCalendarEventScopeType,
  AcademicCalendarEventType,
  CurriculumStatus,
  LessonPlanStatus,
  MembershipStatus,
  OrganizationStatus,
  PrismaClient,
  SchoolStatus,
  TimetableConfigStatus,
  TimetableEntryStatus,
  TimetablePeriodType,
  TimetableScopeType,
  UserStatus,
  UserType,
} from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';

const GLOBAL_PREFIX = '/api/v1';
const PASSWORD = 'Sprint20A5E2E123!';
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

type OverviewAcademicData = {
  academicYearId: string;
  termId: string;
  stageId: string;
  gradeId: string;
  sectionId: string;
  classroomId: string;
  subjectId: string;
  roomId: string;
  teacherUserId: string;
  allocationId: string;
  curriculumId: string;
  unitId: string;
  lessonId: string;
  lessonPlanId: string;
  lessonPlanItemId: string;
  timetableConfigId: string;
  periodId: string;
  timetableEntryId: string;
  calendarEventId: string;
};

jest.setTimeout(180000);

describe('Academics overview (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;

  let organizationId = '';
  let schoolId = '';
  let adminUserId = '';
  let adminEmail = '';
  let overviewRoleId = '';
  let adminAuth: AuthTokens;
  let academic: OverviewAcademicData;
  let otherYearTermId = '';

  let zeroOrganizationId = '';
  let zeroSchoolId = '';
  let zeroRoleId = '';
  let zeroUserId = '';
  let zeroEmail = '';
  let zeroAuth: AuthTokens;

  let crossOrganizationId = '';
  let crossSchoolId = '';
  let crossAcademicYearId = '';
  let crossTermId = '';

  const suffix = randomUUID().split('-')[0];
  const marker = `s20a5-e2e-${suffix}`;
  const createdOrganizationIds: string[] = [];
  const createdSchoolIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdRoleIds: string[] = [];
  const createdPermissionIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const overviewPermission = await findOrCreatePermission({
      code: 'academics.overview.view',
      resource: 'overview',
      action: 'view',
      description: 'View academics overview metrics and setup readiness.',
    });

    organizationId = await createOrganization('main');
    schoolId = await createSchool(organizationId, 'main');
    overviewRoleId = await createCustomRole({
      schoolId,
      key: `${marker}-overview-main`,
      name: `Sprint 20A5 Overview Main ${suffix}`,
      permissionIds: [overviewPermission.id],
    });
    adminEmail = `${marker}-admin@example.test`;
    adminUserId = await createUserWithMembership({
      email: adminEmail,
      firstName: 'Sprint20A5',
      lastName: 'OverviewAdmin',
      userType: UserType.SCHOOL_USER,
      roleId: overviewRoleId,
      organizationId,
      schoolId,
    });
    academic = await createConfiguredAcademicData({
      schoolId,
      organizationId,
      label: 'main',
      createdByUserId: adminUserId,
    });
    otherYearTermId = await createOtherYearTerm(schoolId, 'main-other');

    zeroOrganizationId = await createOrganization('zero');
    zeroSchoolId = await createSchool(zeroOrganizationId, 'zero');
    zeroRoleId = await createCustomRole({
      schoolId: zeroSchoolId,
      key: `${marker}-overview-zero`,
      name: `Sprint 20A5 Overview Zero ${suffix}`,
      permissionIds: [overviewPermission.id],
    });
    zeroEmail = `${marker}-zero@example.test`;
    zeroUserId = await createUserWithMembership({
      email: zeroEmail,
      firstName: 'Sprint20A5',
      lastName: 'Zero',
      userType: UserType.SCHOOL_USER,
      roleId: zeroRoleId,
      organizationId: zeroOrganizationId,
      schoolId: zeroSchoolId,
    });

    crossOrganizationId = await createOrganization('cross');
    crossSchoolId = await createSchool(crossOrganizationId, 'cross');
    const crossContext = await createAcademicContext(crossSchoolId, 'cross');
    crossAcademicYearId = crossContext.academicYearId;
    crossTermId = crossContext.termId;

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
        transformOptions: { enableImplicitConversion: false },
      }),
    );
    await app.init();

    adminAuth = await login(adminEmail);
    zeroAuth = await login(zeroEmail);
  });

  afterAll(async () => {
    try {
      if (app) await app.close();
      await cleanupE2eData();
    } finally {
      if (prisma) await prisma.$disconnect();
    }
  });

  it('registers overview, keeps calendar/dashboard routes stable, and keeps app-facing overview routes absent', () => {
    const routes = listRegisteredRoutes();

    expect(routes).toEqual(
      expect.arrayContaining([
        'GET /api/v1/academics/overview',
        'GET /api/v1/academics/calendar/events',
        'POST /api/v1/academics/calendar/events',
        'GET /api/v1/academics/calendar/events/:eventId',
        'PATCH /api/v1/academics/calendar/events/:eventId',
        'DELETE /api/v1/academics/calendar/events/:eventId',
        'GET /api/v1/dashboard/summary',
      ]),
    );

    for (const absentRoute of [
      'GET /api/v1/teacher/academics/overview',
      'GET /api/v1/student/academics/overview',
      'GET /api/v1/parent/academics/overview',
    ]) {
      expect(routes).not.toContain(absentRoute);
    }
  });

  it('returns the full overview read model for an explicit academic context', async () => {
    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/overview`)
      .query({
        academicYearId: academic.academicYearId,
        termId: academic.termId,
      })
      .set('Authorization', bearer(adminAuth))
      .expect(200);

    expectOverviewSections(response.body);
    expect(response.body.academicContext.academicYear).toMatchObject({
      id: academic.academicYearId,
      nameAr: `${marker}-main-year-ar`,
      nameEn: `${marker}-main-year`,
      isActive: true,
    });
    expect(response.body.academicContext.term).toMatchObject({
      id: academic.termId,
      academicYearId: academic.academicYearId,
      nameAr: `${marker}-main-term-ar`,
      nameEn: `${marker}-main-term`,
      isActive: true,
    });
    expect(response.body.structure).toEqual({
      stagesCount: 1,
      gradesCount: 1,
      sectionsCount: 1,
      classroomsCount: 1,
    });
    expect(response.body.subjects).toEqual({
      subjectsCount: 1,
      activeSubjectsCount: 1,
    });
    expect(response.body.rooms).toEqual({ roomsCount: 1 });
    expect(response.body.teacherAllocation).toEqual({
      allocationsCount: 1,
      allocatedTeachersCount: 1,
      allocatedSubjectsCount: 1,
    });
    expect(response.body.curriculum).toEqual({
      curriculaCount: 1,
      activeCurriculaCount: 1,
      unitsCount: 1,
      lessonsCount: 1,
    });
    expect(response.body.lessonPlans).toEqual({
      lessonPlansCount: 1,
      plannedItemsCount: 1,
    });
    expect(response.body.timetable).toEqual({
      entriesCount: 1,
      activeEntriesCount: 1,
    });
    expect(response.body.calendar).toEqual({
      eventsCount: 1,
      upcomingEventsCount: 1,
    });
    expect(response.body.upcomingEvents).toEqual([
      {
        id: academic.calendarEventId,
        academicYearId: academic.academicYearId,
        termId: academic.termId,
        title: `${marker}-main-calendar-event`,
        type: 'activity',
        scope: {
          type: 'section',
          id: academic.sectionId,
        },
        allDay: false,
        startDate: '2099-10-01T08:00:00.000Z',
        endDate: '2099-10-01T09:00:00.000Z',
      },
    ]);
    expect(response.body.setupIndicators).toEqual({
      hasAcademicYear: true,
      hasTerm: true,
      hasStructure: true,
      hasSubjects: true,
      hasRooms: true,
      hasTeacherAllocations: true,
      hasCurriculum: true,
      hasLessonPlans: true,
      hasTimetable: true,
      hasCalendarEvents: true,
      readyForScheduling: true,
      readyForLearningFlow: true,
    });
    expect(response.body.deferred).toEqual({
      advancedAnalytics: true,
      alertsLifecycle: true,
      appFacingOverview: true,
    });
    expectSafeOverviewPayload(response.body);
    expectUpcomingEventShape(response.body.upcomingEvents[0]);
  });

  it('resolves the active academic year and term without query params', async () => {
    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/overview`)
      .set('Authorization', bearer(adminAuth))
      .expect(200);

    expect(response.body.academicContext.academicYear.id).toBe(
      academic.academicYearId,
    );
    expect(response.body.academicContext.term.id).toBe(academic.termId);
    expectSafeOverviewPayload(response.body);
  });

  it('resolves the academic year from a term-only query', async () => {
    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/overview`)
      .query({ termId: academic.termId })
      .set('Authorization', bearer(adminAuth))
      .expect(200);

    expect(response.body.academicContext.term.academicYearId).toBe(
      response.body.academicContext.academicYear.id,
    );
    expect(response.body.academicContext.academicYear.id).toBe(
      academic.academicYearId,
    );
    expect(response.body.academicContext.term.id).toBe(academic.termId);
  });

  it('returns a safe zero overview when no active academic year exists', async () => {
    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/overview`)
      .set('Authorization', bearer(zeroAuth))
      .expect(200);

    expect(response.body.academicContext).toEqual({
      academicYear: null,
      term: null,
    });
    expect(response.body.structure).toEqual({
      stagesCount: 0,
      gradesCount: 0,
      sectionsCount: 0,
      classroomsCount: 0,
    });
    expect(response.body.subjects).toEqual({
      subjectsCount: 0,
      activeSubjectsCount: 0,
    });
    expect(response.body.rooms).toEqual({ roomsCount: 0 });
    expect(response.body.teacherAllocation).toEqual({
      allocationsCount: 0,
      allocatedTeachersCount: 0,
      allocatedSubjectsCount: 0,
    });
    expect(response.body.curriculum).toEqual({
      curriculaCount: 0,
      activeCurriculaCount: 0,
      unitsCount: 0,
      lessonsCount: 0,
    });
    expect(response.body.lessonPlans).toEqual({
      lessonPlansCount: 0,
      plannedItemsCount: 0,
    });
    expect(response.body.timetable).toEqual({
      entriesCount: 0,
      activeEntriesCount: 0,
    });
    expect(response.body.calendar).toEqual({
      eventsCount: 0,
      upcomingEventsCount: 0,
    });
    expect(response.body.upcomingEvents).toEqual([]);
    expect(response.body.setupIndicators).toMatchObject({
      hasAcademicYear: false,
      hasTerm: false,
      hasStructure: false,
      hasSubjects: false,
      hasRooms: false,
      hasTeacherAllocations: false,
      hasCurriculum: false,
      hasLessonPlans: false,
      hasTimetable: false,
      hasCalendarEvents: false,
      readyForScheduling: false,
      readyForLearningFlow: false,
    });
    expectSafeOverviewPayload(response.body);
  });

  it('rejects invalid and unrelated academic context ids without leaking scope', async () => {
    for (const query of [
      { academicYearId: randomUUID() },
      { termId: randomUUID() },
      { academicYearId: academic.academicYearId, termId: otherYearTermId },
      { academicYearId: crossAcademicYearId },
      { termId: crossTermId },
      { academicYearId: academic.academicYearId, termId: crossTermId },
    ]) {
      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/academics/overview`)
        .query(query)
        .set('Authorization', bearer(adminAuth))
        .expect(422)
        .expect((response) => {
          expect(response.body?.error?.code).toBe(
            'academics.overview.invalid_context',
          );
          expectSafeOverviewPayload(response.body);
        });
    }
  });

  async function findOrCreatePermission(params: {
    code: string;
    resource: string;
    action: string;
    description: string;
  }): Promise<{ id: string }> {
    const permission = await prisma.permission.findUnique({
      where: { code: params.code },
      select: { id: true },
    });
    if (permission) return permission;

    try {
      const created = await prisma.permission.create({
        data: {
          code: params.code,
          module: 'academics',
          resource: params.resource,
          action: params.action,
          description: params.description,
        },
        select: { id: true },
      });
      createdPermissionIds.push(created.id);
      return created;
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return prisma.permission.findUniqueOrThrow({
          where: { code: params.code },
          select: { id: true },
        });
      }
      throw error;
    }
  }

  async function findSystemRole(key: string): Promise<{ id: string }> {
    const role = await prisma.role.findFirst({
      where: { key, schoolId: null, isSystem: true, deletedAt: null },
      select: { id: true },
    });
    if (!role) throw new Error(`Missing system role: ${key}`);
    return role;
  }

  async function createOrganization(label: string): Promise<string> {
    const organization = await prisma.organization.create({
      data: {
        slug: `${marker}-${label}-org`,
        name: `Sprint 20A5 Overview ${label} Org ${suffix}`,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdOrganizationIds.push(organization.id);
    return organization.id;
  }

  async function createSchool(
    inputOrganizationId: string,
    label: string,
  ): Promise<string> {
    const school = await prisma.school.create({
      data: {
        organizationId: inputOrganizationId,
        slug: `${marker}-${label}-school`,
        name: `Sprint 20A5 Overview ${label} School ${suffix}`,
        status: SchoolStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdSchoolIds.push(school.id);
    return school.id;
  }

  async function createCustomRole(params: {
    schoolId: string;
    key: string;
    name: string;
    permissionIds: string[];
  }): Promise<string> {
    const role = await prisma.role.create({
      data: {
        schoolId: params.schoolId,
        key: params.key,
        name: params.name,
        description: 'Academics overview e2e test role',
        isSystem: false,
      },
      select: { id: true },
    });
    createdRoleIds.push(role.id);

    await prisma.rolePermission.createMany({
      data: params.permissionIds.map((permissionId) => ({
        roleId: role.id,
        permissionId,
      })),
    });

    return role.id;
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
    createdUserIds.push(user.id);

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
    inputSchoolId: string,
    label: string,
  ): Promise<{
    academicYearId: string;
    termId: string;
    stageId: string;
    gradeId: string;
    sectionId: string;
  }> {
    const academicYear = await prisma.academicYear.create({
      data: {
        schoolId: inputSchoolId,
        nameAr: `${marker}-${label}-year-ar`,
        nameEn: `${marker}-${label}-year`,
        startDate: new Date('2099-09-01T00:00:00.000Z'),
        endDate: new Date('2100-06-30T00:00:00.000Z'),
        isActive: true,
      },
      select: { id: true },
    });
    const term = await prisma.term.create({
      data: {
        schoolId: inputSchoolId,
        academicYearId: academicYear.id,
        nameAr: `${marker}-${label}-term-ar`,
        nameEn: `${marker}-${label}-term`,
        startDate: new Date('2099-09-01T00:00:00.000Z'),
        endDate: new Date('2099-12-31T00:00:00.000Z'),
        isActive: true,
      },
      select: { id: true },
    });
    const stage = await prisma.stage.create({
      data: {
        schoolId: inputSchoolId,
        nameAr: `${marker}-${label}-stage-ar`,
        nameEn: `${marker}-${label}-stage`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    const grade = await prisma.grade.create({
      data: {
        schoolId: inputSchoolId,
        stageId: stage.id,
        nameAr: `${marker}-${label}-grade-ar`,
        nameEn: `${marker}-${label}-grade`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    const section = await prisma.section.create({
      data: {
        schoolId: inputSchoolId,
        gradeId: grade.id,
        nameAr: `${marker}-${label}-section-ar`,
        nameEn: `${marker}-${label}-section`,
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

  async function createConfiguredAcademicData(params: {
    schoolId: string;
    organizationId: string;
    label: string;
    createdByUserId: string;
  }): Promise<OverviewAcademicData> {
    const context = await createAcademicContext(params.schoolId, params.label);
    const teacherRole = await findSystemRole('teacher');
    const teacherUserId = await createUserWithMembership({
      email: `${marker}-${params.label}-teacher@example.test`,
      firstName: 'Sprint20A5',
      lastName: `Teacher${params.label}`,
      userType: UserType.TEACHER,
      roleId: teacherRole.id,
      organizationId: params.organizationId,
      schoolId: params.schoolId,
    });
    const room = await prisma.room.create({
      data: {
        schoolId: params.schoolId,
        nameAr: `${marker}-${params.label}-room-ar`,
        nameEn: `${marker}-${params.label}-room`,
        isActive: true,
      },
      select: { id: true },
    });
    const classroom = await prisma.classroom.create({
      data: {
        schoolId: params.schoolId,
        sectionId: context.sectionId,
        nameAr: `${marker}-${params.label}-classroom-ar`,
        nameEn: `${marker}-${params.label}-classroom`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    const subject = await prisma.subject.create({
      data: {
        schoolId: params.schoolId,
        nameAr: `${marker}-${params.label}-subject-ar`,
        nameEn: `${marker}-${params.label}-subject`,
        code: `${params.label.toUpperCase()}-${suffix}`,
        isActive: true,
      },
      select: { id: true },
    });
    const allocation = await prisma.teacherSubjectAllocation.create({
      data: {
        schoolId: params.schoolId,
        teacherUserId,
        subjectId: subject.id,
        classroomId: classroom.id,
        termId: context.termId,
      },
      select: { id: true },
    });
    const curriculum = await prisma.curriculum.create({
      data: {
        schoolId: params.schoolId,
        academicYearId: context.academicYearId,
        termId: context.termId,
        gradeId: context.gradeId,
        subjectId: subject.id,
        title: `${marker}-${params.label}-curriculum`,
        status: CurriculumStatus.ACTIVE,
        createdByUserId: params.createdByUserId,
        updatedByUserId: params.createdByUserId,
      },
      select: { id: true },
    });
    const unit = await prisma.curriculumUnit.create({
      data: {
        schoolId: params.schoolId,
        curriculumId: curriculum.id,
        title: `${marker}-${params.label}-unit`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    const lesson = await prisma.curriculumLesson.create({
      data: {
        schoolId: params.schoolId,
        curriculumId: curriculum.id,
        unitId: unit.id,
        title: `${marker}-${params.label}-lesson`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    const timetableConfig = await prisma.timetableConfig.create({
      data: {
        schoolId: params.schoolId,
        academicYearId: context.academicYearId,
        termId: context.termId,
        name: `${marker}-${params.label}-config`,
        weekStartDay: 0,
        activeDays: [0, 1, 2, 3, 4],
        scopeType: TimetableScopeType.CLASSROOM,
        scopeKey: classroom.id,
        classroomId: classroom.id,
        status: TimetableConfigStatus.ACTIVE,
      },
      select: { id: true },
    });
    const period = await prisma.timetablePeriod.create({
      data: {
        schoolId: params.schoolId,
        timetableConfigId: timetableConfig.id,
        periodIndex: 1,
        label: `${marker}-${params.label}-period`,
        startTime: '08:00',
        endTime: '08:45',
        type: TimetablePeriodType.CLASS,
        isInstructional: true,
      },
      select: { id: true },
    });
    const timetableEntry = await prisma.timetableEntry.create({
      data: {
        schoolId: params.schoolId,
        academicYearId: context.academicYearId,
        termId: context.termId,
        timetableConfigId: timetableConfig.id,
        periodId: period.id,
        dayOfWeek: 1,
        gradeId: context.gradeId,
        sectionId: context.sectionId,
        classroomId: classroom.id,
        subjectId: subject.id,
        teacherUserId,
        teacherSubjectAllocationId: allocation.id,
        roomId: room.id,
        status: TimetableEntryStatus.ACTIVE,
      },
      select: { id: true },
    });
    const lessonPlan = await prisma.lessonPlan.create({
      data: {
        schoolId: params.schoolId,
        academicYearId: context.academicYearId,
        termId: context.termId,
        teacherSubjectAllocationId: allocation.id,
        teacherUserId,
        classroomId: classroom.id,
        subjectId: subject.id,
        curriculumId: curriculum.id,
        title: `${marker}-${params.label}-lesson-plan`,
        status: LessonPlanStatus.ACTIVE,
        weekStartDate: new Date('2099-09-07T00:00:00.000Z'),
        weekEndDate: new Date('2099-09-11T00:00:00.000Z'),
        createdByUserId: params.createdByUserId,
        updatedByUserId: params.createdByUserId,
      },
      select: { id: true },
    });
    const lessonPlanItem = await prisma.lessonPlanItem.create({
      data: {
        schoolId: params.schoolId,
        lessonPlanId: lessonPlan.id,
        curriculumId: curriculum.id,
        unitId: unit.id,
        lessonId: lesson.id,
        timetableEntryId: timetableEntry.id,
        plannedDate: new Date('2099-09-08T00:00:00.000Z'),
        dayOfWeek: 1,
        periodId: period.id,
        periodLabel: `${marker}-${params.label}-period`,
        title: `${marker}-${params.label}-lesson-plan-item`,
        sortOrder: 1,
        createdByUserId: params.createdByUserId,
        updatedByUserId: params.createdByUserId,
      },
      select: { id: true },
    });
    const calendarEvent = await prisma.academicCalendarEvent.create({
      data: {
        schoolId: params.schoolId,
        academicYearId: context.academicYearId,
        termId: context.termId,
        title: `${marker}-${params.label}-calendar-event`,
        type: AcademicCalendarEventType.ACTIVITY,
        scopeType: AcademicCalendarEventScopeType.SECTION,
        scopeKey: context.sectionId,
        sectionId: context.sectionId,
        allDay: false,
        startDate: new Date('2099-10-01T08:00:00.000Z'),
        endDate: new Date('2099-10-01T09:00:00.000Z'),
        createdByUserId: params.createdByUserId,
        updatedByUserId: params.createdByUserId,
      },
      select: { id: true },
    });

    return {
      ...context,
      classroomId: classroom.id,
      subjectId: subject.id,
      roomId: room.id,
      teacherUserId,
      allocationId: allocation.id,
      curriculumId: curriculum.id,
      unitId: unit.id,
      lessonId: lesson.id,
      lessonPlanId: lessonPlan.id,
      lessonPlanItemId: lessonPlanItem.id,
      timetableConfigId: timetableConfig.id,
      periodId: period.id,
      timetableEntryId: timetableEntry.id,
      calendarEventId: calendarEvent.id,
    };
  }

  async function createOtherYearTerm(
    inputSchoolId: string,
    label: string,
  ): Promise<string> {
    const academicYear = await prisma.academicYear.create({
      data: {
        schoolId: inputSchoolId,
        nameAr: `${marker}-${label}-year-ar`,
        nameEn: `${marker}-${label}-year`,
        startDate: new Date('2101-09-01T00:00:00.000Z'),
        endDate: new Date('2102-06-30T00:00:00.000Z'),
        isActive: false,
      },
      select: { id: true },
    });
    const term = await prisma.term.create({
      data: {
        schoolId: inputSchoolId,
        academicYearId: academicYear.id,
        nameAr: `${marker}-${label}-term-ar`,
        nameEn: `${marker}-${label}-term`,
        startDate: new Date('2101-09-01T00:00:00.000Z'),
        endDate: new Date('2101-12-31T00:00:00.000Z'),
        isActive: false,
      },
      select: { id: true },
    });
    return term.id;
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

  function expectOverviewSections(body: Record<string, unknown>): void {
    for (const key of [
      'generatedAt',
      'academicContext',
      'structure',
      'subjects',
      'rooms',
      'teacherAllocation',
      'curriculum',
      'lessonPlans',
      'timetable',
      'calendar',
      'upcomingEvents',
      'setupIndicators',
      'deferred',
    ]) {
      expect(body).toHaveProperty(key);
    }
    expect(typeof body.generatedAt).toBe('string');
  }

  function expectUpcomingEventShape(value: Record<string, unknown>): void {
    expect(Object.keys(value).sort()).toEqual(
      [
        'academicYearId',
        'allDay',
        'endDate',
        'id',
        'scope',
        'startDate',
        'termId',
        'title',
        'type',
      ].sort(),
    );
    expect(Object.keys(value.scope as Record<string, unknown>).sort()).toEqual([
      'id',
      'type',
    ]);
  }

  function expectSafeOverviewPayload(value: unknown): void {
    for (const forbiddenKey of [
      'schoolId',
      'organizationId',
      'scopeKey',
      'createdByUserId',
      'updatedByUserId',
      'deletedByUserId',
      'deletedAt',
    ]) {
      expectNoObjectKey(value, forbiddenKey);
    }
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

  async function cleanupE2eData(): Promise<void> {
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
    await prisma.lessonPlanItem.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.lessonPlan.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.timetableEntry.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.timetablePeriod.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.timetableConfig.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.academicCalendarEvent.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.curriculumLesson.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.curriculumUnit.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.curriculum.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.teacherSubjectAllocation.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.subject.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.room.deleteMany({
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
    await prisma.rolePermission.deleteMany({
      where: { roleId: { in: createdRoleIds } },
    });
    await prisma.role.deleteMany({
      where: { id: { in: createdRoleIds } },
    });
    await prisma.permission.deleteMany({
      where: { id: { in: createdPermissionIds } },
    });
    await prisma.school.deleteMany({
      where: { id: { in: createdSchoolIds } },
    });
    await prisma.organization.deleteMany({
      where: { id: { in: createdOrganizationIds } },
    });
  }

  function isUniqueConstraintError(error: unknown): boolean {
    return (
      !!error &&
      typeof error === 'object' &&
      (error as { code?: string }).code === 'P2002'
    );
  }
});
