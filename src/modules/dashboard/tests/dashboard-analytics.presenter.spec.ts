import {
  DASHBOARD_ANALYTICS_CATALOG,
  DASHBOARD_ANALYTICS_CHART_TYPES,
  DASHBOARD_ANALYTICS_GRANULARITIES,
  DASHBOARD_ANALYTICS_RANGES,
  DASHBOARD_ANALYTICS_SOURCES,
} from '../domain/dashboard-analytics-catalog';
import {
  presentDashboardAnalyticsCatalog,
  presentDashboardAnalyticsChart,
  presentDashboardAnalyticsCharts,
} from '../presenters/dashboard-analytics.presenter';

describe('Dashboard analytics presenter', () => {
  it('returns a stable catalog response shape with required catalog dimensions', () => {
    const response = presentDashboardAnalyticsCatalog({
      generatedAt: new Date('2026-07-09T12:00:00.000Z'),
      catalog: DASHBOARD_ANALYTICS_CATALOG,
    });

    expect(response).toMatchObject({
      generatedAt: '2026-07-09T12:00:00.000Z',
      catalog: {
        version: 'v1',
        supportedChartTypes: DASHBOARD_ANALYTICS_CHART_TYPES,
        supportedRanges: DASHBOARD_ANALYTICS_RANGES,
        supportedGranularities: DASHBOARD_ANALYTICS_GRANULARITIES,
      },
      deferred: {
        computedSeries: 'deferred',
        drilldownData: 'deferred',
        savedReports: 'deferred',
        customDashboards: 'deferred',
        exports: 'deferred',
        realtime: 'deferred',
      },
      meta: {
        source: 'dashboard_analytics_catalog',
        dataFreshness: 'catalog',
      },
    });
    expect(response.catalog.sources.map((source) => source.source)).toEqual(
      DASHBOARD_ANALYTICS_SOURCES,
    );
    expect(response.catalog.filters.map((filter) => filter.key)).toEqual([
      'range',
      'granularity',
      'dateFrom',
      'dateTo',
      'academicYearId',
      'termId',
      'gradeId',
      'sectionId',
      'classroomId',
      'source',
      'type',
      'status',
    ]);
    expect(response.catalog.metrics.map((metric) => metric.metricKey)).toEqual(
      expect.arrayContaining([
        'admissions.open_applications',
        'admissions.submitted_applications',
        'admissions.accepted_applications',
        'students.active_students',
        'students.active_enrollments',
        'attendance.pending_sessions_today',
        'attendance.absent_entries_today',
        'attendance.late_entries_today',
        'grades.pending_submissions',
        'grades.pending_answer_reviews',
        'homework.submissions_waiting_review',
        'behavior.pending_review_records',
        'reinforcement.pending_reviews',
        'communication.pending_moderation_reports',
        'settings.email_connection_active',
        'settings.login_identity_configured',
      ]),
    );
    expect(response.catalog.kpis.map((kpi) => kpi.kpiKey)).toEqual(
      expect.arrayContaining([
        'school.operational_health',
        'admissions.pending_work',
        'students.enrollment_health',
        'academics.readiness',
        'attendance.today_readiness',
        'grades.review_backlog',
        'homework.review_backlog',
        'behavior.review_backlog',
        'reinforcement.review_backlog',
        'communication.safety_queue',
        'settings.configuration_readiness',
      ]),
    );
    expect(response.catalog.charts.map((chart) => chart.chartKey)).toEqual(
      expect.arrayContaining(requiredChartKeys()),
    );
    expectNoInternalLeaks(response);
  });

  it('returns filtered charts with summary counts based on returned charts', () => {
    const charts = DASHBOARD_ANALYTICS_CATALOG.charts.filter(
      (chart) => chart.source === 'attendance' && chart.type === 'line',
    );

    const response = presentDashboardAnalyticsCharts({
      generatedAt: new Date('2026-07-09T12:00:00.000Z'),
      charts,
      filters: {
        source: 'attendance',
        type: 'line',
        status: 'planned',
        limit: 50,
      },
    });

    expect(response).toMatchObject({
      generatedAt: '2026-07-09T12:00:00.000Z',
      filters: {
        source: 'attendance',
        type: 'line',
        status: 'planned',
        limit: 50,
      },
      deferred: {
        computedSeries: 'deferred',
        drilldownData: 'deferred',
      },
    });
    expect(response.summary).toEqual({
      total: charts.length,
      bySource: { attendance: charts.length },
      byType: { line: charts.length },
      byStatus: { planned: charts.length },
    });
    expect(
      response.charts.every(
        (chart) =>
          chart.source === 'attendance' &&
          chart.type === 'line' &&
          chart.requiredPermission === 'dashboard.analytics.view' &&
          chart.meta.dataAvailability === 'definition_only',
      ),
    ).toBe(true);
    expect(JSON.stringify(response.charts)).not.toContain('points');
    expect(JSON.stringify(response.charts)).not.toContain('computedSeriesData');
    expectNoInternalLeaks(response);
  });

  it('returns chart detail with a future data contract and no tenant fields', () => {
    const chart = DASHBOARD_ANALYTICS_CATALOG.charts.find(
      (candidate) => candidate.chartKey === 'attendance.daily_trend',
    );
    expect(chart).toBeDefined();

    const response = presentDashboardAnalyticsChart({
      generatedAt: new Date('2026-07-09T12:00:00.000Z'),
      chart: chart!,
    });

    expect(response).toMatchObject({
      generatedAt: '2026-07-09T12:00:00.000Z',
      chart: {
        chartKey: 'attendance.daily_trend',
        source: 'attendance',
        type: 'line',
        status: 'planned',
        defaultRange: '30d',
        supportedRanges: DASHBOARD_ANALYTICS_RANGES,
        supportedGranularities: DASHBOARD_ANALYTICS_GRANULARITIES,
        filters: [
          'range',
          'granularity',
          'dateFrom',
          'dateTo',
          'academicYearId',
          'termId',
          'gradeId',
          'sectionId',
          'classroomId',
        ],
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
        emptyState: {
          reason: 'not_implemented',
          message: 'Chart data will be implemented in a future analytics pack.',
        },
        meta: {
          dataAvailability: 'definition_only',
        },
      },
      deferred: {
        computedSeries: 'deferred',
        drilldownData: 'deferred',
      },
    });
    expectNoInternalLeaks(response);
  });

  it('keeps all catalog statuses definition-only or future-pack states', () => {
    const response = presentDashboardAnalyticsCatalog({
      generatedAt: new Date('2026-07-09T12:00:00.000Z'),
      catalog: DASHBOARD_ANALYTICS_CATALOG,
    });

    expect(
      response.catalog.sources.every((source) =>
        ['available', 'planned', 'deferred'].includes(source.status),
      ),
    ).toBe(true);
    expect(
      response.catalog.metrics.every((metric) =>
        ['available', 'planned', 'deferred'].includes(metric.status),
      ),
    ).toBe(true);
    expect(
      response.catalog.kpis.every((kpi) =>
        ['available', 'planned', 'deferred'].includes(kpi.status),
      ),
    ).toBe(true);
    expect(
      response.catalog.charts.every(
        (chart) =>
          ['available', 'planned', 'deferred'].includes(chart.status) &&
          chart.meta.dataAvailability === 'definition_only',
      ),
    ).toBe(true);
  });
});

function requiredChartKeys(): string[] {
  return [
    'admissions.funnel',
    'admissions.applications_by_status',
    'admissions.applications_over_time',
    'students.enrollment_growth',
    'students.withdrawal_trend',
    'students.guardian_coverage',
    'attendance.daily_trend',
    'attendance.status_distribution',
    'attendance.absence_rate',
    'attendance.late_rate',
    'attendance.pending_sessions',
    'attendance.excuse_status',
    'academics.structure_readiness',
    'academics.subject_allocation_coverage',
    'academics.teacher_allocation_coverage',
    'academics.timetable_publication_status',
    'academics.curriculum_activation',
    'academics.lesson_plan_activation',
    'grades.assessment_status_distribution',
    'grades.pending_submission_reviews',
    'grades.pending_answer_reviews',
    'grades.gradebook_completion',
    'homework.assignment_status_distribution',
    'homework.submission_review_trend',
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
    'settings.email_connection_readiness',
    'settings.login_identity_readiness',
    'settings.notification_readiness',
  ];
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
