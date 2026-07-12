import { buildDashboardAlerts } from '../application/list-dashboard-alerts.use-case';
import { findDashboardAnalyticsChartDefinition } from '../domain/dashboard-analytics-catalog';
import { findDashboardModulePageDefinition } from '../domain/dashboard-module-pages';
import { DashboardAlertSignals } from '../infrastructure/dashboard-alerts.repository';
import { DashboardSummarySnapshot } from '../infrastructure/dashboard-summary.repository';
import {
  presentDashboardModulePage,
  presentDashboardModules,
} from '../presenters/dashboard-modules.presenter';

describe('Dashboard modules presenter', () => {
  it('returns the stable modules list response shape', () => {
    const response = presentDashboardModules({
      generatedAt: new Date('2026-07-09T12:00:00.000Z'),
      alerts: buildDashboardAlerts(alertSignals()),
      filters: { limit: 20 },
    });

    expect(response).toMatchObject({
      generatedAt: '2026-07-09T12:00:00.000Z',
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
    expect(response.modules.map((modulePage) => modulePage.moduleKey)).toEqual([
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
    expectNoInternalLeaks(response);
  });

  it('filters module list by status/source and summarizes returned modules only', () => {
    const response = presentDashboardModules({
      generatedAt: new Date('2026-07-09T12:00:00.000Z'),
      alerts: buildDashboardAlerts(alertSignals()),
      filters: {
        status: 'available',
        source: 'attendance',
        limit: 20,
      },
    });

    expect(response.modules.map((modulePage) => modulePage.moduleKey)).toEqual([
      'attendance',
    ]);
    expect(response.summary).toEqual({
      total: 1,
      byStatus: { available: 1 },
      bySource: { attendance: 1 },
    });
    expect(response.filters).toEqual({
      status: 'available',
      source: 'attendance',
      limit: 20,
    });
  });

  it('returns a module detail page with scoped widgets, charts, data, sections, capabilities, and meta', () => {
    const definition = findDashboardModulePageDefinition('attendance');
    expect(definition).toBeDefined();

    const response = presentDashboardModulePage({
      generatedAt: new Date('2026-07-09T12:00:00.000Z'),
      definition: definition!,
      summary: summarySnapshot({
        pendingSessionsToday: 3,
        absentEntriesToday: 2,
      }),
      alertSignals: alertSignals({
        attendance: {
          todaySessionsPendingSubmission: 3,
          todayAbsentEntries: 2,
        },
      }),
      alerts: buildDashboardAlerts(
        alertSignals({
          attendance: {
            todaySessionsPendingSubmission: 3,
            todayAbsentEntries: 2,
          },
        }),
      ),
    });

    expect(response).toMatchObject({
      generatedAt: '2026-07-09T12:00:00.000Z',
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
        freshness: {
          dataMode: 'request_time_snapshot',
          cacheStatus: 'not_used',
          realtimeStatus: 'not_used',
        },
        deferred: {
          customLayouts: 'deferred',
          userPreferences: 'deferred',
          drilldowns: 'deferred',
          exports: 'deferred',
          realtime: 'deferred',
        },
      },
    });
    expect(response.widgets.map((widget) => widget.widgetKey)).toEqual([
      'attendance.pending_today',
      'attendance.absences_today',
    ]);
    expect(response.overview.quickStats).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'attendance.pending_today',
          value: 3,
        }),
        expect.objectContaining({
          key: 'attendance.absences_today',
          value: 2,
        }),
      ]),
    );
    expect(response.overview.risks.map((risk) => risk.key)).toEqual([
      'attendance.absent_entries_today',
      'attendance.sessions_pending_submission',
    ]);
    expect(
      response.analytics.availableData.map((data) => data.chartKey),
    ).toEqual(['attendance.pending_sessions']);
    expect(response.analytics.availableData[0]).toMatchObject({
      data: {
        series: [
          {
            points: [{ x: 'snapshot', y: 3 }],
          },
        ],
        totals: { pending: 3 },
        empty: false,
      },
      meta: {
        pack: 'operational_snapshot_v1',
        dataAvailability: 'computed_snapshot',
      },
    });
    expect(
      response.analytics.plannedCharts.map((chart) => chart.chartKey),
    ).toEqual([]);
    expect(
      response.analytics.charts
        .filter((chart) => chart.chartKey !== 'attendance.pending_sessions')
        .every(
          (chart) =>
            chart.status === 'available' &&
            ['computed_series', 'computed_category'].includes(
              chart.meta.dataAvailability,
            ),
        ),
    ).toBe(true);
    expect(JSON.stringify(response.analytics.plannedCharts)).not.toContain(
      'points',
    );
    expect(response.sections).toEqual([
      {
        sectionKey: 'overview',
        title: 'Overview',
        status: 'available',
        items: ['quickStats', 'risks', 'actions'],
      },
      {
        sectionKey: 'widgets',
        title: 'Widgets',
        status: 'available',
        items: ['attendance.pending_today', 'attendance.absences_today'],
      },
      {
        sectionKey: 'analytics',
        title: 'Analytics',
        status: 'partial',
        items: [
          'attendance.daily_trend',
          'attendance.status_distribution',
          'attendance.absence_rate',
          'attendance.late_rate',
          'attendance.pending_sessions',
          'attendance.excuse_status',
        ],
      },
    ]);
    expectNoInternalLeaks(response);
  });

  it('includes only first-pack available data and leaves planned definitions without fake data', () => {
    const settings = findDashboardModulePageDefinition('settings');
    expect(settings).toBeDefined();

    const response = presentDashboardModulePage({
      generatedAt: new Date('2026-07-09T12:00:00.000Z'),
      definition: settings!,
      summary: summarySnapshot(),
      alertSignals: alertSignals({
        settings: {
          missingActiveEmailConnection: 0,
          missingLoginIdentity: 1,
        },
      }),
      alerts: buildDashboardAlerts(
        alertSignals({
          settings: {
            missingActiveEmailConnection: 0,
            missingLoginIdentity: 1,
          },
        }),
      ),
    });

    expect(
      response.analytics.availableData.map((data) => data.chartKey),
    ).toEqual([
      'settings.email_connection_readiness',
      'settings.login_identity_readiness',
    ]);
    expect(
      response.analytics.plannedCharts.map((chart) => chart.chartKey),
    ).toEqual(['settings.notification_readiness']);
    expect(
      response.analytics.plannedCharts.every(
        (chart) =>
          chart.status === 'planned' &&
          chart.meta.dataAvailability === 'definition_only',
      ),
    ).toBe(true);
    expect(JSON.stringify(response.analytics.plannedCharts)).not.toContain(
      'points',
    );
    expectNoInternalLeaks(response);
  });

  it('omits missing widget and chart references without crashing', () => {
    const students = findDashboardModulePageDefinition('students');
    const chart = findDashboardAnalyticsChartDefinition(
      'students.enrollment_growth',
    );
    expect(students).toBeDefined();
    expect(chart).toBeDefined();

    const response = presentDashboardModulePage({
      generatedAt: new Date('2026-07-09T12:00:00.000Z'),
      definition: {
        ...students!,
        widgetKeys: ['missing.widget', 'students.active'],
        chartKeys: ['missing.chart', 'students.enrollment_growth'],
      },
      summary: summarySnapshot({ activeStudents: 42 }),
      alertSignals: alertSignals(),
      alerts: buildDashboardAlerts(alertSignals()),
    });

    expect(response.widgets.map((widget) => widget.widgetKey)).toEqual([
      'students.active',
    ]);
    expect(response.analytics.charts.map((item) => item.chartKey)).toEqual([
      'students.enrollment_growth',
    ]);
    expect(response.analytics.availableData).toEqual([]);
    expect(response.analytics.charts[0]).toMatchObject({
      status: 'available',
      meta: { dataAvailability: 'computed_series' },
      queryCapabilities: { timeFilterMode: 'historical' },
    });
    expect(response.capabilities).toMatchObject({
      widgets: 'available',
      analyticsDefinitions: 'available',
      analyticsData: 'planned',
    });
    expectNoInternalLeaks(response);
  });

  it('publishes available Admissions definitions without adding standalone data fanout', () => {
    const admissions = findDashboardModulePageDefinition('admissions');
    expect(admissions).toBeDefined();

    const response = presentDashboardModulePage({
      generatedAt: new Date('2026-07-09T12:00:00.000Z'),
      definition: admissions!,
      summary: summarySnapshot(),
      alertSignals: alertSignals(),
      alerts: buildDashboardAlerts(alertSignals()),
    });

    expect(response.analytics.charts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          chartKey: 'admissions.applications_by_status',
          status: 'available',
          meta: { dataAvailability: 'computed_category' },
        }),
        expect.objectContaining({
          chartKey: 'admissions.applications_over_time',
          status: 'available',
          meta: { dataAvailability: 'computed_series' },
        }),
        expect.objectContaining({
          chartKey: 'admissions.funnel',
          status: 'planned',
          meta: { dataAvailability: 'definition_only' },
        }),
      ]),
    );
    expect(response.analytics.availableData).toEqual([]);
    expect(
      response.analytics.plannedCharts.map((chart) => chart.chartKey),
    ).toEqual(['admissions.funnel']);
    expectNoInternalLeaks(response);
  });

  it('publishes Academics pack definitions without adding category analytics fanout', () => {
    const academics = findDashboardModulePageDefinition('academics');
    expect(academics).toBeDefined();

    const response = presentDashboardModulePage({
      generatedAt: new Date('2026-07-09T12:00:00.000Z'),
      definition: academics!,
      summary: summarySnapshot(),
      alertSignals: alertSignals(),
      alerts: buildDashboardAlerts(alertSignals()),
    });

    expect(response.analytics.charts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          chartKey: 'academics.teacher_allocation_coverage',
          status: 'available',
          meta: { dataAvailability: 'computed_category' },
        }),
        expect.objectContaining({
          chartKey: 'academics.timetable_publication_status',
          status: 'available',
          meta: { dataAvailability: 'computed_category' },
        }),
        expect.objectContaining({
          chartKey: 'academics.curriculum_activation',
          status: 'available',
          meta: { dataAvailability: 'computed_category' },
        }),
        expect.objectContaining({
          chartKey: 'academics.lesson_plan_activation',
          status: 'available',
          meta: { dataAvailability: 'computed_category' },
        }),
      ]),
    );
    expect(response.analytics.availableData).toEqual([]);
    expect(
      response.analytics.plannedCharts.map((chart) => chart.chartKey),
    ).toEqual([
      'academics.structure_readiness',
      'academics.subject_allocation_coverage',
    ]);
    expectNoInternalLeaks(response);
  });

  it('does not expose tenant, raw, platform, or person-level identifiers', () => {
    const communication = findDashboardModulePageDefinition('communication');
    expect(communication).toBeDefined();

    const response = presentDashboardModulePage({
      generatedAt: new Date('2026-07-09T12:00:00.000Z'),
      definition: communication!,
      summary: {
        ...summarySnapshot({ pendingModerationReports: 4 }),
        schoolId: 'school-a',
        organizationId: 'org-a',
      } as any,
      alertSignals: {
        ...alertSignals({
          communication: { pendingModerationReports: 4 },
        }),
        schoolId: 'school-a',
        raw: { actorId: 'actor-1' },
      } as any,
      alerts: buildDashboardAlerts(
        alertSignals({
          communication: { pendingModerationReports: 4 },
        }),
      ),
    });

    expect(response.module.moduleKey).toBe('communication');
    expectNoInternalLeaks(response);
  });
});

