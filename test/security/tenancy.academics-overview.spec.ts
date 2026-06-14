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
const PASSWORD = 'Sprint20A5Security123!';
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

type ActorAuth = {
  label: string;
  auth: AuthTokens;
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
  softDeletedCalendarEventId: string;
};

jest.setTimeout(180000);

describe('Academics overview tenancy isolation (security)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;

  let organizationAId = '';
  let organizationBId = '';
  let schoolAId = '';
  let schoolBId = '';
  let adminAUserId = '';
  let adminBUserId = '';
  let noPermissionUserId = '';
  let calendarOnlyUserId = '';
  let teacherUserId = '';
  let studentUserId = '';
  let parentUserId = '';
  let adminAEmail = '';
  let adminBEmail = '';
  let noPermissionEmail = '';
  let calendarOnlyEmail = '';
  let teacherEmail = '';
  let studentEmail = '';
  let parentEmail = '';
  let academicA: OverviewAcademicData;
  let academicB: OverviewAcademicData;
  let adminAAuth: AuthTokens;
  let adminBAuth: AuthTokens;
  let noPermissionAuth: AuthTokens;
  let calendarOnlyAuth: AuthTokens;
  let teacherAuth: AuthTokens;
  let studentAuth: AuthTokens;
  let parentAuth: AuthTokens;

  const suffix = randomUUID().split('-')[0];
  const marker = `s20a5-sec-${suffix}`;
  const createdOrganizationIds: string[] = [];
  const createdSchoolIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdRoleIds: string[] = [];
  const createdPermissionIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const [
      overviewPermission,
      calendarViewPermission,
      calendarManagePermission,
      teacherRole,
      studentRole,
      parentRole,
    ] = await Promise.all([
      findOrCreatePermission({
        code: 'academics.overview.view',
        resource: 'overview',
        action: 'view',
        description: 'View academics overview metrics and setup readiness.',
      }),
      findOrCreatePermission({
        code: 'academics.calendar.view',
        resource: 'calendar',
        action: 'view',
        description: 'View academic calendar events.',
      }),
      findOrCreatePermission({
        code: 'academics.calendar.manage',
        resource: 'calendar',
        action: 'manage',
        description: 'Create, update, and delete academic calendar events.',
      }),
      findSystemRole('teacher'),
      findSystemRole('student'),
      findSystemRole('parent'),
    ]);

    organizationAId = await createOrganization('a');
    organizationBId = await createOrganization('b');
    schoolAId = await createSchool(organizationAId, 'a');
    schoolBId = await createSchool(organizationBId, 'b');

    const overviewAdminARoleId = await createCustomRole({
      schoolId: schoolAId,
      key: `${marker}-overview-admin-a`,
      name: `Sprint 20A5 Overview Admin A ${suffix}`,
      permissionIds: [overviewPermission.id],
    });
    const overviewAdminBRoleId = await createCustomRole({
      schoolId: schoolBId,
      key: `${marker}-overview-admin-b`,
      name: `Sprint 20A5 Overview Admin B ${suffix}`,
      permissionIds: [overviewPermission.id],
    });
    const noPermissionRoleId = await createCustomRole({
      schoolId: schoolAId,
      key: `${marker}-no-permission`,
      name: `Sprint 20A5 Overview No Permission ${suffix}`,
      permissionIds: [],
    });
    const calendarOnlyRoleId = await createCustomRole({
      schoolId: schoolAId,
      key: `${marker}-calendar-only`,
      name: `Sprint 20A5 Overview Calendar Only ${suffix}`,
      permissionIds: [calendarViewPermission.id, calendarManagePermission.id],
    });

    adminAEmail = `${marker}-admin-a@example.test`;
    adminBEmail = `${marker}-admin-b@example.test`;
    noPermissionEmail = `${marker}-none@example.test`;
    calendarOnlyEmail = `${marker}-calendar-only@example.test`;
    teacherEmail = `${marker}-teacher@example.test`;
    studentEmail = `${marker}-student@example.test`;
    parentEmail = `${marker}-parent@example.test`;

    adminAUserId = await createUserWithMembership({
      email: adminAEmail,
      firstName: 'Overview',
      lastName: 'AdminA',
      userType: UserType.SCHOOL_USER,
      roleId: overviewAdminARoleId,
      organizationId: organizationAId,
      schoolId: schoolAId,
    });
    adminBUserId = await createUserWithMembership({
      email: adminBEmail,
      firstName: 'Overview',
      lastName: 'AdminB',
      userType: UserType.SCHOOL_USER,
      roleId: overviewAdminBRoleId,
      organizationId: organizationBId,
      schoolId: schoolBId,
    });
    noPermissionUserId = await createUserWithMembership({
      email: noPermissionEmail,
      firstName: 'No',
      lastName: 'OverviewPermission',
      userType: UserType.SCHOOL_USER,
      roleId: noPermissionRoleId,
      organizationId: organizationAId,
      schoolId: schoolAId,
    });
    calendarOnlyUserId = await createUserWithMembership({
      email: calendarOnlyEmail,
      firstName: 'Calendar',
      lastName: 'Only',
      userType: UserType.SCHOOL_USER,
      roleId: calendarOnlyRoleId,
      organizationId: organizationAId,
      schoolId: schoolAId,
    });
    teacherUserId = await createUserWithMembership({
      email: teacherEmail,
      firstName: 'Overview',
      lastName: 'Teacher',
      userType: UserType.TEACHER,
      roleId: teacherRole.id,
      organizationId: organizationAId,
      schoolId: schoolAId,
    });
    studentUserId = await createUserWithMembership({
      email: studentEmail,
      firstName: 'Overview',
      lastName: 'Student',
      userType: UserType.STUDENT,
      roleId: studentRole.id,
      organizationId: organizationAId,
      schoolId: schoolAId,
    });
    parentUserId = await createUserWithMembership({
      email: parentEmail,
      firstName: 'Overview',
      lastName: 'Parent',
      userType: UserType.PARENT,
      roleId: parentRole.id,
      organizationId: organizationAId,
      schoolId: schoolAId,
    });

    academicA = await createConfiguredAcademicData({
      schoolId: schoolAId,
      organizationId: organizationAId,
      label: 'a',
      createdByUserId: adminAUserId,
    });
    academicB = await createConfiguredAcademicData({
      schoolId: schoolBId,
      organizationId: organizationBId,
      label: 'b',
      createdByUserId: adminBUserId,
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
        transformOptions: { enableImplicitConversion: false },
      }),
    );
    await app.init();

    adminAAuth = await login(adminAEmail);
    adminBAuth = await login(adminBEmail);
    noPermissionAuth = await login(noPermissionEmail);
    calendarOnlyAuth = await login(calendarOnlyEmail);
    teacherAuth = await login(teacherEmail);
    studentAuth = await login(studentEmail);
    parentAuth = await login(parentEmail);
  });

  afterAll(async () => {
    try {
      if (app) await app.close();
      await cleanupSecurityData();
    } finally {
      if (prisma) await prisma.$disconnect();
    }
  });

  it('keeps overview and dashboard routes registered while app-facing overview routes remain absent', () => {
    const routes = listRegisteredRoutes();

    expect(routes).toEqual(
      expect.arrayContaining([
        'GET /api/v1/academics/overview',
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

  it('denies actors without academics.overview.view', async () => {
    for (const auth of [noPermissionAuth, calendarOnlyAuth]) {
      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/academics/overview`)
        .set('Authorization', bearer(auth))
        .expect(403)
        .expect((response) => {
          expect(response.body?.error?.code).toBe('auth.scope.missing');
        });
    }
  });

  it('keeps school A overview isolated from school B data and allows school B to see its own data', async () => {
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/overview`)
      .query({
        academicYearId: academicB.academicYearId,
        termId: academicB.termId,
      })
      .set('Authorization', bearer(adminAAuth))
      .expect(422)
      .expect((response) => {
        expect(response.body?.error?.code).toBe(
          'academics.overview.invalid_context',
        );
        expectSafeOverviewPayload(response.body);
      });

    const schoolAOverview = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/overview`)
      .query({
        academicYearId: academicA.academicYearId,
        termId: academicA.termId,
      })
      .set('Authorization', bearer(adminAAuth))
      .expect(200);

    expect(schoolAOverview.body.upcomingEvents).toEqual([
      expect.objectContaining({
        id: academicA.calendarEventId,
        title: `${marker}-a-calendar-event`,
      }),
    ]);
    expect(
      schoolAOverview.body.upcomingEvents.map((event: { id: string }) => event.id),
    ).not.toContain(academicB.calendarEventId);
    expect(schoolAOverview.body.calendar).toEqual({
      eventsCount: 1,
      upcomingEventsCount: 1,
    });
    expectSafeOverviewPayload(schoolAOverview.body);

    const schoolBOverview = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/overview`)
      .query({
        academicYearId: academicB.academicYearId,
        termId: academicB.termId,
      })
      .set('Authorization', bearer(adminBAuth))
      .expect(200);

    expect(schoolBOverview.body.upcomingEvents).toEqual([
      expect.objectContaining({
        id: academicB.calendarEventId,
        title: `${marker}-b-calendar-event`,
      }),
    ]);
    expect(
      schoolBOverview.body.upcomingEvents.map((event: { id: string }) => event.id),
    ).not.toContain(academicA.calendarEventId);
    expect(schoolBOverview.body.calendar).toEqual({
      eventsCount: 1,
      upcomingEventsCount: 1,
    });
    expectSafeOverviewPayload(schoolBOverview.body);
  });

  it('rejects a school A academic year combined with a school B term without leaking existence', async () => {
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/overview`)
      .query({
        academicYearId: academicA.academicYearId,
        termId: academicB.termId,
      })
      .set('Authorization', bearer(adminAAuth))
      .expect(422)
      .expect((response) => {
        expect(response.body?.error?.code).toBe(
          'academics.overview.invalid_context',
        );
        expectSafeOverviewPayload(response.body);
      });
  });

  it('denies teacher, student, and parent system roles by default', async () => {
    const rolePermissions = await listAppRoleOverviewPermissions();
    expect(rolePermissions).toEqual({
      parent: [],
      student: [],
      teacher: [],
    });

    for (const actor of [
      { label: 'teacher', auth: teacherAuth },
      { label: 'student', auth: studentAuth },
      { label: 'parent', auth: parentAuth },
    ]) {
      await expectOverviewForbidden(actor);
    }
  });

  it('excludes soft-deleted calendar events and keeps responses free of tenant/internal fields', async () => {
    const deletedRow = await prisma.academicCalendarEvent.findUnique({
      where: { id: academicA.softDeletedCalendarEventId },
      select: { deletedAt: true, deletedByUserId: true },
    });
    expect(deletedRow?.deletedAt).toBeInstanceOf(Date);
    expect(deletedRow?.deletedByUserId).toBe(adminAUserId);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/overview`)
      .query({
        academicYearId: academicA.academicYearId,
        termId: academicA.termId,
      })
      .set('Authorization', bearer(adminAAuth))
      .expect(200);

    expect(response.body.calendar).toEqual({
      eventsCount: 1,
      upcomingEventsCount: 1,
    });
    expect(
      response.body.upcomingEvents.map((event: { id: string }) => event.id),
    ).toContain(academicA.calendarEventId);
    expect(
      response.body.upcomingEvents.map((event: { id: string }) => event.id),
    ).not.toContain(academicA.softDeletedCalendarEventId);
    expectSafeOverviewPayload(response.body);
    expectUpcomingEventShape(response.body.upcomingEvents[0]);
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
        slug: `${marker}-org-${label}`,
        name: `Sprint 20A5 Overview Security Org ${label} ${suffix}`,
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
        slug: `${marker}-school-${label}`,
        name: `Sprint 20A5 Overview Security School ${label} ${suffix}`,
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
        description: 'Academics overview security test role',
        isSystem: false,
      },
      select: { id: true },
    });
    createdRoleIds.push(role.id);

    if (params.permissionIds.length > 0) {
      await prisma.rolePermission.createMany({
        data: params.permissionIds.map((permissionId) => ({
          roleId: role.id,
          permissionId,
        })),
      });
    }

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
    const academicTeacherUserId = await createUserWithMembership({
      email: `${marker}-${params.label}-academic-teacher@example.test`,
      firstName: 'Overview',
      lastName: `AcademicTeacher${params.label}`,
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
        teacherUserId: academicTeacherUserId,
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
        teacherUserId: academicTeacherUserId,
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
        teacherUserId: academicTeacherUserId,
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
    const softDeletedCalendarEvent =
      await prisma.academicCalendarEvent.create({
        data: {
          schoolId: params.schoolId,
          academicYearId: context.academicYearId,
          termId: context.termId,
          title: `${marker}-${params.label}-deleted-calendar-event`,
          type: AcademicCalendarEventType.EXAM,
          scopeType: AcademicCalendarEventScopeType.SCHOOL,
          allDay: true,
          startDate: new Date('2099-10-02T00:00:00.000Z'),
          endDate: new Date('2099-10-02T23:59:59.000Z'),
          createdByUserId: params.createdByUserId,
          updatedByUserId: params.createdByUserId,
          deletedByUserId: params.createdByUserId,
          deletedAt: new Date('2099-09-15T00:00:00.000Z'),
        },
        select: { id: true },
      });

    return {
      ...context,
      classroomId: classroom.id,
      subjectId: subject.id,
      roomId: room.id,
      teacherUserId: academicTeacherUserId,
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
      softDeletedCalendarEventId: softDeletedCalendarEvent.id,
    };
  }

  async function listAppRoleOverviewPermissions(): Promise<
    Record<'parent' | 'student' | 'teacher', string[]>
  > {
    const roles = await prisma.role.findMany({
      where: {
        key: { in: ['teacher', 'student', 'parent'] },
        schoolId: null,
        isSystem: true,
        deletedAt: null,
      },
      select: {
        key: true,
        rolePermissions: {
          select: {
            permission: { select: { code: true } },
          },
        },
      },
    });

    const result = {
      parent: [] as string[],
      student: [] as string[],
      teacher: [] as string[],
    };
    for (const role of roles) {
      if (
        role.key === 'parent' ||
        role.key === 'student' ||
        role.key === 'teacher'
      ) {
        result[role.key] = role.rolePermissions
          .map((rolePermission) => rolePermission.permission.code)
          .filter((code) => code.startsWith('academics.overview.'))
          .sort();
      }
    }

    return result;
  }

  async function expectOverviewForbidden(actor: ActorAuth): Promise<void> {
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/overview`)
      .set('Authorization', bearer(actor.auth))
      .expect(403)
      .expect((response) => {
        expect(response.body?.error?.code).toBe('auth.scope.missing');
        expectSafeOverviewPayload(response.body);
      });
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

  async function cleanupSecurityData(): Promise<void> {
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
