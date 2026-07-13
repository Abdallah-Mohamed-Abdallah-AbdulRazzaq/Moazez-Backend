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
const PASSWORD = 'DashboardAnalytics123!';

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

describe('DASHBOARD-ANALYTICS-1A catalog foundation (e2e)', () => {
  const suffix = randomUUID().split('-')[0];
  const marker = `analytics1a-${suffix}`;

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

  it('registers analytics routes and keeps out-of-scope routes absent', () => {
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
        'GET /api/v1/dashboard/modules',
        'GET /api/v1/dashboard/modules/:moduleKey',
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
      'GET /api/v1/dashboard/realtime',
    ]) {
      expect(routes).not.toContain(absentRoute);
    }
  });

  it('returns 401 without a token and 403 without dashboard.analytics.view', async () => {
    const deniedToken = await login(deniedPrincipal.email, PASSWORD);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/analytics/catalog`)
      .expect(401);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/analytics/catalog`)
      .set('Authorization', `Bearer ${deniedToken}`)
      .expect(403);
  });

  it('returns the analytics catalog for an authorized school admin', async () => {
    const adminToken = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/analytics/catalog`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body).toMatchObject({
      generatedAt: expect.any(String),
      catalog: {
        version: 'v1',
        sources: expect.any(Array),
        supportedChartTypes: [
          'line',
          'bar',
          'stacked-bar',
          'area',
          'donut',
          'pie',
          'funnel',
          'heatmap',
          'radial-progress',
          'table',
          'timeline',
        ],
        supportedRanges: [
          '7d',
          '30d',
          '90d',
          'term',
          'academic_year',
          'custom',
        ],
        supportedGranularities: ['day', 'week', 'month'],
        filters: expect.any(Array),
        metrics: expect.any(Array),
        kpis: expect.any(Array),
        charts: expect.any(Array),
      },
      deferred: {
        computedSeries: 'available',
        historicalSeries: 'available',
        drilldownData: 'deferred',
        savedReports: 'deferred',
        customDashboards: 'deferred',
        exports: 'deferred',
        realtime: 'deferred',
      },
      meta: {
        source: 'dashboard_analytics_catalog',
        dataFreshness: 'catalog',
        freshness: {
          dataMode: 'static_catalog',
          cacheStatus: 'not_used',
          realtimeStatus: 'not_used',
        },
      },
    });
    expect(
      response.body.catalog.sources.map(
        (source: { source: string }) => source.source,
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
    expect(
      response.body.catalog.charts.map(
        (chart: { chartKey: string }) => chart.chartKey,
      ),
    ).toEqual(
      expect.arrayContaining([
        'admissions.funnel',
        'attendance.daily_trend',
        'academics.structure_readiness',
        'grades.gradebook_completion',
        'homework.grade_sync_coverage',
        'behavior.positive_negative_trend',
        'behavior.pending_review',
        'behavior.records_by_category',
        'reinforcement.xp_activity_trend',
        'reinforcement.task_completion',
        'reinforcement.reward_redemption_status',
        'communication.message_volume',
        'communication.announcement_status',
        'communication.moderation_queue',
        'settings.notification_readiness',
      ]),
    );
    expect(
      response.body.catalog.charts.filter(
        (chart: { meta: { dataAvailability: string } }) =>
          chart.meta.dataAvailability !== 'definition_only',
      ),
    ).toHaveLength(33);
    expect(
      response.body.catalog.charts.filter(
        (chart: { meta: { dataAvailability: string } }) =>
          chart.meta.dataAvailability === 'definition_only',
      ),
    ).toHaveLength(4);
    expect(
      response.body.catalog.charts
        .filter(
          (chart: { meta: { dataAvailability: string } }) =>
            chart.meta.dataAvailability === 'definition_only',
        )
        .map((chart: { chartKey: string }) => chart.chartKey),
    ).toEqual([
      'admissions.funnel',
      'academics.structure_readiness',
      'academics.subject_allocation_coverage',
      'settings.notification_readiness',
    ]);
    expectNoInternalLeaks(response.body);
    expect(JSON.stringify(response.body.catalog.charts)).not.toContain(
      'points',
    );
  });

  it('returns chart definitions and supports source/type/status/limit filters', async () => {
    const adminToken = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/analytics/charts`)
      .query({
        source: 'attendance',
        type: 'line',
        status: 'available',
        limit: '2',
      })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body).toMatchObject({
      generatedAt: expect.any(String),
      charts: expect.any(Array),
      summary: {
        total: 2,
        bySource: { attendance: 2 },
        byType: { line: 2 },
        byStatus: { available: 2 },
      },
      filters: {
        source: 'attendance',
        type: 'line',
        status: 'available',
        limit: 2,
      },
      deferred: {
        computedSeries: 'available',
        historicalSeries: 'available',
        drilldownData: 'deferred',
      },
    });
    expect(response.body.charts).toHaveLength(2);
    expect(
      response.body.charts.every(
        (chart: { source: string; type: string; status: string }) =>
          chart.source === 'attendance' &&
          chart.type === 'line' &&
          chart.status === 'available',
      ),
    ).toBe(true);
    expectNoInternalLeaks(response.body);
  });

  it('returns one known chart and 404 for an unknown chart', async () => {
    const adminToken = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const knownResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/analytics/charts/attendance.daily_trend`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(knownResponse.body).toMatchObject({
      generatedAt: expect.any(String),
      chart: {
        chartKey: 'attendance.daily_trend',
        source: 'attendance',
        type: 'line',
        status: 'available',
        requiredPermission: 'dashboard.analytics.view',
        endpoint: '/dashboard/analytics/charts/attendance.daily_trend',
        definitionEndpoint:
          '/dashboard/analytics/charts/attendance.daily_trend',
        dataEndpoint: '/dashboard/analytics/charts/attendance.daily_trend/data',
        endpointPurpose: 'definition',
        futureDataContract: {
          series: [
            {
              key: 'present',
              label: 'Present',
              points: [
                {
                  x: 'YYYY-MM-DD',
                  y: 0,
                  metadata: {
                    drilldown: {
                      source: 'attendance',
                      filters: {},
                    },
                  },
                },
              ],
            },
            {
              key: 'absent',
              label: 'Absent',
              points: expect.any(Array),
            },
            {
              key: 'late',
              label: 'Late',
              points: expect.any(Array),
            },
          ],
        },
        meta: {
          dataAvailability: 'computed_series',
        },
      },
      deferred: {
        computedSeries: 'available',
        historicalSeries: 'available',
        drilldownData: 'deferred',
      },
    });
    expectNoInternalLeaks(knownResponse.body);

    const academicsResponse = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/dashboard/analytics/charts/academics.teacher_allocation_coverage`,
      )
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(academicsResponse.body.chart).toMatchObject({
      chartKey: 'academics.teacher_allocation_coverage',
      status: 'available',
      series: [{ key: 'allocated' }, { key: 'missing' }],
      filters: [
        'range',
        'granularity',
        'academicYearId',
        'termId',
        'gradeId',
        'sectionId',
        'classroomId',
      ],
      meta: { dataAvailability: 'computed_category' },
      queryCapabilities: {
        timeFilterMode: 'compatibility_defaults',
        supportedRanges: ['30d'],
        supportedGranularities: ['day'],
        supportedHierarchyFilters: [
          'academicYearId',
          'termId',
          'gradeId',
          'sectionId',
          'classroomId',
        ],
      },
    });
    expectNoInternalLeaks(academicsResponse.body);

    const gradebookResponse = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/dashboard/analytics/charts/grades.gradebook_completion`,
      )
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(gradebookResponse.body.chart).toMatchObject({
      status: 'available',
      series: [{ key: 'complete' }, { key: 'missing' }],
      meta: { dataAvailability: 'computed_category' },
      queryCapabilities: {
        timeFilterMode: 'compatibility_defaults',
        requiredHierarchyFilters: ['academicYearId', 'termId'],
        supportedHierarchyFilters: [
          'academicYearId',
          'termId',
          'gradeId',
          'sectionId',
          'classroomId',
        ],
      },
    });
    expectNoInternalLeaks(gradebookResponse.body);

    const homeworkTrendResponse = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/dashboard/analytics/charts/homework.submission_review_trend`,
      )
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(homeworkTrendResponse.body.chart).toMatchObject({
      status: 'available',
      series: [{ key: 'submitted' }, { key: 'reviewed' }],
      filters: expect.arrayContaining(['range', 'granularity']),
      meta: { dataAvailability: 'computed_series' },
      queryCapabilities: {
        timeFilterMode: 'historical',
        historicalSeriesCapable: true,
        granularityApplicable: true,
        requiredHierarchyFilters: [],
      },
    });
    expectNoInternalLeaks(homeworkTrendResponse.body);

    const behaviorReinforcementDefinitions = [
      [
        'behavior.positive_negative_trend',
        ['positive', 'negative'],
        'computed_series',
        'historical',
      ],
      [
        'behavior.pending_review',
        ['pending_review'],
        'computed_snapshot',
        'snapshot_compatibility',
      ],
      [
        'behavior.records_by_category',
        ['records'],
        'computed_category',
        'range_only',
      ],
      [
        'reinforcement.xp_activity_trend',
        ['xp'],
        'computed_series',
        'historical',
      ],
      [
        'reinforcement.task_completion',
        ['completed', 'pending', 'overdue'],
        'computed_category',
        'compatibility_defaults',
      ],
      [
        'reinforcement.reward_redemption_status',
        ['requested', 'approved', 'fulfilled'],
        'computed_category',
        'range_only',
      ],
    ] as const;
    for (const [
      chartKey,
      seriesKeys,
      dataAvailability,
      timeFilterMode,
    ] of behaviorReinforcementDefinitions) {
      const chartResponse = await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/dashboard/analytics/charts/${chartKey}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(chartResponse.body.chart).toMatchObject({
        status: 'available',
        meta: { dataAvailability },
        queryCapabilities: {
          timeFilterMode,
          supportedHierarchyFilters: [
            'academicYearId',
            'termId',
            'gradeId',
            'sectionId',
            'classroomId',
          ],
        },
      });
      expect(
        chartResponse.body.chart.series.map(
          (series: { key: string }) => series.key,
        ),
      ).toEqual(seriesKeys);
      expectNoInternalLeaks(chartResponse.body);
    }

    const messageVolumeResponse = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/dashboard/analytics/charts/communication.message_volume`,
      )
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(messageVolumeResponse.body.chart).toMatchObject({
      status: 'available',
      series: [{ key: 'messages' }],
      meta: { dataAvailability: 'computed_series' },
      queryCapabilities: {
        timeFilterMode: 'historical',
        supportedRanges: [
          '7d',
          '30d',
          '90d',
          'term',
          'academic_year',
          'custom',
        ],
        supportedGranularities: ['day', 'week', 'month'],
        supportedHierarchyFilters: [
          'academicYearId',
          'termId',
          'gradeId',
          'sectionId',
          'classroomId',
        ],
      },
    });
    expectNoInternalLeaks(messageVolumeResponse.body);

    const announcementStatusResponse = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/dashboard/analytics/charts/communication.announcement_status`,
      )
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(announcementStatusResponse.body.chart).toMatchObject({
      status: 'available',
      filters: ['range', 'granularity'],
      series: [
        { key: 'draft' },
        { key: 'scheduled' },
        { key: 'published' },
        { key: 'archived' },
        { key: 'cancelled' },
      ],
      meta: { dataAvailability: 'computed_category' },
      queryCapabilities: {
        timeFilterMode: 'compatibility_defaults',
        supportedRanges: ['30d'],
        supportedGranularities: ['day'],
        supportedHierarchyFilters: [],
      },
    });
    expectNoInternalLeaks(announcementStatusResponse.body);

    const statusDistributionResponse = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/dashboard/analytics/charts/attendance.status_distribution`,
      )
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(statusDistributionResponse.body.chart).toMatchObject({
      chartKey: 'attendance.status_distribution',
      type: 'stacked-bar',
      status: 'available',
      queryCapabilities: {
        timeFilterMode: 'historical',
        snapshotOnly: false,
        historicalSeriesCapable: true,
        categoryTableFunnelCapable: true,
        definitionOnly: false,
        timeFiltersApplicable: true,
        granularityApplicable: true,
      },
      meta: {
        dataAvailability: 'computed_series',
      },
    });
    expectNoInternalLeaks(statusDistributionResponse.body);

    const applicationStatusResponse = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/dashboard/analytics/charts/admissions.applications_by_status`,
      )
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(applicationStatusResponse.body.chart).toMatchObject({
      status: 'available',
      filters: ['range', 'granularity', 'academicYearId', 'gradeId'],
      series: [
        { key: 'documents_pending' },
        { key: 'submitted' },
        { key: 'under_review' },
        { key: 'accepted' },
        { key: 'rejected' },
        { key: 'waitlisted' },
      ],
      meta: { dataAvailability: 'computed_category' },
      queryCapabilities: {
        timeFilterMode: 'compatibility_defaults',
        timeFiltersApplicable: false,
        granularityApplicable: false,
        supportedRanges: ['30d'],
        supportedGranularities: ['day'],
        supportedHierarchyFilters: ['academicYearId', 'gradeId'],
      },
    });

    const funnelResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/analytics/charts/admissions.funnel`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(funnelResponse.body.chart).toMatchObject({
      status: 'planned',
      meta: { dataAvailability: 'definition_only' },
      queryCapabilities: {
        timeFilterMode: 'historical',
        timeFiltersApplicable: true,
        granularityApplicable: true,
      },
    });

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/analytics/charts/unknown.chart`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
  });

  it('validates analytics chart query parameters', async () => {
    const adminToken = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/analytics/charts`)
      .query({ source: 'platform' })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/analytics/charts`)
      .query({ type: 'scatter' })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/analytics/charts`)
      .query({ status: 'live' })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/analytics/charts`)
      .query({ limit: '101' })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);
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
      .expect(200)
      .expect((response) => {
        expect(response.body).toHaveProperty('quickStats');
        expectNoInternalLeaks(response.body);
      });

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/widgets`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body).toHaveProperty('widgets');
        expectNoInternalLeaks(response.body);
      });
  });

  async function ensureDashboardPermissions(): Promise<Record<string, string>> {
    const definitions = [
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
        name: `Dashboard Analytics ${input.label} role`,
        description: `Dashboard analytics ${input.label} role`,
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
