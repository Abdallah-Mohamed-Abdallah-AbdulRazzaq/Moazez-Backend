import { DashboardActivityFeedItemDto } from '../dto/dashboard-activity-feed.dto';
import { DashboardAnalyticsChartDataResponseDto } from '../dto/dashboard-analytics-data.dto';
import {
  DashboardWidgetAnalyticsReferenceDto,
  DashboardWidgetDto,
  DashboardWidgetSource,
  DashboardWidgetTone,
  DashboardWidgetType,
  DashboardWidgetsDeferredDto,
  DashboardWidgetsResponseDto,
  DashboardWidgetResponseDto,
  DashboardWidgetTodoDataDto,
  DashboardWidgetCalendarDataDto,
  DashboardWidgetCalendarEventDto,
} from '../dto/dashboard-widgets.dto';
import { DashboardWidgetDefinition } from '../domain/dashboard-widget-registry';
import { DashboardWidgetAnalyticsChartKey } from '../domain/dashboard-widget-composition';
import { findDashboardAnalyticsChartDefinition } from '../domain/dashboard-analytics-catalog';
import {
  DASHBOARD_ANALYTICS_GRADES_HOMEWORK_PACK,
  getDashboardAnalyticsGradesHomeworkComputation,
} from '../domain/dashboard-analytics-data-pack';
import { DashboardAlertSignals } from '../infrastructure/dashboard-alerts.repository';
import { DashboardSummarySnapshot } from '../infrastructure/dashboard-summary.repository';
import {
  DashboardTodoCounts,
  DashboardTodoSnapshot,
} from '../infrastructure/dashboard-todos.repository';
import { dashboardFreshness } from './dashboard-metadata.presenter';
import { DashboardPlannerCalendarEventSnapshot } from '../infrastructure/dashboard-planner-calendar.repository';
import { DashboardPlannerItemSnapshot } from '../infrastructure/dashboard-planner-items.repository';
import {
  presentDashboardPlannerCalendarEvent,
  presentDashboardPlannerItem,
} from './dashboard-light-mode-dropdown.presenter';

export interface DashboardWidgetDataPresentationInput {
  generatedAt: Date;
  definitions: readonly DashboardWidgetDefinition[];
  summary: DashboardSummarySnapshot | null;
  alertSignals: DashboardAlertSignals | null;
  activityItems: DashboardActivityFeedItemDto[];
  analyticsByChartKey?: ReadonlyMap<
    DashboardWidgetAnalyticsChartKey,
    DashboardAnalyticsChartDataResponseDto
  >;
  analyticsUnavailableByChartKey?: ReadonlyMap<
    DashboardWidgetAnalyticsChartKey,
    'academic_context_required'
  >;
  todos?: {
    date: string;
    items: DashboardTodoSnapshot[];
    counts: DashboardTodoCounts;
  } | null;
  calendar?: {
    date: string;
    timezone: string;
    events: DashboardPlannerCalendarEventSnapshot[];
  } | null;
  plannerItems?: {
    date: string;
    timezone: string;
    items: DashboardPlannerItemSnapshot[];
  } | null;
}

export interface DashboardWidgetsPresentationInput {
  generatedAt: Date;
  widgets: DashboardWidgetDto[];
  filters: {
    source?: DashboardWidgetSource;
    type?: DashboardWidgetType;
    limit: number;
  };
}

export interface DashboardWidgetPresentationInput {
  generatedAt: Date;
  widget: DashboardWidgetDto;
}

type WidgetStatus = 'clear' | 'needs_review' | 'not_configured' | 'active';

export function presentDashboardWidgets(
  input: DashboardWidgetsPresentationInput,
): DashboardWidgetsResponseDto {
  return {
    generatedAt: input.generatedAt.toISOString(),
    widgets: input.widgets,
    summary: buildSummary(input.widgets),
    filters: {
      source: input.filters.source ?? null,
      type: input.filters.type ?? null,
      limit: input.filters.limit,
    },
    deferred: dashboardWidgetsDeferred(),
  };
}

