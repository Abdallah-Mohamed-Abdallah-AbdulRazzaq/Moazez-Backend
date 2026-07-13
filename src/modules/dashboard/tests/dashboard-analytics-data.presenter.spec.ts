import {
  DASHBOARD_ANALYTICS_CATALOG,
  findDashboardAnalyticsChartDefinition,
} from '../domain/dashboard-analytics-catalog';
import { DashboardAlertSignals } from '../infrastructure/dashboard-alerts.repository';
import { DashboardSummarySnapshot } from '../infrastructure/dashboard-summary.repository';
import { presentDashboardAnalyticsChartData } from '../presenters/dashboard-analytics-data.presenter';
import { DashboardAnalyticsQueryContext } from '../domain/dashboard-analytics-query';
import { dashboardAnalyticsCategoryPoint } from '../domain/dashboard-analytics-coordinate';

describe('Dashboard analytics data presenter', () => {
  it('returns a stable computed snapshot response for an available chart', () => {
    const chart = findDashboardAnalyticsChartDefinition(
      'attendance.pending_sessions',
    );
    expect(chart).toBeDefined();

    const response = presentDashboardAnalyticsChartData({
      queryContext: defaultQueryContext(),
      chart: chart!,
      summary: summarySnapshot({ pendingSessionsToday: 3 }),
      alertSignals: alertSignals(),
    });

    expect(response).toMatchObject({
      generatedAt: '2026-07-09T12:00:00.000Z',
      chartKey: 'attendance.pending_sessions',
      source: 'attendance',
      title: 'Pending attendance sessions',
      type: 'bar',
      status: 'available',
      range: '30d',
      granularity: 'day',
      filters: defaultFilters(),
      data: {
        series: [
          {
            key: 'pending',
            label: 'Pending',
            points: [
              {
                x: 'snapshot',
                y: 3,
                coordinate: { kind: 'snapshot' },
              },
            ],
          },
        ],
        totals: { pending: 3 },
        summary: {
          value: 3,
          label: 'Pending attendance sessions',
        },
        empty: false,
      },
      emptyState: null,
      meta: {
        source: 'dashboard_analytics_data_pack',
        pack: 'operational_snapshot_v1',
        dataAvailability: 'computed_snapshot',
        computation: 'dashboard_summary_snapshot',
        query: {
          effectiveTimezone: 'UTC',
          requestedFilters: [],
          appliedFilters: [],
          notApplicableFilters: ['range', 'granularity'],
        },
        deferred: {
          historicalSeries: 'deferred',
          drilldown: 'deferred',
          exports: 'deferred',
          realtime: 'deferred',
        },
      },
    });
    expectNoInternalLeaks(response);
    expect(JSON.stringify(response.data.series)).not.toContain('YYYY-MM-DD');
  });

  it('maps the first operational snapshot pack from summary and readiness data', () => {
    const summary = summarySnapshot({
      pendingSubmissions: 4,
      pendingAnswerReviews: 5,
      pendingModerationReports: 6,
    });
    const signals = alertSignals({
      missingActiveEmailConnection: 0,
      missingLoginIdentity: 1,
    });

    expect(
      presentFor('grades.pending_submission_reviews', summary, signals).data,
    ).toMatchObject({
      totals: { pendingSubmissions: 4 },
      summary: { value: 4 },
      empty: false,
    });
    expect(
      presentFor('grades.pending_answer_reviews', summary, signals).data,
    ).toMatchObject({
      totals: { pendingAnswerReviews: 5 },
      summary: { value: 5 },
      empty: false,
    });
    expect(
      presentFor('communication.moderation_queue', summary, signals).data,
    ).toMatchObject({
      totals: { pendingModerationReports: 6 },
      summary: { value: 6 },
      empty: false,
    });
    expect(
      presentFor('settings.email_connection_readiness', summary, signals).data,
    ).toMatchObject({
      totals: { ready: 1, missing: 0 },
      summary: { value: 100 },
      empty: false,
    });
    expect(
      presentFor('settings.login_identity_readiness', summary, signals).data,
    ).toMatchObject({
      totals: { ready: 0, missing: 1 },
      summary: { value: 0 },
      empty: false,
    });
  });

  it('returns no_data only for empty available count snapshots', () => {
    const response = presentFor(
      'grades.pending_submission_reviews',
      summarySnapshot({ pendingSubmissions: 0 }),
      alertSignals(),
    );

    expect(response).toMatchObject({
      status: 'available',
      data: {
        series: [
          {
            points: [{ x: 'snapshot', y: 0 }],
          },
        ],
        totals: { pendingSubmissions: 0 },
        summary: { value: 0 },
        empty: true,
      },
      emptyState: {
        reason: 'no_data',
        message: 'No pending grade submissions found for this school.',
      },
      meta: {
        dataAvailability: 'computed_snapshot',
      },
    });
    expectNoInternalLeaks(response);
  });

  it('returns a safe not_implemented envelope for known unsupported charts', () => {
    const chart = findDashboardAnalyticsChartDefinition('admissions.funnel');
    expect(chart).toBeDefined();

    const response = presentDashboardAnalyticsChartData({
      queryContext: defaultQueryContext(),
      chart: chart!,
    });

    expect(response).toMatchObject({
      chartKey: 'admissions.funnel',
      status: 'planned',
      data: {
        series: [],
        totals: {},
        summary: null,
        empty: true,
      },
      emptyState: {
        reason: 'not_implemented',
        message:
          'Chart data for this definition will be implemented in a future analytics pack.',
      },
      meta: {
        source: 'dashboard_analytics_data_pack',
        pack: null,
        dataAvailability: 'definition_only',
        deferred: {
          computedSeries: 'deferred',
          drilldown: 'deferred',
          exports: 'deferred',
          realtime: 'deferred',
        },
      },
    });
    expect(response.data.series).toHaveLength(0);
    expectNoInternalLeaks(response);
  });

  it('presents Grades/Homework pack metadata without internal identifiers', () => {
    const chart = findDashboardAnalyticsChartDefinition(
      'grades.assessment_status_distribution',
    )!;
    const response = presentDashboardAnalyticsChartData({
      queryContext: {
        ...defaultQueryContext(),
        hierarchy: {
          academicYearId: 'year-1',
          termId: 'term-1',
          gradeId: null,
          sectionId: null,
          classroomId: null,
        },
        filtersApplied: ['academicYearId', 'termId'],
        filtersNotApplicable: ['range', 'granularity'],
      },
      chart,
      gradesHomeworkData: {
        series: [
          {
            key: 'draft',
            label: 'Draft',
            points: [dashboardAnalyticsCategoryPoint('draft', 'Draft', 2)],
          },
        ],
        totals: { draft: 2, published: 0, approved: 0, locked: 0 },
        summary: { value: 2, label: 'Current assessments' },
        empty: false,
      },
    });

    expect(response.meta).toMatchObject({
      pack: 'grades_homework_v1',
      dataAvailability: 'computed_category',
      computation: 'grades_current_assessment_status_distribution',
      query: {
        appliedFilters: ['academicYearId', 'termId'],
        notApplicableFilters: ['range', 'granularity'],
      },
      deferred: { historicalSeries: 'deferred' },
    });
    expectNoInternalLeaks(response);
  });

  it('presents computed Attendance series with the attendance pack and no historical deferral', () => {
    const chart = findDashboardAnalyticsChartDefinition(
      'attendance.daily_trend',
    )!;
    const response = presentDashboardAnalyticsChartData({
      queryContext: {
        ...defaultQueryContext(),
        filtersApplied: ['range', 'granularity'],
        filtersNotApplicable: [],
      },
      chart,
      attendanceData: {
        series: [
          {
            key: 'present',
            label: 'Present',
            points: [
              {
                x: '2026-07-09' as any,
                y: 2,
                coordinate: { kind: 'civil_date', date: '2026-07-09' },
              },
            ],
          },
        ],
        totals: { present: 2, absent: 0, late: 0 },
        summary: { value: 2, label: 'Attendance observations' },
        empty: false,
      },
    });

    expect(response).toMatchObject({
      chartKey: 'attendance.daily_trend',
      status: 'available',
      data: { empty: false },
      emptyState: null,
      meta: {
        pack: 'attendance_v1',
        dataAvailability: 'computed_series',
        computation: 'attendance_observation_daily_trend',
        freshness: {
          dataMode: 'request_time_snapshot',
          cacheStatus: 'not_used',
          realtimeStatus: 'not_used',
        },
        deferred: {
          drilldown: 'deferred',
          exports: 'deferred',
          realtime: 'deferred',
        },
      },
    });
    expect(response.meta.deferred).not.toHaveProperty('historicalSeries');
    expectNoInternalLeaks(response);
  });

  it('presents computed Admissions and Students data with exact pack, computation, freshness, and query metadata', () => {
    const chart = findDashboardAnalyticsChartDefinition(
      'students.guardian_coverage',
    )!;
    const response = presentDashboardAnalyticsChartData({
      queryContext: {
        ...defaultQueryContext(),
        explicitlySuppliedKeys: ['academicYearId'],
        hierarchy: {
          ...defaultQueryContext().hierarchy,
          academicYearId: '11111111-1111-4111-8111-111111111111',
        },
        filtersApplied: ['academicYearId'],
        filtersNotApplicable: ['range', 'granularity'],
      },
      chart,
      admissionsStudentsData: {
        series: [
          {
            key: 'covered',
            label: 'Covered',
            points: [
              {
                x: 'covered' as any,
                y: 4,
                coordinate: {
                  kind: 'category',
                  key: 'covered',
                  label: 'Covered',
                },
              },
            ],
          },
        ],
        totals: { covered: 4, missing: 0 },
        summary: { value: 4, label: 'Active students' },
        empty: false,
      },
    });

    expect(response).toMatchObject({
      chartKey: 'students.guardian_coverage',
      status: 'available',
      meta: {
        pack: 'admissions_students_v1',
        dataAvailability: 'computed_category',
        computation: 'students_current_guardian_coverage',
        freshness: {
          dataMode: 'request_time_snapshot',
          cacheStatus: 'not_used',
          realtimeStatus: 'not_used',
        },
        query: {
          requestedFilters: ['academicYearId'],
          appliedFilters: ['academicYearId'],
          notApplicableFilters: ['range', 'granularity'],
        },
        deferred: {
          historicalSeries: 'deferred',
          drilldown: 'deferred',
          exports: 'deferred',
          realtime: 'deferred',
        },
      },
    });
    expectNoInternalLeaks(response);
  });

  it('presents computed Academics category data with exact pack and computation identity', () => {
    const chart = findDashboardAnalyticsChartDefinition(
      'academics.teacher_allocation_coverage',
    )!;
    const response = presentDashboardAnalyticsChartData({
      queryContext: {
        ...defaultQueryContext(),
        explicitlySuppliedKeys: ['gradeId'],
        hierarchy: {
          ...defaultQueryContext().hierarchy,
          gradeId: '33333333-3333-4333-8333-333333333333',
        },
        filtersApplied: ['gradeId'],
        filtersNotApplicable: ['range', 'granularity'],
      },
      chart,
      academicsData: {
        series: [
          {
            key: 'allocated',
            label: 'Allocated',
            points: [
              {
                x: 'allocated' as any,
                y: 2,
                coordinate: {
                  kind: 'category',
                  key: 'allocated',
                  label: 'Allocated',
                },
              },
            ],
          },
        ],
        totals: { allocated: 2, missing: 0 },
        summary: { value: 2, label: 'Teacher allocation units' },
        empty: false,
      },
    });

    expect(response).toMatchObject({
      chartKey: 'academics.teacher_allocation_coverage',
      status: 'available',
      meta: {
        pack: 'academics_v1',
        dataAvailability: 'computed_category',
        computation: 'academics_teacher_allocation_coverage',
        freshness: {
          dataMode: 'request_time_snapshot',
          cacheStatus: 'not_used',
          realtimeStatus: 'not_used',
        },
        query: {
          requestedFilters: ['gradeId'],
          appliedFilters: ['gradeId'],
          notApplicableFilters: ['range', 'granularity'],
        },
      },
    });
    expectNoInternalLeaks(response);
  });

  it('keeps exactly the implemented pack chart definitions available', () => {
    const availableChartKeys = DASHBOARD_ANALYTICS_CATALOG.charts
      .filter((chart) => chart.status === 'available')
      .map((chart) => chart.chartKey);

    expect(availableChartKeys).toEqual([
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
      'communication.moderation_queue',
      'settings.email_connection_readiness',
      'settings.login_identity_readiness',
    ]);
    expect(
      DASHBOARD_ANALYTICS_CATALOG.charts
        .filter((chart) => !availableChartKeys.includes(chart.chartKey))
        .every(
          (chart) =>
            chart.status === 'planned' &&
            chart.meta.dataAvailability === 'definition_only',
        ),
    ).toBe(true);
  });
});

