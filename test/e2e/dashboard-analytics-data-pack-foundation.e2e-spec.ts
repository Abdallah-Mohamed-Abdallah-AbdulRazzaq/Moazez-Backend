import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AttendanceExcuseStatus,
  AttendanceExcuseType,
  AttendanceMode,
  AttendanceScopeType,
  AttendanceSessionStatus,
  AttendanceStatus,
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
const PASSWORD = 'DashboardAnalyticsData123!';

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

describe('DASHBOARD-ANALYTICS-PACKS-1A data pack foundation (e2e)', () => {
  const suffix = randomUUID().split('-')[0];
  const marker = `analytics-data-${suffix}`;

  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let demoSchoolId = '';
  let demoOrganizationId = '';
  let deniedPrincipal: CreatedPrincipal;
  let academicYearId = '';
  let termId = '';
  let gradeId = '';
  let sectionId = '';
  let otherSectionId = '';
  let classroomId = '';
  let crossSchoolId = '';
  let crossSchoolAcademicYearId = '';
  const attendanceStudentIds: string[] = [];
  const attendanceSessionIds: string[] = [];
  const attendanceExcuseIds: string[] = [];

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

    const hierarchy = await createAnalyticsHierarchyFixtures();
    academicYearId = hierarchy.academicYearId;
    termId = hierarchy.termId;
    gradeId = hierarchy.gradeId;
    sectionId = hierarchy.sectionId;
    otherSectionId = hierarchy.otherSectionId;
    classroomId = hierarchy.classroomId;
    crossSchoolId = hierarchy.crossSchoolId;
    crossSchoolAcademicYearId = hierarchy.crossSchoolAcademicYearId;
    await createAttendanceAnalyticsFixtures();

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
      await cleanupAnalyticsHierarchyFixtures();
      await cleanupE2eData();
      await prisma.$disconnect();
    }
  });

  it('registers only the analytics data route beyond the existing dashboard inventory', () => {
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
      'GET /api/v1/dashboard/exports/:exportKey',
      'POST /api/v1/dashboard/reports/:reportKey',
      'GET /api/v1/dashboard/realtime',
    ]) {
      expect(routes).not.toContain(absentRoute);
    }
  });

  it('returns 401 without a token and 403 without dashboard.analytics.view', async () => {
    const deniedToken = await login(deniedPrincipal.email, PASSWORD);

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/dashboard/analytics/charts/attendance.pending_sessions/data`,
      )
      .expect(401);

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/dashboard/analytics/charts/attendance.pending_sessions/data`,
      )
      .set('Authorization', `Bearer ${deniedToken}`)
      .expect(403);
  });

  it('returns computed snapshot data for an authorized school admin and available chart', async () => {
    const adminToken = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);
    const summaryResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/summary`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const response = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/dashboard/analytics/charts/attendance.pending_sessions/data`,
      )
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const expectedPending =
      summaryResponse.body.cards.attendance.pendingSessionsToday;
    expect(response.body).toMatchObject({
      generatedAt: expect.any(String),
      chartKey: 'attendance.pending_sessions',
      source: 'attendance',
      title: 'Pending attendance sessions',
      type: 'bar',
      status: 'available',
      range: '30d',
      granularity: 'day',
      filters: {
        range: '30d',
        granularity: 'day',
        dateFrom: null,
        dateTo: null,
        academicYearId: null,
        termId: null,
        gradeId: null,
        sectionId: null,
        classroomId: null,
      },
      data: {
        series: [
          {
            key: 'pending',
            label: 'Pending',
            points: [
              {
                x: 'snapshot',
                y: expectedPending,
                coordinate: { kind: 'snapshot' },
              },
            ],
          },
        ],
        totals: { pending: expectedPending },
        summary: {
          value: expectedPending,
          label: 'Pending attendance sessions',
        },
        empty: expectedPending === 0,
      },
      meta: {
        source: 'dashboard_analytics_data_pack',
        pack: 'operational_snapshot_v1',
        dataAvailability: 'computed_snapshot',
        computation: 'dashboard_summary_snapshot',
        query: {
          effectiveTimezone: expect.any(String),
          requestedFilters: [],
          appliedFilters: expect.arrayContaining(['academicYearId', 'termId']),
          notApplicableFilters: ['range', 'granularity'],
          resolvedWindow: {
            startInclusive: expect.any(String),
            endExclusive: expect.any(String),
            startCivilDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
            endCivilDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
          },
        },
        deferred: {
          historicalSeries: 'deferred',
          drilldown: 'deferred',
          exports: 'deferred',
          realtime: 'deferred',
        },
      },
    });
    expect(response.body).toHaveProperty('emptyState');
    expectNoInternalLeaks(response.body);
    expect(JSON.stringify(response.body.data.series)).not.toContain(
      'YYYY-MM-DD',
    );
  });

  it('applies valid same-school hierarchy filters to an existing snapshot chart', async () => {
    const adminToken = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/dashboard/analytics/charts/attendance.pending_sessions/data`,
      )
      .query({
        academicYearId,
        termId,
        gradeId,
        sectionId,
        classroomId,
      })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body).toMatchObject({
      filters: {
        academicYearId,
        termId,
        gradeId,
        sectionId,
        classroomId,
      },
      data: {
        totals: { pending: 0 },
      },
      meta: {
        query: {
          requestedFilters: [
            'academicYearId',
            'termId',
            'gradeId',
            'sectionId',
            'classroomId',
          ],
          appliedFilters: expect.arrayContaining([
            'academicYearId',
            'termId',
            'gradeId',
            'sectionId',
            'classroomId',
          ]),
          notApplicableFilters: ['range', 'granularity'],
        },
      },
    });
    expectNoInternalLeaks(response.body);
  });

  it('returns a safe not_implemented envelope for known unrelated charts', async () => {
    const adminToken = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/dashboard/analytics/charts/students.enrollment_growth/data`,
      )
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body).toMatchObject({
      generatedAt: expect.any(String),
      chartKey: 'students.enrollment_growth',
      source: 'students',
      status: 'planned',
      range: '30d',
      granularity: 'day',
      data: {
        series: [],
        totals: {},
        summary: null,
        empty: true,
      },
      emptyState: {
        reason: 'not_implemented',
      },
      meta: {
        source: 'dashboard_analytics_data_pack',
        pack: null,
        dataAvailability: 'definition_only',
      },
    });
    expectNoInternalLeaks(response.body);
  });

  it('returns day, week, and month Attendance observation buckets from submitted sessions only', async () => {
    const adminToken = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);
    const path = `${GLOBAL_PREFIX}/dashboard/analytics/charts/attendance.daily_trend/data`;

    const day = await request(app.getHttpServer())
      .get(path)
      .query({
        range: 'custom',
        granularity: 'day',
        dateFrom: '2026-07-01',
        dateTo: '2026-07-10',
      })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const week = await request(app.getHttpServer())
      .get(path)
      .query({
        range: 'custom',
        granularity: 'week',
        dateFrom: '2026-07-01',
        dateTo: '2026-07-10',
      })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const month = await request(app.getHttpServer())
      .get(path)
      .query({
        range: 'custom',
        granularity: 'month',
        dateFrom: '2026-07-01',
        dateTo: '2026-07-31',
      })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const fixed = await request(app.getHttpServer())
      .get(path)
      .query({ range: '90d', granularity: 'month' })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(day.body).toMatchObject({
      chartKey: 'attendance.daily_trend',
      status: 'available',
      data: {
        totals: { present: 3, absent: 2, late: 2 },
        summary: { value: 7, label: 'Attendance observations' },
        empty: false,
      },
      meta: {
        pack: 'attendance_v1',
        dataAvailability: 'computed_series',
        computation: 'attendance_observation_daily_trend',
      },
    });
    expect(day.body.data.series[0].points).toHaveLength(10);
    expect(
      week.body.data.series[0].points.map((point: { x: string }) => point.x),
    ).toEqual(['2026-07-01/2026-07-05', '2026-07-06/2026-07-10']);
    expect(month.body.data.series[0].points).toEqual([
      expect.objectContaining({
        x: '2026-07',
        coordinate: { kind: 'calendar_month', month: '2026-07' },
      }),
    ]);
    expect(fixed.body).toMatchObject({
      range: '90d',
      granularity: 'month',
      meta: {
        pack: 'attendance_v1',
        query: {
          appliedFilters: expect.arrayContaining(['range', 'granularity']),
        },
      },
    });
    for (const response of [day, week, month, fixed]) {
      expectNoInternalLeaks(response.body);
    }
  });

  it('returns status distribution and exact absence/late rate semantics', async () => {
    const adminToken = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);
    const query = {
      range: 'custom',
      granularity: 'day',
      dateFrom: '2026-07-01',
      dateTo: '2026-07-10',
    };
    const responses = await Promise.all(
      [
        'attendance.status_distribution',
        'attendance.absence_rate',
        'attendance.late_rate',
      ].map((chartKey) =>
        request(app.getHttpServer())
          .get(`${GLOBAL_PREFIX}/dashboard/analytics/charts/${chartKey}/data`)
          .query(query)
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200),
      ),
    );
    const [distribution, absence, late] = responses.map(
      (response) => response.body,
    );

    expect(distribution.data.totals).toEqual({
      present: 3,
      absent: 2,
      late: 2,
      excused: 1,
    });
    expect(absence.data.totals).toEqual({
      absent: 2,
      considered: 9,
      rate: 22.22,
    });
    expect(late.data.totals).toEqual({
      late: 2,
      considered: 9,
      rate: 22.22,
    });
    expect(absence.data.series[0].points[0].y).toBe(20);
    expect(late.data.series[0].points[0].y).toBe(20);
    for (const body of [distribution, absence, late]) {
      expectNoInternalLeaks(body);
    }
  });

  it('returns overlap-counted excuse categories and rejects unsupported hierarchy/granularity', async () => {
    const adminToken = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);
    const path = `${GLOBAL_PREFIX}/dashboard/analytics/charts/attendance.excuse_status/data`;
    const response = await request(app.getHttpServer())
      .get(path)
      .query({
        range: 'custom',
        granularity: 'day',
        dateFrom: '2026-07-01',
        dateTo: '2026-07-10',
        academicYearId,
        termId,
      })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body).toMatchObject({
      data: {
        totals: { pending: 1, approved: 1, rejected: 0 },
        summary: { value: 2 },
      },
      meta: {
        pack: 'attendance_v1',
        dataAvailability: 'computed_category',
        query: {
          appliedFilters: expect.arrayContaining([
            'range',
            'dateFrom',
            'dateTo',
            'academicYearId',
            'termId',
          ]),
          notApplicableFilters: ['granularity'],
        },
      },
    });
    expect(response.body.data.series[0].points[0]).toMatchObject({
      coordinate: { kind: 'category' },
    });
    expectNoInternalLeaks(response.body);

    for (const invalidQuery of [
      { gradeId },
      { sectionId },
      { classroomId },
      { granularity: 'week' },
      { granularity: 'month' },
    ]) {
      await request(app.getHttpServer())
        .get(path)
        .query(invalidQuery)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    }
  });

  it('applies the full same-school hierarchy chain and returns a no-data envelope safely', async () => {
    const adminToken = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);
    const path = `${GLOBAL_PREFIX}/dashboard/analytics/charts/attendance.daily_trend/data`;
    const filtered = await request(app.getHttpServer())
      .get(path)
      .query({
        range: 'custom',
        dateFrom: '2026-07-01',
        dateTo: '2026-07-10',
        academicYearId,
        termId,
        gradeId,
        sectionId,
        classroomId,
      })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const empty = await request(app.getHttpServer())
      .get(path)
      .query({
        range: 'custom',
        dateFrom: '2026-05-01',
        dateTo: '2026-05-07',
      })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(filtered.body.data.totals).toEqual({
      present: 3,
      absent: 2,
      late: 2,
    });
    expect(filtered.body.meta.query.appliedFilters).toEqual(
      expect.arrayContaining([
        'academicYearId',
        'termId',
        'gradeId',
        'sectionId',
        'classroomId',
      ]),
    );
    expect(empty.body).toMatchObject({
      data: { empty: true },
      emptyState: { reason: 'no_data' },
      meta: { pack: 'attendance_v1' },
    });
  });

  it('returns 404 for unknown chart keys and rejects invalid/unsupported query input', async () => {
    const adminToken = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/analytics/charts/unknown.chart/data`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/dashboard/analytics/charts/attendance.pending_sessions/data`,
      )
      .query({ range: 'wallet' })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/dashboard/analytics/charts/attendance.pending_sessions/data`,
      )
      .query({ granularity: 'minute' })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/dashboard/analytics/charts/attendance.pending_sessions/data`,
      )
      .query({ dateFrom: 'not-a-date' })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/dashboard/analytics/charts/attendance.pending_sessions/data`,
      )
      .query({ schoolId: demoSchoolId })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/dashboard/analytics/charts/attendance.pending_sessions/data`,
      )
      .query({ range: '90d' })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);
  });

  it('rejects missing, reversed, invalid, and excessive custom ranges', async () => {
    const adminToken = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);
    const path = `${GLOBAL_PREFIX}/dashboard/analytics/charts/attendance.daily_trend/data`;

    for (const query of [
      { range: 'custom', dateFrom: '2026-07-01' },
      {
        range: 'custom',
        dateFrom: '2026-07-03',
        dateTo: '2026-07-01',
      },
      {
        range: 'custom',
        dateFrom: '2026-02-30',
        dateTo: '2026-03-01',
      },
      {
        range: 'custom',
        dateFrom: '2025-01-01',
        dateTo: '2026-01-02',
      },
      {
        range: 'custom',
        granularity: 'month',
        dateFrom: '2026-07-01',
        dateTo: '2026-07-03',
      },
      {
        range: '30d',
        dateFrom: '2026-07-01',
      },
    ]) {
      await request(app.getHttpServer())
        .get(path)
        .query(query)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    }
  });

  it('rejects malformed, cross-school, and inconsistent hierarchy filters safely', async () => {
    const adminToken = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);
    const path = `${GLOBAL_PREFIX}/dashboard/analytics/charts/attendance.pending_sessions/data`;

    await request(app.getHttpServer())
      .get(path)
      .query({ gradeId: 'not-a-uuid' })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);

    const crossSchoolResponse = await request(app.getHttpServer())
      .get(path)
      .query({ academicYearId: crossSchoolAcademicYearId })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);

    const inconsistentResponse = await request(app.getHttpServer())
      .get(path)
      .query({ gradeId, sectionId: otherSectionId })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);

    for (const response of [crossSchoolResponse, inconsistentResponse]) {
      expect(response.body).toMatchObject({
        error: {
          code: 'not_found',
          message: 'Dashboard analytics hierarchy was not found',
          traceId: expect.any(String),
        },
      });
    }
    expect(JSON.stringify(crossSchoolResponse.body)).not.toContain(
      crossSchoolAcademicYearId,
    );
    expect(JSON.stringify(inconsistentResponse.body)).not.toContain(gradeId);
    expect(JSON.stringify(inconsistentResponse.body)).not.toContain(
      otherSectionId,
    );
  });

  it('rejects hierarchy filters for Communication and Settings snapshot charts', async () => {
    const adminToken = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    for (const chartKey of [
      'communication.moderation_queue',
      'settings.email_connection_readiness',
    ]) {
      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/dashboard/analytics/charts/${chartKey}/data`)
        .query({ gradeId })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    }
  });

  it('keeps analytics catalog and existing dashboard routes working', async () => {
    const adminToken = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/analytics/catalog`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.catalog.charts).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              chartKey: 'attendance.pending_sessions',
              status: 'available',
              meta: { dataAvailability: 'computed_snapshot' },
            }),
          ]),
        );
        expectNoInternalLeaks(response.body);
      });

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/analytics/charts`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/alerts`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/activity-feed`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/command-center`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/widgets`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
  });

  async function createAnalyticsHierarchyFixtures() {
    const academicYear = await prisma.academicYear.create({
      data: {
        schoolId: demoSchoolId,
        nameAr: `${marker}-year-ar`,
        nameEn: `${marker}-year-en`,
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        endDate: new Date('2026-12-31T00:00:00.000Z'),
        isActive: false,
      },
      select: { id: true },
    });
    const term = await prisma.term.create({
      data: {
        schoolId: demoSchoolId,
        academicYearId: academicYear.id,
        nameAr: `${marker}-term-ar`,
        nameEn: `${marker}-term-en`,
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        endDate: new Date('2026-12-31T00:00:00.000Z'),
        isActive: false,
      },
      select: { id: true },
    });
    const stage = await prisma.stage.create({
      data: {
        schoolId: demoSchoolId,
        nameAr: `${marker}-stage-ar`,
        nameEn: `${marker}-stage-en`,
      },
      select: { id: true },
    });
    const [grade, otherGrade] = await Promise.all([
      prisma.grade.create({
        data: {
          schoolId: demoSchoolId,
          stageId: stage.id,
          nameAr: `${marker}-grade-a-ar`,
          nameEn: `${marker}-grade-a-en`,
        },
        select: { id: true },
      }),
      prisma.grade.create({
        data: {
          schoolId: demoSchoolId,
          stageId: stage.id,
          nameAr: `${marker}-grade-b-ar`,
          nameEn: `${marker}-grade-b-en`,
        },
        select: { id: true },
      }),
    ]);
    const [section, otherSection] = await Promise.all([
      prisma.section.create({
        data: {
          schoolId: demoSchoolId,
          gradeId: grade.id,
          nameAr: `${marker}-section-a-ar`,
          nameEn: `${marker}-section-a-en`,
        },
        select: { id: true },
      }),
      prisma.section.create({
        data: {
          schoolId: demoSchoolId,
          gradeId: otherGrade.id,
          nameAr: `${marker}-section-b-ar`,
          nameEn: `${marker}-section-b-en`,
        },
        select: { id: true },
      }),
    ]);
    const classroom = await prisma.classroom.create({
      data: {
        schoolId: demoSchoolId,
        sectionId: section.id,
        nameAr: `${marker}-classroom-ar`,
        nameEn: `${marker}-classroom-en`,
      },
      select: { id: true },
    });

    const crossSchool = await prisma.school.create({
      data: {
        organizationId: demoOrganizationId,
        slug: `${marker}-cross-school`,
        name: `${marker} cross school`,
      },
      select: { id: true },
    });
    const crossAcademicYear = await prisma.academicYear.create({
      data: {
        schoolId: crossSchool.id,
        nameAr: `${marker}-cross-year-ar`,
        nameEn: `${marker}-cross-year-en`,
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        endDate: new Date('2026-12-31T00:00:00.000Z'),
      },
      select: { id: true },
    });

    return {
      academicYearId: academicYear.id,
      termId: term.id,
      gradeId: grade.id,
      otherGradeId: otherGrade.id,
      sectionId: section.id,
      otherSectionId: otherSection.id,
      classroomId: classroom.id,
      crossSchoolId: crossSchool.id,
      crossSchoolAcademicYearId: crossAcademicYear.id,
    };
  }

  async function createAttendanceAnalyticsFixtures(): Promise<void> {
    const students = await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        prisma.student.create({
          data: {
            schoolId: demoSchoolId,
            organizationId: demoOrganizationId,
            firstName: `Analytics ${index + 1}`,
            lastName: marker,
          },
          select: { id: true },
        }),
      ),
    );
    attendanceStudentIds.push(...students.map((student) => student.id));

    const sessionInput = (
      date: string,
      status: AttendanceSessionStatus,
      periodKey: string,
      deletedAt: Date | null = null,
    ) => ({
      schoolId: demoSchoolId,
      academicYearId,
      termId,
      date: new Date(`${date}T00:00:00.000Z`),
      scopeType: AttendanceScopeType.CLASSROOM,
      scopeKey: classroomId,
      gradeId,
      sectionId,
      classroomId,
      mode:
        periodKey === 'daily' ? AttendanceMode.DAILY : AttendanceMode.PERIOD,
      periodKey,
      status,
      deletedAt,
    });
    const sessions = await Promise.all([
      prisma.attendanceSession.create({
        data: sessionInput(
          '2026-07-01',
          AttendanceSessionStatus.SUBMITTED,
          'daily',
        ),
        select: { id: true },
      }),
      prisma.attendanceSession.create({
        data: sessionInput(
          '2026-07-02',
          AttendanceSessionStatus.SUBMITTED,
          'period-1',
        ),
        select: { id: true },
      }),
      prisma.attendanceSession.create({
        data: sessionInput(
          '2026-07-08',
          AttendanceSessionStatus.SUBMITTED,
          'daily',
        ),
        select: { id: true },
      }),
      prisma.attendanceSession.create({
        data: sessionInput(
          '2026-07-03',
          AttendanceSessionStatus.DRAFT,
          'daily',
        ),
        select: { id: true },
      }),
      prisma.attendanceSession.create({
        data: sessionInput(
          '2026-07-04',
          AttendanceSessionStatus.SUBMITTED,
          'daily',
          new Date('2026-07-05T00:00:00.000Z'),
        ),
        select: { id: true },
      }),
    ]);
    attendanceSessionIds.push(...sessions.map((session) => session.id));

    const statuses = [
      AttendanceStatus.PRESENT,
      AttendanceStatus.ABSENT,
      AttendanceStatus.LATE,
      AttendanceStatus.EXCUSED,
      AttendanceStatus.EARLY_LEAVE,
      AttendanceStatus.UNMARKED,
    ];
    await prisma.attendanceEntry.createMany({
      data: [
        ...statuses.map((status, index) => ({
          schoolId: demoSchoolId,
          sessionId: sessions[0].id,
          studentId: students[index].id,
          status,
        })),
        {
          schoolId: demoSchoolId,
          sessionId: sessions[1].id,
          studentId: students[0].id,
          status: AttendanceStatus.PRESENT,
        },
        {
          schoolId: demoSchoolId,
          sessionId: sessions[1].id,
          studentId: students[1].id,
          status: AttendanceStatus.PRESENT,
        },
        {
          schoolId: demoSchoolId,
          sessionId: sessions[1].id,
          studentId: students[2].id,
          status: AttendanceStatus.LATE,
        },
        {
          schoolId: demoSchoolId,
          sessionId: sessions[2].id,
          studentId: students[0].id,
          status: AttendanceStatus.ABSENT,
        },
        {
          schoolId: demoSchoolId,
          sessionId: sessions[3].id,
          studentId: students[0].id,
          status: AttendanceStatus.ABSENT,
        },
        {
          schoolId: demoSchoolId,
          sessionId: sessions[4].id,
          studentId: students[0].id,
          status: AttendanceStatus.ABSENT,
        },
      ],
    });

    const excuses = await Promise.all([
      prisma.attendanceExcuseRequest.create({
        data: {
          schoolId: demoSchoolId,
          academicYearId,
          termId,
          studentId: students[0].id,
          type: AttendanceExcuseType.ABSENCE,
          status: AttendanceExcuseStatus.PENDING,
          dateFrom: new Date('2026-06-30T00:00:00.000Z'),
          dateTo: new Date('2026-07-02T00:00:00.000Z'),
        },
        select: { id: true },
      }),
      prisma.attendanceExcuseRequest.create({
        data: {
          schoolId: demoSchoolId,
          academicYearId,
          termId,
          studentId: students[1].id,
          type: AttendanceExcuseType.LATE,
          status: AttendanceExcuseStatus.APPROVED,
          dateFrom: new Date('2026-07-08T00:00:00.000Z'),
          dateTo: new Date('2026-07-12T00:00:00.000Z'),
        },
        select: { id: true },
      }),
      prisma.attendanceExcuseRequest.create({
        data: {
          schoolId: demoSchoolId,
          academicYearId,
          termId,
          studentId: students[2].id,
          type: AttendanceExcuseType.ABSENCE,
          status: AttendanceExcuseStatus.REJECTED,
          dateFrom: new Date('2026-06-20T00:00:00.000Z'),
          dateTo: new Date('2026-06-30T00:00:00.000Z'),
        },
        select: { id: true },
      }),
      prisma.attendanceExcuseRequest.create({
        data: {
          schoolId: demoSchoolId,
          academicYearId,
          termId,
          studentId: students[3].id,
          type: AttendanceExcuseType.ABSENCE,
          status: AttendanceExcuseStatus.PENDING,
          dateFrom: new Date('2026-07-01T00:00:00.000Z'),
          dateTo: new Date('2026-07-01T00:00:00.000Z'),
          deletedAt: new Date('2026-07-02T00:00:00.000Z'),
        },
        select: { id: true },
      }),
    ]);
    attendanceExcuseIds.push(...excuses.map((excuse) => excuse.id));
  }

  async function cleanupAnalyticsHierarchyFixtures(): Promise<void> {
    if (attendanceExcuseIds.length > 0) {
      await prisma.attendanceExcuseRequest.deleteMany({
        where: { id: { in: attendanceExcuseIds } },
      });
    }
    if (attendanceSessionIds.length > 0) {
      await prisma.attendanceEntry.deleteMany({
        where: { sessionId: { in: attendanceSessionIds } },
      });
      await prisma.attendanceSession.deleteMany({
        where: { id: { in: attendanceSessionIds } },
      });
    }
    if (attendanceStudentIds.length > 0) {
      await prisma.student.deleteMany({
        where: { id: { in: attendanceStudentIds } },
      });
    }
    await prisma.classroom.deleteMany({
      where: {
        schoolId: { in: [demoSchoolId, crossSchoolId] },
        nameEn: { startsWith: marker },
      },
    });
    await prisma.section.deleteMany({
      where: {
        schoolId: { in: [demoSchoolId, crossSchoolId] },
        nameEn: { startsWith: marker },
      },
    });
    await prisma.grade.deleteMany({
      where: {
        schoolId: { in: [demoSchoolId, crossSchoolId] },
        nameEn: { startsWith: marker },
      },
    });
    await prisma.stage.deleteMany({
      where: {
        schoolId: { in: [demoSchoolId, crossSchoolId] },
        nameEn: { startsWith: marker },
      },
    });
    await prisma.term.deleteMany({
      where: {
        schoolId: { in: [demoSchoolId, crossSchoolId] },
        nameEn: { startsWith: marker },
      },
    });
    await prisma.academicYear.deleteMany({
      where: {
        schoolId: { in: [demoSchoolId, crossSchoolId] },
        nameEn: { startsWith: marker },
      },
    });
    if (crossSchoolId) {
      await prisma.school.deleteMany({ where: { id: crossSchoolId } });
    }
  }

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
        name: `Dashboard Analytics Data ${input.label} role`,
        description: `Dashboard analytics data ${input.label} role`,
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
