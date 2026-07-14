import {
  AcademicCalendarEventType,
  DashboardTodoPriority,
  DashboardTodoStatus,
} from '@prisma/client';
import { DashboardAnalyticsChartDataResponseDto } from '../dto/dashboard-analytics-data.dto';
import { DashboardActivityFeedItemDto } from '../dto/dashboard-activity-feed.dto';
import { dashboardAnalyticsCivilDatePoint } from '../domain/dashboard-analytics-coordinate';
import {
  DASHBOARD_WIDGET_REGISTRY,
  findDashboardWidgetDefinition,
} from '../domain/dashboard-widget-registry';
import { DashboardAlertSignals } from '../infrastructure/dashboard-alerts.repository';
import { DashboardSummarySnapshot } from '../infrastructure/dashboard-summary.repository';
import {
  buildDashboardWidgetRegistry,
  presentDashboardWidget,
  presentDashboardWidgets,
} from '../presenters/dashboard-widgets.presenter';

const GENERATED_AT = new Date('2026-07-12T12:00:00.000Z');

describe('Dashboard widgets presenter', () => {
  it('preserves the original 12 widgets and appends the seven locked definitions', () => {
    expect(DASHBOARD_WIDGET_REGISTRY.map((item) => item.widgetKey)).toEqual([
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
      'students.enrollment_growth',
      'attendance.daily_trend',
      'communication.message_volume',
      'academics.teacher_allocation_coverage',
      'grades.gradebook_completion',
      'todos.today',
      'calendar.today',
    ]);
    expect(DASHBOARD_WIDGET_REGISTRY).toHaveLength(19);
    expect(
      DASHBOARD_WIDGET_REGISTRY.slice(0, 12).map((definition) => [
        definition.widgetKey,
        definition.type,
        definition.iconKey,
        definition.action.target,
      ]),
    ).toEqual([
      ['students.active', 'stat-card', 'users', '/students'],
      [
        'admissions.open_applications',
        'stat-card',
        'clipboard-list',
        '/admissions/applications',
      ],
      [
        'attendance.pending_today',
        'action-card',
        'calendar-check',
        '/attendance/roll-call',
      ],
      [
        'attendance.absences_today',
        'risk-card',
        'user-x',
        '/attendance/roll-call',
      ],
      [
        'homework.waiting_review',
        'action-card',
        'book-open-check',
        '/homework/submissions',
      ],
      [
        'grades.pending_review',
        'action-card',
        'graduation-cap',
        '/grades/submissions',
      ],
      [
        'behavior.pending_review',
        'action-card',
        'clipboard-check',
        '/behavior/review',
      ],
      [
        'reinforcement.pending_reviews',
        'action-card',
        'award',
        '/reinforcement/reviews',
      ],
      [
        'communication.moderation_queue',
        'risk-card',
        'message-square-warning',
        '/communication/moderation',
      ],
      [
        'settings.email_connection',
        'action-card',
        'mail-check',
        '/settings/email/connection',
      ],
      [
        'settings.login_identity',
        'action-card',
        'key-round',
        '/settings/login-identity',
      ],
      [
        'activity.recent',
        'timeline-card',
        'activity',
        '/dashboard/activity-feed',
      ],
    ]);
  });

  it('preserves real Analytics points and adds the safe Analytics reference', () => {
    const analytics = analyticsResponse('attendance.daily_trend', {
      series: [
        {
          key: 'present',
          label: 'Present',
          points: [
            dashboardAnalyticsCivilDatePoint('2026-07-11', 0),
            dashboardAnalyticsCivilDatePoint('2026-07-12', 7),
          ],
        },
      ],
      totals: { present: 7 },
      summary: { value: 7, label: 'Attendance observations' },
      empty: false,
    });
    const [widget] = compose(['attendance.daily_trend'], [analytics]);

    expect(widget.data).toEqual(analytics.data);
    expect(widget.data).not.toHaveProperty('delta');
    expect(widget.data).not.toHaveProperty('trend');
    expect(widget.meta).toMatchObject({
      freshnessDetails: { dataMode: 'request_time_snapshot' },
      analytics: {
        chartKey: 'attendance.daily_trend',
        chartType: 'line',
        definitionEndpoint:
          '/api/v1/dashboard/analytics/charts/attendance.daily_trend',
        dataEndpoint:
          '/api/v1/dashboard/analytics/charts/attendance.daily_trend/data',
        defaultRange: '30d',
        defaultGranularity: 'day',
        dataAvailability: 'computed_series',
        pack: 'attendance_v1',
      },
    });
    expect(widget.tone).toBe('info');
  });

  it('computes progress segments, tones, zero denominators, and two-decimal rounding', () => {
    const teacher = analyticsResponse(
      'academics.teacher_allocation_coverage',
      data({ allocated: 2, missing: 1 }),
    );
    const gradebook = analyticsResponse(
      'grades.gradebook_completion',
      data({ complete: 0, missing: 0 }),
    );
    const [teacherWidget, gradebookWidget] = compose(
      ['academics.teacher_allocation_coverage', 'grades.gradebook_completion'],
      [teacher, gradebook],
    );

    expect(teacherWidget.data).toEqual({
      value: 2,
      max: 3,
      percent: 66.67,
      unit: 'percent',
      label: 'Teacher allocation coverage',
      segments: [
        { key: 'allocated', label: 'Allocated', value: 2 },
        { key: 'missing', label: 'Missing', value: 1 },
      ],
    });
    expect(teacherWidget.tone).toBe('warning');
    expect(gradebookWidget.data).toMatchObject({
      value: 0,
      max: 0,
      percent: 0,
    });
    expect(gradebookWidget.tone).toBe('neutral');
  });

  it('uses strict Todo and combined Calendar allowlists with deterministic event order', () => {
    const widgets = compose(
      ['todos.today', 'calendar.today'],
      [],
      {
        date: '2026-07-12',
        items: [todo()],
        counts: { total: 1, pending: 1, completed: 0 },
      },
      calendarInput([calendarEvent()]),
    );

    expect(widgets[0].data).toEqual({
      date: '2026-07-12',
      items: [{ title: 'Review reports', status: 'pending', priority: 'high' }],
      summary: { total: 1, pending: 1, completed: 0 },
    });
    expect(widgets[1].data).toEqual({
      date: '2026-07-12',
      sourceMode: 'academic_calendar_and_todos',
      eventDates: ['2026-07-12'],
      events: [
        {
          source: 'academic_calendar',
          title: 'School exam',
          date: '2026-07-12',
          endDate: '2026-07-12',
          startTime: null,
          endTime: null,
          allDay: true,
          eventType: 'exam',
          status: null,
          priority: null,
          tone: 'warning',
          iconKey: 'clock',
        },
        {
          source: 'todo',
          title: 'Review reports',
          date: '2026-07-12',
          endDate: '2026-07-12',
          startTime: null,
          endTime: null,
          allDay: true,
          eventType: null,
          status: 'pending',
          priority: 'high',
          tone: 'warning',
          iconKey: 'list-todo',
        },
      ],
      summary: { total: 2, academicCalendar: 1, todos: 1 },
    });
    expect(JSON.stringify(widgets)).not.toMatch(
      /todoId|notes|completedAt|createdAt|updatedAt|sortOrder|ownerUserId/,
    );
    expect(widgets[0].meta.freshnessDetails.dataMode).toBe(
      'persisted_user_data',
    );
    expect(widgets[1].meta.freshnessDetails.dataMode).toBe(
      'request_time_snapshot',
    );
    expect(widgets[1].tone).toBe('warning');
  });

  it('returns stable empty Todo/Calendar data and exact capability metadata', () => {
    const widgets = compose(
      ['todos.today', 'calendar.today'],
      [],
      {
        date: '2026-07-12',
        items: [],
        counts: { total: 0, pending: 0, completed: 0 },
      },
      calendarInput([]),
    );
    const response = presentDashboardWidgets({
      generatedAt: GENERATED_AT,
      widgets,
      filters: { limit: 20 },
    });

    expect(widgets.map((widget) => widget.tone)).toEqual([
      'neutral',
      'neutral',
    ]);
    expect(widgets[1].data).toMatchObject({ eventDates: [], events: [] });
    expect(response.deferred).toEqual({
      customLayouts: 'deferred',
      widgetPreferences: 'deferred',
      analyticsCharts: 'available',
      weatherWidgets: 'deferred',
      todoWidgets: 'available',
      analyticsStandalone: 'available',
      todosStandalone: 'persisted',
      calendarTodoComposition: 'available',
      plannerCalendar: 'available',
      crossModulePlannerItems: 'deferred',
    });
    expect(
      presentDashboardWidget({ generatedAt: GENERATED_AT, widget: widgets[0] }),
    ).toMatchObject({
      generatedAt: GENERATED_AT.toISOString(),
      widget: widgets[0],
    });
  });

  it('caps Calendar and Todo sources independently at five and applies Calendar tone precedence', () => {
    const calendarEvents = Array.from({ length: 5 }, (_, index) => ({
      ...calendarEvent(`event-${index}`),
      title: `Calendar ${index}`,
    }));
    const todoItems = Array.from({ length: 5 }, (_, index) => ({
      ...todo(),
      id: `todo-${index}`,
      title: `Todo ${index}`,
      status: DashboardTodoStatus.COMPLETED,
    }));
    const [widget] = compose(
      ['calendar.today'],
      [],
      {
        date: '2026-07-12',
        items: todoItems,
        counts: { total: 5, pending: 0, completed: 5 },
      },
      calendarInput(calendarEvents),
    );

    expect(widget.data.events as unknown[]).toHaveLength(10);
    expect(widget.data).toMatchObject({
      summary: { total: 10, academicCalendar: 5, todos: 5 },
    });
    expect(
      (widget.data.events as Array<{ source: string }>).map(
        (event) => event.source,
      ),
    ).toEqual([
      'academic_calendar',
      'academic_calendar',
      'academic_calendar',
      'academic_calendar',
      'academic_calendar',
      'todo',
      'todo',
      'todo',
      'todo',
      'todo',
    ]);
    expect(widget.tone).toBe('info');
    expect(JSON.stringify(widget)).not.toMatch(
      /eventId|todoId|notes|sortOrder|completedAt|createdAt|updatedAt|academicYearId|termId|schoolId|organizationId|ownerUserId/,
    );
  });

  it.each([
    ['Todo only', [], [todo()], 'warning'],
    ['Calendar only', [calendarEvent()], [], 'info'],
    [
      'completed Todo only',
      [],
      [{ ...todo(), status: DashboardTodoStatus.COMPLETED }],
      'success',
    ],
    ['empty', [], [], 'neutral'],
  ] as const)(
    'maps the %s Calendar state and widget tone',
    (_label, calendarEvents, todoItems, tone) => {
      const typedCalendarEvents = [...calendarEvents] as ReturnType<
        typeof calendarEvent
      >[];
      const typedTodoItems = [...todoItems] as Array<
        Omit<ReturnType<typeof todo>, 'status'> & {
          status: DashboardTodoStatus;
        }
      >;
      const [widget] = compose(
        ['calendar.today'],
        [],
        {
          date: '2026-07-12',
          items: typedTodoItems,
          counts: {
            total: typedTodoItems.length,
            pending: typedTodoItems.filter(
              (item) => item.status === DashboardTodoStatus.PENDING,
            ).length,
            completed: typedTodoItems.filter(
              (item) => item.status === DashboardTodoStatus.COMPLETED,
            ).length,
          },
        },
        calendarInput(typedCalendarEvents),
      );
      expect(widget.tone).toBe(tone);
      expect(widget.data).toMatchObject({
        eventDates:
          typedCalendarEvents.length + typedTodoItems.length > 0
            ? ['2026-07-12']
            : [],
        summary: {
          total: typedCalendarEvents.length + typedTodoItems.length,
          academicCalendar: typedCalendarEvents.length,
          todos: typedTodoItems.length,
        },
      });
    },
  );

  it.each([
    ['missing', { missing: 2 }],
    ['non-finite', { allocated: Number.POSITIVE_INFINITY, missing: 2 }],
    ['negative', { allocated: -1, missing: 2 }],
  ])('rejects %s required Analytics totals', (_case, totals) => {
    const response = analyticsResponse(
      'academics.teacher_allocation_coverage',
      data(totals),
    );

    expect(() =>
      compose(['academics.teacher_allocation_coverage'], [response]),
    ).toThrow('Dashboard widget Analytics total is invalid: allocated');
  });

  it('throws when a selected definition is missing its required source result', () => {
    expect(() => compose(['attendance.daily_trend'])).toThrow(
      'Dashboard widget analytics data is missing: attendance.daily_trend',
    );
    expect(() =>
      buildDashboardWidgetRegistry({
        generatedAt: GENERATED_AT,
        definitions: [requireDefinition('students.active')],
        summary: null,
        alertSignals: null,
        activityItems: [],
      }),
    ).toThrow('Dashboard widget summary data is missing');
  });
});

