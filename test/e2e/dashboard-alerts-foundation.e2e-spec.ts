import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AdmissionApplicationSource,
  AdmissionApplicationStatus,
  MembershipStatus,
  PrismaClient,
  UserStatus,
  UserType,
} from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { BullmqService } from '../../src/infrastructure/queue/bullmq.service';

const GLOBAL_PREFIX = '/api/v1';
const DEMO_ADMIN_EMAIL = 'admin@academy.moazez.dev';
const DEMO_ADMIN_PASSWORD = 'School123!';
const DEMO_SCHOOL_SLUG = 'moazez-academy';
const PASSWORD = 'DashboardAlerts123!';

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

type CreatedPrincipal = {
  email: string;
  userId: string;
  roleId: string;
  organizationId: string;
  schoolId: string;
};

jest.setTimeout(90000);

describe('Sprint 16B Dashboard Alerts Foundation (e2e)', () => {
  const suffix = randomUUID().split('-')[0];
  const marker = `s16b-alerts-${suffix}`;

  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let demoSchoolId = '';
  let demoOrganizationId = '';
  let alertsPermissionId = '';
  let deniedPrincipal: CreatedPrincipal;
  let minimalPrincipal: CreatedPrincipal;

  const createdOrganizationIds: string[] = [];
  const createdSchoolIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdRoleIds: string[] = [];
  const createdApplicationIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const demoSchool = await prisma.school.findFirst({
      where: { slug: DEMO_SCHOOL_SLUG },
      select: { id: true, organizationId: true },
    });
    if (!demoSchool) {
      throw new Error('Demo school not found - run `npm run seed` first.');
    }
    demoSchoolId = demoSchool.id;
    demoOrganizationId = demoSchool.organizationId;

    alertsPermissionId = await ensureAlertsPermission();
    await ensureDemoAdminHasAlertsPermission();
    deniedPrincipal = await createPrincipal({
      label: 'denied',
      organizationId: demoOrganizationId,
      schoolId: demoSchoolId,
      permissionIds: [],
    });
    minimalPrincipal = await createMinimalSchoolPrincipal();
    await createDemoAdmissionAlertSeed();

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(BullmqService)
      .useValue(createNoopBullmqService())
      .compile();

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
    if (app) {
      await app.close();
    }
    if (prisma) {
      await cleanupE2eData();
      await prisma.$disconnect();
    }
  });

  it('registers summary and alerts, while keeping deferred lifecycle routes absent', () => {
    const routes = listRegisteredRoutes();

    expect(routes).toContain('GET /api/v1/dashboard/summary');
    expect(routes).toContain('GET /api/v1/dashboard/alerts');
    for (const absentRoute of [
      'GET /api/v1/dashboard/activity-feed',
      'GET /api/v1/dashboard/activities',
      'GET /api/v1/dashboard/analytics-builder',
      'POST /api/v1/dashboard/alerts/:alertId/acknowledge',
      'POST /api/v1/dashboard/alerts/:alertId/dismiss',
      'POST /api/v1/dashboard/alerts/:alertId/read',
      'GET /api/v1/platform/dashboard/alerts',
      'GET /api/v1/admin/dashboard/alerts',
      'GET /api/v1/teacher/dashboard/alerts',
      'GET /api/v1/student/dashboard/alerts',
      'GET /api/v1/parent/dashboard/alerts',
    ]) {
      expect(routes).not.toContain(absentRoute);
    }
  });

  it('requires dashboard.alerts.view and returns the stable alerts contract', async () => {
    const adminToken = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);
    const deniedToken = await login(deniedPrincipal.email, PASSWORD);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/alerts`)
      .set('Authorization', `Bearer ${deniedToken}`)
      .expect(403);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/alerts`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body).toMatchObject({
      generatedAt: expect.any(String),
      alerts: expect.any(Array),
      summary: {
        total: expect.any(Number),
        critical: expect.any(Number),
        warning: expect.any(Number),
        info: expect.any(Number),
        bySource: expect.any(Object),
      },
      deferred: {
        persistence: 'deferred',
        acknowledge: 'deferred',
        dismiss: 'deferred',
        activityFeed: 'deferred',
      },
    });
    expectNoTenantIds(response.body);
  });

  it('supports source, severity, limit, and includeZeroCount query controls', async () => {
    const adminToken = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const sourceResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/alerts`)
      .query({ source: 'admissions' })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(sourceResponse.body.alerts.length).toBeGreaterThan(0);
    expect(
      sourceResponse.body.alerts.every(
        (alert: { source: string }) => alert.source === 'admissions',
      ),
    ).toBe(true);

    const severityResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/alerts`)
      .query({ severity: 'warning' })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(severityResponse.body.alerts.length).toBeGreaterThan(0);
    expect(
      severityResponse.body.alerts.every(
        (alert: { severity: string }) => alert.severity === 'warning',
      ),
    ).toBe(true);

    const limitedResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/alerts`)
      .query({ includeZeroCount: 'true', limit: '1' })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(limitedResponse.body.alerts).toHaveLength(1);

    const zeroCountResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/alerts`)
      .query({ includeZeroCount: 'true', limit: '100' })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(zeroCountResponse.body.alerts.length).toBeGreaterThanOrEqual(
      limitedResponse.body.alerts.length,
    );
    expectNoTenantIds(zeroCountResponse.body);
  });

  it('validates alert query parameters', async () => {
    const adminToken = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/alerts`)
      .query({ source: 'wallet' })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/alerts`)
      .query({ severity: 'urgent' })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/alerts`)
      .query({ limit: '0' })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);
  });

  it('returns a stable response for a new school with minimal data', async () => {
    const token = await login(minimalPrincipal.email, PASSWORD);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/alerts`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toMatchObject({
      generatedAt: expect.any(String),
      alerts: expect.any(Array),
      summary: expect.objectContaining({
        total: expect.any(Number),
        bySource: expect.any(Object),
      }),
      deferred: {
        persistence: 'deferred',
        acknowledge: 'deferred',
        dismiss: 'deferred',
        activityFeed: 'deferred',
      },
    });
    expectNoTenantIds(response.body);
  });

  it('keeps dashboard summary working after adding alerts', async () => {
    const adminToken = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/summary`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body).toHaveProperty('cards');
        expect(response.body).toHaveProperty('alertsPreview');
        expectNoTenantIds(response.body);
      });
  });

  async function ensureAlertsPermission(): Promise<string> {
    const permission = await prisma.permission.upsert({
      where: { code: 'dashboard.alerts.view' },
      update: {
        module: 'dashboard',
        resource: 'alerts',
        action: 'view',
        description: 'View computed dashboard operational alerts',
      },
      create: {
        code: 'dashboard.alerts.view',
        module: 'dashboard',
        resource: 'alerts',
        action: 'view',
        description: 'View computed dashboard operational alerts',
      },
      select: { id: true },
    });

    return permission.id;
  }

  async function ensureDemoAdminHasAlertsPermission(): Promise<void> {
    const admin = await prisma.user.findUnique({
      where: { email: DEMO_ADMIN_EMAIL },
      select: { id: true },
    });
    if (!admin) {
      throw new Error('Demo admin not found - run `npm run seed` first.');
    }

    const membership = await prisma.membership.findFirst({
      where: {
        userId: admin.id,
        schoolId: demoSchoolId,
        status: MembershipStatus.ACTIVE,
        deletedAt: null,
      },
      orderBy: { startedAt: 'desc' },
      select: { roleId: true },
    });
    if (!membership) {
      throw new Error('Demo admin school membership missing.');
    }

    await prisma.rolePermission.createMany({
      data: [{ roleId: membership.roleId, permissionId: alertsPermissionId }],
      skipDuplicates: true,
    });
  }

  async function createDemoAdmissionAlertSeed(): Promise<void> {
    const application = await prisma.application.create({
      data: {
        organizationId: demoOrganizationId,
        schoolId: demoSchoolId,
        studentName: `${marker} demo admissions alert`,
        source: AdmissionApplicationSource.WALK_IN,
        status: AdmissionApplicationStatus.SUBMITTED,
        submittedAt: new Date('2026-06-01T08:00:00.000Z'),
      },
      select: { id: true },
    });
    createdApplicationIds.push(application.id);
  }

  async function createMinimalSchoolPrincipal(): Promise<CreatedPrincipal> {
    const organization = await prisma.organization.create({
      data: {
        slug: `${marker}-minimal-org`,
        name: `Sprint 16B Minimal Org ${suffix}`,
      },
      select: { id: true },
    });
    createdOrganizationIds.push(organization.id);

    const school = await prisma.school.create({
      data: {
        organizationId: organization.id,
        slug: `${marker}-minimal-school`,
        name: `Sprint 16B Minimal School ${suffix}`,
      },
      select: { id: true },
    });
    createdSchoolIds.push(school.id);

    return createPrincipal({
      label: 'minimal',
      organizationId: organization.id,
      schoolId: school.id,
      permissionIds: [alertsPermissionId],
    });
  }

  async function createPrincipal(input: {
    label: string;
    organizationId: string;
    schoolId: string;
    permissionIds: string[];
  }): Promise<CreatedPrincipal> {
    const role = await prisma.role.create({
      data: {
        schoolId: input.schoolId,
        key: `${marker}-${input.label}-role`,
        name: `Sprint 16B ${input.label} role`,
        description: `Sprint 16B dashboard alerts ${input.label} role`,
        isSystem: false,
      },
      select: { id: true },
    });
    createdRoleIds.push(role.id);

    if (input.permissionIds.length > 0) {
      await prisma.rolePermission.createMany({
        data: input.permissionIds.map((permissionId) => ({
          roleId: role.id,
          permissionId,
        })),
        skipDuplicates: true,
      });
    }

    const email = `${marker}-${input.label}@example.test`;
    const user = await prisma.user.create({
      data: {
        email,
        firstName: 'Dashboard',
        lastName: input.label,
        userType: UserType.SCHOOL_USER,
        status: UserStatus.ACTIVE,
        passwordHash: await argon2.hash(PASSWORD, ARGON2_OPTIONS),
      },
      select: { id: true },
    });
    createdUserIds.push(user.id);

    await prisma.membership.create({
      data: {
        userId: user.id,
        organizationId: input.organizationId,
        schoolId: input.schoolId,
        roleId: role.id,
        userType: UserType.SCHOOL_USER,
        status: MembershipStatus.ACTIVE,
      },
    });

    return {
      email,
      userId: user.id,
      roleId: role.id,
      organizationId: input.organizationId,
      schoolId: input.schoolId,
    };
  }

  async function login(email: string, password: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email, password })
      .expect(200);

    return response.body.accessToken;
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

        for (const routePath of paths) {
          for (const method of methods) {
            routes.push(`${method} ${routePath}`);
          }
        }
      }

      if (layer.handle?.stack) {
        collectRoutes(layer.handle.stack, routes);
      }
    }
  }

  async function cleanupE2eData(): Promise<void> {
    if (createdApplicationIds.length > 0) {
      await prisma.application.deleteMany({
        where: { id: { in: createdApplicationIds } },
      });
    }
    if (createdUserIds.length > 0) {
      await prisma.session.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
    }
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { actorId: { in: createdUserIds } },
          { schoolId: { in: createdSchoolIds } },
          { organizationId: { in: createdOrganizationIds } },
        ],
      },
    });
    if (createdUserIds.length > 0) {
      await prisma.membership.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      });
    }
    if (createdRoleIds.length > 0) {
      await prisma.rolePermission.deleteMany({
        where: { roleId: { in: createdRoleIds } },
      });
      await prisma.role.deleteMany({
        where: { id: { in: createdRoleIds } },
      });
    }
    if (createdSchoolIds.length > 0) {
      await prisma.school.deleteMany({
        where: { id: { in: createdSchoolIds } },
      });
    }
    if (createdOrganizationIds.length > 0) {
      await prisma.organization.deleteMany({
        where: { id: { in: createdOrganizationIds } },
      });
    }
  }
});

function expectNoTenantIds(body: unknown): void {
  const serialized = JSON.stringify(body);
  expect(serialized).not.toContain('schoolId');
  expect(serialized).not.toContain('organizationId');
}

function createNoopBullmqService(): Pick<
  BullmqService,
  'addEmailJob' | 'addImportJob' | 'createWorker' | 'onModuleDestroy'
> {
  return {
    addEmailJob: jest.fn().mockResolvedValue(undefined),
    addImportJob: jest.fn().mockResolvedValue(undefined),
    createWorker: jest.fn().mockReturnValue({ close: jest.fn() }),
    onModuleDestroy: jest.fn().mockResolvedValue(undefined),
  };
}
