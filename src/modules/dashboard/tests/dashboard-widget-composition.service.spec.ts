import {
  DashboardTodoPriority,
  DashboardTodoStatus,
  UserType,
} from '@prisma/client';
import { DashboardWidgetCompositionService } from '../application/dashboard-widget-composition.service';
import { GetDashboardAnalyticsChartDataUseCase } from '../application/get-dashboard-analytics-chart-data.use-case';
import { DashboardScope } from '../dashboard-context';
import { DashboardAnalyticsChartDataResponseDto } from '../dto/dashboard-analytics-data.dto';
import {
  buildDashboardWidgetCompositionPlan,
  DashboardWidgetAnalyticsChartKey,
} from '../domain/dashboard-widget-composition';
import {
  DASHBOARD_WIDGET_REGISTRY,
  findDashboardWidgetDefinition,
  DashboardWidgetDefinition,
} from '../domain/dashboard-widget-registry';
import { buildDashboardTimeContext } from '../domain/dashboard-time-context';
import { DashboardActivityFeedRepository } from '../infrastructure/dashboard-activity-feed.repository';
import { DashboardAlertsRepository } from '../infrastructure/dashboard-alerts.repository';
import { DashboardSummaryRepository } from '../infrastructure/dashboard-summary.repository';
import { DashboardTodosRepository } from '../infrastructure/dashboard-todos.repository';

const GENERATED_AT = new Date('2026-07-11T22:30:00.000Z');
const TIME_CONTEXT = buildDashboardTimeContext({
  generatedAt: GENERATED_AT,
  schoolTimezone: 'Africa/Cairo',
});
const SCOPE: DashboardScope = {
  actorId: 'user-1',
  userType: UserType.SCHOOL_USER,
  organizationId: 'org-1',
  schoolId: 'school-1',
  roleId: 'role-1',
};