export function presentDashboardWidget(
  input: DashboardWidgetPresentationInput,
): DashboardWidgetResponseDto {
  return {
    generatedAt: input.generatedAt.toISOString(),
    widget: input.widget,
    deferred: dashboardWidgetsDeferred(),
  };
}

export function buildDashboardWidgetRegistry(
  input: DashboardWidgetDataPresentationInput,
): DashboardWidgetDto[] {
  return input.definitions.map((definition) =>
    buildDashboardWidget(definition, input),
  );
}

function buildDashboardWidget(
  definition: DashboardWidgetDefinition,
  input: DashboardWidgetDataPresentationInput,
): DashboardWidgetDto {
  const cards = input.summary?.cards;

  switch (definition.widgetKey) {
    case 'students.active':
      return statWidget(
        definition,
        requireValue(cards?.students.activeStudents),
        'info',
      );

    case 'admissions.open_applications': {
      const value = requireValue(cards?.admissions.openApplications);
      return statWidget(definition, value, value > 0 ? 'warning' : 'success');
    }

    case 'attendance.pending_today': {
      const value = requireValue(cards?.attendance.pendingSessionsToday);
      return actionWidget(
        definition,
        value,
        value > 0 ? 'warning' : 'success',
        value > 0
          ? 'Attendance sessions are still pending today.'
          : 'Attendance has no pending sessions today.',
      );
    }

    case 'attendance.absences_today': {
      const value = requireValue(cards?.attendance.absentEntriesToday);
      return riskWidget(definition, value, value > 0 ? 'critical' : 'success');
    }

    case 'homework.waiting_review': {
      const value = requireValue(cards?.homework.submissionsWaitingReview);
      return actionWidget(
        definition,
        value,
        value > 0 ? 'warning' : 'success',
        value > 0
          ? 'Homework submissions are waiting for review.'
          : 'Homework has no submissions waiting for review.',
      );
    }

    case 'grades.pending_review': {
      const pending =
        requireValue(cards?.grades.pendingSubmissions) +
        requireValue(cards?.grades.pendingAnswerReviews);
      return actionWidget(
        definition,
        pending,
        pending > 0 ? 'warning' : 'success',
        pending > 0
          ? 'Grade submissions or answers need review.'
          : 'Grades has no pending review backlog.',
      );
    }

    case 'behavior.pending_review': {
      const value = requireValue(cards?.behavior.pendingReviewRecords);
      return actionWidget(
        definition,
        value,
        value > 0 ? 'warning' : 'success',
        value > 0
          ? 'Behavior records are pending review.'
          : 'Behavior has no pending review backlog.',
      );
    }

    case 'reinforcement.pending_reviews': {
      const value = requireValue(cards?.reinforcement.pendingReviews);
      return actionWidget(
        definition,
        value,
        value > 0 ? 'warning' : 'success',
        value > 0
          ? 'Reinforcement submissions are waiting for review.'
          : 'Reinforcement has no pending review backlog.',
      );
    }

    case 'communication.moderation_queue': {
      const value = requireValue(cards?.communication.pendingModerationReports);
      return riskWidget(definition, value, value > 0 ? 'critical' : 'success');
    }

    case 'settings.email_connection':
      return readinessWidget(
        definition,
        requireSignals(input).settings.missingActiveEmailConnection > 0,
        'School email connection is active or verified.',
        'School email connection is not active.',
      );

    case 'settings.login_identity':
      return readinessWidget(
        definition,
        requireSignals(input).settings.missingLoginIdentity > 0,
        'School login identity settings are configured.',
        'School login identity settings are not configured.',
      );

    case 'activity.recent':
      return timelineWidget(definition, input.activityItems);

    case 'students.enrollment_growth':
    case 'attendance.daily_trend':
    case 'communication.message_volume':
      return miniChartWidget(definition, requireAnalytics(input, definition));

    case 'academics.teacher_allocation_coverage':
      return progressWidget(
        definition,
        requireAnalytics(input, definition),
        'allocated',
        'Allocated',
        'missing',
        'Missing',
      );

    case 'grades.gradebook_completion': {
      const unavailableReason = input.analyticsUnavailableByChartKey?.get(
        'grades.gradebook_completion',
      );
      if (unavailableReason === 'academic_context_required') {
        if (input.analyticsByChartKey?.has('grades.gradebook_completion')) {
          throw new Error(
            'Dashboard Gradebook widget has conflicting Analytics results',
          );
        }
        return unavailableGradebookProgressWidget(definition);
      }
      return progressWidget(
        definition,
        requireAnalytics(input, definition),
        'complete',
        'Complete',
        'missing',
        'Missing',
      );
    }

    case 'todos.today':
      return todoWidget(definition, requireTodos(input));

    case 'calendar.today':
      return calendarWidget(
        definition,
        requireTodos(input),
        requireCalendar(input),
        requirePlannerItems(input),
      );

    default:
      return statWidget(definition, 0, 'neutral');
  }
}

