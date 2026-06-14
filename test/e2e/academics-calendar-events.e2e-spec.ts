import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
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
const PASSWORD = 'Sprint20A3E2E123!';
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

jest.setTimeout(180000);

describe('Academic calendar events (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;

  let organizationId = '';
  let schoolId = '';
  let adminUserId = '';
  let adminEmail = '';
  let academic: AcademicBase;
  let otherYearTermId = '';
  let adminAuth: AuthTokens;

  let holidayEventId = '';
  let scopedEventId = '';

  const suffix = randomUUID().split('-')[0];
  const marker = `s20a3-e2e-${suffix}`;
  const createdOrganizationIds: string[] = [];
  const createdSchoolIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdRoleIds: string[] = [];
  const createdPermissionIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const [viewPermission, managePermission] = await Promise.all([
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

    organizationId = await createOrganization();
    schoolId = await createSchool(organizationId);
    const calendarAdminRoleId = await createCustomRole({
      key: `${marker}-calendar-admin`,
      name: `Sprint 20A3 Calendar Admin ${suffix}`,
      permissionIds: [viewPermission.id, managePermission.id],
    });
    academic = await createAcademicBase(schoolId);
    otherYearTermId = await createOtherYearTerm(schoolId);

    adminEmail = `${marker}-admin@example.test`;
    adminUserId = await createUserWithMembership({
      email: adminEmail,
      firstName: 'Sprint20A3',
      lastName: 'Admin',
      userType: UserType.SCHOOL_USER,
      roleId: calendarAdminRoleId,
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

    adminAuth = await login(adminEmail);
  });

  afterAll(async () => {
    try {
      if (app) await app.close();
      await cleanupE2eData();
    } finally {
      if (prisma) await prisma.$disconnect();
    }
  });

  it('registers calendar and overview routes while keeping app calendar routes deferred', () => {
    const routes = listRegisteredRoutes();

    expect(routes).toEqual(
      expect.arrayContaining([
        'GET /api/v1/academics/calendar/events',
        'POST /api/v1/academics/calendar/events',
        'GET /api/v1/academics/calendar/events/:eventId',
        'PATCH /api/v1/academics/calendar/events/:eventId',
        'DELETE /api/v1/academics/calendar/events/:eventId',
        'GET /api/v1/academics/overview',
      ]),
    );

    for (const absentRoute of [
      'GET /api/v1/teacher/calendar',
      'GET /api/v1/student/calendar',
      'GET /api/v1/parent/children/:studentId/calendar',
    ]) {
      expect(routes).not.toContain(absentRoute);
    }
  });

  it('creates a school-scoped holiday event with a safe response and audit row', async () => {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/academics/calendar/events`)
      .set('Authorization', bearer(adminAuth))
      .send({
        academicYearId: academic.academicYearId,
        termId: academic.termId,
        title: '  Founding Day  ',
        description: null,
        notes: null,
        type: 'holiday',
        scopeType: 'school',
        allDay: true,
        startDate: '2026-09-05T00:00:00.000Z',
        endDate: '2026-09-05T23:59:59.000Z',
      })
      .expect(201);

    holidayEventId = response.body.id;
    expect(response.body).toMatchObject({
      id: holidayEventId,
      academicYearId: academic.academicYearId,
      termId: academic.termId,
      title: 'Founding Day',
      description: null,
      notes: null,
      type: 'holiday',
      scope: { type: 'school', id: null },
      allDay: true,
      startDate: '2026-09-05T00:00:00.000Z',
      endDate: '2026-09-05T23:59:59.000Z',
    });
    expect(typeof response.body.createdAt).toBe('string');
    expect(typeof response.body.updatedAt).toBe('string');
    expectSafeCalendarPayload(response.body);

    const audit = await findAuditLog(
      'academics.calendar_event.create',
      holidayEventId,
    );
    expect(audit?.after).toMatchObject({
      id: holidayEventId,
      academicYearId: academic.academicYearId,
      termId: academic.termId,
      type: 'holiday',
      scopeType: 'school',
      scopeId: null,
      allDay: true,
    });
    expectNoObjectKey(audit?.after, 'title');
    expectNoObjectKey(audit?.after, 'description');
    expectNoObjectKey(audit?.after, 'notes');
  });

  it('creates a non-school scoped exam event', async () => {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/academics/calendar/events`)
      .set('Authorization', bearer(adminAuth))
      .send({
        academicYearId: academic.academicYearId,
        termId: academic.termId,
        title: 'Section Exam',
        description: 'Visible calendar description',
        notes: 'Visible calendar notes',
        type: 'exam',
        scopeType: 'section',
        scopeId: academic.sectionId,
        allDay: false,
        startDate: '2026-10-10T08:00:00.000Z',
        endDate: '2026-10-10T10:00:00.000Z',
      })
      .expect(201);

    scopedEventId = response.body.id;
    expect(response.body).toMatchObject({
      id: scopedEventId,
      type: 'exam',
      scope: { type: 'section', id: academic.sectionId },
      allDay: false,
      description: 'Visible calendar description',
      notes: 'Visible calendar notes',
    });
    expectSafeCalendarPayload(response.body);
  });

  it('lists events with academic, date, type, scope, and bounded pagination filters', async () => {
    const bounded = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/calendar/events`)
      .query({
        academicYearId: academic.academicYearId,
        termId: academic.termId,
        from: '2026-09-01T00:00:00.000Z',
        to: '2026-12-31T23:59:59.000Z',
        limit: 1,
      })
      .set('Authorization', bearer(adminAuth))
      .expect(200);

    expect(bounded.body.items).toHaveLength(1);
    expect(typeof bounded.body.nextCursor).toBe('string');
    expectSafeCalendarPayload(bounded.body);

    const byType = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/calendar/events`)
      .query({
        academicYearId: academic.academicYearId,
        termId: academic.termId,
        from: '2026-09-01T00:00:00.000Z',
        to: '2026-12-31T23:59:59.000Z',
        type: 'holiday',
      })
      .set('Authorization', bearer(adminAuth))
      .expect(200);

    expect(byType.body.nextCursor).toBeNull();
    expect(byType.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: holidayEventId, type: 'holiday' }),
      ]),
    );
    expect(
      byType.body.items.map((item: { id: string }) => item.id),
    ).not.toContain(scopedEventId);

    const byScope = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/calendar/events`)
      .query({
        academicYearId: academic.academicYearId,
        termId: academic.termId,
        from: '2026-09-01T00:00:00.000Z',
        to: '2026-12-31T23:59:59.000Z',
        scopeType: 'section',
        scopeId: academic.sectionId,
      })
      .set('Authorization', bearer(adminAuth))
      .expect(200);

    expect(byScope.body.items).toEqual([
      expect.objectContaining({
        id: scopedEventId,
        scope: { type: 'section', id: academic.sectionId },
      }),
    ]);
    expectSafeCalendarPayload(byScope.body);
  });

  it('reads event detail with no tenant or storage leakage', async () => {
    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/calendar/events/${holidayEventId}`)
      .set('Authorization', bearer(adminAuth))
      .expect(200);

    expect(response.body).toMatchObject({
      id: holidayEventId,
      academicYearId: academic.academicYearId,
      termId: academic.termId,
      type: 'holiday',
      scope: { type: 'school', id: null },
    });
    expectSafeCalendarPayload(response.body);
  });

  it('updates title, type, dates, and scope with safe audit metadata', async () => {
    const response = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/academics/calendar/events/${scopedEventId}`)
      .set('Authorization', bearer(adminAuth))
      .send({
        title: '  Grade Activity  ',
        type: 'activity',
        scopeType: 'grade',
        scopeId: academic.gradeId,
        allDay: true,
        startDate: '2026-10-11T00:00:00.000Z',
        endDate: '2026-10-11T23:59:59.000Z',
      })
      .expect(200);

    expect(response.body).toMatchObject({
      id: scopedEventId,
      title: 'Grade Activity',
      type: 'activity',
      scope: { type: 'grade', id: academic.gradeId },
      allDay: true,
      startDate: '2026-10-11T00:00:00.000Z',
      endDate: '2026-10-11T23:59:59.000Z',
    });
    expectSafeCalendarPayload(response.body);

    const audit = await findAuditLog(
      'academics.calendar_event.update',
      scopedEventId,
    );
    expect(audit?.before).toMatchObject({
      id: scopedEventId,
      type: 'exam',
      scopeType: 'section',
      scopeId: academic.sectionId,
    });
    expect(audit?.after).toMatchObject({
      id: scopedEventId,
      type: 'activity',
      scopeType: 'grade',
      scopeId: academic.gradeId,
    });
    expectNoObjectKey(audit?.before, 'title');
    expectNoObjectKey(audit?.before, 'description');
    expectNoObjectKey(audit?.before, 'notes');
    expectNoObjectKey(audit?.after, 'title');
    expectNoObjectKey(audit?.after, 'description');
    expectNoObjectKey(audit?.after, 'notes');
  });

  it('soft deletes events and excludes them from normal reads', async () => {
    await request(app.getHttpServer())
      .delete(`${GLOBAL_PREFIX}/academics/calendar/events/${scopedEventId}`)
      .set('Authorization', bearer(adminAuth))
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual({ id: scopedEventId, deleted: true });
      });

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/calendar/events/${scopedEventId}`)
      .set('Authorization', bearer(adminAuth))
      .expect(404)
      .expect((response) => {
        expect(response.body?.error?.code).toBe(
          'academics.calendar_event.not_found',
        );
        expectSafeCalendarPayload(response.body);
      });

    const listed = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/calendar/events`)
      .query({
        academicYearId: academic.academicYearId,
        termId: academic.termId,
        from: '2026-09-01T00:00:00.000Z',
        to: '2026-12-31T23:59:59.000Z',
      })
      .set('Authorization', bearer(adminAuth))
      .expect(200);

    expect(listed.body.items.map((item: { id: string }) => item.id)).not.toContain(
      scopedEventId,
    );
    const deletedRow = await prisma.academicCalendarEvent.findUnique({
      where: { id: scopedEventId },
      select: { deletedAt: true, deletedByUserId: true },
    });
    expect(deletedRow?.deletedAt).toBeInstanceOf(Date);
    expect(deletedRow?.deletedByUserId).toBe(adminUserId);

    const audit = await findAuditLog(
      'academics.calendar_event.delete',
      scopedEventId,
    );
    expect(audit?.after).toMatchObject({
      id: scopedEventId,
      type: 'activity',
      scopeType: 'grade',
      scopeId: academic.gradeId,
    });
    expect(audit?.after).toHaveProperty('deletedAt');
    expectNoObjectKey(audit?.after, 'title');
    expectNoObjectKey(audit?.after, 'description');
    expectNoObjectKey(audit?.after, 'notes');
  });

  it('rejects invalid date, scope, academic, and list range requests', async () => {
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/academics/calendar/events`)
      .set('Authorization', bearer(adminAuth))
      .send({
        academicYearId: academic.academicYearId,
        termId: academic.termId,
        title: 'Invalid Date Range',
        type: 'holiday',
        scopeType: 'school',
        startDate: '2026-10-12T00:00:00.000Z',
        endDate: '2026-10-11T00:00:00.000Z',
      })
      .expect(422)
      .expect((response) => {
        expect(response.body?.error?.code).toBe(
          'academics.calendar_event.invalid_date_range',
        );
        expectSafeCalendarPayload(response.body);
      });

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/academics/calendar/events`)
      .set('Authorization', bearer(adminAuth))
      .send({
        academicYearId: academic.academicYearId,
        termId: academic.termId,
        title: 'School Scope With Id',
        type: 'holiday',
        scopeType: 'school',
        scopeId: academic.gradeId,
        startDate: '2026-10-12T00:00:00.000Z',
        endDate: '2026-10-12T00:00:00.000Z',
      })
      .expect(422)
      .expect((response) => {
        expect(response.body?.error?.code).toBe(
          'academics.calendar_event.invalid_scope',
        );
      });

    for (const scopeType of ['stage', 'grade', 'section']) {
      await request(app.getHttpServer())
        .post(`${GLOBAL_PREFIX}/academics/calendar/events`)
        .set('Authorization', bearer(adminAuth))
        .send({
          academicYearId: academic.academicYearId,
          termId: academic.termId,
          title: `Missing ${scopeType} Scope Id`,
          type: 'activity',
          scopeType,
          startDate: '2026-10-13T00:00:00.000Z',
          endDate: '2026-10-13T00:00:00.000Z',
        })
        .expect(422)
        .expect((response) => {
          expect(response.body?.error?.code).toBe(
            'academics.calendar_event.invalid_scope',
          );
        });
    }

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/academics/calendar/events`)
      .set('Authorization', bearer(adminAuth))
      .send({
        academicYearId: academic.academicYearId,
        termId: otherYearTermId,
        title: 'Term In Different Academic Year',
        type: 'other',
        scopeType: 'school',
        startDate: '2026-10-14T00:00:00.000Z',
        endDate: '2026-10-14T00:00:00.000Z',
      })
      .expect(422)
      .expect((response) => {
        expect(response.body?.error?.code).toBe(
          'academics.calendar_event.invalid_scope',
        );
      });

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/calendar/events`)
      .query({
        from: '2026-01-01T00:00:00.000Z',
        to: '2028-01-10T00:00:00.000Z',
      })
      .set('Authorization', bearer(adminAuth))
      .expect(422)
      .expect((response) => {
        expect(response.body?.error?.code).toBe(
          'academics.calendar_event.invalid_list_range',
        );
      });
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

  async function createOrganization(): Promise<string> {
    const organization = await prisma.organization.create({
      data: {
        slug: `${marker}-org`,
        name: `Sprint 20A3 Calendar Org ${suffix}`,
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
        name: `Sprint 20A3 Calendar School ${suffix}`,
        status: SchoolStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdSchoolIds.push(school.id);
    return school.id;
  }

  async function createCustomRole(params: {
    key: string;
    name: string;
    permissionIds: string[];
  }): Promise<string> {
    const role = await prisma.role.create({
      data: {
        schoolId,
        key: params.key,
        name: params.name,
        description: 'Academic calendar e2e test role',
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
        nameAr: `${marker}-term-ar`,
        nameEn: `${marker}-term`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2026-12-31T00:00:00.000Z'),
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

  async function createOtherYearTerm(inputSchoolId: string): Promise<string> {
    const academicYear = await prisma.academicYear.create({
      data: {
        schoolId: inputSchoolId,
        nameAr: `${marker}-other-year-ar`,
        nameEn: `${marker}-other-year`,
        startDate: new Date('2027-09-01T00:00:00.000Z'),
        endDate: new Date('2028-06-30T00:00:00.000Z'),
        isActive: false,
      },
      select: { id: true },
    });
    const term = await prisma.term.create({
      data: {
        schoolId: inputSchoolId,
        academicYearId: academicYear.id,
        nameAr: `${marker}-other-term-ar`,
        nameEn: `${marker}-other-term`,
        startDate: new Date('2027-09-01T00:00:00.000Z'),
        endDate: new Date('2027-12-31T00:00:00.000Z'),
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

  async function findAuditLog(action: string, resourceId: string) {
    return prisma.auditLog.findFirst({
      where: {
        action,
        resourceId,
        actorId: adminUserId,
        schoolId,
      },
      orderBy: { createdAt: 'desc' },
      select: {
        action: true,
        resourceId: true,
        before: true,
        after: true,
      },
    });
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
