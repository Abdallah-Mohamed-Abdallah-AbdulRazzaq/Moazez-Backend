import { UserType } from '@prisma/client';
import { NotFoundDomainException } from '../../../common/exceptions/domain-exception';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../common/context/request-context';
import { ScopeMissingException } from '../../iam/auth/domain/auth.exceptions';
import { GetDashboardAnalyticsCatalogUseCase } from '../application/get-dashboard-analytics-catalog.use-case';
import { GetDashboardAnalyticsChartUseCase } from '../application/get-dashboard-analytics-chart.use-case';
import {
  ListDashboardAnalyticsChartsUseCase,
  normalizeDashboardAnalyticsChartsQuery,
} from '../application/list-dashboard-analytics-charts.use-case';
import {
  DASHBOARD_ANALYTICS_CHART_TYPES,
  DASHBOARD_ANALYTICS_GRANULARITIES,
  DASHBOARD_ANALYTICS_RANGES,
  DASHBOARD_ANALYTICS_SOURCES,
} from '../domain/dashboard-analytics-catalog';

describe('Dashboard analytics use cases', () => {
  it('returns the stable analytics catalog response shape', async () => {
    const useCase = new GetDashboardAnalyticsCatalogUseCase();

    const response = await withSchoolScope(() => useCase.execute());

    expect(response).toMatchObject({
      generatedAt: expect.any(String),
      catalog: {
        version: 'v1',
        sources: expect.any(Array),
        supportedChartTypes: DASHBOARD_ANALYTICS_CHART_TYPES,
        supportedRanges: DASHBOARD_ANALYTICS_RANGES,
        supportedGranularities: DASHBOARD_ANALYTICS_GRANULARITIES,
        filters: expect.any(Array),
        metrics: expect.any(Array),
        kpis: expect.any(Array),
        charts: expect.any(Array),
      },
      deferred: {
        computedSeries: 'snapshot_only',
        historicalSeries: 'deferred',
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
    expect(response.catalog.sources.map((source) => source.source)).toEqual(
      DASHBOARD_ANALYTICS_SOURCES,
    );
    expect(response.catalog.metrics.map((metric) => metric.metricKey)).toEqual(
      expect.arrayContaining([
        'admissions.open_applications',
        'students.active_students',
        'attendance.pending_sessions_today',
        'grades.pending_answer_reviews',
        'settings.login_identity_configured',
      ]),
    );
    expect(response.catalog.kpis.map((kpi) => kpi.kpiKey)).toEqual(
      expect.arrayContaining([
        'school.operational_health',
        'attendance.today_readiness',
        'communication.safety_queue',
      ]),
    );
    expect(response.catalog.charts.map((chart) => chart.chartKey)).toEqual(
      expect.arrayContaining([
        'admissions.funnel',
        'attendance.daily_trend',
        'academics.structure_readiness',
        'grades.gradebook_completion',
        'homework.grade_sync_coverage',
        'behavior.records_by_category',
        'reinforcement.reward_redemption_status',
        'settings.notification_readiness',
      ]),
    );
    expectNoInternalLeaks(response);
    expect(JSON.stringify(response.catalog.charts)).not.toContain(
      'futureDataContract',
    );
    expect(JSON.stringify(response.catalog.charts)).not.toContain('points');
  });

  it('filters analytics charts by source, type, status, and normalized limit', async () => {
    const useCase = new ListDashboardAnalyticsChartsUseCase();

    const response = await withSchoolScope(() =>
      useCase.execute({
        source: 'attendance',
        type: 'line',
        status: 'planned',
        limit: 2,
      }),
    );

    expect(response.filters).toEqual({
      source: 'attendance',
      type: 'line',
      status: 'planned',
      limit: 2,
    });
    expect(response.charts).toHaveLength(2);
    expect(
      response.charts.every(
        (chart) =>
          chart.source === 'attendance' &&
          chart.type === 'line' &&
          chart.status === 'planned',
      ),
    ).toBe(true);
    expect(response.summary).toEqual({
      total: 2,
      bySource: { attendance: 2 },
      byType: { line: 2 },
      byStatus: { planned: 2 },
    });
    expect(response.deferred.computedSeries).toBe('deferred');

    expect(
      normalizeDashboardAnalyticsChartsQuery({
        source: 'wallet',
        type: 'mini-chart',
        status: 'live',
        limit: 999,
      } as any),
    ).toEqual({
      source: undefined,
      type: undefined,
      status: undefined,
      limit: 100,
    });
    expect(
      normalizeDashboardAnalyticsChartsQuery({ limit: -10 } as any),
    ).toMatchObject({ limit: 1 });
    expectNoInternalLeaks(response);
  });

  it('returns one chart by chartKey with a future data contract only', async () => {
    const useCase = new GetDashboardAnalyticsChartUseCase();

    const response = await withSchoolScope(() =>
      useCase.execute('attendance.daily_trend'),
    );

    expect(response.chart).toMatchObject({
      chartKey: 'attendance.daily_trend',
      source: 'attendance',
      type: 'line',
      status: 'planned',
      requiredPermission: 'dashboard.analytics.view',
      endpoint: '/dashboard/analytics/charts/attendance.daily_trend',
      definitionEndpoint: '/dashboard/analytics/charts/attendance.daily_trend',
      dataEndpoint: '/dashboard/analytics/charts/attendance.daily_trend/data',
      endpointPurpose: 'definition',
      meta: {
        dataAvailability: 'definition_only',
      },
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
    });
    expect(response.deferred).toEqual({
      computedSeries: 'deferred',
      historicalSeries: 'deferred',
      drilldownData: 'deferred',
    });
    expectNoInternalLeaks(response);
  });

  it('reports snapshot-only metadata when list and detail include a computed chart', async () => {
    const listUseCase = new ListDashboardAnalyticsChartsUseCase();
    const detailUseCase = new GetDashboardAnalyticsChartUseCase();

    const listResponse = await withSchoolScope(() =>
      listUseCase.execute({
        source: 'attendance',
        status: 'available',
        limit: 10,
      }),
    );
    const detailResponse = await withSchoolScope(() =>
      detailUseCase.execute('attendance.pending_sessions'),
    );

    expect(
      listResponse.charts.some(
        (chart) => chart.meta.dataAvailability === 'computed_snapshot',
      ),
    ).toBe(true);
    expect(listResponse.deferred.computedSeries).toBe('snapshot_only');
    expect(detailResponse.chart.meta.dataAvailability).toBe(
      'computed_snapshot',
    );
    expect(detailResponse.deferred.computedSeries).toBe('snapshot_only');
  });

  it('throws not found for unknown chart keys', async () => {
    const useCase = new GetDashboardAnalyticsChartUseCase();

    await expect(
      withSchoolScope(() => useCase.execute('unknown.chart')),
    ).rejects.toBeInstanceOf(NotFoundDomainException);
  });

  it('rejects callers without an active school scope', async () => {
    const useCase = new GetDashboardAnalyticsCatalogUseCase();

    await expect(
      runWithRequestContext(createRequestContext(), async () => {
        setActor({ id: 'platform-user', userType: UserType.PLATFORM_USER });
        return useCase.execute();
      }),
    ).rejects.toBeInstanceOf(ScopeMissingException);
  });
});

async function withSchoolScope<T>(fn: () => T | Promise<T>): Promise<T> {
  return runWithRequestContext(createRequestContext(), async () => {
    setActor({ id: 'user-1', userType: UserType.SCHOOL_USER });
    setActiveMembership({
      membershipId: 'membership-1',
      organizationId: 'org-1',
      schoolId: 'school-1',
      roleId: 'role-1',
      permissions: ['dashboard.analytics.view'],
    });

    return fn();
  });
}

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
