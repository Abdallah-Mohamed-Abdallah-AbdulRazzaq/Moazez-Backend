import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AcademicCalendarEventScopeType,
  AcademicCalendarEventType,
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
const PASSWORD = 'DashboardLightMode123!';
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

type LightModePlannerEventBody = {
  title: string;
  source: string;
  eventType: string;
  date: string;
  endDate: string;
  startTime: string | null;
  endTime: string | null;
  allDay: boolean;
};

type LightModeResponseBody = {
  generatedAt: string;
  location: { timezone: string };
  forecast: unknown[];
  planner: {
    timezone: string;
    date: string;
    eventDates: string[];
    events: LightModePlannerEventBody[];
    todos: unknown[];
  };
  meta: Record<string, unknown>;
};

jest.setTimeout(90000);

describe('DASHBOARD-LIGHT-MODE-DROPDOWN-1A foundation (e2e)', () => {
  const suffix = randomUUID().split('-')[0];
  const marker = `light-mode-${suffix}`;

  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let organizationId = '';
  let schoolId = '';
  let adminPrincipal: CreatedPrincipal;
  let deniedPrincipal: CreatedPrincipal;
  let previewOnlyPrincipal: CreatedPrincipal;
  let academicYearId = '';
  let termId = '';

  const createdUserIds: string[] = [];
  const createdRoleIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const organization = await prisma.organization.create({
      data: {
        slug: `${marker}-org`,
        name: `Dashboard LightMode Org ${suffix}`,
      },
      select: { id: true },
    });
    organizationId = organization.id;

    const school = await prisma.school.create({
      data: {
        organizationId,
        slug: `${marker}-school`,
        name: `Dashboard LightMode School ${suffix}`,
      },
      select: { id: true },
    });
    schoolId = school.id;

    await prisma.schoolProfile.create({
      data: {
        schoolId,
        schoolName: `Dashboard LightMode School ${suffix}`,
        timezone: 'Africa/Cairo',
        formattedAddress: 'New Cairo, Cairo Governorate, Egypt',
        city: 'Cairo',
        country: 'Egypt',
        latitude: '30.044400',
        longitude: '31.235700',
      },
    });

    const permissionIds = await ensureDashboardPermissions();
    adminPrincipal = await createPrincipal({
      label: 'admin',
      organizationId,
      schoolId,
      permissionIds: Object.values(permissionIds),
    });
    deniedPrincipal = await createPrincipal({
      label: 'denied',
      organizationId,
      schoolId,
      permissionIds: [],
    });
    previewOnlyPrincipal = await createPrincipal({
      label: 'preview-only',
      organizationId,
      schoolId,
      permissionIds: [permissionIds.lightModeDropdown],
    });

    const academicYear = await prisma.academicYear.create({
      data: {
        schoolId,
        nameAr: `${marker}-year-ar`,
        nameEn: `${marker}-year-en`,
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        endDate: new Date('2026-12-31T00:00:00.000Z'),
      },
      select: { id: true },
    });
    academicYearId = academicYear.id;
    const term = await prisma.term.create({
      data: {
        schoolId,
        academicYearId,
        nameAr: `${marker}-term-ar`,
        nameEn: `${marker}-term-en`,
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        endDate: new Date('2026-12-31T00:00:00.000Z'),
      },
      select: { id: true },
    });
    termId = term.id;
    await prisma.academicCalendarEvent.createMany({
      data: [
        calendarEvent(
          'All-day holiday',
          AcademicCalendarEventType.HOLIDAY,
          true,
          '2026-07-09T00:00:00.000Z',
          '2026-07-09T00:00:00.000Z',
        ),
        calendarEvent(
          'Next-day all-day excluded',
          AcademicCalendarEventType.OTHER,
          true,
          '2026-07-10T00:00:00.000Z',
          '2026-07-10T00:00:00.000Z',
        ),
        calendarEvent(
          'Timed exam',
          AcademicCalendarEventType.EXAM,
          false,
          '2026-07-09T08:30:00.000Z',
          '2026-07-09T10:00:00.000Z',
        ),
        calendarEvent(
          'Multi-day activity',
          AcademicCalendarEventType.ACTIVITY,
          true,
          '2026-07-08T00:00:00.000Z',
          '2026-07-10T00:00:00.000Z',
        ),
        calendarEvent(
          'Next-day excluded',
          AcademicCalendarEventType.OTHER,
          false,
          '2026-07-09T22:00:00.000Z',
          '2026-07-09T23:00:00.000Z',
        ),
        calendarEvent(
          'Non-overlapping',
          AcademicCalendarEventType.OTHER,
          true,
          '2026-07-11T00:00:00.000Z',
          '2026-07-11T00:00:00.000Z',
        ),
        {
          ...calendarEvent(
            'Soft-deleted',
            AcademicCalendarEventType.OTHER,
            true,
            '2026-07-09T00:00:00.000Z',
            '2026-07-09T00:00:00.000Z',
          ),
          deletedAt: new Date('2026-07-01T00:00:00.000Z'),
        },
      ],
    });
    await prisma.dashboardTodo.create({
      data: {
        schoolId,
        ownerUserId: adminPrincipal.userId,
        date: new Date('2026-07-09T00:00:00.000Z'),
        title: `${marker} selected-day todo`,
      },
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

  it('registers only the LightModeDropdown read route and keeps out-of-scope routes absent', () => {
    const routes = listRegisteredRoutes();

    expect(routes).toEqual(
      expect.arrayContaining([
        'GET /api/v1/dashboard/summary',
        'GET /api/v1/dashboard/alerts',
        'GET /api/v1/dashboard/activity-feed',
        'GET /api/v1/dashboard/command-center',
        'GET /api/v1/dashboard/light-mode-dropdown',
        'GET /api/v1/dashboard/widgets',
        'GET /api/v1/dashboard/widgets/:widgetKey',
        'GET /api/v1/dashboard/analytics/catalog',
        'GET /api/v1/dashboard/analytics/charts',
        'GET /api/v1/dashboard/analytics/charts/:chartKey',
        'GET /api/v1/dashboard/analytics/charts/:chartKey/data',
        'GET /api/v1/dashboard/modules',
        'GET /api/v1/dashboard/modules/:moduleKey',
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

  it('returns 401 without a token and 403 without dashboard.light_mode_dropdown.view', async () => {
    const deniedToken = await login(deniedPrincipal.email, PASSWORD);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/light-mode-dropdown`)
      .expect(401);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/light-mode-dropdown`)
      .set('Authorization', `Bearer ${deniedToken}`)
      .expect(403);
  });

  it('returns the stable LightModeDropdown contract for an authorized school admin', async () => {
    const adminToken = await login(adminPrincipal.email, PASSWORD);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/light-mode-dropdown`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const body = response.body as LightModeResponseBody;

    expect(body).toMatchObject({
      location: {
        label: 'New Cairo, Cairo Governorate, Egypt',
        city: 'Cairo',
        country: 'Egypt',
        timezone: 'Africa/Cairo',
        source: 'school_profile',
      },
      weather: {
        status: 'provider_not_configured',
        provider: null,
        current: {
          temperature: null,
          lowTemperature: null,
          feelsLike: null,
          condition: 'Weather unavailable',
          conditionCode: 'provider_not_configured',
          iconKey: 'cloud',
          observedAt: null,
        },
        emptyState: {
          reason: 'provider_not_configured',
        },
      },
      hints: [],
      highlights: [],
      cities: [],
      forecast: [],
      planner: {
        timezone: 'Africa/Cairo',
        eventDates: [],
        events: [],
        todos: [],
      },
      meta: {
        source: 'dashboard_light_mode_dropdown',
        version: 'v1',
        locale: 'en',
        units: 'metric',
        weatherStatus: 'provider_not_configured',
        plannerStatus: 'calendar_available',
        todosStatus: 'persisted',
        deferred: {
          weatherProvider: 'deferred',
          weatherCache: 'deferred',
          todoPersistence: 'persisted',
          plannerCalendar: 'available',
          crossModulePlannerItems: 'deferred',
          realtime: 'deferred',
        },
      },
    });
    expect(typeof body.generatedAt).toBe('string');
    expect(body.planner.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(body.forecast).toEqual([]);
    expect(body.planner.todos).toEqual([]);
    expect(body.planner.eventDates.every(isDateOnly)).toBe(true);
    expectIconKeysAreSemanticStrings(body);
    expectNoInternalLeaks(body);
    expect(JSON.stringify(body)).not.toContain('React');
    expect(JSON.stringify(body)).not.toContain('jsx');
    expect(JSON.stringify(body)).not.toMatch(/[<](svg|div|span)/i);
  });

  it('composes overlapping Calendar events and owner Todos for the selected civil day', async () => {
    const token = await login(adminPrincipal.email, PASSWORD);
    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/light-mode-dropdown`)
      .query({ date: '2026-07-09', timezone: 'Europe/Berlin' })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const body = response.body as LightModeResponseBody;

    expect(body.planner.eventDates).toEqual(['2026-07-09']);
    expect(body.planner.events.map((event) => event.title)).toEqual([
      'Multi-day activity',
      'All-day holiday',
      'Timed exam',
    ]);
    expect(body.planner.events).toEqual([
      expect.objectContaining({
        source: 'academic_calendar',
        eventType: 'activity',
        date: '2026-07-08',
        endDate: '2026-07-10',
        startTime: null,
        endTime: null,
      }),
      expect.objectContaining({ eventType: 'holiday', allDay: true }),
      expect.objectContaining({
        eventType: 'exam',
        date: '2026-07-09',
        endDate: '2026-07-09',
        startTime: '10:30',
        endTime: '12:00',
        allDay: false,
      }),
    ]);
    expect(JSON.stringify(body)).not.toMatch(
      /Next-day excluded|Non-overlapping|Soft-deleted/,
    );
    expect(body.planner.todos).toEqual([
      expect.objectContaining({ title: `${marker} selected-day todo` }),
    ]);
    expect(body.meta).toMatchObject({
      plannerStatus: 'calendar_available',
      componentFreshness: { plannerEvents: 'persisted_school_data' },
      deferred: { plannerCalendar: 'available' },
    });
    expectNoInternalLeaks(body);
  });

  it('uses logical all-day dates in a negative UTC offset without admitting the next day', async () => {
    const token = await login(adminPrincipal.email, PASSWORD);
    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/light-mode-dropdown`)
      .query({ date: '2026-07-09', timezone: 'America/Los_Angeles' })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const body = response.body as LightModeResponseBody;

    const titles = body.planner.events.map((event) => event.title);
    expect(titles).toContain('All-day holiday');
    expect(titles).not.toContain('Next-day all-day excluded');
    expect(
      body.planner.events.find((event) => event.title === 'All-day holiday'),
    ).toMatchObject({
      date: '2026-07-09',
      endDate: '2026-07-09',
      startTime: null,
      endTime: null,
      allDay: true,
    });
    expect(body.planner).toMatchObject({
      timezone: 'America/Los_Angeles',
      date: '2026-07-09',
      eventDates: ['2026-07-09'],
    });
  });

  it('allows the fixed Dashboard preview permission without granting standalone Academics Calendar access', async () => {
    const token = await login(previewOnlyPrincipal.email, PASSWORD);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/light-mode-dropdown`)
      .query({ date: '2026-07-09' })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/calendar/events`)
      .query({ from: '2026-07-09', to: '2026-07-09' })
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('supports allowed query controls and rejects invalid or override-shaped input', async () => {
    const adminToken = await login(adminPrincipal.email, PASSWORD);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/light-mode-dropdown`)
      .query({
        locale: 'ar',
        timezone: 'Europe/Berlin',
        units: 'imperial',
        date: '2026-07-09',
      })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const body = response.body as LightModeResponseBody;

    expect(body.location.timezone).toBe('Europe/Berlin');
    expect(body.planner).toMatchObject({
      timezone: 'Europe/Berlin',
      date: '2026-07-09',
    });
    expect(Array.isArray(body.planner.events)).toBe(true);
    expect(Array.isArray(body.planner.todos)).toBe(true);
    expect(body.meta).toMatchObject({
      locale: 'ar',
      units: 'imperial',
    });
    expectNoInternalLeaks(body);

    for (const query of [
      { locale: 'fr' },
      { timezone: 'Invalid/Timezone' },
      { units: 'kelvin' },
      { date: 'not-a-date' },
      { schoolId },
    ]) {
      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/dashboard/light-mode-dropdown`)
        .query(query)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    }
  });

  it('keeps existing dashboard routes working', async () => {
    const adminToken = await login(adminPrincipal.email, PASSWORD);

    for (const path of [
      '/dashboard/summary',
      '/dashboard/alerts',
      '/dashboard/activity-feed',
      '/dashboard/command-center',
      '/dashboard/widgets',
      '/dashboard/analytics/catalog',
      '/dashboard/modules',
    ]) {
      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}${path}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((response) => expectNoInternalLeaks(response.body));
    }
  });

  async function ensureDashboardPermissions(): Promise<Record<string, string>> {
    const definitions = [
      {
        key: 'lightModeDropdown',
        code: 'dashboard.light_mode_dropdown.view',
        resource: 'light_mode_dropdown',
        description: 'View read-only Dashboard LightModeDropdown contract',
      },
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
        name: `Dashboard LightMode ${input.label} role`,
        description: `Dashboard LightMode ${input.label} role`,
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

    return (response.body as { accessToken: string }).accessToken;
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
    if (schoolId) {
      await prisma.academicCalendarEvent.deleteMany({ where: { schoolId } });
      await prisma.dashboardTodo.deleteMany({ where: { schoolId } });
    }
    if (academicYearId) {
      await prisma.term.deleteMany({ where: { id: termId } });
      await prisma.academicYear.deleteMany({ where: { id: academicYearId } });
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
    if (schoolId) {
      await prisma.schoolProfile.deleteMany({ where: { schoolId } });
      await prisma.school.deleteMany({ where: { id: schoolId } });
    }
    if (organizationId) {
      await prisma.organization.deleteMany({ where: { id: organizationId } });
    }
  }

  function calendarEvent(
    title: string,
    type: AcademicCalendarEventType,
    allDay: boolean,
    startDate: string,
    endDate: string,
  ) {
    return {
      schoolId,
      academicYearId,
      termId,
      title,
      type,
      scopeType: AcademicCalendarEventScopeType.SCHOOL,
      allDay,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
    };
  }
});

function isDateOnly(value: unknown): boolean {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function expectIconKeysAreSemanticStrings(body: unknown): void {
  const iconKeys: unknown[] = [];
  const allowedIconKeys = [
    'sun',
    'cloud',
    'cloud-rain',
    'cloud-snow',
    'wind',
    'droplets',
    'sunrise',
    'sunset',
    'eye',
    'gauge',
    'thermometer',
    'calendar',
    'clock',
    'check-circle',
  ];

  function visit(value: unknown): void {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== 'object') return;

    for (const [key, child] of Object.entries(value)) {
      if (key === 'iconKey') {
        iconKeys.push(child);
      }
      visit(child);
    }
  }

  visit(body);
  expect(iconKeys.length).toBeGreaterThan(0);
  expect(
    iconKeys.every(
      (iconKey) =>
        typeof iconKey === 'string' && allowedIconKeys.includes(iconKey),
    ),
  ).toBe(true);
}

function expectNoInternalLeaks(body: unknown): void {
  const serialized = JSON.stringify(body);
  for (const forbidden of [
    'schoolId',
    'organizationId',
    'membershipId',
    'roleId',
    'ownerUserId',
    'userId',
    'passwordHash',
    'deletedAt',
    'actorId',
    'resourceId',
    'bucket',
    'objectKey',
    'latitude',
    'longitude',
    'providerSecret',
    'smtp',
  ]) {
    expect(serialized).not.toContain(forbidden);
  }
  expect(serialized).not.toMatch(/(^|[^A-Za-z0-9])raw([^A-Za-z0-9]|$)/i);
  expect(serialized).not.toMatch(/[<](svg|div|span)/i);
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