function summarySnapshot(
  overrides: Partial<{
    activeStudents: number;
    pendingSessionsToday: number;
    absentEntriesToday: number;
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
        openApplications: 2,
        submittedApplications: 0,
        acceptedApplications: 0,
        pendingTests: 0,
        pendingInterviews: 0,
        recentDecisions: 0,
      },
      students: {
        activeStudents: overrides.activeStudents ?? 12,
        activeEnrollments: 12,
        guardians: 10,
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
        todaySessions: 5,
        submittedSessionsToday: 0,
        pendingSessionsToday: overrides.pendingSessionsToday ?? 0,
        absentEntriesToday: overrides.absentEntriesToday ?? 0,
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
  overrides: {
    admissions?: Partial<DashboardAlertSignals['admissions']>;
    academics?: Partial<DashboardAlertSignals['academics']>;
    attendance?: Partial<DashboardAlertSignals['attendance']>;
    grades?: Partial<DashboardAlertSignals['grades']>;
    homework?: Partial<DashboardAlertSignals['homework']>;
    behavior?: Partial<DashboardAlertSignals['behavior']>;
    reinforcement?: Partial<DashboardAlertSignals['reinforcement']>;
    communication?: Partial<DashboardAlertSignals['communication']>;
    settings?: Partial<DashboardAlertSignals['settings']>;
  } = {},
): DashboardAlertSignals {
  return {
    generatedAt: new Date('2026-07-09T12:00:00.000Z'),
    academicContext: { academicYear: null, term: null },
    admissions: {
      applicationsWaitingDecision: 0,
      testsPending: 0,
      interviewsPending: 0,
      ...overrides.admissions,
    },
    academics: {
      missingActiveAcademicYear: 0,
      missingActiveTerm: 0,
      draftTimetableEntries: 0,
      lessonPlansPendingActivation: 0,
      ...overrides.academics,
    },
    attendance: {
      todaySessionsPendingSubmission: 0,
      todayAbsentEntries: 0,
      todayLateEntries: 0,
      pendingExcuses: 0,
      ...overrides.attendance,
    },
    grades: {
      draftAssessments: 0,
      publishedAssessmentsPendingApproval: 0,
      pendingSubmissions: 0,
      pendingAnswerReviews: 0,
      ...overrides.grades,
    },
    homework: {
      submissionsWaitingReview: 0,
      gradedAssignmentsMissingSyncLink: 0,
      pastDueMissingSubmissions: 0,
      ...overrides.homework,
    },
    behavior: {
      pendingReviews: 0,
      recentNegativeRecords: 0,
      ...overrides.behavior,
    },
    reinforcement: {
      pendingReviews: 0,
      overdueActiveTasks: 0,
      ...overrides.reinforcement,
    },
    communication: {
      pendingModerationReports: 0,
      activeAnnouncementsExpiringSoon: 0,
      ...overrides.communication,
    },
    settings: {
      missingLoginIdentity: 0,
      missingActiveEmailConnection: 0,
      ...overrides.settings,
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
