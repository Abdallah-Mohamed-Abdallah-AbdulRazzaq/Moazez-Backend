import { UserType } from '@prisma/client';
import { NotFoundDomainException } from '../../../common/exceptions/domain-exception';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../common/context/request-context';
import { ScopeMissingException } from '../../iam/auth/domain/auth.exceptions';
import { GetDashboardWidgetUseCase } from '../application/get-dashboard-widget.use-case';
import {
  ListDashboardWidgetsUseCase,
  normalizeDashboardWidgetsQuery,
} from '../application/list-dashboard-widgets.use-case';
import { DashboardActivityAuditRecord } from '../infrastructure/dashboard-activity-feed.repository';
import { DashboardActivityFeedRepository } from '../infrastructure/dashboard-activity-feed.repository';
import {
  DashboardAlertSignals,
  DashboardAlertsRepository,
} from '../infrastructure/dashboard-alerts.repository';
import {
  DashboardSummaryRepository,
  DashboardSummarySnapshot,
} from '../infrastructure/dashboard-summary.repository';
import { dashboardTimeContextServiceMock } from './dashboard-test-time-context';

describe('Dashboard widgets use cases', () => {
  it('returns the stable list response from existing dashboard read models', async () => {
    const summaryRepository = summaryRepositoryMock(snapshot());
    const alertsRepository = alertsRepositoryMock(
      signals({
        settings: {
          missingLoginIdentity: 1,
          missingActiveEmailConnection: 1,
        },
      }),
    );
    const activityFeedRepository = activityFeedRepositoryMock([
      auditRecord({
        id: 'activity-1',
        actorId: 'actor-1',
        resourceId: 'resource-1',
      }),
    ]);
    const useCase = new ListDashboardWidgetsUseCase(
      summaryRepository as any,
      alertsRepository as any,
      activityFeedRepository as any,
      dashboardTimeContextServiceMock() as any,
    );

    const response = await withSchoolScope(() => useCase.execute());

    expect(summaryRepository.loadSummarySnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'user-1',
        organizationId: 'org-1',
        schoolId: 'school-1',
      }),
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
    expect(
      activityFeedRepository.listActivityAuditRecords,
    ).toHaveBeenCalledWith(expect.objectContaining({ schoolId: 'school-1' }), {
      take: 20,
    });

    expect(response.widgets.map((widget) => widget.widgetKey)).toEqual(
      expect.arrayContaining([
        'students.active',
        'admissions.open_applications',
        'attendance.pending_today',
        'attendance.absences_today',
        'homework.waiting_review',
        'grades.pending_review',
        'behavior.pending_review',
        'reinforcement.pending_reviews',
        'communication.moderation_queue',
        'settings.email_connection',
        'settings.login_identity',
        'activity.recent',
      ]),
    );
    expect(response.summary.total).toBe(12);
    expect(response.deferred).toEqual({
      customLayouts: 'deferred',
      widgetPreferences: 'deferred',
      analyticsCharts: 'integration_deferred',
      weatherWidgets: 'deferred',
      todoWidgets: 'integration_deferred',
      analyticsStandalone: 'snapshot_only',
      todosStandalone: 'persisted',
    });
    expect(
      response.widgets.every(
        (widget) =>
          widget.action?.kind === 'frontend-route' &&
          widget.action.target.startsWith('/') &&
          !widget.action.target.startsWith('//'),
      ),
    ).toBe(true);
    expect(JSON.stringify(response)).not.toContain('actor-1');
    expect(JSON.stringify(response)).not.toContain('resource-1');
    expect(summaryRepository.createAuditLog).not.toHaveBeenCalled();
    expect(alertsRepository.updateDashboardAlert).not.toHaveBeenCalled();
  });

  it('filters list widgets and normalizes limit defensively', async () => {
    const useCase = new ListDashboardWidgetsUseCase(
      summaryRepositoryMock(snapshot()) as any,
      alertsRepositoryMock(signals()) as any,
      activityFeedRepositoryMock([]) as any,
      dashboardTimeContextServiceMock() as any,
    );

    const response = await withSchoolScope(() =>
      useCase.execute({
        source: 'settings',
        limit: 999,
      } as any),
    );

    expect(response.filters).toEqual({
      source: 'settings',
      type: null,
      limit: 50,
    });
    expect(response.widgets.map((widget) => widget.widgetKey)).toEqual([
      'settings.email_connection',
      'settings.login_identity',
    ]);

    expect(
      normalizeDashboardWidgetsQuery({
        type: 'risk-card',
        limit: -10,
      } as any),
    ).toEqual({
      source: undefined,
      type: 'risk-card',
      limit: 1,
    });
  });

  it('returns one widget by widgetKey', async () => {
    const useCase = new GetDashboardWidgetUseCase(
      summaryRepositoryMock(snapshot()) as any,
      alertsRepositoryMock(signals()) as any,
      activityFeedRepositoryMock([]) as any,
      dashboardTimeContextServiceMock() as any,
    );

    const response = await withSchoolScope(() =>
      useCase.execute('grades.pending_review'),
    );

    expect(response.widget).toMatchObject({
      widgetKey: 'grades.pending_review',
      type: 'action-card',
      source: 'grades',
      data: expect.objectContaining({
        value: 6,
        status: 'needs_review',
      }),
      action: {
        label: 'Review grades',
        target: '/grades/submissions',
        kind: 'frontend-route',
      },
    });
  });

  it('throws not found for unknown widget keys', async () => {
    const useCase = new GetDashboardWidgetUseCase(
      summaryRepositoryMock(snapshot()) as any,
      alertsRepositoryMock(signals()) as any,
      activityFeedRepositoryMock([]) as any,
      dashboardTimeContextServiceMock() as any,
    );

    await expect(
      withSchoolScope(() => useCase.execute('unknown.widget')),
    ).rejects.toBeInstanceOf(NotFoundDomainException);
  });

  it('rejects callers without an active school scope', async () => {
    const useCase = new ListDashboardWidgetsUseCase(
      summaryRepositoryMock(snapshot()) as any,
      alertsRepositoryMock(signals()) as any,
      activityFeedRepositoryMock([]) as any,
      dashboardTimeContextServiceMock() as any,
    );

    await expect(
      runWithRequestContext(createRequestContext(), async () => {
        setActor({ id: 'platform-user', userType: UserType.PLATFORM_USER });
        return useCase.execute();
      }),
    ).rejects.toBeInstanceOf(ScopeMissingException);
  });

  it('handles minimal data with stable widgets', async () => {
    const useCase = new ListDashboardWidgetsUseCase(
      summaryRepositoryMock(
        snapshot({
          academicContext: {
            academicYear: null,
            term: null,
          },
          cards: zeroCards(),
        }),
      ) as any,
      alertsRepositoryMock(
        signals({
          settings: {
            missingLoginIdentity: 1,
            missingActiveEmailConnection: 1,
          },
        }),
      ) as any,
      activityFeedRepositoryMock([]) as any,
      dashboardTimeContextServiceMock() as any,
    );

    const response = await withSchoolScope(() => useCase.execute());

    expect(response.widgets).toHaveLength(12);
    expect(
      response.widgets.find((widget) => widget.widgetKey === 'students.active'),
    ).toMatchObject({
      data: {
        value: 0,
        unit: null,
        label: 'Active students',
      },
    });
    expect(
      response.widgets.find(
        (widget) => widget.widgetKey === 'settings.login_identity',
      ),
    ).toMatchObject({
      tone: 'warning',
      data: expect.objectContaining({
        value: 'not_configured',
      }),
    });
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
      permissions: ['dashboard.widgets.view'],
    });

    return fn();
  });
}