function statWidget(
  definition: DashboardWidgetDefinition,
  value: number,
  tone: DashboardWidgetTone,
): DashboardWidgetDto {
  return widget(definition, tone, {
    value,
    unit: null,
    label: definition.dataLabel,
  });
}

function actionWidget(
  definition: DashboardWidgetDefinition,
  value: number,
  tone: DashboardWidgetTone,
  message: string,
): DashboardWidgetDto {
  return widget(definition, tone, {
    value,
    unit: null,
    label: definition.dataLabel,
    message,
    status: value > 0 ? 'needs_review' : 'clear',
  });
}

function riskWidget(
  definition: DashboardWidgetDefinition,
  count: number,
  tone: DashboardWidgetTone,
): DashboardWidgetDto {
  return widget(definition, tone, {
    count,
    label: definition.dataLabel,
    riskLevel: riskLevelFromTone(tone),
    items: [],
  });
}

function readinessWidget(
  definition: DashboardWidgetDefinition,
  missing: boolean,
  readyMessage: string,
  missingMessage: string,
): DashboardWidgetDto {
  const status: WidgetStatus = missing ? 'not_configured' : 'active';

  return widget(definition, missing ? 'warning' : 'success', {
    value: status,
    label: definition.dataLabel,
    status,
    message: missing ? missingMessage : readyMessage,
  });
}

function timelineWidget(
  definition: DashboardWidgetDefinition,
  activityItems: DashboardActivityFeedItemDto[],
): DashboardWidgetDto {
  const items = activityItems.slice(0, 5).map((item) => ({
    source: item.source,
    eventType: item.eventType,
    title: item.title,
    description: item.description,
    actor: {
      displayName: item.actor.displayName,
      type: item.actor.type,
    },
    subject: {
      type: item.subject.type,
      label: item.subject.label,
    },
    occurredAt: item.occurredAt,
  }));

  return widget(definition, 'neutral', {
    items,
    count: items.length,
    label: definition.dataLabel,
    nextCursor: null,
    hasMore: false,
  });
}

function miniChartWidget(
  definition: DashboardWidgetDefinition,
  analytics: DashboardAnalyticsChartDataResponseDto,
): DashboardWidgetDto {
  return widget(
    definition,
    analytics.data.empty ? 'neutral' : 'info',
    {
      series: analytics.data.series,
      totals: analytics.data.totals,
      summary: analytics.data.summary,
      empty: analytics.data.empty,
    },
    analyticsReference(definition, analytics),
    analyticsEmptyState(analytics),
  );
}

