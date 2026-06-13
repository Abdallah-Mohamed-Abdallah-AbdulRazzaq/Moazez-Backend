import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AcademicCalendarEventScopeType,
  AcademicCalendarEventType,
  MembershipStatus,
  OrganizationStatus,
  PrismaClient,
  SchoolStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';

const GLOBAL_PREFIX = '/api/v1';
const PASSWORD = 'Sprint20A3Security123!';
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
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

type ActorAuth = {
  label: string;
  auth: AuthTokens;
};

jest.setTimeout(180000);

describe('Academic calendar event tenancy isolation (security)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;

  let organizationAId = '';
  let organizationBId = '';
  let schoolAId = '';
  let schoolBId = '';
  let adminAUserId = '';
  let adminBUserId = '';
  let noPermissionUserId = '';
  let viewOnlyUserId = '';
  let manageOnlyUserId = '';
  let teacherUserId = '';
  let studentUserId = '';
  let parentUserId = '';
  let adminAEmail = '';
  let adminBEmail = '';
  let noPermissionEmail = '';
  let viewOnlyEmail = '';
  let manageOnlyEmail = '';
  let teacherEmail = '';
  let studentEmail = '';
  let parentEmail = '';
  let noPermissionRoleId = '';
  let viewOnlyRoleId = '';
  let manageOnlyRoleId = '';
  let academicA: AcademicBase;
  let academicB: AcademicBase;
  let eventAId = '';
  let eventBId = '';
  let softDeleteEventId = '';
  let adminAAuth: AuthTokens;
  let adminBAuth: AuthTokens;
  let noPermissionAuth: AuthTokens;
  let viewOnlyAuth: AuthTokens;
  let manageOnlyAuth: AuthTokens;
  let teacherAuth: AuthTokens;
  let studentAuth: AuthTokens;
  let parentAuth: AuthTokens;

  const suffix = randomUUID().split('-')[0];
  const marker = `s20a3-sec-${suffix}`;
  const createdOrganizationIds: string[] = [];
  const createdSchoolIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdRoleIds: string[] = [];
  const createdPermissionIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const [
      teacherRole,
      studentRole,
      parentRole,
      viewPermission,
      managePermission,
    ] = await Promise.all([
      findSystemRole('teacher'),
      findSystemRole('student'),
      findSystemRole('parent'),
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
    ]);

    organizationAId = await createOrganization('a');
    organizationBId = await createOrganization('b');
    schoolAId = await createSchool(organizationAId, 'a');
    schoolBId = await createSchool(organizationBId, 'b');
    academicA = await createAcademicBase(schoolAId, 'a');
    academicB = await createAcademicBase(schoolBId, 'b');

    const calendarAdminARoleId = await createCustomRole({
      schoolId: schoolAId,
      key: `${marker}-admin-a`,
      name: `Sprint 20A3 Calendar Admin A ${suffix}`,
      permissionIds: [viewPermission.id, managePermission.id],
    });
    const calendarAdminBRoleId = await createCustomRole({
      schoolId: schoolBId,
      key: `${marker}-admin-b`,
      name: `Sprint 20A3 Calendar Admin B ${suffix}`,
      permissionIds: [viewPermission.id, managePermission.id],
    });
    noPermissionRoleId = await createCustomRole({
      schoolId: schoolAId,
      key: `${marker}-none`,
      name: `Sprint 20A3 Calendar No Permission ${suffix}`,
      permissionIds: [],
    });
    viewOnlyRoleId = await createCustomRole({
      schoolId: schoolAId,
      key: `${marker}-view`,
      name: `Sprint 20A3 Calendar Viewer ${suffix}`,
      permissionIds: [viewPermission.id],
    });
    manageOnlyRoleId = await createCustomRole({
      schoolId: schoolAId,
      key: `${marker}-manage`,
      name: `Sprint 20A3 Calendar Manager Only ${suffix}`,
      permissionIds: [managePermission.id],
    });

    adminAEmail = `${marker}-admin-a@example.test`;
    adminBEmail = `${marker}-admin-b@example.test`;
    noPermissionEmail = `${marker}-none@example.test`;
    viewOnlyEmail = `${marker}-viewer@example.test`;
    manageOnlyEmail = `${marker}-manager@example.test`;
    teacherEmail = `${marker}-teacher@example.test`;
    studentEmail = `${marker}-student@example.test`;
    parentEmail = `${marker}-parent@example.test`;

    adminAUserId = await createUserWithMembership({
      email: adminAEmail,
      firstName: 'Calendar',
      lastName: 'AdminA',
      userType: UserType.SCHOOL_USER,
      roleId: calendarAdminARoleId,
      organizationId: organizationAId,
      schoolId: schoolAId,
    });
    adminBUserId = await createUserWithMembership({
      email: adminBEmail,
      firstName: 'Calendar',
      lastName: 'AdminB',
      userType: UserType.SCHOOL_USER,
      roleId: calendarAdminBRoleId,
      organizationId: organizationBId,
      schoolId: schoolBId,
    });
    noPermissionUserId = await createUserWithMembership({
      email: noPermissionEmail,
      firstName: 'No',
      lastName: 'Permission',
      userType: UserType.SCHOOL_USER,
      roleId: noPermissionRoleId,
      organizationId: organizationAId,
      schoolId: schoolAId,
    });
    viewOnlyUserId = await createUserWithMembership({
      email: viewOnlyEmail,
      firstName: 'View',
      lastName: 'Only',
      userType: UserType.SCHOOL_USER,
      roleId: viewOnlyRoleId,
      organizationId: organizationAId,
      schoolId: schoolAId,
    });
    manageOnlyUserId = await createUserWithMembership({
      email: manageOnlyEmail,
      firstName: 'Manage',
      lastName: 'Only',
      userType: UserType.SCHOOL_USER,
      roleId: manageOnlyRoleId,
      organizationId: organizationAId,
      schoolId: schoolAId,
    });
    teacherUserId = await createUserWithMembership({
      email: teacherEmail,
      firstName: 'Calendar',
      lastName: 'Teacher',
      userType: UserType.TEACHER,
      roleId: teacherRole.id,
      organizationId: organizationAId,
      schoolId: schoolAId,
    });
    studentUserId = await createUserWithMembership({
      email: studentEmail,
      firstName: 'Calendar',
      lastName: 'Student',
      userType: UserType.STUDENT,
      roleId: studentRole.id,
      organizationId: organizationAId,
      schoolId: schoolAId,
    });
    parentUserId = await createUserWithMembership({
      email: parentEmail,
      firstName: 'Calendar',
      lastName: 'Parent',
      userType: UserType.PARENT,
      roleId: parentRole.id,
      organizationId: organizationAId,
      schoolId: schoolAId,
    });

    eventAId = await createCalendarEvent({
      schoolId: schoolAId,
      academic: academicA,
      createdByUserId: adminAUserId,
      label: 'a',
      title: 'School A Holiday',
    });
    softDeleteEventId = await createCalendarEvent({
      schoolId: schoolAId,
      academic: academicA,
      createdByUserId: adminAUserId,
      label: 'delete',
      title: 'School A Delete Target',
    });
    eventBId = await createCalendarEvent({
      schoolId: schoolBId,
      academic: academicB,
      createdByUserId: adminBUserId,
      label: 'b',
      title: 'School B Holiday',
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
    viewOnlyAuth = await login(viewOnlyEmail);
    manageOnlyAuth = await login(manageOnlyEmail);
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

  it('prevents school A from reading, updating, deleting, or listing school B events', async () => {
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/calendar/events/${eventBId}`)
      .set('Authorization', bearer(adminAAuth))
      .expect(404)
      .expect((response) => {
        expect(response.body?.error?.code).toBe(
          'academics.calendar_event.not_found',
        );
        expectSafeCalendarPayload(response.body);
      });

    await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/academics/calendar/events/${eventBId}`)
      .set('Authorization', bearer(adminAAuth))
      .send({ title: 'Cross School Update' })
      .expect(404)
      .expect((response) => {
        expect(response.body?.error?.code).toBe(
          'academics.calendar_event.not_found',
        );
      });

    await request(app.getHttpServer())
      .delete(`${GLOBAL_PREFIX}/academics/calendar/events/${eventBId}`)
      .set('Authorization', bearer(adminAAuth))
      .expect(404)
      .expect((response) => {
        expect(response.body?.error?.code).toBe(
          'academics.calendar_event.not_found',
        );
      });

    const listed = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/calendar/events`)
      .query({
        from: '2026-09-01T00:00:00.000Z',
        to: '2026-12-31T23:59:59.000Z',
      })
      .set('Authorization', bearer(adminAAuth))
      .expect(200);

    expect(listed.body.items.map((item: { id: string }) => item.id)).toContain(
      eventAId,
    );
    expect(listed.body.items.map((item: { id: string }) => item.id)).not.toContain(
      eventBId,
    );
    expectSafeCalendarPayload(listed.body);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/calendar/events/${eventBId}`)
      .set('Authorization', bearer(adminBAuth))
      .expect(200)
      .expect((response) => {
        expect(response.body.id).toBe(eventBId);
        expect(response.body.title).toBe('School B Holiday');
        expectSafeCalendarPayload(response.body);
      });

    const schoolBEvent = await prisma.academicCalendarEvent.findUnique({
      where: { id: eventBId },
      select: { title: true, deletedAt: true },
    });
    expect(schoolBEvent).toEqual({
      title: 'School B Holiday',
      deletedAt: null,
    });
  });

  it('rejects cross-school stage, grade, and section ids without creating or updating rows', async () => {
    const countBefore = await prisma.academicCalendarEvent.count({
      where: { schoolId: schoolAId },
    });

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/academics/calendar/events`)
      .set('Authorization', bearer(adminAAuth))
      .send({
        academicYearId: academicA.academicYearId,
        termId: academicA.termId,
        title: 'Cross School Stage',
        type: 'activity',
        scopeType: 'stage',
        scopeId: academicB.stageId,
        startDate: '2026-10-01T00:00:00.000Z',
        endDate: '2026-10-01T00:00:00.000Z',
      })
      .expect(422)
      .expect((response) => {
        expect(response.body?.error?.code).toBe(
          'academics.calendar_event.invalid_scope',
        );
      });

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/academics/calendar/events`)
      .set('Authorization', bearer(adminAAuth))
      .send({
        academicYearId: academicA.academicYearId,
        termId: academicA.termId,
        title: 'Cross School Grade',
        type: 'exam',
        scopeType: 'grade',
        scopeId: academicB.gradeId,
        startDate: '2026-10-02T00:00:00.000Z',
        endDate: '2026-10-02T00:00:00.000Z',
      })
      .expect(422)
      .expect((response) => {
        expect(response.body?.error?.code).toBe(
          'academics.calendar_event.invalid_scope',
        );
      });

    await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/academics/calendar/events/${eventAId}`)
      .set('Authorization', bearer(adminAAuth))
      .send({
        scopeType: 'section',
        scopeId: academicB.sectionId,
      })
      .expect(422)
      .expect((response) => {
        expect(response.body?.error?.code).toBe(
          'academics.calendar_event.invalid_scope',
        );
      });

    const countAfter = await prisma.academicCalendarEvent.count({
      where: { schoolId: schoolAId },
    });
    expect(countAfter).toBe(countBefore);

    const eventA = await prisma.academicCalendarEvent.findUniqueOrThrow({
      where: { id: eventAId },
      select: {
        scopeType: true,
        scopeKey: true,
        stageId: true,
        gradeId: true,
        sectionId: true,
      },
    });
    expect(eventA).toEqual({
      scopeType: AcademicCalendarEventScopeType.SCHOOL,
      scopeKey: null,
      stageId: null,
      gradeId: null,
      sectionId: null,
    });
  });

  it('enforces view and manage permissions independently', async () => {
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/calendar/events`)
      .set('Authorization', bearer(noPermissionAuth))
      .expect(403)
      .expect((response) => {
        expect(response.body?.error?.code).toBe('auth.scope.missing');
      });

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/calendar/events/${eventAId}`)
      .set('Authorization', bearer(noPermissionAuth))
      .expect(403)
      .expect((response) => {
        expect(response.body?.error?.code).toBe('auth.scope.missing');
      });

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/calendar/events`)
      .set('Authorization', bearer(viewOnlyAuth))
      .expect(200);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/calendar/events/${eventAId}`)
      .set('Authorization', bearer(viewOnlyAuth))
      .expect(200);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/academics/calendar/events`)
      .set('Authorization', bearer(viewOnlyAuth))
      .send(validCreatePayload('View Only Create'))
      .expect(403)
      .expect((response) => {
        expect(response.body?.error?.code).toBe('auth.scope.missing');
      });

    await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/academics/calendar/events/${eventAId}`)
      .set('Authorization', bearer(viewOnlyAuth))
      .send({ title: 'View Only Update' })
      .expect(403);

    await request(app.getHttpServer())
      .delete(`${GLOBAL_PREFIX}/academics/calendar/events/${eventAId}`)
      .set('Authorization', bearer(viewOnlyAuth))
      .expect(403);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/calendar/events`)
      .set('Authorization', bearer(manageOnlyAuth))
      .expect(403)
      .expect((response) => {
        expect(response.body?.error?.code).toBe('auth.scope.missing');
      });

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/calendar/events/${eventAId}`)
      .set('Authorization', bearer(manageOnlyAuth))
      .expect(403)
      .expect((response) => {
        expect(response.body?.error?.code).toBe('auth.scope.missing');
      });
  });

  it('denies teacher, student, and parent system roles by default', async () => {
    const rolePermissions = await listAppRoleCalendarPermissions();
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
      await expectCalendarCrudForbidden(actor);
    }
  });

  it('keeps active responses free of tenant/internal fields and excludes soft-deleted rows', async () => {
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/calendar/events/${eventAId}`)
      .set('Authorization', bearer(adminAAuth))
      .expect(200)
      .expect((response) => {
        expect(response.body.id).toBe(eventAId);
        expectSafeCalendarPayload(response.body);
      });

    await request(app.getHttpServer())
      .delete(`${GLOBAL_PREFIX}/academics/calendar/events/${softDeleteEventId}`)
      .set('Authorization', bearer(adminAAuth))
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual({
          id: softDeleteEventId,
          deleted: true,
        });
      });

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/calendar/events/${softDeleteEventId}`)
      .set('Authorization', bearer(adminAAuth))
      .expect(404);

    const listed = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/calendar/events`)
      .query({
        from: '2026-09-01T00:00:00.000Z',
        to: '2026-12-31T23:59:59.000Z',
      })
      .set('Authorization', bearer(adminAAuth))
      .expect(200);

    expect(
      listed.body.items.map((item: { id: string }) => item.id),
    ).not.toContain(softDeleteEventId);
    expectSafeCalendarPayload(listed.body);

    const deletedRow = await prisma.academicCalendarEvent.findUnique({
      where: { id: softDeleteEventId },
      select: { deletedAt: true, deletedByUserId: true },
    });
    expect(deletedRow?.deletedAt).toBeInstanceOf(Date);
    expect(deletedRow?.deletedByUserId).toBe(adminAUserId);
  });

  async function findSystemRole(key: string): Promise<{ id: string }> {
    const role = await prisma.role.findFirst({
      where: { key, schoolId: null, isSystem: true, deletedAt: null },
      select: { id: true },
    });
    if (!role) throw new Error(`Missing system role: ${key}`);
    return role;
  }

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
  }

  async function createOrganization(label: string): Promise<string> {
    const organization = await prisma.organization.create({
      data: {
        slug: `${marker}-org-${label}`,
        name: `Sprint 20A3 Calendar Security Org ${label} ${suffix}`,
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
        name: `Sprint 20A3 Calendar Security School ${label} ${suffix}`,
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
        description: 'Academic calendar security test role',
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

  async function createAcademicBase(
    inputSchoolId: string,
    label: string,
  ): Promise<AcademicBase> {
    const academicYear = await prisma.academicYear.create({
      data: {
        schoolId: inputSchoolId,
        nameAr: `${marker}-${label}-year-ar`,
        nameEn: `${marker}-${label}-year`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2027-06-30T00:00:00.000Z'),
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
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2026-12-31T00:00:00.000Z'),
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

  async function createCalendarEvent(params: {
    schoolId: string;
    academic: AcademicBase;
    createdByUserId: string;
    label: string;
    title: string;
  }): Promise<string> {
    const event = await prisma.academicCalendarEvent.create({
      data: {
        schoolId: params.schoolId,
        academicYearId: params.academic.academicYearId,
        termId: params.academic.termId,
        title: params.title,
        type: AcademicCalendarEventType.HOLIDAY,
        scopeType: AcademicCalendarEventScopeType.SCHOOL,
        allDay: true,
        startDate: new Date(`2026-09-${params.label === 'b' ? '08' : '07'}T00:00:00.000Z`),
        endDate: new Date(`2026-09-${params.label === 'b' ? '08' : '07'}T23:59:59.000Z`),
        createdByUserId: params.createdByUserId,
        updatedByUserId: params.createdByUserId,
      },
      select: { id: true },
    });

    return event.id;
  }

  function validCreatePayload(title: string) {
    return {
      academicYearId: academicA.academicYearId,
      termId: academicA.termId,
      title,
      type: 'holiday',
      scopeType: 'school',
      startDate: '2026-11-01T00:00:00.000Z',
      endDate: '2026-11-01T00:00:00.000Z',
    };
  }

  async function listAppRoleCalendarPermissions(): Promise<
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
          .filter((code) => code.startsWith('academics.calendar.'))
          .sort();
      }
    }

    return result;
  }

  async function expectCalendarCrudForbidden(actor: ActorAuth): Promise<void> {
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/calendar/events`)
      .set('Authorization', bearer(actor.auth))
      .expect(403)
      .expect((response) => {
        expect(response.body?.error?.code).toBe('auth.scope.missing');
      });

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/calendar/events/${eventAId}`)
      .set('Authorization', bearer(actor.auth))
      .expect(403);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/academics/calendar/events`)
      .set('Authorization', bearer(actor.auth))
      .send(validCreatePayload(`${actor.label} Forbidden Create`))
      .expect(403);

    await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/academics/calendar/events/${eventAId}`)
      .set('Authorization', bearer(actor.auth))
      .send({ title: `${actor.label} Forbidden Update` })
      .expect(403);

    await request(app.getHttpServer())
      .delete(`${GLOBAL_PREFIX}/academics/calendar/events/${eventAId}`)
      .set('Authorization', bearer(actor.auth))
      .expect(403);
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

  function bearer(tokens: AuthTokens): string {
    return `Bearer ${tokens.accessToken}`;
  }

  function expectSafeCalendarPayload(value: unknown): void {
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
    await prisma.academicCalendarEvent.deleteMany({
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
});
