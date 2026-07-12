import {
  DashboardAnalyticsChartDataFiltersDto,
  DashboardAnalyticsChartDataResponseDto,
} from '../dto/dashboard-analytics-data.dto';
import { DashboardAnalyticsChartDto } from '../dto/dashboard-analytics.dto';
import { DashboardAlertDto } from '../dto/dashboard-alerts.dto';
import {
  DashboardModuleActionDto,
  DashboardModuleBaseDto,
  DashboardModuleCapabilitiesDto,
  DashboardModuleListItemDto,
  DashboardModuleNextActionDto,
  DashboardModuleOverviewDto,
  DashboardModulePageResponseDto,
  DashboardModuleQuickStatDto,
  DashboardModulesResponseDto,
} from '../dto/dashboard-modules.dto';
import { DashboardWidgetDto } from '../dto/dashboard-widgets.dto';
import {
  DASHBOARD_ANALYTICS_CHARTS,
  DashboardAnalyticsChartDefinition,
} from '../domain/dashboard-analytics-catalog';
import { isDashboardAnalyticsComputedSnapshotChartKey } from '../domain/dashboard-analytics-data-pack';
import { DASHBOARD_WIDGET_KEYS } from '../domain/dashboard-widget-registry';
import {
  DASHBOARD_MODULE_PAGE_REGISTRY,
  DashboardModuleCapabilityStatus,
  DashboardModuleSource,
  DashboardModulePageDefinition,
  DashboardModuleStatus,
} from '../domain/dashboard-module-pages';
import { DashboardAlertSignals } from '../infrastructure/dashboard-alerts.repository';
import { DashboardSummarySnapshot } from '../infrastructure/dashboard-summary.repository';
import { presentDashboardAnalyticsChartData } from './dashboard-analytics-data.presenter';
import { presentDashboardAnalyticsCharts } from './dashboard-analytics.presenter';
import { buildDashboardWidgetRegistry } from './dashboard-widgets.presenter';
import { dashboardFreshness } from './dashboard-metadata.presenter';

export interface DashboardModulesPresentationInput {
  generatedAt: Date;
  alerts: DashboardAlertDto[];
  filters: {
    status?: DashboardModuleStatus;
    source?: DashboardModuleSource;
    limit: number;
  };
  moduleDefinitions?: readonly DashboardModulePageDefinition[];
}

export interface DashboardModulePagePresentationInput {
  generatedAt: Date;
  definition: DashboardModulePageDefinition;
  summary: DashboardSummarySnapshot;
  alertSignals: DashboardAlertSignals;
  alerts: DashboardAlertDto[];
}

export function presentDashboardModules(
  input: DashboardModulesPresentationInput,
): DashboardModulesResponseDto {
  const definitions = input.moduleDefinitions ?? DASHBOARD_MODULE_PAGE_REGISTRY;
  const modules = definitions
    .filter(
      (definition) =>
        !input.filters.status || definition.status === input.filters.status,
    )
    .filter(
      (definition) =>
        !input.filters.source || definition.source === input.filters.source,
    )
    .slice(0, input.filters.limit)
    .map((definition) =>
      presentModuleListItem({
        definition,
        alerts: moduleAlerts(input.alerts, definition.source),
      }),
    );

  return {
    generatedAt: input.generatedAt.toISOString(),
    modules,
    summary: summarizeModules(modules),
    filters: {
      status: input.filters.status ?? null,
      source: input.filters.source ?? null,
      limit: input.filters.limit,
    },
    deferred: dashboardModulesDeferred(),
    meta: {
      source: 'dashboard_module_pages',
      version: 'v1',
      freshness: dashboardFreshness('request_time_snapshot'),
    },
  };
}