function progressWidget(
  definition: DashboardWidgetDefinition,
  analytics: DashboardAnalyticsChartDataResponseDto,
  successfulKey: string,
  successfulLabel: string,
  missingKey: string,
  missingLabel: string,
): DashboardWidgetDto {
  const successful = requireAnalyticsTotal(analytics, successfulKey);
  const missing = requireAnalyticsTotal(analytics, missingKey);
  const max = successful + missing;
  const percent = max === 0 ? 0 : round2((successful / max) * 100);
  const tone: DashboardWidgetTone =
    max === 0
      ? 'neutral'
      : percent === 100
        ? 'success'
        : percent === 0
          ? 'critical'
          : 'warning';

  return widget(
    definition,
    tone,
    {
      value: successful,
      max,
      percent,
      unit: 'percent',
      label: definition.dataLabel,
      segments: [
        { key: successfulKey, label: successfulLabel, value: successful },
        { key: missingKey, label: missingLabel, value: missing },
      ],
    },
    analyticsReference(definition, analytics),
    analyticsEmptyState(analytics),
  );
}

function unavailableGradebookProgressWidget(
  definition: DashboardWidgetDefinition,
): DashboardWidgetDto {
  const chart = findDashboardAnalyticsChartDefinition(
    'grades.gradebook_completion',
  );
  if (!chart) {
    throw new Error('Dashboard Gradebook Analytics definition is missing');
  }

  return widget(
    definition,
    'neutral',
    {
      status: 'not_configured',
      value: null,
      max: null,
      percent: null,
      unit: 'percent',
      label: definition.dataLabel,
      segments: [],
    },
    {
      chartKey: 'grades.gradebook_completion',
      chartType: chart.type,
      definitionEndpoint: chart.definitionEndpoint,
      dataEndpoint: chart.dataEndpoint,
      defaultRange: '30d',
      defaultGranularity: 'day',
      dataAvailability: chart.meta.dataAvailability,
      pack: DASHBOARD_ANALYTICS_GRADES_HOMEWORK_PACK,
      computation: getDashboardAnalyticsGradesHomeworkComputation(
        'grades.gradebook_completion',
      ),
    },
    {
      title: 'Academic context required',
      description:
        'An active academic year and term are required to calculate Gradebook completion.',
      action: null,
    },
  );
}

function todoWidget(
  definition: DashboardWidgetDefinition,
  todos: NonNullable<DashboardWidgetDataPresentationInput['todos']>,
): DashboardWidgetDto {
  const data: DashboardWidgetTodoDataDto = {
    date: todos.date,
    items: todos.items.map((todo) => ({
      title: todo.title,
      status: todo.status.toLowerCase() as 'pending' | 'completed',
      priority: todo.priority.toLowerCase() as 'low' | 'normal' | 'high',
    })),
    summary: { ...todos.counts },
  };

  return widget(
    definition,
    todoTone(todos.counts),
    data as unknown as Record<string, unknown>,
    null,
    null,
    'persisted_user_data',
  );
}

