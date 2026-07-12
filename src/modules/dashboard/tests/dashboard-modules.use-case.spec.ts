import { UserType } from '@prisma/client';
import { NotFoundDomainException } from '../../../common/exceptions/domain-exception';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../common/context/request-context';
import { ScopeMissingException } from '../../iam/auth/domain/auth.exceptions';
import { GetDashboardModulePageUseCase } from '../application/get-dashboard-module-page.use-case';
import {
  ListDashboardModulesUseCase,
  normalizeDashboardModulesQuery,
} from '../application/list-dashboard-modules.use-case';
import { DashboardAlertSignals } from '../infrastructure/dashboard-alerts.repository';
import { DashboardAlertsRepository } from '../infrastructure/dashboard-alerts.repository';
import {
  DashboardSummaryRepository,
  DashboardSummarySnapshot,
} from '../infrastructure/dashboard-summary.repository';
import { dashboardTimeContextServiceMock } from './dashboard-test-time-context';

describe('Dashboard modules use cases', () => {
  it('returns the stable module list response shape with all required module keys', async () => {
    const alertsRepository = alertsRepositoryMock(alertSignals());
    const useCase = new ListDashboardModulesUseCase(
      alertsRepository as any,
      dashboardTimeContextServiceMock() as any,
    );

    const response = await withSchoolScope(() => useCase.execute());

    expect(alertsRepository.loadAlertSignals).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'user-1',
        organizationId: 'org-1',
        schoolId: 'school-1',
      }),
      expect.objectContaining({
        now: expect.any(Date),
        todayStart: expect.any(Date),
        last30DaysStart: expect.any(Date),
        next7DaysEndExclusive: new Date('2026-07-18T22:30:00.000Z'),
      }),
    );
    expect(response).toMatchObject({
      generatedAt: expect.any(String),
      modules: expect.any(Array),
      summary: {
        total: 10,
        byStatus: { available: 10 },
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
    expect(
      response.modules.find(
        (modulePage) => modulePage.moduleKey === 'attendance',
      ),
    ).toMatchObject({
      frontendRoute: '/dashboard/modules/attendance',
      sourceRoute: '/attendance/roll-call',
      summary: {
        widgetCount: 2,
        chartCount: 6,
        availableChartDataCount: 1,
      },
      capabilities: {
        widgets: 'available',
        analyticsDefinitions: 'available',
        analyticsData: 'partial',
        drilldowns: 'deferred',
      },
    });
    expectNoInternalLeaks(response);
  });

  it('filters by status/source and normalizes limit defensively', async () => {
    const useCase = new ListDashboardModulesUseCase(
      alertsRepositoryMock(alertSignals()) as any,
      dashboardTimeContextServiceMock() as any,
    );

    const response = await withSchoolScope(() =>
      useCase.execute({
        status: 'available',
        source: 'settings',
        limit: 999,
      } as any),
    );

    expect(response.filters).toEqual({
      status: 'available',
      source: 'settings',
      limit: 50,
    });
    expect(response.modules.map((modulePage) => modulePage.moduleKey)).toEqual([
      'settings',
    ]);
    expect(
      normalizeDashboardModulesQuery({
        source: 'wallet',
        status: 'live',
        limit: -10,
      } as any),
    ).toEqual({
      source: undefined,
      status: undefined,
      limit: 1,
    });
  });

  it('returns one module page by moduleKey with scoped widgets and analytics', async () => {
    const { useCase, summaryRepository, alertsRepository } = detailUseCaseWith({
      summary: summarySnapshot({
        pendingSessionsToday: 5,
        absentEntriesToday: 2,
      }),
      alertSignals: alertSignals({
        attendance: {
          todaySessionsPendingSubmission: 5,
          todayAbsentEntries: 2,
        },
      }),
    });

    const response = await withSchoolScope(() => useCase.execute('attendance'));

    expect(summaryRepository.loadSummarySnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ schoolId: 'school-1' }),
      expect.objectContaining({
        now: expect.any(Date),
        todayStart: expect.any(Date),
        last7DaysStart: expect.any(Date),
        last30DaysStart: expect.any(Date),
      }),
    );
    expect(alertsRepository.loadAlertSignals).toHaveBeenCalledWith(
      expect.objectContaining({ schoolId: 'school-1' }),
      expect.objectContaining({
        now: expect.any(Date),
        todayStart: expect.any(Date),
        last30DaysStart: expect.any(Date),
        next7DaysEndExclusive: new Date('2026-07-18T22:30:00.000Z'),
      }),
    );
    expect(response).toMatchObject({
      generatedAt: expect.any(String),
      module: {
        moduleKey: 'attendance',
        source: 'attendance',
        frontendRoute: '/dashboard/modules/attendance',
        sourceRoute: '/attendance/roll-call',
      },
      overview: {
        quickStats: expect.any(Array),
        risks: expect.any(Array),
        actions: expect.any(Array),
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
        freshness: {
          dataMode: 'request_time_snapshot',
          cacheStatus: 'not_used',
          realtimeStatus: 'not_used',
        },
      },
    });
    expect(response.widgets.map((widget) => widget.widgetKey)).toEqual([
      'attendance.pending_today',
      'attendance.absences_today',
    ]);
    expect(response.analytics.charts.map((chart) => chart.chartKey)).toEqual([
      'attendance.daily_trend',
      'attendance.status_distribution',
      'attendance.absence_rate',
      'attendance.late_rate',
      'attendance.pending_sessions',
      'attendance.excuse_status',
    ]);
    expect(
      response.analytics.availableData.map((data) => data.chartKey),
    ).toEqual(['attendance.pending_sessions']);
    expect(
      response.analytics.plannedCharts.map((chart) => chart.chartKey),
    ).toEqual([
      'attendance.daily_trend',
      'attendance.status_distribution',
      'attendance.absence_rate',
      'attendance.late_rate',
      'attendance.excuse_status',
    ]);
    expect(JSON.stringify(response.analytics.plannedCharts)).not.toContain(
      'points',
    );
    expectNoInternalLeaks(response);
  });

  it('returns first-pack available settings data and keeps unsupported settings charts definition-only', async () => {
    const { useCase } = detailUseCaseWith({
      summary: summarySnapshot(),
      alertSignals: alertSignals({
        settings: {
          missingActiveEmailConnection: 0,
          missingLoginIdentity: 1,
        },
      }),
    });

    const response = await withSchoolScope(() => useCase.execute('settings'));

    expect(response.widgets.map((widget) => widget.widgetKey)).toEqual([
      'settings.email_connection',
      'settings.login_identity',
    ]);
    expect(
      response.analytics.availableData.map((data) => data.chartKey),
    ).toEqual([
      'settings.email_connection_readiness',
      'settings.login_identity_readiness',
    ]);
    expect(
      response.analytics.availableData.find(
        (data) => data.chartKey === 'settings.email_connection_readiness',
      )?.data.summary,
    ).toMatchObject({ value: 100 });
    expect(
      response.analytics.plannedCharts.map((chart) => chart.chartKey),
    ).toEqual(['settings.notification_readiness']);
    expectNoInternalLeaks(response);
  });

  it('throws not found for unknown module keys', async () => {
    const { useCase, summaryRepository, alertsRepository } = detailUseCaseWith({
      summary: summarySnapshot(),
      alertSignals: alertSignals(),
    });

    await expect(
      withSchoolScope(() => useCase.execute('platform-admin')),
    ).rejects.toBeInstanceOf(NotFoundDomainException);
    expect(summaryRepository.loadSummarySnapshot).not.toHaveBeenCalled();
    expect(alertsRepository.loadAlertSignals).not.toHaveBeenCalled();
  });

  it('rejects callers without an active school scope', async () => {
    const useCase = new ListDashboardModulesUseCase(
      alertsRepositoryMock(alertSignals()) as any,
      dashboardTimeContextServiceMock() as any,
    );

    await expect(
      runWithRequestContext(createRequestContext(), async () => {
        setActor({ id: 'platform-user', userType: UserType.PLATFORM_USER });
        return useCase.execute();
      }),
    ).rejects.toBeInstanceOf(ScopeMissingException);
  });
});