function presentFor(
  chartKey: string,
  summary: DashboardSummarySnapshot,
  signals: DashboardAlertSignals,
) {
  const chart = findDashboardAnalyticsChartDefinition(chartKey);
  expect(chart).toBeDefined();

  return presentDashboardAnalyticsChartData({
    queryContext: defaultQueryContext(),
    chart: chart!,
    summary,
    alertSignals: signals,
  });
}

function defaultFilters() {
  return {
    range: '30d' as const,
    granularity: 'day' as const,
    dateFrom: null,
    dateTo: null,
    academicYearId: null,
    termId: null,
    gradeId: null,
    sectionId: null,
    classroomId: null,
  };
}

function defaultQueryContext(): DashboardAnalyticsQueryContext {
  return {
    generatedAt: new Date('2026-07-09T12:00:00.000Z'),
    timezone: 'UTC',
    range: '30d',
    granularity: 'day',
    startInclusive: new Date('2026-06-10T00:00:00.000Z'),
    endExclusive: new Date('2026-07-10T00:00:00.000Z'),
    startCivilDate: '2026-06-10',
    endCivilDate: '2026-07-09',
    hierarchy: {
      academicYearId: null,
      termId: null,
      gradeId: null,
      sectionId: null,
      classroomId: null,
    },
    explicitlySuppliedKeys: [],
    filtersApplied: [],
    filtersNotApplicable: ['range', 'granularity'],
  };
}