describe('Dashboard widgets legacy 12 regression', () => {
  it('preserves exact original Widget behavior, actions, tones, and freshness', () => {
    const widgets = composeLegacy(
      legacySnapshot(),
      legacySignals({
        settings: {
          missingLoginIdentity: 1,
          missingActiveEmailConnection: 0,
        },
      }),
    );

    expect(findWidget(widgets, 'students.active')).toEqual(
      expect.objectContaining({
        type: 'stat-card',
        source: 'students',
        title: 'Active students',
        iconKey: 'users',
        tone: 'info',
        data: { value: 120, unit: null, label: 'Active students' },
        action: {
          label: 'Open students',
          target: '/students',
          kind: 'frontend-route',
        },
        emptyState: null,
        meta: {
          freshness: 'live',
          freshnessDetails: {
            dataMode: 'request_time_snapshot',
            cacheStatus: 'not_used',
            realtimeStatus: 'not_used',
          },
          analytics: null,
        },
      }),
    );
    expect(findWidget(widgets, 'admissions.open_applications')).toMatchObject({
      tone: 'warning',
      data: { value: 4, unit: null, label: 'Open applications' },
    });
    expect(findWidget(widgets, 'attendance.pending_today')).toMatchObject({
      tone: 'warning',
      data: { value: 3, status: 'needs_review' },
    });
    expect(findWidget(widgets, 'attendance.absences_today')).toMatchObject({
      tone: 'critical',
      data: { count: 2, riskLevel: 'critical' },
    });
    expect(findWidget(widgets, 'homework.waiting_review')).toMatchObject({
      tone: 'warning',
      data: { value: 3, status: 'needs_review' },
    });
    expect(findWidget(widgets, 'grades.pending_review')).toMatchObject({
      tone: 'warning',
      data: { value: 6, status: 'needs_review' },
    });
    expect(findWidget(widgets, 'behavior.pending_review')).toMatchObject({
      tone: 'warning',
      data: { value: 1, status: 'needs_review' },
    });
    expect(findWidget(widgets, 'reinforcement.pending_reviews')).toMatchObject({
      tone: 'warning',
      data: { value: 2, status: 'needs_review' },
    });
    expect(findWidget(widgets, 'communication.moderation_queue')).toMatchObject(
      { tone: 'critical', data: { count: 1, riskLevel: 'critical' } },
    );
    expect(findWidget(widgets, 'settings.email_connection')).toMatchObject({
      tone: 'success',
      data: { value: 'active', status: 'active' },
    });
    expect(findWidget(widgets, 'settings.login_identity')).toMatchObject({
      tone: 'warning',
      data: { value: 'not_configured', status: 'not_configured' },
    });
  });

  it('preserves zero/minimal Summary and clear-state behavior', () => {
    const snapshot = legacySnapshot();
    snapshot.academicContext = { academicYear: null, term: null };
    snapshot.cards = legacyZeroCards();
    const widgets = composeLegacy(
      snapshot,
      legacySignals({
        settings: {
          missingLoginIdentity: 1,
          missingActiveEmailConnection: 1,
        },
      }),
    );

    expect(widgets).toHaveLength(12);
    expect(findWidget(widgets, 'students.active')).toMatchObject({
      data: { value: 0, unit: null, label: 'Active students' },
    });
    expect(findWidget(widgets, 'admissions.open_applications').tone).toBe(
      'success',
    );
    expect(findWidget(widgets, 'attendance.pending_today').tone).toBe(
      'success',
    );
    expect(findWidget(widgets, 'attendance.absences_today').tone).toBe(
      'success',
    );
    expect(findWidget(widgets, 'homework.waiting_review').tone).toBe('success');
    expect(findWidget(widgets, 'grades.pending_review').tone).toBe('success');
    expect(findWidget(widgets, 'behavior.pending_review').tone).toBe('success');
    expect(findWidget(widgets, 'reinforcement.pending_reviews').tone).toBe(
      'success',
    );
    expect(findWidget(widgets, 'communication.moderation_queue').tone).toBe(
      'success',
    );
    expect(findWidget(widgets, 'activity.recent')).toMatchObject({
      data: { items: [], count: 0 },
    });
  });

  it('preserves the safe Activity preview allowlist', () => {
    const unsafeActivity = {
      ...legacyActivityItem(),
      actor: {
        id: 'actor-1',
        displayName: 'Teacher One',
        type: 'teacher',
      },
      subject: {
        type: 'homework_submission',
        id: 'submission-1',
        label: 'Homework Submission',
      },
      schoolId: 'school-1',
      organizationId: 'org-1',
      raw: { auditLogId: 'audit-1' },
    } as DashboardActivityFeedItemDto;
    const widgets = composeLegacy(legacySnapshot(), legacySignals(), [
      unsafeActivity,
    ]);
    const activity = findWidget(widgets, 'activity.recent');

    expect(activity).toMatchObject({
      data: {
        count: 1,
        items: [
          {
            source: 'homework',
            eventType: 'homework.submission.review',
            actor: { displayName: 'Teacher One', type: 'teacher' },
            subject: {
              type: 'homework_submission',
              label: 'Homework Submission',
            },
          },
        ],
      },
    });
    const serialized = JSON.stringify(activity);
    for (const forbidden of [
      'schoolId',
      'organizationId',
      'membershipId',
      'roleId',
      'actorId',
      'resourceId',
      'actor-1',
      'submission-1',
      'auditLogId',
      'raw',
      'passwordHash',
      'deletedAt',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('preserves original registry order and list summary/filter shaping', () => {
    const widgets = composeLegacy(legacySnapshot(), legacySignals());
    expect(widgets.map((widget) => widget.widgetKey)).toEqual(
      DASHBOARD_WIDGET_REGISTRY.slice(0, 12).map(
        (definition) => definition.widgetKey,
      ),
    );
    const absence = widgets.filter(
      (widget) => widget.source === 'attendance' && widget.type === 'risk-card',
    );
    const response = presentDashboardWidgets({
      generatedAt: GENERATED_AT,
      widgets: absence,
      filters: { source: 'attendance', type: 'risk-card', limit: 20 },
    });
    expect(response.summary).toEqual({
      total: 1,
      byType: { 'risk-card': 1 },
      bySource: { attendance: 1 },
    });
    expect(response.filters).toEqual({
      source: 'attendance',
      type: 'risk-card',
      limit: 20,
    });
  });
});

function compose(
  keys: string[],
  analytics: DashboardAnalyticsChartDataResponseDto[] = [],
  todos: Parameters<typeof buildDashboardWidgetRegistry>[0]['todos'] = null,
  calendar: Parameters<
    typeof buildDashboardWidgetRegistry
  >[0]['calendar'] = null,
) {
  return buildDashboardWidgetRegistry({
    generatedAt: GENERATED_AT,
    definitions: keys.map((key) => requireDefinition(key)),
    summary: null,
    alertSignals: null,
    activityItems: [],
    analyticsByChartKey: new Map(
      analytics.map((response) => [response.chartKey, response] as const),
    ) as any,
    todos,
    calendar,
  });
}

function calendarInput(events: ReturnType<typeof calendarEvent>[]) {
  return {
    date: '2026-07-12',
    timezone: 'Africa/Cairo',
    events,
  };
}

function calendarEvent(id = 'event-1') {
  return {
    id,
    title: 'School exam',
    type: AcademicCalendarEventType.EXAM,
    allDay: true,
    startDate: new Date('2026-07-12T00:00:00.000Z'),
    endDate: new Date('2026-07-12T00:00:00.000Z'),
  };
}

function requireDefinition(key: string) {
  const definition = findDashboardWidgetDefinition(key);
  if (!definition) throw new Error(`Missing fixture definition: ${key}`);
  return definition;
}

function data(totals: Record<string, number>) {
  const value = Object.values(totals).reduce((sum, item) => sum + item, 0);
  return {
    series: [],
    totals,
    summary: { value, label: 'Summary' },
    empty: value === 0,
  };
}

function analyticsResponse(
  chartKey: string,
  chartData: DashboardAnalyticsChartDataResponseDto['data'],
): DashboardAnalyticsChartDataResponseDto {
  const chartType = chartKey.includes('daily_trend') ? 'line' : 'bar';
  const pack = chartKey.startsWith('attendance.')
    ? 'attendance_v1'
    : chartKey.startsWith('academics.')
      ? 'academics_v1'
      : 'grades_homework_v1';
  return {
    generatedAt: GENERATED_AT.toISOString(),
    chartKey,
    source: chartKey.split('.')[0] as any,
    title: chartKey,
    type: chartType,
    status: 'available',
    range: '30d',
    granularity: 'day',
    filters: {
      range: '30d',
      granularity: 'day',
      dateFrom: null,
      dateTo: null,
      academicYearId: null,
      termId: null,
      gradeId: null,
      sectionId: null,
      classroomId: null,
    },
    data: chartData,
    emptyState: chartData.empty
      ? { reason: 'no_data', message: 'No data found.' }
      : null,
    meta: {
      source: 'dashboard_analytics_data_pack',
      pack,
      dataAvailability:
        chartType === 'line' ? 'computed_series' : 'computed_category',
      computation:
        chartKey === 'attendance.daily_trend'
          ? 'attendance_observation_daily_trend'
          : chartKey === 'academics.teacher_allocation_coverage'
            ? 'academics_teacher_allocation_coverage'
            : 'grades_current_gradebook_completion',
      freshness: {
        dataMode: 'request_time_snapshot',
        cacheStatus: 'not_used',
        realtimeStatus: 'not_used',
      },
      query: {
        effectiveTimezone: 'Africa/Cairo',
        requestedFilters: [],
        appliedFilters: [],
        notApplicableFilters: [],
        resolvedWindow: {
          startInclusive: '2026-06-12T21:00:00.000Z',
          endExclusive: '2026-07-12T21:00:00.000Z',
          startCivilDate: '2026-06-13',
          endCivilDate: '2026-07-12',
        },
      },
      deferred: {
        drilldown: 'deferred',
        exports: 'deferred',
        realtime: 'deferred',
      },
    },
  } as DashboardAnalyticsChartDataResponseDto;
}

function todo() {
  return {
    id: 'todo-1',
    date: new Date('2026-07-12T00:00:00.000Z'),
    title: 'Review reports',
    notes: 'secret notes',
    status: DashboardTodoStatus.PENDING,
    priority: DashboardTodoPriority.HIGH,
    sortOrder: 4,
    completedAt: null,
    createdAt: new Date('2026-07-11T10:00:00.000Z'),
    updatedAt: new Date('2026-07-11T10:00:00.000Z'),
  };
}

function composeLegacy(
  summary: DashboardSummarySnapshot,
  alertSignals: DashboardAlertSignals,
  activityItems: DashboardActivityFeedItemDto[] = [],
) {
  return buildDashboardWidgetRegistry({
    definitions: DASHBOARD_WIDGET_REGISTRY.slice(0, 12),
    generatedAt: GENERATED_AT,
    summary,
    alertSignals,
    activityItems,
  });
}

function findWidget(
  widgets: ReturnType<typeof buildDashboardWidgetRegistry>,
  widgetKey: string,
) {
  const widget = widgets.find((candidate) => candidate.widgetKey === widgetKey);
  expect(widget).toBeDefined();
  return widget!;
}

function legacySnapshot(): DashboardSummarySnapshot {
  return {
    generatedAt: GENERATED_AT,
    school: {
      name: 'Moazez Academy',
      timezone: 'Africa/Cairo',
      locale: null,
    },
    academicContext: {
      academicYear: { id: 'year-1', name: '2026/2027' },
      term: { id: 'term-1', name: 'Term 1', academicYearId: 'year-1' },
    },
    cards: {
      ...legacyZeroCards(),
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
    },
  };
}

function legacyZeroCards(): DashboardSummarySnapshot['cards'] {
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

function legacySignals(
  overrides: {
    academics?: Partial<DashboardAlertSignals['academics']>;
    settings?: Partial<DashboardAlertSignals['settings']>;
  } = {},
): DashboardAlertSignals {
  return {
    generatedAt: GENERATED_AT,
    academicContext: {
      academicYear: { id: 'year-1', name: '2026/2027' },
      term: { id: 'term-1', name: 'Term 1', academicYearId: 'year-1' },
    },
    admissions: {
      applicationsWaitingDecision: 0,
      testsPending: 0,
      interviewsPending: 0,
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
    behavior: { pendingReviews: 0, recentNegativeRecords: 0 },
    reinforcement: { pendingReviews: 0, overdueActiveTasks: 0 },
    communication: {
      pendingModerationReports: 0,
      activeAnnouncementsExpiringSoon: 0,
    },
    settings: {
      missingLoginIdentity: 0,
      missingActiveEmailConnection: 0,
      ...overrides.settings,
    },
  };
}

function legacyActivityItem(): DashboardActivityFeedItemDto {
  return {
    activityId: 'audit:activity-1',
    source: 'homework',
    eventType: 'homework.submission.review',
    title: 'Homework reviewed',
    description: 'A homework submission was reviewed.',
    actor: { id: null, displayName: 'System', type: 'system' },
    subject: {
      type: 'homework_submission',
      id: null,
      label: 'Homework Submission',
    },
    occurredAt: '2026-07-09T11:00:00.000Z',
  };
}