function calendarWidget(
  definition: DashboardWidgetDefinition,
  todos: NonNullable<DashboardWidgetDataPresentationInput['todos']>,
  calendar: NonNullable<DashboardWidgetDataPresentationInput['calendar']>,
  plannerItems: NonNullable<
    DashboardWidgetDataPresentationInput['plannerItems']
  >,
): DashboardWidgetDto {
  if (
    calendar.date !== todos.date ||
    plannerItems.date !== todos.date ||
    plannerItems.timezone !== calendar.timezone
  ) {
    throw new Error('Dashboard Planner composition context must match');
  }
  const academicCalendarEvents: DashboardWidgetCalendarEventDto[] =
    calendar.events.map((event) => {
      const presented = presentDashboardPlannerCalendarEvent(
        event,
        calendar.timezone,
      );
      return {
        source: presented.source,
        title: presented.title,
        date: presented.date,
        endDate: presented.endDate,
        startTime: presented.startTime,
        endTime: presented.endTime,
        allDay: presented.allDay,
        eventType: presented.eventType,
        status: null,
        priority: null,
        tone: presented.tone,
        iconKey: presented.iconKey,
      };
    });
  const crossModuleEvents: DashboardWidgetCalendarEventDto[] =
    plannerItems.items.map((item) => {
      const presented = presentDashboardPlannerItem(
        item,
        plannerItems.timezone,
        'en',
      );
      return {
        source: presented.source,
        title: presented.title,
        date: presented.date,
        endDate: presented.endDate,
        startTime: presented.startTime,
        endTime: presented.endTime,
        allDay: presented.allDay,
        eventType: presented.eventType,
        status: null,
        priority: null,
        tone: presented.tone,
        iconKey: presented.iconKey,
      };
    });
  const todoEvents: DashboardWidgetCalendarEventDto[] = todos.items.map(
    (todo) => {
      const status = todo.status.toLowerCase() as 'pending' | 'completed';
      const priority = todo.priority.toLowerCase() as 'low' | 'normal' | 'high';
      return {
        source: 'todo',
        title: todo.title,
        date: todos.date,
        endDate: todos.date,
        startTime: null,
        endTime: null,
        allDay: true,
        eventType: null,
        status,
        priority,
        tone:
          status === 'completed'
            ? 'success'
            : priority === 'high'
              ? 'warning'
              : 'info',
        iconKey: 'list-todo',
      };
    },
  );
  const events = [
    ...academicCalendarEvents,
    ...crossModuleEvents,
    ...todoEvents,
  ];
  const countSource = (source: DashboardWidgetCalendarEventDto['source']) =>
    crossModuleEvents.filter((event) => event.source === source).length;
  const data: DashboardWidgetCalendarDataDto = {
    date: todos.date,
    sourceMode: 'academic_calendar_cross_module_and_todos',
    eventDates: events.length > 0 ? [todos.date] : [],
    events,
    summary: {
      total: events.length,
      academicCalendar: academicCalendarEvents.length,
      crossModule: crossModuleEvents.length,
      attendanceSessions: countSource('attendance_session'),
      placementTests: countSource('placement_test'),
      interviews: countSource('interview'),
      homeworkDue: countSource('homework_due'),
      gradeAssessments: countSource('grade_assessment'),
      todos: todoEvents.length,
    },
  };
  const tone: DashboardWidgetTone =
    events.length === 0
      ? 'neutral'
      : todos.counts.pending > 0
        ? 'warning'
        : crossModuleEvents.some(
              (event) =>
                event.source === 'homework_due' ||
                event.source === 'grade_assessment',
            )
          ? 'warning'
          : academicCalendarEvents.length > 0 || crossModuleEvents.length > 0
            ? 'info'
            : 'success';

  return widget(
    definition,
    tone,
    data as unknown as Record<string, unknown>,
    null,
    null,
    'request_time_snapshot',
  );
}

function widget(
  definition: DashboardWidgetDefinition,
  tone: DashboardWidgetTone,
  data: Record<string, unknown>,
  analytics: DashboardWidgetAnalyticsReferenceDto | null = null,
  emptyState: DashboardWidgetDto['emptyState'] = null,
  dataMode:
    | 'request_time_snapshot'
    | 'persisted_user_data' = 'request_time_snapshot',
): DashboardWidgetDto {
  return {
    widgetKey: definition.widgetKey,
    type: definition.type,
    source: definition.source,
    title: definition.title,
    subtitle: definition.subtitle,
    iconKey: definition.iconKey,
    tone,
    data,
    action: { ...definition.action },
    emptyState,
    meta: {
      freshness: 'live',
      freshnessDetails: dashboardFreshness(dataMode),
      analytics,
    },
  };
}

function analyticsReference(
  definition: DashboardWidgetDefinition,
  analytics: DashboardAnalyticsChartDataResponseDto,
): DashboardWidgetAnalyticsReferenceDto {
  const chartKey = requireAnalyticsBinding(definition).chartKey;
  return {
    chartKey,
    chartType: analytics.type,
    definitionEndpoint: `/api/v1/dashboard/analytics/charts/${chartKey}`,
    dataEndpoint: `/api/v1/dashboard/analytics/charts/${chartKey}/data`,
    defaultRange: '30d',
    defaultGranularity: 'day',
    dataAvailability: analytics.meta.dataAvailability,
    pack: analytics.meta.pack,
    computation: analytics.meta.computation,
  };
}

