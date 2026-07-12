import { UserType } from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../common/context/request-context';
import { ScopeMissingException } from '../../iam/auth/domain/auth.exceptions';
import { GetDashboardCommandCenterUseCase } from '../application/get-dashboard-command-center.use-case';
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
import {
  DASHBOARD_TEST_GENERATED_AT,
  dashboardTimeContextServiceMock,
} from './dashboard-test-time-context';

describe('GetDashboardCommandCenterUseCase', () => {
  it('requires school scope and composes the command center from existing dashboard foundations', async () => {
    const summaryRepository = summaryRepositoryMock(snapshot());
    const alertsRepository = alertsRepositoryMock(
      signals({
        attendance: { todayAbsentEntries: 2 },
        settings: { missingActiveEmailConnection: 1 },
      }),
    );
    const activityFeedRepository = activityFeedRepositoryMock([
      auditRecord({
        id: 'activity-1',
        actorId: 'actor-1',
        resourceId: 'resource-1',
      }),
    ]);
    const timeContextService = dashboardTimeContextServiceMock();
    const useCase = new GetDashboardCommandCenterUseCase(
      summaryRepository as any,
      alertsRepository as any,
      activityFeedRepository as any,
      timeContextService as any,
    );

    const response = await withSchoolScope(() => useCase.execute());

    expect(summaryRepository.loadSummarySnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'user-1',
        organizationId: 'org-1',
        schoolId: 'school-1',
      }),
      expect.objectContaining({
        now: DASHBOARD_TEST_GENERATED_AT,
        todayDate: new Date('2026-07-12T00:00:00.000Z'),
        todayStart: new Date('2026-07-11T21:00:00.000Z'),
        last7DaysStart: new Date('2026-07-04T21:00:00.000Z'),
        last30DaysStart: new Date('2026-06-11T21:00:00.000Z'),
      }),
    );
    expect(alertsRepository.loadAlertSignals).toHaveBeenCalledWith(
      expect.objectContaining({ schoolId: 'school-1' }),
      expect.objectContaining({
        now: DASHBOARD_TEST_GENERATED_AT,
        todayDate: new Date('2026-07-12T00:00:00.000Z'),
        todayStart: new Date('2026-07-11T21:00:00.000Z'),
        last30DaysStart: new Date('2026-06-11T21:00:00.000Z'),
        next7DaysEndExclusive: new Date('2026-07-18T22:30:00.000Z'),
      }),
    );
    expect(
      activityFeedRepository.listActivityAuditRecords,
    ).toHaveBeenCalledWith(expect.objectContaining({ schoolId: 'school-1' }), {
      take: 20,
    });
    expect(response).toMatchObject({
      generatedAt: expect.any(String),
      school: {
        name: 'Moazez Academy',
        timezone: 'Africa/Cairo',
        locale: null,
      },
      academicContext: {
        academicYear: { id: 'year-1', name: '2026/2027' },
        term: { id: 'term-1', name: 'Term 1' },
      },
      operator: {
        displayName: 'School operator',
        userType: UserType.SCHOOL_USER,
      },
      today: {
        date: '2026-07-12',
        dayOfWeek: expect.any(String),
        timezone: 'Africa/Cairo',
      },
      quickStats: expect.any(Array),
      operationalHealth: expect.any(Array),
      moduleReadiness: expect.any(Array),
      topRisks: expect.any(Array),
      topActions: expect.any(Array),
      alertsPreview: expect.any(Array),
      activityPreview: expect.any(Array),
      meta: {
        source: 'dashboard_command_center',
        version: 'v2',
        dataFreshness: 'live',
        freshness: {
          dataMode: 'request_time_snapshot',
          cacheStatus: 'not_used',
          realtimeStatus: 'not_used',
        },
      },
    });
    expect(
      response.quickStats.find((stat) => stat.key === 'students.active'),
    ).toMatchObject({
      value: 120,
      action: {
        kind: 'frontend-route',
        target: '/students',
      },
    });
    expect(response.topRisks.map((risk) => risk.key)).toContain(
      'attendance.absent_entries_today',
    );
    expect(response.topActions.map((action) => action.key)).toContain(
      'settings.configure_email',
    );
    expect(JSON.stringify(response)).not.toContain('actor-1');
    expect(JSON.stringify(response)).not.toContain('resource-1');
    expect(summaryRepository.createAuditLog).not.toHaveBeenCalled();
    expect(alertsRepository.updateDashboardAlert).not.toHaveBeenCalled();
    const summaryWindow =
      summaryRepository.loadSummarySnapshot.mock.calls[0][1];
    const alertsWindow = alertsRepository.loadAlertSignals.mock.calls[0][1];
    expect(summaryWindow.now).toBe(alertsWindow.now);
    expect(response.generatedAt).toBe(summaryWindow.now.toISOString());
    expect(timeContextService.resolveForSchool).toHaveBeenCalledTimes(1);
  });

  it('rejects callers without an active school scope', async () => {
    const useCase = new GetDashboardCommandCenterUseCase(
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

  it('handles empty/minimal data with stable arrays and deferred flags', async () => {
    const useCase = new GetDashboardCommandCenterUseCase(
      summaryRepositoryMock(
        snapshot({
          school: {
            name: 'Minimal School',
            timezone: null,
            locale: null,
          },
          academicContext: {
            academicYear: null,
            term: null,
          },
          cards: zeroCards(),
        }),
      ) as any,
      alertsRepositoryMock(
        signals({
          academics: {
            missingActiveAcademicYear: 1,
            missingActiveTerm: 1,
          },
          settings: {
            missingLoginIdentity: 1,
            missingActiveEmailConnection: 1,
          },
        }),
      ) as any,
      activityFeedRepositoryMock([]) as any,
      dashboardTimeContextServiceMock({ schoolTimezone: 'UTC' }) as any,
    );

    const response = await withSchoolScope(() => useCase.execute());

    expect(response.today.timezone).toBe('UTC');
    expect(response.school.timezone).toBe('UTC');
    expect(response.quickStats).toHaveLength(6);
    expect(response.moduleReadiness.map((entry) => entry.source)).toEqual([
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
    expect(response.activityPreview).toEqual([]);
    expect(response.meta.deferred).toEqual({
      widgets: 'available',
      analytics: 'snapshot_only',
      lightModeDropdown: 'foundation',
      todos: 'persisted',
      weather: 'deferred',
      planner: 'deferred',
      alertLifecycle: 'deferred',
      realtime: 'deferred',
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
      permissions: ['dashboard.command_center.view'],
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
    academics: {
      activeAcademicYears: 1,
      hasCurrentAcademicYear: true,
      terms: 2,
      stages: 3,
      grades: 9,
      sections: 18,
      classrooms: 18,
      subjects: 12,
      rooms: 14,
      teacherAllocations: 22,
      curricula: 8,
      lessonPlans: 16,
      timetableEntries: 40,
      publishedTimetablePublications: 1,
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