function summarySnapshot(
  overrides: Partial<{
    pendingSessionsToday: number;
    pendingSubmissions: number;
    pendingAnswerReviews: number;
    pendingModerationReports: number;
  }> = {},
): DashboardSummarySnapshot {
  return {
    generatedAt: new Date('2026-07-09T12:00:00.000Z'),
    school: { name: 'School A', timezone: null, locale: null },
    academicContext: { academicYear: null, term: null },
    cards: {
      admissions: {
        totalLeads: 0,
        openApplications: 0,
        submittedApplications: 0,
        acceptedApplications: 0,
        pendingTests: 0,
        pendingInterviews: 0,
        recentDecisions: 0,
      },
      students: {
        activeStudents: 0,
        activeEnrollments: 0,
        guardians: 0,
        newEnrollmentsLast30Days: 0,
        withdrawnEnrollments: 0,
      },
      academics: {
        activeAcademicYears: 0,
        hasCurrentAcademicYear: false,
        terms: 0,
        stages: 0,
        grades: 0,
        sections: 0,
        classrooms: 0,
        subjects: 0,
        rooms: 0,
        teacherAllocations: 0,
        curricula: 0,
        lessonPlans: 0,
        timetableEntries: 0,
        publishedTimetablePublications: 0,
      },
      attendance: {
        todaySessions: 0,
        submittedSessionsToday: 0,
        pendingSessionsToday: overrides.pendingSessionsToday ?? 0,
        absentEntriesToday: 0,
        lateEntriesToday: 0,
        pendingExcuses: 0,
      },
      grades: {
        activeAssessments: 0,
        draftAssessments: 0,
        publishedAssessments: 0,
        approvedAssessments: 0,
        lockedAssessments: 0,
        gradeItems: 0,
        pendingSubmissions: overrides.pendingSubmissions ?? 0,
        pendingAnswerReviews: overrides.pendingAnswerReviews ?? 0,
      },
      homework: {
        draftAssignments: 0,
        publishedAssignments: 0,
        closedAssignments: 0,
        submissionsWaitingReview: 0,
        reviewedSubmissions: 0,
        gradeSyncLinkedAssignments: 0,
        gradeSyncPendingAssignments: 0,
      },
      behavior: {
        recentRecords: 0,
        pendingReviewRecords: 0,
        positiveRecords: 0,
        negativeRecords: 0,
      },
      reinforcement: {
        activeTasks: 0,
        pendingReviews: 0,
        completedAssignments: 0,
        recentXpLedgerEntries: 0,
        rewardsPending: 0,
      },
      communication: {
        activeAnnouncements: 0,
        recentMessages: 0,
        activeConversations: 0,
        pendingModerationReports: overrides.pendingModerationReports ?? 0,
      },
    },
  };
}

