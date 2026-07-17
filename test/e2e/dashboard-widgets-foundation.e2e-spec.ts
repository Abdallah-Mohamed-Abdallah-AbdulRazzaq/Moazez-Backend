import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AcademicCalendarEventScopeType,
  AcademicCalendarEventType,
  AttendanceMode,
  AttendanceScopeType,
  AttendanceSessionStatus,
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
const PASSWORD = 'DashboardWidgets123!';

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

describe('DASHBOARD-WIDGETS-1A foundation (e2e)', () => {
  const suffix = randomUUID().split('-')[0];
  const marker = `widgets1a-${suffix}`;

  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let demoSchoolId = '';
  let demoOrganizationId = '';
  let widgetsPermissionId = '';
  let deniedPrincipal: CreatedPrincipal;
  let previewOnlyPrincipal: CreatedPrincipal;
  let calendarEventId = '';
  let dashboardTodoId = '';
  let attendanceSessionId = '';

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

    widgetsPermissionId = await ensureWidgetsPermission();
    await ensureDemoAdminHasWidgetsPermission();
    deniedPrincipal = await createPrincipal({
      label: 'denied',
      organizationId: demoOrganizationId,
      schoolId: demoSchoolId,
      permissionIds: [],
    });
    previewOnlyPrincipal = await createPrincipal({
      label: 'preview-only',
      organizationId: demoOrganizationId,
      schoolId: demoSchoolId,
      permissionIds: [widgetsPermissionId],
    });

    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: DEMO_ADMIN_EMAIL },
      select: { id: true },
    });
    const academicYear = await prisma.academicYear.findFirstOrThrow({
      where: { schoolId: demoSchoolId, deletedAt: null },
      orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
      select: { id: true },
    });
    const term = await prisma.term.findFirstOrThrow({
      where: {
        schoolId: demoSchoolId,
        academicYearId: academicYear.id,
        deletedAt: null,
      },
      orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
      select: { id: true },
    });
    const today = civilDate(new Date(), 'Africa/Cairo');
    const event = await prisma.academicCalendarEvent.create({
      data: {
        schoolId: demoSchoolId,
        academicYearId: academicYear.id,
        termId: term.id,
        title: `${marker} calendar event`,
        type: AcademicCalendarEventType.ACTIVITY,
        scopeType: AcademicCalendarEventScopeType.SCHOOL,
        allDay: true,
        startDate: new Date(`${today}T00:00:00.000Z`),
        endDate: new Date(`${today}T00:00:00.000Z`),
      },
      select: { id: true },
    });
    calendarEventId = event.id;
    const todo = await prisma.dashboardTodo.create({
      data: {
        schoolId: demoSchoolId,
        ownerUserId: admin.id,
        date: new Date(`${today}T00:00:00.000Z`),
        title: `${marker} owner todo`,
      },
      select: { id: true },
    });
    dashboardTodoId = todo.id;
    const attendanceSession = await prisma.attendanceSession.create({
      data: {
        schoolId: demoSchoolId,
        academicYearId: academicYear.id,
        termId: term.id,
        date: new Date(`${today}T00:00:00.000Z`),
        scopeType: AttendanceScopeType.SCHOOL,
        scopeKey: demoSchoolId,
        mode: AttendanceMode.DAILY,
        periodKey: `DASHBOARD-${suffix}`,
        periodLabelEn: `${marker} attendance session`,
        status: AttendanceSessionStatus.DRAFT,
      },
      select: { id: true },
    });
    attendanceSessionId = attendanceSession.id;

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

  it('registers widget routes and keeps out-of-scope dashboard routes absent', () => {
    const routes = listRegisteredRoutes();

    expect(routes).toEqual(
      expect.arrayContaining([
        'GET /api/v1/dashboard/command-center',
        'GET /api/v1/dashboard/analytics/catalog',
        'GET /api/v1/dashboard/analytics/charts',
        'GET /api/v1/dashboard/analytics/charts/:chartKey',
        'GET /api/v1/dashboard/analytics/charts/:chartKey/data',
        'GET /api/v1/dashboard/light-mode-dropdown',
        'GET /api/v1/dashboard/modules',
        'GET /api/v1/dashboard/modules/:moduleKey',
        'GET /api/v1/dashboard/widgets',
        'GET /api/v1/dashboard/widgets/:widgetKey',
        'GET /api/v1/dashboard/summary',
        'GET /api/v1/dashboard/alerts',
        'GET /api/v1/dashboard/activity-feed',
      ]),
    );
    for (const absentRoute of [
      'POST /api/v1/dashboard/alerts/:alertKey/acknowledge',
      'POST /api/v1/dashboard/alerts/:alertKey/dismiss',
      'POST /api/v1/dashboard/alerts/:alertKey/snooze',
    ]) {
      expect(routes).not.toContain(absentRoute);
    }
  });

  it('returns 401 without a token and 403 without dashboard.widgets.view', async () => {
    const deniedToken = await login(deniedPrincipal.email, PASSWORD);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/widgets`)
      .expect(401);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/widgets`)
      .set('Authorization', `Bearer ${deniedToken}`)
      .expect(403);
  });

  it('returns the widget registry for an authorized school admin', async () => {
    const adminToken = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/widgets`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body).toMatchObject({
      generatedAt: expect.any(String),
      widgets: expect.any(Array),
      summary: {
        total: 19,
        byType: expect.any(Object),
        bySource: expect.any(Object),
      },
      filters: {
        source: null,
        type: null,
        limit: 20,
      },
      deferred: {
        customLayouts: 'deferred',
        widgetPreferences: 'deferred',
        analyticsCharts: 'available',
        weatherWidgets: 'deferred',
        todoWidgets: 'available',
        analyticsStandalone: 'available',
        todosStandalone: 'persisted',
        calendarTodoComposition: 'available',
        plannerCalendar: 'available',
        crossModulePlannerItems: 'available',
      },
    });
    expect(
      response.body.widgets.map(
        (widget: { widgetKey: string }) => widget.widgetKey,
      ),
    ).toEqual([
      'students.active',
      'admissions.open_applications',
      'attendance.pending_today',
      'attendance.absences_today',
      'homework.waiting_review',
      'grades.pending_review',
      'behavior.pending_review',
      'reinforcement.pending_reviews',
      'communication.moderation_queue',
      'settings.email_connection',
      'settings.login_identity',
      'activity.recent',
      'students.enrollment_growth',
      'attendance.daily_trend',
      'communication.message_volume',
      'academics.teacher_allocation_coverage',
      'grades.gradebook_completion',
      'todos.today',
      'calendar.today',
    ]);
    expect(response.body.widgets[0]).toMatchObject({
      widgetKey: expect.any(String),
      type: expect.any(String),
      source: expect.any(String),
      title: expect.any(String),
      iconKey: expect.any(String),
      tone: expect.any(String),
      data: expect.any(Object),
      meta: {
        freshness: 'live',
        analytics: null,
      },
    });
    expectNoInternalLeaks(response.body);
  });

  it('supports source, type, and limit query controls', async () => {
    const adminToken = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/widgets`)
      .query({ source: 'attendance', type: 'risk-card', limit: '1' })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body.filters).toEqual({
      source: 'attendance',
      type: 'risk-card',
      limit: 1,
    });
    expect(response.body.widgets).toHaveLength(1);
    expect(response.body.widgets[0]).toMatchObject({
      widgetKey: 'attendance.absences_today',
      source: 'attendance',
      type: 'risk-card',
    });
    expectNoInternalLeaks(response.body);

    for (const [query, keys] of [
      [{ source: 'todos' }, ['todos.today']],
      [{ source: 'calendar' }, ['calendar.today']],
      [
        { type: 'mini-chart-card' },
        [
          'students.enrollment_growth',
          'attendance.daily_trend',
          'communication.message_volume',
        ],
      ],
      [
        { type: 'progress-card' },
        [
          'academics.teacher_allocation_coverage',
          'grades.gradebook_completion',
        ],
      ],
      [{ type: 'todo-card' }, ['todos.today']],
      [{ type: 'calendar-card' }, ['calendar.today']],
    ] as const) {
      const filtered = await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/dashboard/widgets`)
        .query(query)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(
        filtered.body.widgets.map(
          (widget: { widgetKey: string }) => widget.widgetKey,
        ),
      ).toEqual(keys);
      expectNoInternalLeaks(filtered.body);
    }
  });

  it('returns one known widget and 404 for an unknown widget', async () => {
    const adminToken = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const knownResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/widgets/students.active`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(knownResponse.body).toMatchObject({
      generatedAt: expect.any(String),
      widget: {
        widgetKey: 'students.active',
        type: 'stat-card',
        source: 'students',
        data: {
          value: expect.any(Number),
          unit: null,
          label: 'Active students',
        },
      },
      deferred: {
        customLayouts: 'deferred',
        widgetPreferences: 'deferred',
        analyticsCharts: 'available',
        weatherWidgets: 'deferred',
        todoWidgets: 'available',
        analyticsStandalone: 'available',
        todosStandalone: 'persisted',
        calendarTodoComposition: 'available',
        plannerCalendar: 'available',
        crossModulePlannerItems: 'available',
      },
    });
    expectNoInternalLeaks(knownResponse.body);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/widgets/unknown.widget`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
  });

  it('returns safe composed detail for all seven new widgets', async () => {
    const adminToken = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);
    const analyticsKeys = new Set([
      'students.enrollment_growth',
      'attendance.daily_trend',
      'communication.message_volume',
      'academics.teacher_allocation_coverage',
      'grades.gradebook_completion',
    ]);

    for (const widgetKey of [
      ...analyticsKeys,
      'todos.today',
      'calendar.today',
    ]) {
      const response = await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/dashboard/widgets/${widgetKey}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(response.body.widget.widgetKey).toBe(widgetKey);

      if (analyticsKeys.has(widgetKey)) {
        expect(response.body.widget.meta.analytics).toMatchObject({
          chartKey: widgetKey,
          definitionEndpoint: `${GLOBAL_PREFIX}/dashboard/analytics/charts/${widgetKey}`,
          dataEndpoint: `${GLOBAL_PREFIX}/dashboard/analytics/charts/${widgetKey}/data`,
          defaultRange: '30d',
          defaultGranularity: 'day',
        });
      } else {
        expect(response.body.widget.meta.analytics).toBeNull();
      }
      expectNoInternalLeaks(response.body);
    }

    const calendar = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/widgets/calendar.today`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(calendar.body.widget.data).toMatchObject({
      sourceMode: 'academic_calendar_cross_module_and_todos',
      eventDates: [expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)],
      events: [
        expect.objectContaining({
          source: 'academic_calendar',
          title: `${marker} calendar event`,
        }),
        expect.objectContaining({
          source: 'attendance_session',
          title: `${marker} attendance session`,
          eventType: 'attendance',
        }),
        expect.objectContaining({
          source: 'todo',
          title: `${marker} owner todo`,
        }),
      ],
      summary: {
        total: 3,
        academicCalendar: 1,
        crossModule: 1,
        attendanceSessions: 1,
        todos: 1,
      },
    });
    expectNoInternalLeaks(calendar.body);
  });

  it('keeps Todo source output free of Calendar events and allows fixed Widget preview permission only', async () => {
    const adminToken = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);
    const todos = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/widgets`)
      .query({ source: 'todos' })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(JSON.stringify(todos.body)).toContain(`${marker} owner todo`);
    expect(JSON.stringify(todos.body)).not.toContain(
      `${marker} calendar event`,
    );

    const previewToken = await login(previewOnlyPrincipal.email, PASSWORD);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/widgets/calendar.today`)
      .set('Authorization', `Bearer ${previewToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/calendar/events`)
      .set('Authorization', `Bearer ${previewToken}`)
      .expect(403);
    for (const path of [
      '/attendance/roll-call/sessions',
      '/admissions/tests',
      '/admissions/interviews',
      '/homework/assignments',
      '/grades/assessments',
    ]) {
      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}${path}`)
        .set('Authorization', `Bearer ${previewToken}`)
        .expect(403);
    }
  });

  it('validates widget query parameters', async () => {
    const adminToken = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/widgets`)
      .query({ source: 'wallet' })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/widgets`)
      .query({ type: 'unsupported-card' })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/widgets`)
      .query({ limit: '51' })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);
  });

  it('keeps the existing dashboard routes working', async () => {
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
      .expect(200)
      .expect((response) => {
        expect(response.body).toHaveProperty('quickStats');
        expectNoInternalLeaks(response.body);
      });
  });

  async function ensureWidgetsPermission(): Promise<string> {
    const permission = await prisma.permission.upsert({
      where: { code: 'dashboard.widgets.view' },
      update: {
        module: 'dashboard',
        resource: 'widgets',
        action: 'view',
        description: 'View read-only dashboard widgets registry',
      },
      create: {
        code: 'dashboard.widgets.view',
        module: 'dashboard',
        resource: 'widgets',
        action: 'view',
        description: 'View read-only dashboard widgets registry',
      },
      select: { id: true },
    });

    return permission.id;
  }

  async function ensureDemoAdminHasWidgetsPermission(): Promise<void> {
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
      data: [{ roleId: membership.roleId, permissionId: widgetsPermissionId }],
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
        name: `Dashboard Widgets ${input.label} role`,
        description: `Dashboard widgets ${input.label} role`,
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
    if (attendanceSessionId) {
      await prisma.attendanceSession.deleteMany({
        where: { id: attendanceSessionId },
      });
    }
    if (dashboardTodoId) {
      await prisma.dashboardTodo.deleteMany({ where: { id: dashboardTodoId } });
    }
    if (calendarEventId) {
      await prisma.academicCalendarEvent.deleteMany({
        where: { id: calendarEventId },
      });
    }
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
    'resourceId',
    'bucket',
    'objectKey',
  ]) {
    expect(serialized).not.toContain(forbidden);
  }
}

function civilDate(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const byType = new Map(parts.map((part) => [part.type, part.value]));
  return `${byType.get('year')}-${byType.get('month')}-${byType.get('day')}`;
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
