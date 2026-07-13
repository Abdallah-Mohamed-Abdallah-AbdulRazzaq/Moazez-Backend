import {
  AttendanceExcuseStatus,
  AttendanceStatus,
  UserType,
} from '@prisma/client';
import {
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../common/exceptions/domain-exception';
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
import { DashboardAnalyticsQueryContext } from '../domain/dashboard-analytics-query';

describe('Dashboard analytics data use case', () => {
  it('preserves the default snapshot response while exposing truthful query metadata', async () => {
    const { useCase, queryContextService, snapshotRepository } = useCaseWith(7);

    const response = await withSchoolScope(() =>
      useCase.execute('attendance.pending_sessions', {}),
    );

    expect(response).toMatchObject({
      chartKey: 'attendance.pending_sessions',
      source: 'attendance',
      status: 'available',
      range: '30d',
      granularity: 'day',
      data: {
        series: [
          {
            key: 'pending',
            points: [
              {
                x: 'snapshot',
                y: 7,
                coordinate: { kind: 'snapshot' },
              },
            ],
          },
        ],
        totals: { pending: 7 },
        summary: { value: 7 },
      },
      meta: {
        pack: 'operational_snapshot_v1',
        dataAvailability: 'computed_snapshot',
        query: {
          effectiveTimezone: 'Africa/Cairo',
          requestedFilters: [],
          appliedFilters: ['academicYearId', 'termId'],
          notApplicableFilters: ['range', 'granularity'],
          resolvedWindow: {
            startCivilDate: '2026-06-13',
            endCivilDate: '2026-07-12',
          },
        },
      },
    });
    expect(queryContextService.resolve).toHaveBeenCalledWith(
      expect.objectContaining({ schoolId: 'school-1' }),
      expect.objectContaining({ chartKey: 'attendance.pending_sessions' }),
      {},
    );
    expect(snapshotRepository.loadChartValue).toHaveBeenCalledWith(
      expect.objectContaining({ schoolId: 'school-1' }),
      'attendance.pending_sessions',
      expect.objectContaining({ timezone: 'Africa/Cairo' }),
    );
    expectNoInternalLeaks(response);
  });

  it.each([
    ['grades.pending_submission_reviews', 2, { pendingSubmissions: 2 }],
    ['grades.pending_answer_reviews', 3, { pendingAnswerReviews: 3 }],
    ['communication.moderation_queue', 4, { pendingModerationReports: 4 }],
    ['settings.email_connection_readiness', 100, { ready: 1, missing: 0 }],
    ['settings.login_identity_readiness', 0, { ready: 0, missing: 1 }],
  ])(
    'returns the existing computed snapshot for %s',
    async (chartKey, value, totals) => {
      const { useCase } = useCaseWith(value as number);
      const response = await withSchoolScope(() =>
        useCase.execute(chartKey as string, {}),
      );

      expect(response.data.totals).toEqual(totals);
      expect(response.data.summary?.value).toBe(value);
      expect(response.data.series[0]?.points[0]).toMatchObject({
        x: 'snapshot',
        coordinate: { kind: 'snapshot' },
      });
    },
  );

  it.each([
    [
      'communication.message_volume',
      'aggregateMessageVolumeByCivilDate',
      'communication_message_volume_trend',
    ],
    [
      'communication.announcement_status',
      'countCurrentAnnouncementsByStatus',
      'communication_current_announcement_status_distribution',
    ],
  ] as const)(
    'dispatches %s to exactly one Communication aggregate',
    async (chartKey, expectedMethod, computation) => {
      const setup = useCaseWith(0);
      const response = await withSchoolScope(() =>
        setup.useCase.execute(chartKey, {}),
      );

      expect(response.meta).toMatchObject({
        pack: 'communication_settings_v1',
        computation,
      });
      for (const [method, mock] of Object.entries(
        setup.communicationRepository,
      )) {
        if (method === expectedMethod) {
          expect(mock).toHaveBeenCalledTimes(1);
        } else {
          expect(mock).not.toHaveBeenCalled();
        }
      }
      expect(setup.snapshotRepository.loadChartValue).not.toHaveBeenCalled();
      expectNoInternalLeaks(response);
    },
  );

  it('keeps notification readiness on the definition-only fallback without Communication fanout', async () => {
    const setup = useCaseWith(0);
    const response = await withSchoolScope(() =>
      setup.useCase.execute('settings.notification_readiness', {}),
    );

    expect(response).toMatchObject({
      status: 'planned',
      emptyState: { reason: 'not_implemented' },
      meta: { pack: null, dataAvailability: 'definition_only' },
    });
    for (const mock of Object.values(setup.communicationRepository)) {
      expect(mock).not.toHaveBeenCalled();
    }
  });

  it.each([
    [
      'grades.assessment_status_distribution',
      'gradesRepository',
      'countCurrentAssessmentStatusDistribution',
      'grades_current_assessment_status_distribution',
    ],
    [
      'grades.gradebook_completion',
      'gradesRepository',
      'countCurrentGradebookCompletion',
      'grades_current_gradebook_completion',
    ],
    [
      'homework.assignment_status_distribution',
      'homeworkRepository',
      'countCurrentAssignmentStatusDistribution',
      'homework_current_assignment_status_distribution',
    ],
    [
      'homework.submission_review_trend',
      'homeworkRepository',
      'aggregateSubmissionReviewEventsByCivilDate',
      'homework_submission_review_trend',
    ],
    [
      'homework.grade_sync_coverage',
      'homeworkRepository',
      'countCurrentGradeSyncLinkCoverage',
      'homework_current_grade_sync_link_coverage',
    ],
  ] as const)(
    'dispatches %s to exactly one Grades/Homework aggregate',
    async (chartKey, repositoryName, expectedMethod, computation) => {
      const setup = useCaseWith(0);
      const response = await withSchoolScope(() =>
        setup.useCase.execute(chartKey, {}),
      );

      expect(response.meta).toMatchObject({
        pack: 'grades_homework_v1',
        computation,
      });
      for (const name of ['gradesRepository', 'homeworkRepository'] as const) {
        for (const [method, mock] of Object.entries(setup[name])) {
          if (name === repositoryName && method === expectedMethod) {
            expect(mock).toHaveBeenCalledTimes(1);
          } else {
            expect(mock).not.toHaveBeenCalled();
          }
        }
      }
      expect(setup.snapshotRepository.loadChartValue).not.toHaveBeenCalled();
      expectNoInternalLeaks(response);
    },
  );

  it('keeps existing Grades snapshots on the operational pack without new repository fanout', async () => {
    const setup = useCaseWith(4);
    const response = await withSchoolScope(() =>
      setup.useCase.execute('grades.pending_submission_reviews', {}),
    );
    expect(response.meta.pack).toBe('operational_snapshot_v1');
    for (const repository of [
      setup.gradesRepository,
      setup.homeworkRepository,
      setup.behaviorRepository,
      setup.reinforcementRepository,
    ]) {
      for (const mock of Object.values(repository)) {
        expect(mock).not.toHaveBeenCalled();
      }
    }
  });

  it.each([
    [
      'behavior.positive_negative_trend',
      'behaviorRepository',
      'aggregateApprovedRecordTypesByCivilDate',
      'behavior_approved_positive_negative_trend',
    ],
    [
      'behavior.pending_review',
      'behaviorRepository',
      'countCurrentPendingReview',
      'behavior_current_pending_review',
    ],
    [
      'behavior.records_by_category',
      'behaviorRepository',
      'countApprovedRecordsByCategory',
      'behavior_approved_records_by_category',
    ],
    [
      'reinforcement.xp_activity_trend',
      'reinforcementRepository',
      'aggregateXpActivityByCivilDate',
      'reinforcement_xp_activity_trend',
    ],
    [
      'reinforcement.task_completion',
      'reinforcementRepository',
      'countCurrentAssignmentCompletion',
      'reinforcement_current_assignment_completion',
    ],
    [
      'reinforcement.reward_redemption_status',
      'reinforcementRepository',
      'countRewardRedemptionFunnel',
      'reinforcement_reward_redemption_funnel',
    ],
  ] as const)(
    'dispatches %s to exactly one Behavior/Reinforcement aggregate',
    async (chartKey, repositoryName, expectedMethod, computation) => {
      const setup = useCaseWith(0);
      const response = await withSchoolScope(() =>
        setup.useCase.execute(chartKey, {}),
      );

      expect(response.meta).toMatchObject({
        pack: 'behavior_reinforcement_v1',
        computation,
      });
      for (const name of [
        'behaviorRepository',
        'reinforcementRepository',
      ] as const) {
        for (const [method, mock] of Object.entries(setup[name])) {
          if (name === repositoryName && method === expectedMethod) {
            expect(mock).toHaveBeenCalledTimes(1);
          } else {
            expect(mock).not.toHaveBeenCalled();
          }
        }
      }
      expect(setup.snapshotRepository.loadChartValue).not.toHaveBeenCalled();
      expectNoInternalLeaks(response);
    },
  );

  it.each([
    [
      'academics.teacher_allocation_coverage',
      'countTeacherAllocationCoverage',
      'academics_teacher_allocation_coverage',
    ],
    [
      'academics.timetable_publication_status',
      'countCurrentTimetablePublicationStatus',
      'academics_current_timetable_publication_status',
    ],
    [
      'academics.curriculum_activation',
      'countCurrentCurriculumActivationStatus',
      'academics_current_curriculum_activation_status',
    ],
    [
      'academics.lesson_plan_activation',
      'countCurrentLessonPlanActivationStatus',
      'academics_current_lesson_plan_activation_status',
    ],
  ] as const)(
    'dispatches %s only to %s',
    async (chartKey, expectedMethod, computation) => {
      const setup = useCaseWith(0);
      const response = await withSchoolScope(() =>
        setup.useCase.execute(chartKey, {}),
      );

      expect(response.meta).toMatchObject({
        pack: 'academics_v1',
        computation,
        dataAvailability: 'computed_category',
      });
      for (const [method, mock] of Object.entries(setup.academicsRepository)) {
        if (method === expectedMethod) {
          expect(mock).toHaveBeenCalledTimes(1);
        } else {
          expect(mock).not.toHaveBeenCalled();
        }
      }
      expect(setup.snapshotRepository.loadChartValue).not.toHaveBeenCalled();
      expect(
        setup.attendanceRepository.aggregateDailyEntryStatuses,
      ).not.toHaveBeenCalled();
      expectNoInternalLeaks(response);
    },
  );

  it.each([
    'academics.structure_readiness',
    'academics.subject_allocation_coverage',
  ])(
    'keeps %s definition-only without Academics repository fanout',
    async (chartKey) => {
      const setup = useCaseWith(0);
      const response = await withSchoolScope(() =>
        setup.useCase.execute(chartKey, {}),
      );

      expect(response).toMatchObject({
        status: 'planned',
        emptyState: { reason: 'not_implemented' },
        meta: { pack: null, dataAvailability: 'definition_only' },
      });
      for (const mock of Object.values(setup.academicsRepository)) {
        expect(mock).not.toHaveBeenCalled();
      }
    },
  );

  it('keeps a definition-only chart safe while returning resolved query metadata', async () => {
    const context = queryContext({
      range: 'custom',
      granularity: 'week',
      explicitlySuppliedKeys: ['range', 'granularity', 'dateFrom', 'dateTo'],
      filtersApplied: ['range', 'granularity', 'dateFrom', 'dateTo'],
      filtersNotApplicable: [],
      startCivilDate: '2026-07-01',
      endCivilDate: '2026-07-09',
    });
    const { useCase, queryContextService, snapshotRepository } = useCaseWith(0);
    queryContextService.resolve.mockResolvedValue(context);

    const response = await withSchoolScope(() =>
      useCase.execute('admissions.funnel', {
        range: 'custom',
        granularity: 'week',
        dateFrom: '2026-07-01',
        dateTo: '2026-07-09',
      }),
    );

    expect(response).toMatchObject({
      chartKey: 'admissions.funnel',
      status: 'planned',
      range: 'custom',
      granularity: 'week',
      data: { series: [], totals: {}, summary: null, empty: true },
      emptyState: { reason: 'not_implemented' },
      meta: {
        pack: null,
        dataAvailability: 'definition_only',
        query: {
          requestedFilters: ['range', 'granularity', 'dateFrom', 'dateTo'],
          appliedFilters: ['range', 'granularity', 'dateFrom', 'dateTo'],
          notApplicableFilters: [],
        },
      },
    });
    expect(snapshotRepository.loadChartValue).not.toHaveBeenCalled();
    expectNoInternalLeaks(response);
  });

  it('dispatches Attendance entry charts only to the bounded daily aggregate source', async () => {
    const { useCase, snapshotRepository, attendanceRepository } =
      useCaseWith(0);
    attendanceRepository.aggregateDailyEntryStatuses.mockResolvedValue([
      {
        date: '2026-07-12',
        status: AttendanceStatus.PRESENT,
        count: 2,
      },
    ]);

    const response = await withSchoolScope(() =>
      useCase.execute('attendance.daily_trend', {}),
    );

    expect(response).toMatchObject({
      chartKey: 'attendance.daily_trend',
      meta: {
        pack: 'attendance_v1',
        dataAvailability: 'computed_series',
        computation: 'attendance_observation_daily_trend',
      },
      data: {
        totals: { present: 2, absent: 0, late: 0 },
        summary: { value: 2 },
        empty: false,
      },
    });
    expect(
      attendanceRepository.aggregateDailyEntryStatuses,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: expect.objectContaining({ schoolId: 'school-1' }),
        hierarchy: expect.objectContaining({
          academicYearId: expect.any(String),
        }),
      }),
    );
    expect(attendanceRepository.aggregateExcuseStatuses).not.toHaveBeenCalled();
    expect(snapshotRepository.loadChartValue).not.toHaveBeenCalled();
    expectNoInternalLeaks(response);
  });

  it('dispatches excuse status only to the scoped category aggregate source', async () => {
    const { useCase, snapshotRepository, attendanceRepository } =
      useCaseWith(0);
    attendanceRepository.aggregateExcuseStatuses.mockResolvedValue([
      { status: AttendanceExcuseStatus.PENDING, count: 3 },
    ]);

    const response = await withSchoolScope(() =>
      useCase.execute('attendance.excuse_status', {}),
    );

    expect(response).toMatchObject({
      chartKey: 'attendance.excuse_status',
      meta: {
        pack: 'attendance_v1',
        dataAvailability: 'computed_category',
        computation: 'attendance_excuse_status_distribution',
      },
      data: {
        totals: { pending: 3, approved: 0, rejected: 0 },
      },
    });
    expect(attendanceRepository.aggregateExcuseStatuses).toHaveBeenCalled();
    expect(
      attendanceRepository.aggregateDailyEntryStatuses,
    ).not.toHaveBeenCalled();
    expect(snapshotRepository.loadChartValue).not.toHaveBeenCalled();
    expectNoInternalLeaks(response);
  });

  it.each([
    [
      'admissions.applications_by_status',
      'countCurrentApplicationsByStatus',
      'admissions_current_application_status_distribution',
    ],
    [
      'admissions.applications_over_time',
      'aggregateApplicationEventsByCivilDate',
      'admissions_application_submission_acceptance_events',
    ],
    [
      'students.enrollment_growth',
      'countActiveEnrollmentsAtBucketCloses',
      'students_point_in_time_active_enrollment_stock',
    ],
    [
      'students.withdrawal_trend',
      'aggregateWithdrawalsByCivilDate',
      'students_withdrawal_events',
    ],
    [
      'students.guardian_coverage',
      'countCurrentGuardianCoverage',
      'students_current_guardian_coverage',
    ],
  ] as const)(
    'dispatches %s only to %s',
    async (chartKey, expectedMethod, computation) => {
      const setup = useCaseWith(0);
      const response = await withSchoolScope(() =>
        setup.useCase.execute(chartKey, {}),
      );

      expect(response.meta).toMatchObject({
        pack: 'admissions_students_v1',
        computation,
      });
      const allMethods = {
        ...setup.admissionsRepository,
        ...setup.studentsRepository,
      };
      for (const [method, mock] of Object.entries(allMethods)) {
        if (method === expectedMethod) {
          expect(mock).toHaveBeenCalledTimes(1);
        } else {
          expect(mock).not.toHaveBeenCalled();
        }
      }
      expect(setup.snapshotRepository.loadChartValue).not.toHaveBeenCalled();
      expect(
        setup.attendanceRepository.aggregateDailyEntryStatuses,
      ).not.toHaveBeenCalled();
      expect(
        setup.attendanceRepository.aggregateExcuseStatuses,
      ).not.toHaveBeenCalled();
      expectNoInternalLeaks(response);
    },
  );

  it('throws safe not-found for unknown chart keys before query resolution', async () => {
    const { useCase, queryContextService } = useCaseWith(0);

    await expect(
      withSchoolScope(() => useCase.execute('unknown.chart', {})),
    ).rejects.toBeInstanceOf(NotFoundDomainException);
    expect(queryContextService.resolve).not.toHaveBeenCalled();
  });

  it('normalizes valid defaults and rejects invalid values instead of rewriting them', () => {
    expect(normalizeDashboardAnalyticsChartDataQuery({})).toEqual({
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
    expect(() =>
      normalizeDashboardAnalyticsChartDataQuery({
        range: 'wallet',
      } as any),
    ).toThrow(ValidationDomainException);
  });

  it('rejects callers without an active school scope', async () => {
    const { useCase } = useCaseWith(0);

    await expect(
      runWithRequestContext(createRequestContext(), async () => {
        setActor({ id: 'platform-user', userType: UserType.PLATFORM_USER });
        return useCase.execute('attendance.pending_sessions', {});
      }),
    ).rejects.toBeInstanceOf(ScopeMissingException);
  });
});

function useCaseWith(snapshotValue: number) {
  const queryContextService = {
    resolve: jest.fn().mockResolvedValue(queryContext()),
  };
  const snapshotRepository = {
    loadChartValue: jest.fn().mockResolvedValue(snapshotValue),
  };
  const attendanceRepository = {
    aggregateDailyEntryStatuses: jest.fn().mockResolvedValue([]),
    aggregateExcuseStatuses: jest.fn().mockResolvedValue([]),
  };
  const admissionsRepository = {
    countCurrentApplicationsByStatus: jest.fn().mockResolvedValue([]),
    aggregateApplicationEventsByCivilDate: jest.fn().mockResolvedValue([]),
  };
  const studentsRepository = {
    countActiveEnrollmentsAtBucketCloses: jest.fn().mockResolvedValue([]),
    aggregateWithdrawalsByCivilDate: jest.fn().mockResolvedValue([]),
    countCurrentGuardianCoverage: jest
      .fn()
      .mockResolvedValue({ covered: 0, missing: 0 }),
  };
  const academicsRepository = {
    countTeacherAllocationCoverage: jest
      .fn()
      .mockResolvedValue({ allocated: 0, missing: 0 }),
    countCurrentTimetablePublicationStatus: jest
      .fn()
      .mockResolvedValue({ published: 0, draft: 0 }),
    countCurrentCurriculumActivationStatus: jest
      .fn()
      .mockResolvedValue({ active: 0, draft: 0 }),
    countCurrentLessonPlanActivationStatus: jest
      .fn()
      .mockResolvedValue({ active: 0, draft: 0 }),
  };
  const gradesRepository = {
    countCurrentAssessmentStatusDistribution: jest
      .fn()
      .mockResolvedValue({ draft: 0, published: 0, approved: 0, locked: 0 }),
    countCurrentGradebookCompletion: jest
      .fn()
      .mockResolvedValue({ complete: 0, missing: 0 }),
  };
  const homeworkRepository = {
    countCurrentAssignmentStatusDistribution: jest.fn().mockResolvedValue({
      draft: 0,
      published: 0,
      closed: 0,
      cancelled: 0,
    }),
    aggregateSubmissionReviewEventsByCivilDate: jest.fn().mockResolvedValue([]),
    countCurrentGradeSyncLinkCoverage: jest
      .fn()
      .mockResolvedValue({ linked: 0, pending: 0 }),
  };
  const behaviorRepository = {
    aggregateApprovedRecordTypesByCivilDate: jest.fn().mockResolvedValue([]),
    countCurrentPendingReview: jest.fn().mockResolvedValue(0),
    countApprovedRecordsByCategory: jest.fn().mockResolvedValue([]),
  };
  const reinforcementRepository = {
    aggregateXpActivityByCivilDate: jest.fn().mockResolvedValue([]),
    countCurrentAssignmentCompletion: jest
      .fn()
      .mockResolvedValue({ completed: 0, pending: 0, overdue: 0 }),
    countRewardRedemptionFunnel: jest
      .fn()
      .mockResolvedValue({ requested: 0, approved: 0, fulfilled: 0 }),
  };
  const communicationRepository = {
    aggregateMessageVolumeByCivilDate: jest.fn().mockResolvedValue([]),
    countCurrentAnnouncementsByStatus: jest.fn().mockResolvedValue({
      draft: 0,
      scheduled: 0,
      published: 0,
      archived: 0,
      cancelled: 0,
    }),
  };

  return {
    queryContextService,
    snapshotRepository,
    attendanceRepository,
    admissionsRepository,
    studentsRepository,
    academicsRepository,
    gradesRepository,
    homeworkRepository,
    behaviorRepository,
    reinforcementRepository,
    communicationRepository,
    useCase: new GetDashboardAnalyticsChartDataUseCase(
      queryContextService as any,
      snapshotRepository as any,
      attendanceRepository as any,
      admissionsRepository as any,
      studentsRepository as any,
      academicsRepository as any,
      gradesRepository as any,
      homeworkRepository as any,
      behaviorRepository as any,
      reinforcementRepository as any,
      communicationRepository as any,
    ),
  };
}

function queryContext(
  overrides: Partial<DashboardAnalyticsQueryContext> = {},
): DashboardAnalyticsQueryContext {
  return {
    generatedAt: new Date('2026-07-11T22:30:00.000Z'),
    timezone: 'Africa/Cairo',
    range: '30d',
    granularity: 'day',
    startInclusive: new Date('2026-06-12T21:00:00.000Z'),
    endExclusive: new Date('2026-07-12T21:00:00.000Z'),
    startCivilDate: '2026-06-13',
    endCivilDate: '2026-07-12',
    hierarchy: {
      academicYearId: '11111111-1111-4111-8111-111111111111',
      termId: '22222222-2222-4222-8222-222222222222',
      gradeId: null,
      sectionId: null,
      classroomId: null,
    },
    explicitlySuppliedKeys: [],
    filtersApplied: ['academicYearId', 'termId'],
    filtersNotApplicable: ['range', 'granularity'],
    ...overrides,
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
}