async function withSchoolScope<T>(fn: () => Promise<T>): Promise<T> {
  return runWithRequestContext(createRequestContext(), async () => {
    setActor({ id: 'user-1', userType: UserType.SCHOOL_USER });
    setActiveMembership({
      membershipId: 'membership-1',
      organizationId: 'org-1',
      schoolId: 'school-1',
      roleId: 'role-1',
      permissions: ['dashboard.modules.view'],
    });

    return fn();
  });
}

function detailUseCaseWith(input: {
  summary: DashboardSummarySnapshot;
  alertSignals: DashboardAlertSignals;
}) {
  const summaryRepository = summaryRepositoryMock(input.summary);
  const alertsRepository = alertsRepositoryMock(input.alertSignals);

  return {
    summaryRepository,
    alertsRepository,
    useCase: new GetDashboardModulePageUseCase(
      summaryRepository as any,
      alertsRepository as any,
      dashboardTimeContextServiceMock() as any,
    ),
  };
}

function summaryRepositoryMock(
  snapshotValue: DashboardSummarySnapshot,
): jest.Mocked<Pick<DashboardSummaryRepository, 'loadSummarySnapshot'>> {
  return {
    loadSummarySnapshot: jest.fn().mockResolvedValue(snapshotValue),
  };
}

function alertsRepositoryMock(
  alertSignals: DashboardAlertSignals,
): jest.Mocked<Pick<DashboardAlertsRepository, 'loadAlertSignals'>> {
  return {
    loadAlertSignals: jest.fn().mockResolvedValue(alertSignals),
  };
}

function summarySnapshot(
  overrides: Partial<{
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
        activeStudents: 12,
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
