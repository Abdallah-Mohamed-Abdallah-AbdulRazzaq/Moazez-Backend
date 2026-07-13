import {
  DASHBOARD_ANALYTICS_CATALOG,
  DASHBOARD_ANALYTICS_CHARTS,
  DASHBOARD_ANALYTICS_CHART_TYPES,
  DASHBOARD_ANALYTICS_GRANULARITIES,
  DASHBOARD_ANALYTICS_RANGES,
  DASHBOARD_ANALYTICS_SOURCES,
  DASHBOARD_ANALYTICS_BEHAVIOR_REINFORCEMENT_PACK_CHART_KEYS,
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
        status: 'available',
        limit: 50,
      },
    });

    expect(response).toMatchObject({
      generatedAt: '2026-07-09T12:00:00.000Z',
      filters: {
        source: 'attendance',
        type: 'line',
        status: 'available',
        limit: 50,
      },
      deferred: {
        computedSeries: 'available',
        historicalSeries: 'available',
        drilldownData: 'deferred',
      },
    });
    expect(response.summary).toEqual({
      total: charts.length,
      bySource: { attendance: charts.length },
      byType: { line: charts.length },
      byStatus: { available: charts.length },
    });
    expect(
      response.charts.every(
        (chart) =>
          chart.source === 'attendance' &&
          chart.type === 'line' &&
          chart.requiredPermission === 'dashboard.analytics.view' &&
          chart.meta.dataAvailability === 'computed_series',
      ),
    ).toBe(true);
    expect(JSON.stringify(response.charts)).not.toContain('points');
    expect(JSON.stringify(response.charts)).not.toContain('computedSeriesData');
    expectNoInternalLeaks(response);
  });

  it('reports snapshot-only computed series for returned computed charts', () => {
    const chart = DASHBOARD_ANALYTICS_CHARTS.find(
      (candidate) => candidate.chartKey === 'attendance.pending_sessions',
    );
    expect(chart).toBeDefined();

    const listResponse = presentDashboardAnalyticsCharts({
      generatedAt: new Date('2026-07-09T12:00:00.000Z'),
      charts: [chart!],
      filters: { limit: 1 },
    });
    const detailResponse = presentDashboardAnalyticsChart({
      generatedAt: new Date('2026-07-09T12:00:00.000Z'),
      chart: chart!,
    });

    expect(listResponse.deferred.computedSeries).toBe('snapshot_only');
    expect(detailResponse.deferred.computedSeries).toBe('snapshot_only');
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
        status: 'available',
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
          reason: 'no_data',
          message: 'No attendance observations found for the selected range.',
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
    expectNoInternalLeaks(response);
  });

  it('marks exactly thirty-one charts as computed and leaves six definition-only', () => {
    const response = presentDashboardAnalyticsCatalog({
      generatedAt: new Date('2026-07-09T12:00:00.000Z'),
      catalog: DASHBOARD_ANALYTICS_CATALOG,
    });
    const computedSnapshotChartKeys = [
      'attendance.pending_sessions',
      'grades.pending_submission_reviews',
      'grades.pending_answer_reviews',
      'communication.moderation_queue',
      'settings.email_connection_readiness',
      'settings.login_identity_readiness',
    ];
    const attendancePackChartKeys = [
      'attendance.daily_trend',
      'attendance.status_distribution',
      'attendance.absence_rate',
      'attendance.late_rate',
      'attendance.excuse_status',
    ];
    const admissionsStudentsPackChartKeys = [
      'admissions.applications_by_status',
      'admissions.applications_over_time',
      'students.enrollment_growth',
      'students.withdrawal_trend',
      'students.guardian_coverage',
    ];
    const academicsPackChartKeys = [
      'academics.teacher_allocation_coverage',
      'academics.timetable_publication_status',
      'academics.curriculum_activation',
      'academics.lesson_plan_activation',
    ];
    const gradesHomeworkPackChartKeys = [
      'grades.assessment_status_distribution',
      'grades.gradebook_completion',
      'homework.assignment_status_distribution',
      'homework.submission_review_trend',
      'homework.grade_sync_coverage',
    ];
    const behaviorReinforcementPackChartKeys = [
      'behavior.positive_negative_trend',
      'behavior.pending_review',
      'behavior.records_by_category',
      'reinforcement.xp_activity_trend',
      'reinforcement.task_completion',
      'reinforcement.reward_redemption_status',
    ];

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
      response.catalog.charts
        .filter((chart) => computedSnapshotChartKeys.includes(chart.chartKey))
        .every(
          (chart) =>
            chart.status === 'available' &&
            chart.meta.dataAvailability === 'computed_snapshot',
        ),
    ).toBe(true);
    expect(
      response.catalog.charts
        .filter((chart) => attendancePackChartKeys.includes(chart.chartKey))
        .every(
          (chart) =>
            chart.status === 'available' &&
            ['computed_series', 'computed_category'].includes(
              chart.meta.dataAvailability,
            ),
        ),
    ).toBe(true);
    expect(
      response.catalog.charts
        .filter(
          (chart) =>
            !computedSnapshotChartKeys.includes(chart.chartKey) &&
            !attendancePackChartKeys.includes(chart.chartKey) &&
            !admissionsStudentsPackChartKeys.includes(chart.chartKey) &&
            !academicsPackChartKeys.includes(chart.chartKey) &&
            !gradesHomeworkPackChartKeys.includes(chart.chartKey) &&
            !behaviorReinforcementPackChartKeys.includes(chart.chartKey),
        )
        .every(
          (chart) =>
            chart.status === 'planned' &&
            chart.meta.dataAvailability === 'definition_only',
        ),
    ).toBe(true);
    expect(
      response.catalog.charts.filter(
        (chart) => chart.meta.dataAvailability !== 'definition_only',
      ),
    ).toHaveLength(31);
    expect(
      response.catalog.charts.filter(
        (chart) => chart.meta.dataAvailability === 'definition_only',
      ),
    ).toHaveLength(6);
  });

  it('publishes one truthful typed query capability matrix', () => {
    const response = presentDashboardAnalyticsCatalog({
      generatedAt: new Date('2026-07-09T12:00:00.000Z'),
      catalog: DASHBOARD_ANALYTICS_CATALOG,
    });
    const attendanceSnapshot = response.catalog.charts.find(
      (chart) => chart.chartKey === 'attendance.pending_sessions',
    );
    const communicationSnapshot = response.catalog.charts.find(
      (chart) => chart.chartKey === 'communication.moderation_queue',
    );
    const historicalDefinition = response.catalog.charts.find(
      (chart) => chart.chartKey === 'attendance.daily_trend',
    );
    const statusDistribution = response.catalog.charts.find(
      (chart) => chart.chartKey === 'attendance.status_distribution',
    );
    const homeworkReviewDefinition = response.catalog.charts.find(
      (chart) => chart.chartKey === 'homework.submission_review_trend',
    );
    const behaviorReviewDefinition = response.catalog.charts.find(
      (chart) => chart.chartKey === 'behavior.pending_review',
    );

    expect(attendanceSnapshot?.queryCapabilities).toEqual({
      timeFilterMode: 'snapshot_compatibility',
      snapshotOnly: true,
      historicalSeriesCapable: false,
      categoryTableFunnelCapable: false,
      definitionOnly: false,
      timeFiltersApplicable: false,
      granularityApplicable: false,
      supportedRanges: ['30d'],
      supportedGranularities: ['day'],
      supportedHierarchyFilters: [
        'academicYearId',
        'termId',
        'gradeId',
        'sectionId',
        'classroomId',
      ],
      requiredHierarchyFilters: [],
    });
    expect(
      communicationSnapshot?.queryCapabilities.supportedHierarchyFilters,
    ).toEqual([]);
    expect(historicalDefinition?.queryCapabilities).toMatchObject({
      timeFilterMode: 'historical',
      snapshotOnly: false,
      historicalSeriesCapable: true,
      definitionOnly: false,
      timeFiltersApplicable: true,
      granularityApplicable: true,
    });
    expect(statusDistribution).toMatchObject({
      meta: { dataAvailability: 'computed_series' },
      queryCapabilities: {
        timeFilterMode: 'historical',
        snapshotOnly: false,
        historicalSeriesCapable: true,
        categoryTableFunnelCapable: true,
        definitionOnly: false,
        timeFiltersApplicable: true,
        granularityApplicable: true,
      },
    });
    expect(homeworkReviewDefinition).toMatchObject({
      status: 'available',
      meta: { dataAvailability: 'computed_series' },
      queryCapabilities: {
        timeFilterMode: 'historical',
        definitionOnly: false,
        timeFiltersApplicable: true,
        granularityApplicable: true,
        supportedRanges: DASHBOARD_ANALYTICS_RANGES,
        supportedGranularities: DASHBOARD_ANALYTICS_GRANULARITIES,
      },
    });
    expect(behaviorReviewDefinition).toMatchObject({
      status: 'available',
      meta: { dataAvailability: 'computed_snapshot' },
      queryCapabilities: {
        timeFilterMode: 'snapshot_compatibility',
        definitionOnly: false,
        timeFiltersApplicable: false,
        granularityApplicable: false,
        supportedRanges: ['30d'],
        supportedGranularities: ['day'],
      },
    });

    const excuseDefinition = response.catalog.charts.find(
      (chart) => chart.chartKey === 'attendance.excuse_status',
    );
    expect(excuseDefinition?.queryCapabilities).toMatchObject({
      timeFilterMode: 'range_only',
      definitionOnly: false,
      timeFiltersApplicable: true,
      granularityApplicable: false,
      supportedGranularities: ['day'],
      supportedHierarchyFilters: ['academicYearId', 'termId'],
    });

    const currentApplicationStatus = response.catalog.charts.find(
      (chart) => chart.chartKey === 'admissions.applications_by_status',
    );
    expect(currentApplicationStatus).toMatchObject({
      status: 'available',
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

    const funnel = response.catalog.charts.find(
      (chart) => chart.chartKey === 'admissions.funnel',
    );
    expect(funnel).toMatchObject({
      status: 'planned',
      meta: { dataAvailability: 'definition_only' },
      queryCapabilities: {
        timeFilterMode: 'historical',
        timeFiltersApplicable: true,
        granularityApplicable: true,
      },
    });

    const academicsCapabilities = new Map(
      response.catalog.charts
        .filter((chart) => chart.source === 'academics')
        .map((chart) => [chart.chartKey, chart]),
    );
    for (const chartKey of [
      'academics.teacher_allocation_coverage',
      'academics.timetable_publication_status',
      'academics.curriculum_activation',
      'academics.lesson_plan_activation',
    ]) {
      expect(academicsCapabilities.get(chartKey)).toMatchObject({
        status: 'available',
        meta: { dataAvailability: 'computed_category' },
        queryCapabilities: {
          timeFilterMode: 'compatibility_defaults',
          timeFiltersApplicable: false,
          granularityApplicable: false,
          supportedRanges: ['30d'],
          supportedGranularities: ['day'],
        },
      });
    }
    expect(
      academicsCapabilities.get('academics.teacher_allocation_coverage')
        ?.queryCapabilities.supportedHierarchyFilters,
    ).toEqual([
      'academicYearId',
      'termId',
      'gradeId',
      'sectionId',
      'classroomId',
    ]);
    expect(
      academicsCapabilities.get('academics.timetable_publication_status')
        ?.queryCapabilities.supportedHierarchyFilters,
    ).toEqual(['academicYearId', 'termId']);
    expect(
      academicsCapabilities.get('academics.curriculum_activation')
        ?.queryCapabilities.supportedHierarchyFilters,
    ).toEqual(['academicYearId', 'termId', 'gradeId']);
    expect(
      academicsCapabilities.get('academics.lesson_plan_activation')
        ?.queryCapabilities.supportedHierarchyFilters,
    ).toEqual([
      'academicYearId',
      'termId',
      'gradeId',
      'sectionId',
      'classroomId',
    ]);
    expect(
      academicsCapabilities.get('academics.teacher_allocation_coverage'),
    ).toMatchObject({
      description:
        'Current required classroom-subject allocation units with and without at least one teacher allocation.',
      filters: [
        'range',
        'granularity',
        'academicYearId',
        'termId',
        'gradeId',
        'sectionId',
        'classroomId',
      ],
      series: [{ key: 'allocated' }, { key: 'missing' }],
    });
    expect(
      academicsCapabilities.get('academics.timetable_publication_status'),
    ).toMatchObject({
      description:
        'Current non-archived timetable configurations grouped by published operational state.',
      filters: ['range', 'granularity', 'academicYearId', 'termId'],
      series: [{ key: 'published' }, { key: 'draft' }],
    });
    expect(
      academicsCapabilities.get('academics.curriculum_activation'),
    ).toMatchObject({
      description:
        'Current non-archived curricula grouped by active or draft status.',
      filters: ['range', 'granularity', 'academicYearId', 'termId', 'gradeId'],
      series: [{ key: 'active' }, { key: 'draft' }],
    });
    expect(
      academicsCapabilities.get('academics.lesson_plan_activation'),
    ).toMatchObject({
      description:
        'Current non-archived lesson plans grouped by active or draft status.',
      filters: [
        'range',
        'granularity',
        'academicYearId',
        'termId',
        'gradeId',
        'sectionId',
        'classroomId',
      ],
      series: [{ key: 'active' }, { key: 'draft' }],
    });
    for (const chartKey of [
      'academics.structure_readiness',
      'academics.subject_allocation_coverage',
    ]) {
      expect(academicsCapabilities.get(chartKey)).toMatchObject({
        status: 'planned',
        meta: { dataAvailability: 'definition_only' },
        queryCapabilities: { timeFilterMode: 'historical' },
      });
    }
  });

  it('publishes the five Grades/Homework contracts and generic required hierarchy metadata', () => {
    const response = presentDashboardAnalyticsCatalog({
      generatedAt: new Date('2026-07-09T12:00:00.000Z'),
      catalog: DASHBOARD_ANALYTICS_CATALOG,
    });
    const byKey = new Map(
      response.catalog.charts.map((chart) => [chart.chartKey, chart]),
    );
    const expected = [
      [
        'grades.assessment_status_distribution',
        ['draft', 'published', 'approved', 'locked'],
        'computed_category',
      ],
      [
        'grades.gradebook_completion',
        ['complete', 'missing'],
        'computed_category',
      ],
      [
        'homework.assignment_status_distribution',
        ['draft', 'published', 'closed', 'cancelled'],
        'computed_category',
      ],
      [
        'homework.submission_review_trend',
        ['submitted', 'reviewed'],
        'computed_series',
      ],
      [
        'homework.grade_sync_coverage',
        ['linked', 'pending'],
        'computed_category',
      ],
    ] as const;

    for (const [chartKey, seriesKeys, availability] of expected) {
      const chart = byKey.get(chartKey);
      expect(chart).toMatchObject({
        status: 'available',
        meta: { dataAvailability: availability },
      });
      expect(chart?.series.map((series) => series.key)).toEqual(seriesKeys);
      expect(chart?.queryCapabilities.requiredHierarchyFilters).toEqual(
        chartKey === 'grades.gradebook_completion'
          ? ['academicYearId', 'termId']
          : [],
      );
    }
    expect(
      byKey.get('homework.submission_review_trend')?.queryCapabilities,
    ).toMatchObject({
      timeFilterMode: 'historical',
      timeFiltersApplicable: true,
      granularityApplicable: true,
    });
    for (const chartKey of [
      'grades.assessment_status_distribution',
      'grades.gradebook_completion',
      'homework.assignment_status_distribution',
      'homework.grade_sync_coverage',
    ]) {
      expect(byKey.get(chartKey)?.queryCapabilities).toMatchObject({
        timeFilterMode: 'compatibility_defaults',
        supportedRanges: ['30d'],
        supportedGranularities: ['day'],
      });
    }
  });

  it('publishes the exact six-chart Behavior/Reinforcement pack capability contracts', () => {
    const response = presentDashboardAnalyticsCatalog({
      generatedAt: new Date('2026-07-09T12:00:00.000Z'),
      catalog: DASHBOARD_ANALYTICS_CATALOG,
    });
    const byKey = new Map(
      response.catalog.charts.map((chart) => [chart.chartKey, chart]),
    );
    const expected = [
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

    expect(DASHBOARD_ANALYTICS_BEHAVIOR_REINFORCEMENT_PACK_CHART_KEYS).toEqual(
      expected.map(([chartKey]) => chartKey),
    );

    for (const [
      chartKey,
      seriesKeys,
      dataAvailability,
      timeFilterMode,
    ] of expected) {
      const chart = byKey.get(chartKey);
      expect(chart).toMatchObject({
        status: 'available',
        meta: { dataAvailability },
        queryCapabilities: {
          timeFilterMode,
          definitionOnly: false,
          supportedHierarchyFilters: [
            'academicYearId',
            'termId',
            'gradeId',
            'sectionId',
            'classroomId',
          ],
        },
      });
      expect(chart?.series.map((series) => series.key)).toEqual(seriesKeys);
    }
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