describe('DashboardWidgetCompositionService', () => {
  it.each([
    [
      'students.active',
      { loadSummary: true, loadAlerts: false, loadActivity: false },
    ],
    [
      'settings.email_connection',
      { loadSummary: false, loadAlerts: true, loadActivity: false },
    ],
    [
      'activity.recent',
      { loadSummary: false, loadAlerts: false, loadActivity: true },
    ],
  ] as const)('builds the exact dependency plan for %s', (key, expected) => {
    expect(buildDashboardWidgetCompositionPlan(definitions(key))).toMatchObject(
      {
        ...expected,
        loadTodos: false,
        analytics: [],
      },
    );
  });

  it('loads only Summary for a Summary widget and preserves active school scope', async () => {
    const fixture = fixtureService();
    const widgets = await fixture.service.compose({
      scope: SCOPE,
      timeContext: TIME_CONTEXT,
      definitions: definitions('students.active'),
    });

    expect(widgets[0]).toMatchObject({
      widgetKey: 'students.active',
      data: { value: 12 },
    });
    expect(fixture.summary.loadSummarySnapshot).toHaveBeenCalledWith(SCOPE, {
      now: GENERATED_AT,
      todayDate: new Date('2026-07-12T00:00:00.000Z'),
      todayStart: new Date('2026-07-11T21:00:00.000Z'),
      todayEndExclusive: new Date('2026-07-12T21:00:00.000Z'),
      last7DaysStart: new Date('2026-07-04T21:00:00.000Z'),
      last30DaysStart: new Date('2026-06-11T21:00:00.000Z'),
    });
    expectOnlyCalls(fixture, { summary: 1 });
  });

  it('loads only Alerts for settings and only Activity for activity', async () => {
    const settings = fixtureService();
    await settings.service.compose({
      scope: SCOPE,
      timeContext: TIME_CONTEXT,
      definitions: definitions('settings.email_connection'),
    });
    expectOnlyCalls(settings, { alerts: 1 });
    expect(settings.alerts.loadAlertSignals).toHaveBeenCalledWith(SCOPE, {
      now: GENERATED_AT,
      todayDate: new Date('2026-07-12T00:00:00.000Z'),
      todayStart: new Date('2026-07-11T21:00:00.000Z'),
      todayEndExclusive: new Date('2026-07-12T21:00:00.000Z'),
      last30DaysStart: new Date('2026-06-11T21:00:00.000Z'),
      next7DaysEndExclusive: new Date('2026-07-18T22:30:00.000Z'),
    });

    const activity = fixtureService();
    const widgets = await activity.service.compose({
      scope: SCOPE,
      timeContext: TIME_CONTEXT,
      definitions: definitions('activity.recent'),
    });
    expectOnlyCalls(activity, { activity: 1 });
    expect(activity.activity.listActivityAuditRecords).toHaveBeenCalledWith(
      SCOPE,
      { take: 20 },
    );
    expect(widgets[0].data.items as unknown[]).toHaveLength(5);
    expect(JSON.stringify(widgets[0])).not.toMatch(
      /actorId|resourceId|actor-0|resource-0/,
    );
  });

  it('shares one Todo list/count pair between Todo and Calendar', async () => {
    const fixture = fixtureService();
    const widgets = await fixture.service.compose({
      scope: SCOPE,
      timeContext: TIME_CONTEXT,
      definitions: definitions('todos.today', 'calendar.today'),
    });

    expect(fixture.todos.listOwnedTodos).toHaveBeenCalledTimes(1);
    expect(fixture.todos.countOwnedTodos).toHaveBeenCalledTimes(1);
    expect(fixture.todos.listOwnedTodos).toHaveBeenCalledWith(SCOPE, {
      date: new Date('2026-07-12T00:00:00.000Z'),
      limit: 5,
    });
    expect(widgets.map((widget) => widget.widgetKey)).toEqual([
      'todos.today',
      'calendar.today',
    ]);
    expectOnlyCalls(fixture, { todoList: 1, todoCount: 1 });
  });

  it('deduplicates Analytics keys, preserves selection order, and shares generatedAt', async () => {
    const fixture = fixtureService();
    const selected = definitions(
      'students.enrollment_growth',
      'attendance.daily_trend',
      'students.enrollment_growth',
    );
    const widgets = await fixture.service.compose({
      scope: SCOPE,
      timeContext: TIME_CONTEXT,
      definitions: selected,
    });

    expect(fixture.analytics.execute).toHaveBeenCalledTimes(2);
    expect(fixture.analytics.execute.mock.calls.map((call) => call[0])).toEqual(
      ['students.enrollment_growth', 'attendance.daily_trend'],
    );
    for (const call of fixture.analytics.execute.mock.calls) {
      expect(call[2]).toBe(TIME_CONTEXT.generatedAt);
    }
    expect(widgets.map((widget) => widget.widgetKey)).toEqual(
      selected.map((definition) => definition.widgetKey),
    );
    expectOnlyCalls(fixture, { analytics: 2 });
  });

  it('performs zero source calls for an empty definition list', async () => {
    const fixture = fixtureService();
    await expect(
      fixture.service.compose({
        scope: SCOPE,
        timeContext: TIME_CONTEXT,
        definitions: [],
      }),
    ).resolves.toEqual([]);
    expectOnlyCalls(fixture, {});
  });

  it('passes active academic-year and term IDs explicitly to Gradebook Analytics', async () => {
    const fixture = fixtureService();

    const [widget] = await fixture.service.compose({
      scope: SCOPE,
      timeContext: TIME_CONTEXT,
      definitions: definitions('grades.gradebook_completion'),
    });

    expect(fixture.summary.loadSummarySnapshot).toHaveBeenCalledTimes(1);
    expect(fixture.analytics.execute).toHaveBeenCalledWith(
      'grades.gradebook_completion',
      {
        range: '30d',
        granularity: 'day',
        academicYearId: '11111111-1111-4111-8111-111111111111',
        termId: '22222222-2222-4222-8222-222222222222',
      },
      TIME_CONTEXT.generatedAt,
    );
    expect(widget).toMatchObject({
      tone: 'neutral',
      data: { value: 0, max: 0, percent: 0 },
    });
    expect(JSON.stringify(widget)).not.toMatch(/academicYearId|termId/);
  });

  it.each([
    ['missing year', null, activeTerm()],
    ['missing term', activeAcademicYear(), null],
    ['missing both', null, null],
  ] as const)(
    'renders Gradebook as not configured and skips Analytics when %s',
    async (_label, academicYear, term) => {
      const fixture = fixtureService({ academicYear, term });

      const [widget] = await fixture.service.compose({
        scope: SCOPE,
        timeContext: TIME_CONTEXT,
        definitions: definitions('grades.gradebook_completion'),
      });

      expect(fixture.summary.loadSummarySnapshot).toHaveBeenCalledTimes(1);
      expect(fixture.analytics.execute).not.toHaveBeenCalled();
      expect(widget).toMatchObject({
        widgetKey: 'grades.gradebook_completion',
        tone: 'neutral',
        data: {
          status: 'not_configured',
          value: null,
          max: null,
          percent: null,
          segments: [],
        },
        emptyState: {
          title: 'Academic context required',
        },
      });
    },
  );

  it('keeps the complete 19-widget registry successful without academic context', async () => {
    const fixture = fixtureService({ academicYear: null, term: null });

    const widgets = await fixture.service.compose({
      scope: SCOPE,
      timeContext: TIME_CONTEXT,
      definitions: DASHBOARD_WIDGET_REGISTRY,
    });

    expect(widgets).toHaveLength(19);
    expect(
      widgets.find(
        (widget) => widget.widgetKey === 'grades.gradebook_completion',
      ),
    ).toMatchObject({ data: { status: 'not_configured' } });
    expect(fixture.analytics.execute).toHaveBeenCalledTimes(4);
  });
});

