import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
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
const PASSWORD = 'DashboardModules123!';

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

describe('DASHBOARD-MODULE-PAGES-1A foundation (e2e)', () => {
  const suffix = randomUUID().split('-')[0];
  const marker = `modules1a-${suffix}`;

  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let demoSchoolId = '';
  let demoOrganizationId = '';
  let deniedPrincipal: CreatedPrincipal;

  const createdUserIds: string[] = [];
  const createdRoleIds: string[] = [];

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

    const permissionIds = await ensureDashboardPermissions();
    await ensureDemoAdminHasDashboardPermissions(Object.values(permissionIds));
    deniedPrincipal = await createPrincipal({
      label: 'denied',
      organizationId: demoOrganizationId,
      schoolId: demoSchoolId,
      permissionIds: [],
    });

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

  it('registers module routes and keeps out-of-scope dashboard routes absent', () => {
    const routes = listRegisteredRoutes();

    expect(routes).toEqual(
      expect.arrayContaining([
        'GET /api/v1/dashboard/summary',
        'GET /api/v1/dashboard/alerts',
        'GET /api/v1/dashboard/activity-feed',
        'GET /api/v1/dashboard/command-center',
        'GET /api/v1/dashboard/light-mode-dropdown',
        'GET /api/v1/dashboard/modules',
        'GET /api/v1/dashboard/modules/:moduleKey',
        'GET /api/v1/dashboard/widgets',
        'GET /api/v1/dashboard/widgets/:widgetKey',
        'GET /api/v1/dashboard/analytics/catalog',
        'GET /api/v1/dashboard/analytics/charts',
        'GET /api/v1/dashboard/analytics/charts/:chartKey',
        'GET /api/v1/dashboard/analytics/charts/:chartKey/data',
      ]),
    );
    for (const absentRoute of [
      'POST /api/v1/dashboard/alerts/:alertKey/acknowledge',
      'POST /api/v1/dashboard/alerts/:alertKey/dismiss',
      'POST /api/v1/dashboard/alerts/:alertKey/snooze',
      'GET /api/v1/dashboard/exports/:exportKey',
      'POST /api/v1/dashboard/reports/:reportKey',
      'GET /api/v1/dashboard/realtime',
    ]) {
      expect(routes).not.toContain(absentRoute);
    }
  });

  it('returns 401 without a token and 403 without dashboard.modules.view', async () => {
    const deniedToken = await login(deniedPrincipal.email, PASSWORD);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/modules`)
      .expect(401);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/modules`)
      .set('Authorization', `Bearer ${deniedToken}`)
      .expect(403);
  });

  it('returns the module list for an authorized school admin', async () => {
    const adminToken = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/modules`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body).toMatchObject({
      generatedAt: expect.any(String),
      modules: expect.any(Array),
      summary: {
        total: 10,
        byStatus: { available: 10 },
        bySource: expect.any(Object),
      },
      filters: {
        status: null,
        source: null,
        limit: 20,
      },
      deferred: {
        customLayouts: 'deferred',
        userPreferences: 'deferred',
        exports: 'deferred',
        realtime: 'deferred',
      },
      meta: {
        source: 'dashboard_module_pages',
        version: 'v1',
        freshness: {
          dataMode: 'request_time_snapshot',
          cacheStatus: 'not_used',
          realtimeStatus: 'not_used',
        },
      },
    });
    expect(
      response.body.modules.map(
        (modulePage: { moduleKey: string }) => modulePage.moduleKey,
      ),
    ).toEqual([
      'admissions',
      'students',
      'academics',
      'attendance',
      'grades',
      'homework',
      'behavior',
      'reinforcement',
      'communication',
      'settings',
    ]);
    expect(response.body.modules).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ moduleKey: 'platform-admin' }),
      ]),
    );
    expectNoInternalLeaks(response.body);
  });

  it('supports module list query controls and rejects override-shaped input', async () => {
    const adminToken = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/modules`)
      .query({ status: 'available', source: 'settings', limit: '1' })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body.filters).toEqual({
      status: 'available',
      source: 'settings',
      limit: 1,
    });
    expect(response.body.modules).toHaveLength(1);
    expect(response.body.modules[0]).toMatchObject({
      moduleKey: 'settings',
      summary: {
        widgetCount: 2,
        chartCount: 3,
        availableChartDataCount: 2,
      },
      capabilities: {
        analyticsData: 'partial',
      },
    });

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/modules`)
      .query({ source: 'platform' })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/modules`)
      .query({ status: 'live' })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/modules`)
      .query({ limit: '51' })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/modules`)
      .query({ schoolId: demoSchoolId })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);
  });

  it('returns a known attendance module page and 404 for an unknown module', async () => {
    const adminToken = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/modules/attendance`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body).toMatchObject({
      generatedAt: expect.any(String),
      module: {
        moduleKey: 'attendance',
        source: 'attendance',
        title: 'Attendance',
        frontendRoute: '/dashboard/modules/attendance',
        sourceRoute: '/attendance/roll-call',
      },
      overview: {
        quickStats: expect.any(Array),
        risks: expect.any(Array),
        actions: expect.any(Array),
      },
      widgets: expect.any(Array),
      analytics: {
        charts: expect.any(Array),
        availableData: expect.any(Array),
        plannedCharts: expect.any(Array),
      },
      sections: expect.any(Array),
      capabilities: {
        widgets: 'available',
        analyticsDefinitions: 'available',
        analyticsData: 'partial',
        drilldowns: 'deferred',
        exports: 'deferred',
        realtime: 'deferred',
      },
      emptyState: null,
      meta: {
        source: 'dashboard_module_page',
        version: 'v1',
        dataFreshness: 'live',
      },
    });
    expect(
      response.body.widgets.map(
        (widget: { widgetKey: string }) => widget.widgetKey,
      ),
    ).toEqual(['attendance.pending_today', 'attendance.absences_today']);
    expect(
      response.body.analytics.charts.map(
        (chart: { chartKey: string }) => chart.chartKey,
      ),
    ).toEqual(
      expect.arrayContaining([
        'attendance.daily_trend',
        'attendance.pending_sessions',
        'attendance.excuse_status',
      ]),
    );
    expect(
      response.body.analytics.availableData.map(
        (data: { chartKey: string }) => data.chartKey,
      ),
    ).toEqual(['attendance.pending_sessions']);
    expect(
      response.body.analytics.plannedCharts.map(
        (chart: { chartKey: string }) => chart.chartKey,
      ),
    ).toEqual([]);
    expect(
      response.body.analytics.charts
        .filter(
          (chart: { chartKey: string }) =>
            chart.chartKey !== 'attendance.pending_sessions',
        )
        .every(
          (chart: { status: string; meta: { dataAvailability: string } }) =>
            chart.status === 'available' &&
            ['computed_series', 'computed_category'].includes(
              chart.meta.dataAvailability,
            ),
        ),
    ).toBe(true);
    expect(JSON.stringify(response.body.analytics.plannedCharts)).not.toContain(
      'points',
    );
    expectNoInternalLeaks(response.body);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/modules/platform-admin`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
  });

  it('returns settings readiness data only for operational_snapshot_v1 charts', async () => {
    const adminToken = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/modules/settings`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(
      response.body.widgets.map(
        (widget: { widgetKey: string }) => widget.widgetKey,
      ),
    ).toEqual(['settings.email_connection', 'settings.login_identity']);
    expect(
      response.body.analytics.availableData.map(
        (data: { chartKey: string }) => data.chartKey,
      ),
    ).toEqual([
      'settings.email_connection_readiness',
      'settings.login_identity_readiness',
    ]);
    expect(
      response.body.analytics.availableData.every(
        (data: { meta: { pack: string; dataAvailability: string } }) =>
          data.meta.pack === 'operational_snapshot_v1' &&
          data.meta.dataAvailability === 'computed_snapshot',
      ),
    ).toBe(true);
    expect(
      response.body.analytics.plannedCharts.map(
        (chart: { chartKey: string }) => chart.chartKey,
      ),
    ).toEqual(['settings.notification_readiness']);
    expect(JSON.stringify(response.body.analytics.plannedCharts)).not.toContain(
      'points',
    );
    expectNoInternalLeaks(response.body);
  });

  it('shows newly available Admissions and Students definitions without standalone data fanout', async () => {
    const adminToken = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const admissions = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/modules/admissions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(admissions.body.analytics.availableData).toEqual([]);
    expect(
      admissions.body.analytics.charts.map(
        (chart: { chartKey: string; status: string }) => ({
          chartKey: chart.chartKey,
          status: chart.status,
        }),
      ),
    ).toEqual([
      { chartKey: 'admissions.funnel', status: 'planned' },
      {
        chartKey: 'admissions.applications_by_status',
        status: 'available',
      },
      {
        chartKey: 'admissions.applications_over_time',
        status: 'available',
      },
    ]);
    expect(
      admissions.body.analytics.plannedCharts.map(
        (chart: { chartKey: string }) => chart.chartKey,
      ),
    ).toEqual(['admissions.funnel']);

    const students = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/modules/students`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(students.body.analytics.availableData).toEqual([]);
    expect(
      students.body.analytics.charts.every(
        (chart: { status: string }) => chart.status === 'available',
      ),
    ).toBe(true);
    expect(students.body.analytics.plannedCharts).toEqual([]);
    expectNoInternalLeaks(admissions.body);
    expectNoInternalLeaks(students.body);
  });

  it('shows Communication computed definitions without standalone chart-data fanout', async () => {
    const adminToken = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);
    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/modules/communication`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(
      response.body.analytics.charts.map(
        (chart: { chartKey: string; status: string }) => ({
          chartKey: chart.chartKey,
          status: chart.status,
        }),
      ),
    ).toEqual([
      { chartKey: 'communication.message_volume', status: 'available' },
      { chartKey: 'communication.announcement_status', status: 'available' },
      { chartKey: 'communication.moderation_queue', status: 'available' },
    ]);
    expect(
      response.body.analytics.availableData.map(
        (data: { chartKey: string }) => data.chartKey,
      ),
    ).toEqual(['communication.moderation_queue']);
    expect(response.body.analytics.plannedCharts).toEqual([]);
    expectNoInternalLeaks(response.body);
  });

  it('keeps existing dashboard routes working', async () => {
    const adminToken = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/summary`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body).toHaveProperty('cards');
        expectNoInternalLeaks(response.body);
      });

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/alerts`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body).toHaveProperty('alerts');
        expectNoInternalLeaks(response.body);
      });

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/activity-feed`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body).toHaveProperty('items');
        expectNoInternalLeaks(response.body);
      });

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/command-center`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/widgets`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/analytics/catalog`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
  });

  async function ensureDashboardPermissions(): Promise<Record<string, string>> {
    const definitions = [
      {
        key: 'modules',
        code: 'dashboard.modules.view',
        resource: 'modules',
        description: 'View read-only dashboard module pages registry',
      },
      {
        key: 'analytics',
        code: 'dashboard.analytics.view',
        resource: 'analytics',
        description: 'View internal Dashboard Analytics catalog definitions',
      },
      {
        key: 'summary',
        code: 'dashboard.summary.view',
        resource: 'summary',
        description: 'View dashboard summary KPIs',
      },
      {
        key: 'alerts',
        code: 'dashboard.alerts.view',
        resource: 'alerts',
        description: 'View computed dashboard operational alerts',
      },
      {
        key: 'activityFeed',
        code: 'dashboard.activity_feed.view',
        resource: 'activity_feed',
        description: 'View read-only dashboard operational activity feed',
      },
      {
        key: 'commandCenter',
        code: 'dashboard.command_center.view',
        resource: 'command_center',
        description: 'View Dashboard Command Center V2 overview',
      },
      {
        key: 'widgets',
        code: 'dashboard.widgets.view',
        resource: 'widgets',
        description: 'View read-only dashboard widgets registry',
      },
    ] as const;
    const permissionIds: Record<string, string> = {};

    for (const definition of definitions) {
      const permission = await prisma.permission.upsert({
        where: { code: definition.code },
        update: {
          module: 'dashboard',
          resource: definition.resource,
          action: 'view',
          description: definition.description,
        },
        create: {
          code: definition.code,
          module: 'dashboard',
          resource: definition.resource,
          action: 'view',
          description: definition.description,
        },
        select: { id: true },
      });
      permissionIds[definition.key] = permission.id;
    }

    return permissionIds;
  }

  async function ensureDemoAdminHasDashboardPermissions(
    permissionIds: string[],
  ): Promise<void> {
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
      data: permissionIds.map((permissionId) => ({
        roleId: membership.roleId,
        permissionId,
      })),
      skipDuplicates: true,
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
        name: `Dashboard Modules ${input.label} role`,
        description: `Dashboard modules ${input.label} role`,
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
    if (createdUserIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: { actorId: { in: createdUserIds } },
      });
      await prisma.session.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
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
  }
});

function expectNoInternalLeaks(body: unknown): void {
  const serialized = JSON.stringify(body);
  for (const forbidden of [
    'schoolId',
    'organizationId',
    'membershipId',
    'roleId',
    'passwordHash',
    'deletedAt',
    'actorId',
    'userId',
    'resourceId',
    'bucket',
    'objectKey',
    'platform_admin',
    'platform-admin',
  ]) {
    expect(serialized).not.toContain(forbidden);
  }
  expect(serialized).not.toMatch(/(^|[^A-Za-z0-9])raw([^A-Za-z0-9]|$)/i);
}

type AppModuleBullmqServiceMock = {
  addEmailJob: (...args: unknown[]) => Promise<void>;
  addImportJob: (...args: unknown[]) => Promise<void>;
  addJob: (...args: Parameters<BullmqService['addJob']>) => Promise<void>;
  getQueueReadiness: BullmqService['getQueueReadiness'];
  createWorker: (
    ...args: Parameters<BullmqService['createWorker']>
  ) => NoopBullmqWorker;
  onModuleDestroy: BullmqService['onModuleDestroy'];
};

type NoopBullmqWorker = {
  on: (event: string, listener: (...args: unknown[]) => void) => void;
  close: () => Promise<void>;
};

function createNoopBullmqService(): AppModuleBullmqServiceMock {
  return {
    addEmailJob: jest.fn().mockResolvedValue(undefined),
    addImportJob: jest.fn().mockResolvedValue(undefined),
    addJob: jest.fn().mockResolvedValue(undefined),
    getQueueReadiness: jest.fn().mockResolvedValue({
      name: 'settings-branding-logo-cleanup',
      status: 'ok',
      counts: { waiting: 0, active: 0, delayed: 0, failed: 0 },
    }),
    createWorker: jest.fn().mockReturnValue({
      on: jest.fn(),
      close: jest.fn().mockResolvedValue(undefined),
    }),
    onModuleDestroy: jest.fn().mockResolvedValue(undefined),
  };
}
