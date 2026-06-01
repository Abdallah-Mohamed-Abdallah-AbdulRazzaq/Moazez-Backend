import { UserType } from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../common/context/request-context';
import { ScopeMissingException } from '../../iam/auth/domain/auth.exceptions';
import {
  buildDashboardAlerts,
  ListDashboardAlertsUseCase,
} from '../application/list-dashboard-alerts.use-case';
import { ListDashboardAlertsQueryDto } from '../dto/dashboard-alerts.dto';
import {
  DashboardAlertSignals,
  DashboardAlertsRepository,
} from '../infrastructure/dashboard-alerts.repository';

describe('ListDashboardAlertsUseCase', () => {
  it('requires school scope and delegates signal loading to the repository', async () => {
    const repository = repositoryMock(signals());
    const useCase = new ListDashboardAlertsUseCase(repository as any);

    const response = await withSchoolScope(() => useCase.execute());

    expect(repository.loadAlertSignals).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'user-1',
        organizationId: 'org-1',
        schoolId: 'school-1',
      }),
      expect.objectContaining({
        now: expect.any(Date),
        todayStart: expect.any(Date),
        last30DaysStart: expect.any(Date),
        next7DaysEnd: expect.any(Date),
      }),
    );
    expect(response.alerts).toEqual([]);
    expect(repository.createAuditLog).not.toHaveBeenCalled();
    expect(repository.updateDashboardAlert).not.toHaveBeenCalled();
  });

  it('rejects callers without an active school scope', async () => {
    const repository = repositoryMock(signals());
    const useCase = new ListDashboardAlertsUseCase(repository as any);

    await expect(
      runWithRequestContext(createRequestContext(), async () => {
        setActor({ id: 'platform-user', userType: UserType.PLATFORM_USER });
        return useCase.execute();
      }),
    ).rejects.toBeInstanceOf(ScopeMissingException);
    expect(repository.loadAlertSignals).not.toHaveBeenCalled();
  });

  it('omits zero-count alerts by default', async () => {
    const repository = repositoryMock(signals());
    const useCase = new ListDashboardAlertsUseCase(repository as any);

    const response = await withSchoolScope(() => useCase.execute());

    expect(response.alerts).toEqual([]);
    expect(response.summary.total).toBe(0);
  });

  it('filters alerts by source', async () => {
    const repository = repositoryMock(
      signals({
        admissions: { applicationsWaitingDecision: 2 },
        attendance: { todayAbsentEntries: 1 },
      }),
    );
    const useCase = new ListDashboardAlertsUseCase(repository as any);

    const response = await withSchoolScope(() =>
      useCase.execute(query({ source: 'attendance' })),
    );

    expect(response.alerts).toHaveLength(1);
    expect(response.alerts[0]).toMatchObject({
      key: 'attendance.absent_entries_today',
      source: 'attendance',
      severity: 'critical',
      count: 1,
    });
    expect(response.summary).toMatchObject({
      total: 1,
      critical: 1,
      bySource: { attendance: 1 },
    });
  });

  it('filters alerts by severity', async () => {
    const repository = repositoryMock(
      signals({
        admissions: { applicationsWaitingDecision: 2 },
        academics: { lessonPlansPendingActivation: 4 },
        communication: { pendingModerationReports: 1 },
      }),
    );
    const useCase = new ListDashboardAlertsUseCase(repository as any);

    const response = await withSchoolScope(() =>
      useCase.execute(query({ severity: 'info' })),
    );

    expect(response.alerts).toEqual([
      expect.objectContaining({
        key: 'academics.lesson_plans_pending_activation',
        severity: 'info',
        count: 4,
      }),
    ]);
    expect(response.summary).toMatchObject({
      total: 4,
      critical: 0,
      warning: 0,
      info: 4,
    });
  });

  it('applies limits and clamps oversized limits to available alerts', async () => {
    const allSignals = signals();
    const repository = repositoryMock(allSignals);
    const useCase = new ListDashboardAlertsUseCase(repository as any);

    const limited = await withSchoolScope(() =>
      useCase.execute(query({ includeZeroCount: true, limit: 2 })),
    );
    const oversized = await withSchoolScope(() =>
      useCase.execute(query({ includeZeroCount: true, limit: 500 })),
    );

    expect(limited.alerts).toHaveLength(2);
    expect(oversized.alerts).toHaveLength(
      buildDashboardAlerts(allSignals).length,
    );
  });

  it('sorts deterministically by severity, source, and key', async () => {
    const repository = repositoryMock(
      signals({
        admissions: { applicationsWaitingDecision: 1 },
        academics: { lessonPlansPendingActivation: 1 },
        attendance: { todayAbsentEntries: 1 },
        communication: { pendingModerationReports: 1 },
      }),
    );
    const useCase = new ListDashboardAlertsUseCase(repository as any);

    const response = await withSchoolScope(() => useCase.execute());

    expect(response.alerts.map((alert) => alert.key)).toEqual([
      'attendance.absent_entries_today',
      'communication.moderation_reports_pending',
      'admissions.applications_waiting_decision',
      'academics.lesson_plans_pending_activation',
    ]);
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
      permissions: ['dashboard.alerts.view'],
    });

    return fn();
  });
}

function query(
  overrides: Partial<ListDashboardAlertsQueryDto>,
): ListDashboardAlertsQueryDto {
  return Object.assign(new ListDashboardAlertsQueryDto(), overrides);
}

function repositoryMock(alertSignals: DashboardAlertSignals): jest.Mocked<
  Pick<DashboardAlertsRepository, 'loadAlertSignals'>
> & {
  createAuditLog: jest.Mock;
  updateDashboardAlert: jest.Mock;
} {
  return {
    loadAlertSignals: jest.fn().mockResolvedValue(alertSignals),
    createAuditLog: jest.fn(),
    updateDashboardAlert: jest.fn(),
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
    generatedAt: new Date('2026-06-01T09:00:00.000Z'),
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