function fixtureService(
  academicContext: {
    academicYear: ReturnType<typeof activeAcademicYear> | null;
    term: ReturnType<typeof activeTerm> | null;
  } = {
    academicYear: activeAcademicYear(),
    term: activeTerm(),
  },
) {
  const summary = {
    loadSummarySnapshot: jest
      .fn()
      .mockResolvedValue(summarySnapshot(academicContext)),
    createAuditLog: jest.fn(),
  };
  const alerts = {
    loadAlertSignals: jest.fn().mockResolvedValue({
      settings: { missingActiveEmailConnection: 1, missingLoginIdentity: 0 },
    }),
    updateDashboardAlert: jest.fn(),
  };
  const activity = {
    listActivityAuditRecords: jest
      .fn()
      .mockResolvedValue(
        Array.from({ length: 7 }, (_, index) => auditRecord(index)),
      ),
  };
  const todos = {
    listOwnedTodos: jest.fn().mockResolvedValue([todo()]),
    countOwnedTodos: jest
      .fn()
      .mockResolvedValue({ total: 1, pending: 1, completed: 0 }),
  };
  const analytics = {
    execute: jest.fn(
      (
        chartKey: DashboardWidgetAnalyticsChartKey,
        query: unknown,
        generatedAt?: Date,
      ) => {
        void query;
        void generatedAt;
        return Promise.resolve(analyticsResponse(chartKey));
      },
    ),
  };

  return {
    summary,
    alerts,
    activity,
    todos,
    analytics,
    service: new DashboardWidgetCompositionService(
      summary as unknown as DashboardSummaryRepository,
      alerts as unknown as DashboardAlertsRepository,
      activity as unknown as DashboardActivityFeedRepository,
      todos as unknown as DashboardTodosRepository,
      analytics as unknown as GetDashboardAnalyticsChartDataUseCase,
    ),
  };
}

function definitions(...keys: string[]): DashboardWidgetDefinition[] {
  return keys.map((key) => {
    const definition = findDashboardWidgetDefinition(key);
    if (!definition) throw new Error(`Missing test definition: ${key}`);
    return definition;
  });
}

function expectOnlyCalls(
  fixture: ReturnType<typeof fixtureService>,
  expected: Partial<
    Record<
      | 'summary'
      | 'alerts'
      | 'activity'
      | 'todoList'
      | 'todoCount'
      | 'analytics',
      number
    >
  >,
) {
  expect(fixture.summary.loadSummarySnapshot).toHaveBeenCalledTimes(
    expected.summary ?? 0,
  );
  expect(fixture.alerts.loadAlertSignals).toHaveBeenCalledTimes(
    expected.alerts ?? 0,
  );
  expect(fixture.activity.listActivityAuditRecords).toHaveBeenCalledTimes(
    expected.activity ?? 0,
  );
  expect(fixture.todos.listOwnedTodos).toHaveBeenCalledTimes(
    expected.todoList ?? 0,
  );
  expect(fixture.todos.countOwnedTodos).toHaveBeenCalledTimes(
    expected.todoCount ?? 0,
  );
  expect(fixture.analytics.execute).toHaveBeenCalledTimes(
    expected.analytics ?? 0,
  );
  expect(fixture.summary.createAuditLog).not.toHaveBeenCalled();
  expect(fixture.alerts.updateDashboardAlert).not.toHaveBeenCalled();
}

function auditRecord(index: number) {
  return {
    id: `activity-${index}`,
    actorId: `actor-${index}`,
    userType: UserType.SCHOOL_USER,
    module: 'homework',
    action: 'homework.submission.review',
    resourceType: 'homework_submission',
    resourceId: `resource-${index}`,
    createdAt: new Date(GENERATED_AT.getTime() - index * 1000),
    actor: { id: `actor-${index}`, firstName: 'Teacher', lastName: `${index}` },
  };
}

function todo() {
  return {
    id: 'todo-1',
    date: new Date('2026-07-12T00:00:00.000Z'),
    title: 'Review reports',
    notes: 'private',
    status: DashboardTodoStatus.PENDING,
    priority: DashboardTodoPriority.HIGH,
    sortOrder: 0,
    completedAt: null,
    createdAt: GENERATED_AT,
    updatedAt: GENERATED_AT,
  };
}

function analyticsResponse(
  chartKey: DashboardWidgetAnalyticsChartKey,
): DashboardAnalyticsChartDataResponseDto {
  const totals =
    chartKey === 'academics.teacher_allocation_coverage'
      ? { allocated: 0, missing: 0 }
      : chartKey === 'grades.gradebook_completion'
        ? { complete: 0, missing: 0 }
        : {};
  return {
    chartKey,
    type: 'line',
    data: {
      series: [],
      totals,
      summary: { value: 0, label: 'Summary' },
      empty: true,
    },
    emptyState: { reason: 'no_data', message: 'No data found.' },
    meta: {
      dataAvailability: 'computed_series',
      pack: 'attendance_v1',
      computation: 'attendance_observation_daily_trend',
    },
  } as unknown as DashboardAnalyticsChartDataResponseDto;
}

function activeAcademicYear() {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    name: '2026/2027',
  };
}

function activeTerm() {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Term 1',
    academicYearId: '11111111-1111-4111-8111-111111111111',
  };
}

function summarySnapshot(academicContext: {
  academicYear: ReturnType<typeof activeAcademicYear> | null;
  term: ReturnType<typeof activeTerm> | null;
}) {
  return {
    generatedAt: GENERATED_AT,
    school: { name: 'School', timezone: 'Africa/Cairo', locale: null },
    academicContext,
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
        activeStudents: 12,
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
    },
  };
}