function summaryRepositoryMock(
  snapshotValue: DashboardSummarySnapshot,
): jest.Mocked<Pick<DashboardSummaryRepository, 'loadSummarySnapshot'>> & {
  createAuditLog: jest.Mock;
} {
  return {
    loadSummarySnapshot: jest.fn().mockResolvedValue(snapshotValue),
    createAuditLog: jest.fn(),
  };
}

function alertsRepositoryMock(alertSignals: DashboardAlertSignals): jest.Mocked<
  Pick<DashboardAlertsRepository, 'loadAlertSignals'>
> & {
  updateDashboardAlert: jest.Mock;
} {
  return {
    loadAlertSignals: jest.fn().mockResolvedValue(alertSignals),
    updateDashboardAlert: jest.fn(),
  };
}

function activityFeedRepositoryMock(
  records: DashboardActivityAuditRecord[],
): jest.Mocked<
  Pick<DashboardActivityFeedRepository, 'listActivityAuditRecords'>
> {
  return {
    listActivityAuditRecords: jest.fn().mockResolvedValue(records),
  };
}

function snapshot(
  overrides: Partial<DashboardSummarySnapshot> = {},
): DashboardSummarySnapshot {
  return {
    generatedAt: new Date('2026-07-09T12:00:00.000Z'),
    school: {
      name: 'Moazez Academy',
      timezone: 'Africa/Cairo',
      locale: null,
    },
    academicContext: {
      academicYear: { id: 'year-1', name: '2026/2027' },
      term: { id: 'term-1', name: 'Term 1', academicYearId: 'year-1' },
    },
    cards: cards(),
    ...overrides,
  };
}