function alertSignals(
  overrides: Partial<{
    missingLoginIdentity: number;
    missingActiveEmailConnection: number;
  }> = {},
): DashboardAlertSignals {
  return {
    generatedAt: new Date('2026-07-09T12:00:00.000Z'),
    academicContext: { academicYear: null, term: null },
    admissions: {
      applicationsWaitingDecision: 0,
      testsPending: 0,
      interviewsPending: 0,
    },
    academics: {
      missingActiveAcademicYear: 1,
      missingActiveTerm: 1,
      draftTimetableEntries: 0,
      lessonPlansPendingActivation: 0,
    },
    attendance: {
      todaySessionsPendingSubmission: 0,
      todayAbsentEntries: 0,
      todayLateEntries: 0,
      pendingExcuses: 0,
    },
    grades: {
      draftAssessments: 0,
      publishedAssessmentsPendingApproval: 0,
      pendingSubmissions: 0,
      pendingAnswerReviews: 0,
    },
    homework: {
      submissionsWaitingReview: 0,
      gradedAssignmentsMissingSyncLink: 0,
      pastDueMissingSubmissions: 0,
    },
    behavior: {
      pendingReviews: 0,
      recentNegativeRecords: 0,
    },
    reinforcement: {
      pendingReviews: 0,
      overdueActiveTasks: 0,
    },
    communication: {
      pendingModerationReports: 0,
      activeAnnouncementsExpiringSoon: 0,
    },
    settings: {
      missingLoginIdentity: overrides.missingLoginIdentity ?? 1,
      missingActiveEmailConnection: overrides.missingActiveEmailConnection ?? 1,
    },
  };
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