export function presentDashboardModulePage(
  input: DashboardModulePagePresentationInput,
): DashboardModulePageResponseDto {
  const widgets = moduleWidgets(input);
  const charts = moduleChartDefinitions(input.definition);
  const chartDtos = presentChartDtos(input.generatedAt, charts);
  const availableData = moduleAvailableChartData(input, charts);
  const plannedCharts = chartDtos.filter(
    (chart) => chart.status !== 'available',
  );
  const alerts = moduleAlerts(input.alerts, input.definition.source);
  const overview = buildOverview(input.definition, widgets, alerts);
  const capabilities = resolveCapabilities(
    input.definition,
    widgets.length,
    chartDtos.length,
    availableData.length,
  );

  return {
    generatedAt: input.generatedAt.toISOString(),
    module: presentModuleBase(input.definition),
    overview,
    widgets,
    analytics: {
      charts: chartDtos,
      availableData,
      plannedCharts,
    },
    sections: input.definition.sections.map((section) => ({
      sectionKey: section.sectionKey,
      title: section.title,
      status:
        section.sectionKey === 'widgets'
          ? capabilities.widgets
          : section.sectionKey === 'analytics'
            ? capabilities.analyticsData
            : section.status,
      items:
        section.sectionKey === 'widgets'
          ? widgets.map((widget) => widget.widgetKey)
          : section.sectionKey === 'analytics'
            ? chartDtos.map((chart) => chart.chartKey)
            : section.items,
    })),
    capabilities,
    emptyState:
      widgets.length === 0 && chartDtos.length === 0
        ? {
            reason: 'no_widgets_or_charts',
            message: 'No dashboard modules content is available yet.',
          }
        : null,
    meta: {
      source: 'dashboard_module_page',
      version: 'v1',
      dataFreshness: 'live',
      freshness: dashboardFreshness('request_time_snapshot'),
      deferred: {
        customLayouts: 'deferred',
        userPreferences: 'deferred',
        drilldowns: 'deferred',
        exports: 'deferred',
        realtime: 'deferred',
      },
    },
  };
}

function presentModuleListItem(input: {
  definition: DashboardModulePageDefinition;
  alerts: DashboardAlertDto[];
}): DashboardModuleListItemDto {
  const widgets = moduleWidgetKeyCount(input.definition);
  const charts = moduleChartDefinitions(input.definition);
  const availableDataCount = charts.filter((chart) =>
    isDashboardAnalyticsComputedSnapshotChartKey(chart.chartKey),
  ).length;
  const actions = buildModuleActions(input.definition, input.alerts);

  return {
    ...presentModuleBase(input.definition),
    summary: {
      widgetCount: widgets,
      chartCount: charts.length,
      availableChartDataCount: availableDataCount,
      riskCount: input.alerts.filter((alert) => alert.count > 0).length,
      actionCount: actions.length,
    },
    capabilities: resolveCapabilities(
      input.definition,
      widgets,
      charts.length,
      availableDataCount,
    ),
  };
}

function presentModuleBase(
  definition: DashboardModulePageDefinition,
): DashboardModuleBaseDto {
  return {
    moduleKey: definition.moduleKey,
    source: definition.source,
    title: definition.title,
    description: definition.description,
    status: definition.status,
    iconKey: definition.iconKey,
    tone: definition.tone,
    frontendRoute: definition.frontendRoute,
    sourceRoute: definition.sourceRoute,
  };
}

function moduleWidgets(
  input: DashboardModulePagePresentationInput,
): DashboardWidgetDto[] {
  const widgets = buildDashboardWidgetRegistry({
    generatedAt: input.generatedAt,
    summary: input.summary,
    alertSignals: input.alertSignals,
    activityItems: [],
  });
  const allowedKeys = new Set(input.definition.widgetKeys);

  return widgets.filter((widget) => allowedKeys.has(widget.widgetKey));
}

function moduleWidgetKeyCount(
  definition: DashboardModulePageDefinition,
): number {
  const registryKeys = new Set(DASHBOARD_WIDGET_KEYS);

  return definition.widgetKeys.filter((widgetKey) =>
    registryKeys.has(widgetKey),
  ).length;
}

