import { UserType } from '@prisma/client';
import { NotFoundDomainException } from '../../../common/exceptions/domain-exception';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../common/context/request-context';
import { ScopeMissingException } from '../../iam/auth/domain/auth.exceptions';
import {
  GetDashboardAnalyticsChartDataUseCase,
  normalizeDashboardAnalyticsChartDataQuery,
} from '../application/get-dashboard-analytics-chart-data.use-case';
import { DashboardAlertSignals } from '../infrastructure/dashboard-alerts.repository';
import { DashboardSummarySnapshot } from '../infrastructure/dashboard-summary.repository';
import { dashboardTimeContextServiceMock } from './dashboard-test-time-context';

describe('Dashboard analytics data use case', () => {
  it('returns computed snapshot data for attendance.pending_sessions', async () => {
    const { useCase, summaryRepository, alertsRepository } = useCaseWith({
      summary: summarySnapshot({ pendingSessionsToday: 7 }),
      alertSignals: alertSignals(),
    });

    const response = await withSchoolScope(() =>
      useCase.execute('attendance.pending_sessions', {}),
    );

    expect(response).toMatchObject({
      chartKey: 'attendance.pending_sessions',
      source: 'attendance',
      status: 'available',
      range: '30d',
      granularity: 'day',
      filters: {
        range: '30d',
        granularity: 'day',
        dateFrom: null,
        dateTo: null,
      },
      data: {
        series: [
          {
            key: 'pending',
            points: [{ x: 'snapshot', y: 7 }],
          },
        ],
        totals: { pending: 7 },
        summary: { value: 7 },
        empty: false,
      },
      meta: {
        pack: 'operational_snapshot_v1',
        dataAvailability: 'computed_snapshot',
        computation: 'dashboard_summary_snapshot',
      },
    });
    expect(summaryRepository.loadSummarySnapshot).toHaveBeenCalledTimes(1);
    expect(alertsRepository.loadAlertSignals).toHaveBeenCalledTimes(1);
    expectNoInternalLeaks(response);
    expect(JSON.stringify(response.data.series)).not.toContain('YYYY-MM-DD');
  });

  it('returns computed snapshot data for grades, communication, and settings readiness', async () => {
    const { useCase } = useCaseWith({
      summary: summarySnapshot({
        pendingSubmissions: 2,
        pendingAnswerReviews: 3,
        pendingModerationReports: 4,
      }),
      alertSignals: alertSignals({
        missingActiveEmailConnection: 0,
        missingLoginIdentity: 1,
      }),
    });

    await expectValue(useCase, 'grades.pending_submission_reviews', 2, {
      pendingSubmissions: 2,
    });
    await expectValue(useCase, 'grades.pending_answer_reviews', 3, {
      pendingAnswerReviews: 3,
    });
    await expectValue(useCase, 'communication.moderation_queue', 4, {
      pendingModerationReports: 4,
    });
    await expectValue(useCase, 'settings.email_connection_readiness', 100, {
      ready: 1,
      missing: 0,
    });
    await expectValue(useCase, 'settings.login_identity_readiness', 0, {
      ready: 0,
      missing: 1,
    });
  });

  it('returns not_implemented for known unsupported planned charts without loading data', async () => {
    const { useCase, summaryRepository, alertsRepository } = useCaseWith({
      summary: summarySnapshot(),
      alertSignals: alertSignals(),
    });

    const response = await withSchoolScope(() =>
      useCase.execute('attendance.daily_trend', {
        range: 'custom',
        granularity: 'week',
        dateFrom: '2026-07-01',
        dateTo: '2026-07-09',
      }),
    );

    expect(response).toMatchObject({
      chartKey: 'attendance.daily_trend',
      status: 'planned',
      range: 'custom',
      granularity: 'week',
      filters: {
        range: 'custom',
        granularity: 'week',
        dateFrom: '2026-07-01',
        dateTo: '2026-07-09',
      },
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
        pack: null,
        dataAvailability: 'definition_only',
      },
    });
    expect(summaryRepository.loadSummarySnapshot).not.toHaveBeenCalled();
    expect(alertsRepository.loadAlertSignals).not.toHaveBeenCalled();
    expectNoInternalLeaks(response);
  });

  it('throws not found for unknown chart keys', async () => {
    const { useCase } = useCaseWith({
      summary: summarySnapshot(),
      alertSignals: alertSignals(),
    });

    await expect(
      withSchoolScope(() => useCase.execute('unknown.chart', {})),
    ).rejects.toBeInstanceOf(NotFoundDomainException);
  });

  it('normalizes default, invalid, and custom filter values safely', () => {
    expect(normalizeDashboardAnalyticsChartDataQuery({})).toMatchObject({
      range: '30d',
      granularity: 'day',
      dateFrom: null,
      dateTo: null,
    });
    expect(
      normalizeDashboardAnalyticsChartDataQuery({
        range: 'wallet',
        granularity: 'minute',
        schoolId: 'school-b',
      } as any),
    ).toEqual({
      range: '30d',
      granularity: 'day',
      dateFrom: null,
      dateTo: null,
      academicYearId: null,
      termId: null,
      gradeId: null,
      sectionId: null,
      classroomId: null,
    });
    expect(
      normalizeDashboardAnalyticsChartDataQuery({
        range: 'custom',
        granularity: 'month',
        dateFrom: '2026-07-01',
        dateTo: '2026-07-09',
        academicYearId: 'academic-year-1',
      }),
    ).toMatchObject({
      range: 'custom',
      granularity: 'month',
      dateFrom: '2026-07-01',
      dateTo: '2026-07-09',
      academicYearId: 'academic-year-1',
    });
  });

  it('rejects callers without an active school scope', async () => {
    const { useCase } = useCaseWith({
      summary: summarySnapshot(),
      alertSignals: alertSignals(),
    });

    await expect(
      runWithRequestContext(createRequestContext(), async () => {
        setActor({ id: 'platform-user', userType: UserType.PLATFORM_USER });
        return useCase.execute('attendance.pending_sessions', {});
      }),
    ).rejects.toBeInstanceOf(ScopeMissingException);
  });
});

async function expectValue(
  useCase: GetDashboardAnalyticsChartDataUseCase,
  chartKey: string,
  value: number,
  totals: Record<string, number>,
): Promise<void> {
  const response = await withSchoolScope(() => useCase.execute(chartKey, {}));

  expect(response).toMatchObject({
    chartKey,
    status: 'available',
    data: {
      totals,
      summary: { value },
      empty: false,
    },
    meta: {
      dataAvailability: 'computed_snapshot',
    },
  });
  expectNoInternalLeaks(response);
}

function useCaseWith(input: {
  summary: DashboardSummarySnapshot;
  alertSignals: DashboardAlertSignals;
}) {
  const summaryRepository = {
    loadSummarySnapshot: jest.fn().mockResolvedValue(input.summary),
  };
  const alertsRepository = {
    loadAlertSignals: jest.fn().mockResolvedValue(input.alertSignals),
  };

  return {
    summaryRepository,
    alertsRepository,
    useCase: new GetDashboardAnalyticsChartDataUseCase(
      summaryRepository as any,
      alertsRepository as any,
      dashboardTimeContextServiceMock() as any,
    ),
  };
}

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