function cards(): DashboardSummarySnapshot['cards'] {
  return {
    ...zeroCards(),
    admissions: {
      totalLeads: 5,
      openApplications: 4,
      submittedApplications: 2,
      acceptedApplications: 1,
      pendingTests: 1,
      pendingInterviews: 0,
      recentDecisions: 1,
    },
    students: {
      activeStudents: 120,
      activeEnrollments: 118,
      guardians: 180,
      newEnrollmentsLast30Days: 3,
      withdrawnEnrollments: 1,
    },
    attendance: {
      todaySessions: 10,
      submittedSessionsToday: 7,
      pendingSessionsToday: 3,
      absentEntriesToday: 2,
      lateEntriesToday: 1,
      pendingExcuses: 1,
    },
    grades: {
      activeAssessments: 7,
      draftAssessments: 1,
      publishedAssessments: 3,
      approvedAssessments: 3,
      lockedAssessments: 1,
      gradeItems: 50,
      pendingSubmissions: 2,
      pendingAnswerReviews: 4,
    },
    homework: {
      draftAssignments: 2,
      publishedAssignments: 5,
      closedAssignments: 1,
      submissionsWaitingReview: 3,
      reviewedSubmissions: 6,
      gradeSyncLinkedAssignments: 1,
      gradeSyncPendingAssignments: 1,
    },
    behavior: {
      recentRecords: 4,
      pendingReviewRecords: 1,
      positiveRecords: 3,
      negativeRecords: 1,
    },
    reinforcement: {
      activeTasks: 5,
      pendingReviews: 2,
      completedAssignments: 12,
      recentXpLedgerEntries: 8,
      rewardsPending: 1,
    },
    communication: {
      activeAnnouncements: 2,
      recentMessages: 20,
      activeConversations: 9,
      pendingModerationReports: 1,
    },
  };
}

function zeroCards(): DashboardSummarySnapshot['cards'] {
  return {
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
      pendingSessionsToday: 0,
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
      pendingSubmissions: 0,
      pendingAnswerReviews: 0,
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
      pendingModerationReports: 0,
    },
  };
}

function signals(
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
    academicContext: {
      academicYear: { id: 'year-1', name: '2026/2027' },
      term: { id: 'term-1', name: 'Term 1', academicYearId: 'year-1' },
    },
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

function auditRecord(
  overrides: Partial<DashboardActivityAuditRecord> = {},
): DashboardActivityAuditRecord {
  return {
    id: 'activity-1',
    actorId: null,
    userType: UserType.SERVICE_ACCOUNT,
    module: 'homework',
    action: 'homework.submission.review',
    resourceType: 'homework_submission',
    resourceId: null,
    createdAt: new Date('2026-07-09T11:00:00.000Z'),
    actor: null,
    ...overrides,
  };
}