function analyticsEmptyState(
  analytics: DashboardAnalyticsChartDataResponseDto,
): DashboardWidgetDto['emptyState'] {
  if (!analytics.emptyState) return null;
  return {
    title:
      analytics.emptyState.reason === 'no_data' ? 'No data' : 'Unavailable',
    description: analytics.emptyState.message,
    action: null,
  };
}

function requireAnalytics(
  input: DashboardWidgetDataPresentationInput,
  definition: DashboardWidgetDefinition,
): DashboardAnalyticsChartDataResponseDto {
  const chartKey = requireAnalyticsBinding(definition).chartKey;
  const response = input.analyticsByChartKey?.get(chartKey);
  if (!response) {
    throw new Error(`Dashboard widget analytics data is missing: ${chartKey}`);
  }
  return response;
}

function requireAnalyticsBinding(definition: DashboardWidgetDefinition) {
  const binding = definition.composition.analytics;
  if (!binding) {
    throw new Error(
      `Dashboard widget analytics binding is missing: ${definition.widgetKey}`,
    );
  }
  return binding;
}

function requireSignals(
  input: DashboardWidgetDataPresentationInput,
): DashboardAlertSignals {
  if (!input.alertSignals) {
    throw new Error('Dashboard widget alert signals are missing');
  }
  return input.alertSignals;
}

function requireTodos(
  input: DashboardWidgetDataPresentationInput,
): NonNullable<DashboardWidgetDataPresentationInput['todos']> {
  if (!input.todos) throw new Error('Dashboard widget Todo data is missing');
  return input.todos;
}

function requireCalendar(
  input: DashboardWidgetDataPresentationInput,
): NonNullable<DashboardWidgetDataPresentationInput['calendar']> {
  if (!input.calendar) {
    throw new Error('Dashboard widget Calendar data is missing');
  }
  return input.calendar;
}

function requirePlannerItems(
  input: DashboardWidgetDataPresentationInput,
): NonNullable<DashboardWidgetDataPresentationInput['plannerItems']> {
  if (!input.plannerItems) {
    throw new Error('Dashboard widget Planner Items data is missing');
  }
  return input.plannerItems;
}

function requireValue(value: number | undefined): number {
  if (value === undefined) {
    throw new Error('Dashboard widget summary data is missing');
  }
  return value;
}

function requireAnalyticsTotal(
  analytics: DashboardAnalyticsChartDataResponseDto,
  key: string,
): number {
  const value = analytics.data.totals[key];
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`Dashboard widget Analytics total is invalid: ${key}`);
  }
  return value;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function todoTone(counts: DashboardTodoCounts): DashboardWidgetTone {
  if (counts.total === 0) return 'neutral';
  return counts.pending > 0 ? 'warning' : 'success';
}

function riskLevelFromTone(tone: DashboardWidgetTone): string {
  if (tone === 'critical') return 'critical';
  if (tone === 'warning') return 'elevated';
  return 'clear';
}

function buildSummary(widgets: DashboardWidgetDto[]) {
  return widgets.reduce(
    (summary, current) => {
      summary.total += 1;
      summary.byType[current.type] = (summary.byType[current.type] ?? 0) + 1;
      summary.bySource[current.source] =
        (summary.bySource[current.source] ?? 0) + 1;
      return summary;
    },
    {
      total: 0,
      byType: {},
      bySource: {},
    } as DashboardWidgetsResponseDto['summary'],
  );
}

function dashboardWidgetsDeferred(): DashboardWidgetsDeferredDto {
  return {
    customLayouts: 'deferred',
    widgetPreferences: 'deferred',
    analyticsCharts: 'available',
    weatherWidgets: 'deferred',
    todoWidgets: 'available',
    analyticsStandalone: 'available',
    todosStandalone: 'persisted',
    calendarTodoComposition: 'available',
    plannerCalendar: 'available',
    crossModulePlannerItems: 'available',
  };
}