function moduleChartDefinitions(
  definition: DashboardModulePageDefinition,
): DashboardAnalyticsChartDefinition[] {
  const chartDefinitionsByKey = new Map(
    DASHBOARD_ANALYTICS_CHARTS.map((chart) => [chart.chartKey, chart]),
  );

  return definition.chartKeys
    .map((chartKey) => chartDefinitionsByKey.get(chartKey))
    .filter(
      (chart): chart is DashboardAnalyticsChartDefinition =>
        chart !== undefined,
    );
}

function presentChartDtos(
  generatedAt: Date,
  charts: readonly DashboardAnalyticsChartDefinition[],
): DashboardAnalyticsChartDto[] {
  if (charts.length === 0) return [];

  return Array.from(
    presentDashboardAnalyticsCharts({
      generatedAt,
      charts,
      filters: {
        limit: charts.length,
      },
    }).charts,
  );
}

function moduleAvailableChartData(
  input: DashboardModulePagePresentationInput,
  charts: readonly DashboardAnalyticsChartDefinition[],
): DashboardAnalyticsChartDataResponseDto[] {
  const filters = defaultAnalyticsDataFilters();

  return charts
    .filter((chart) =>
      isDashboardAnalyticsComputedSnapshotChartKey(chart.chartKey),
    )
    .map((chart) =>
      presentDashboardAnalyticsChartData({
        generatedAt: input.generatedAt,
        chart,
        filters,
        summary: input.summary,
        alertSignals: input.alertSignals,
      }),
    );
}

function buildOverview(
  definition: DashboardModulePageDefinition,
  widgets: DashboardWidgetDto[],
  alerts: DashboardAlertDto[],
): DashboardModuleOverviewDto {
  return {
    quickStats: buildQuickStats(widgets),
    risks: alerts
      .filter((alert) => alert.count > 0)
      .sort(compareAlerts)
      .slice(0, 4)
      .map((alert) => ({
        key: alert.key,
        severity: alert.severity,
        title: alert.title,
        count: alert.count,
        source: definition.source,
        action: moduleAction(alert.action.label, alert.action.target),
      })),
    actions: buildModuleActions(definition, alerts),
  };
}

function buildQuickStats(
  widgets: readonly DashboardWidgetDto[],
): DashboardModuleQuickStatDto[] {
  return widgets
    .map((widget) => {
      const value = extractWidgetValue(widget);
      if (value === null) return null;

      return {
        key: widget.widgetKey,
        label: widget.title,
        value,
        unit: typeof widget.data.unit === 'string' ? widget.data.unit : null,
        tone: widget.tone,
        iconKey: widget.iconKey,
        source: widget.source as DashboardModuleSource,
        action: widget.action,
      };
    })
    .filter((item): item is DashboardModuleQuickStatDto => item !== null)
    .slice(0, 4);
}

function buildModuleActions(
  definition: DashboardModulePageDefinition,
  alerts: DashboardAlertDto[],
): DashboardModuleNextActionDto[] {
  const actions: DashboardModuleNextActionDto[] = [
    {
      key: `${definition.moduleKey}.open`,
      priority: 'medium',
      label: definition.primaryAction.label,
      description: `Open the ${definition.title} workspace.`,
      source: definition.source,
      action: moduleAction(
        definition.primaryAction.label,
        definition.primaryAction.target,
      ),
    },
  ];

  for (const alert of alerts.filter((candidate) => candidate.count > 0)) {
    actions.push({
      key: alert.key,
      priority: priorityFromSeverity(alert.severity),
      label: alert.action.label,
      description: alert.description,
      source: definition.source,
      action: moduleAction(alert.action.label, alert.action.target),
    });
  }

  return actions.sort(compareActions).slice(0, 5);
}

