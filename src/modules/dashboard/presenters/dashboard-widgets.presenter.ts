import { DashboardActivityFeedItemDto } from '../dto/dashboard-activity-feed.dto';
import {
  DashboardWidgetDto,
  DashboardWidgetSource,
  DashboardWidgetTone,
  DashboardWidgetType,
  DashboardWidgetsDeferredDto,
  DashboardWidgetsResponseDto,
  DashboardWidgetResponseDto,
} from '../dto/dashboard-widgets.dto';
import {
  DASHBOARD_WIDGET_REGISTRY,
  DashboardWidgetDefinition,
} from '../domain/dashboard-widget-registry';
import { DashboardAlertSignals } from '../infrastructure/dashboard-alerts.repository';
import { DashboardSummarySnapshot } from '../infrastructure/dashboard-summary.repository';
import { dashboardFreshness } from './dashboard-metadata.presenter';

export interface DashboardWidgetsPresentationInput {
  generatedAt: Date;
  summary: DashboardSummarySnapshot;
  alertSignals: DashboardAlertSignals;
  activityItems: DashboardActivityFeedItemDto[];
}

export interface DashboardWidgetsListPresentationInput extends DashboardWidgetsPresentationInput {
  filters: {
    source?: DashboardWidgetSource;
    type?: DashboardWidgetType;
    limit: number;
  };
}

export interface DashboardWidgetPresentationInput extends DashboardWidgetsPresentationInput {
  widgetKey: string;
}

type WidgetStatus = 'clear' | 'needs_review' | 'not_configured' | 'active';

export function presentDashboardWidgets(
  input: DashboardWidgetsListPresentationInput,
): DashboardWidgetsResponseDto {
  const widgets = buildDashboardWidgetRegistry(input)
    .filter(
      (widget) =>
        !input.filters.source || widget.source === input.filters.source,
    )
    .filter(
      (widget) => !input.filters.type || widget.type === input.filters.type,
    )
    .slice(0, input.filters.limit);

  return {
    generatedAt: input.generatedAt.toISOString(),
    widgets,
    summary: buildSummary(widgets),
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
): DashboardWidgetResponseDto | null {
  const widget = buildDashboardWidgetRegistry(input).find(
    (candidate) => candidate.widgetKey === input.widgetKey,
  );

  if (!widget) return null;

  return {
    generatedAt: input.generatedAt.toISOString(),
    widget,
    deferred: dashboardWidgetsDeferred(),
  };
}

export function buildDashboardWidgetRegistry(
  input: DashboardWidgetsPresentationInput,
): DashboardWidgetDto[] {
  return DASHBOARD_WIDGET_REGISTRY.map((definition) =>
    buildDashboardWidget(definition, input),
  );
}

function buildDashboardWidget(
  definition: DashboardWidgetDefinition,
  input: DashboardWidgetsPresentationInput,
): DashboardWidgetDto {
  const { cards } = input.summary;

  switch (definition.widgetKey) {
    case 'students.active':
      return statWidget(definition, cards.students.activeStudents, 'info');

    case 'admissions.open_applications':
      return statWidget(
        definition,
        cards.admissions.openApplications,
        cards.admissions.openApplications > 0 ? 'warning' : 'success',
      );

    case 'attendance.pending_today':
      return actionWidget(
        definition,
        cards.attendance.pendingSessionsToday,
        cards.attendance.pendingSessionsToday > 0 ? 'warning' : 'success',
        cards.attendance.pendingSessionsToday > 0
          ? 'Attendance sessions are still pending today.'
          : 'Attendance has no pending sessions today.',
      );

    case 'attendance.absences_today':
      return riskWidget(
        definition,
        cards.attendance.absentEntriesToday,
        cards.attendance.absentEntriesToday > 0 ? 'critical' : 'success',
      );

    case 'homework.waiting_review':
      return actionWidget(
        definition,
        cards.homework.submissionsWaitingReview,
        cards.homework.submissionsWaitingReview > 0 ? 'warning' : 'success',
        cards.homework.submissionsWaitingReview > 0
          ? 'Homework submissions are waiting for review.'
          : 'Homework has no submissions waiting for review.',
      );

    case 'grades.pending_review': {
      const pending =
        cards.grades.pendingSubmissions + cards.grades.pendingAnswerReviews;
      return actionWidget(
        definition,
        pending,
        pending > 0 ? 'warning' : 'success',
        pending > 0
          ? 'Grade submissions or answers need review.'
          : 'Grades has no pending review backlog.',
      );
    }

    case 'behavior.pending_review':
      return actionWidget(
        definition,
        cards.behavior.pendingReviewRecords,
        cards.behavior.pendingReviewRecords > 0 ? 'warning' : 'success',
        cards.behavior.pendingReviewRecords > 0
          ? 'Behavior records are pending review.'
          : 'Behavior has no pending review backlog.',
      );

    case 'reinforcement.pending_reviews':
      return actionWidget(
        definition,
        cards.reinforcement.pendingReviews,
        cards.reinforcement.pendingReviews > 0 ? 'warning' : 'success',
        cards.reinforcement.pendingReviews > 0
          ? 'Reinforcement submissions are waiting for review.'
          : 'Reinforcement has no pending review backlog.',
      );

    case 'communication.moderation_queue':
      return riskWidget(
        definition,
        cards.communication.pendingModerationReports,
        cards.communication.pendingModerationReports > 0
          ? 'critical'
          : 'success',
      );

    case 'settings.email_connection':
      return readinessWidget(
        definition,
        input.alertSignals.settings.missingActiveEmailConnection > 0,
        'School email connection is active or verified.',
        'School email connection is not active.',
      );

    case 'settings.login_identity':
      return readinessWidget(
        definition,
        input.alertSignals.settings.missingLoginIdentity > 0,
        'School login identity settings are configured.',
        'School login identity settings are not configured.',
      );

    case 'activity.recent':
      return timelineWidget(definition, input.activityItems);

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

function widget(
  definition: DashboardWidgetDefinition,
  tone: DashboardWidgetTone,
  data: Record<string, unknown>,
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
    action: {
      label: definition.action.label,
      target: definition.action.target,
      kind: definition.action.kind,
    },
    emptyState: null,
    meta: {
      freshness: 'live',
      freshnessDetails: dashboardFreshness('request_time_snapshot'),
    },
  };
}

function riskLevelFromTone(tone: DashboardWidgetTone): string {
  if (tone === 'critical') return 'critical';
  if (tone === 'warning') return 'elevated';
  return 'clear';
}

function buildSummary(widgets: DashboardWidgetDto[]) {
  return widgets.reduce(
    (summary, widget) => {
      summary.total += 1;
      summary.byType[widget.type] = (summary.byType[widget.type] ?? 0) + 1;
      summary.bySource[widget.source] =
        (summary.bySource[widget.source] ?? 0) + 1;
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
    analyticsCharts: 'integration_deferred',
    weatherWidgets: 'deferred',
    todoWidgets: 'integration_deferred',
    analyticsStandalone: 'snapshot_only',
    todosStandalone: 'persisted',
  };
}