function resolveCapabilities(
  definition: DashboardModulePageDefinition,
  widgetCount: number,
  chartCount: number,
  availableDataCount: number,
): DashboardModuleCapabilitiesDto {
  return {
    widgets:
      widgetCount > 0
        ? 'available'
        : definition.widgetKeys.length > 0
          ? 'planned'
          : definition.capabilities.widgets,
    analyticsDefinitions:
      chartCount > 0
        ? 'available'
        : definition.capabilities.analyticsDefinitions,
    analyticsData: analyticsDataCapability(chartCount, availableDataCount),
    drilldowns: 'deferred',
    exports: 'deferred',
    realtime: 'deferred',
  };
}

function analyticsDataCapability(
  chartCount: number,
  availableDataCount: number,
): DashboardModuleCapabilityStatus {
  if (availableDataCount === 0) return 'planned';
  if (availableDataCount === chartCount) return 'available';
  return 'partial';
}

function extractWidgetValue(
  widget: DashboardWidgetDto,
): number | string | null {
  if (
    typeof widget.data.value === 'number' ||
    typeof widget.data.value === 'string'
  ) {
    return widget.data.value;
  }

  if (typeof widget.data.count === 'number') {
    return widget.data.count;
  }

  return null;
}

function moduleAlerts(
  alerts: readonly DashboardAlertDto[],
  source: DashboardModuleSource,
): DashboardAlertDto[] {
  return alerts.filter((alert) => alert.source === source);
}

function summarizeModules(
  modules: readonly DashboardModuleListItemDto[],
): DashboardModulesResponseDto['summary'] {
  return modules.reduce(
    (summary, modulePage) => {
      summary.total += 1;
      summary.byStatus[modulePage.status] =
        (summary.byStatus[modulePage.status] ?? 0) + 1;
      summary.bySource[modulePage.source] =
        (summary.bySource[modulePage.source] ?? 0) + 1;
      return summary;
    },
    {
      total: 0,
      byStatus: {},
      bySource: {},
    } as DashboardModulesResponseDto['summary'],
  );
}

function defaultAnalyticsDataFilters(): DashboardAnalyticsChartDataFiltersDto {
  return {
    range: '30d',
    granularity: 'day',
    dateFrom: null,
    dateTo: null,
    academicYearId: null,
    termId: null,
    gradeId: null,
    sectionId: null,
    classroomId: null,
  };
}

function compareAlerts(left: DashboardAlertDto, right: DashboardAlertDto) {
  const severityDiff =
    severityRank(left.severity) - severityRank(right.severity);
  if (severityDiff !== 0) return severityDiff;

  const countDiff = right.count - left.count;
  if (countDiff !== 0) return countDiff;

  return left.key.localeCompare(right.key);
}

function compareActions(
  left: DashboardModuleNextActionDto,
  right: DashboardModuleNextActionDto,
): number {
  const priorityDiff =
    actionPriorityRank(left.priority) - actionPriorityRank(right.priority);
  if (priorityDiff !== 0) return priorityDiff;

  return left.key.localeCompare(right.key);
}

function severityRank(severity: DashboardAlertDto['severity']): number {
  if (severity === 'critical') return 0;
  if (severity === 'warning') return 1;
  return 2;
}

function priorityFromSeverity(
  severity: DashboardAlertDto['severity'],
): DashboardModuleNextActionDto['priority'] {
  if (severity === 'critical') return 'critical';
  if (severity === 'warning') return 'high';
  return 'medium';
}

function actionPriorityRank(
  priority: DashboardModuleNextActionDto['priority'],
): number {
  if (priority === 'critical') return 0;
  if (priority === 'high') return 1;
  if (priority === 'medium') return 2;
  return 3;
}

function moduleAction(label: string, target: string): DashboardModuleActionDto {
  return {
    label,
    target,
    kind: 'frontend-route',
  };
}

function dashboardModulesDeferred() {
  return {
    customLayouts: 'deferred',
    userPreferences: 'deferred',
    exports: 'deferred',
    realtime: 'deferred',
  } as const;
}
