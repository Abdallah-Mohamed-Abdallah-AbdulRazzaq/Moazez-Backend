export type DashboardWidgetCompositionDependency =
  | 'summary'
  | 'alerts'
  | 'activity'
  | 'todos';

export type DashboardWidgetAnalyticsChartKey =
  | 'students.enrollment_growth'
  | 'attendance.daily_trend'
  | 'communication.message_volume'
  | 'academics.teacher_allocation_coverage'
  | 'grades.gradebook_completion';

export interface DashboardWidgetAnalyticsBinding {
  chartKey: DashboardWidgetAnalyticsChartKey;
  range: '30d';
  granularity: 'day';
}

export interface DashboardWidgetCompositionDescriptor {
  dependencies: readonly DashboardWidgetCompositionDependency[];
  analytics: DashboardWidgetAnalyticsBinding | null;
}

export interface DashboardWidgetCompositionPlan {
  loadSummary: boolean;
  loadAlerts: boolean;
  loadActivity: boolean;
  loadTodos: boolean;
  analytics: readonly DashboardWidgetAnalyticsBinding[];
}

export function buildDashboardWidgetCompositionPlan(
  definitions: readonly {
    composition: DashboardWidgetCompositionDescriptor;
  }[],
): DashboardWidgetCompositionPlan {
  const dependencies = new Set<DashboardWidgetCompositionDependency>();
  const analyticsByChartKey = new Map<
    DashboardWidgetAnalyticsChartKey,
    DashboardWidgetAnalyticsBinding
  >();

  for (const definition of definitions) {
    for (const dependency of definition.composition.dependencies) {
      dependencies.add(dependency);
    }

    const analytics = definition.composition.analytics;
    if (analytics && !analyticsByChartKey.has(analytics.chartKey)) {
      analyticsByChartKey.set(analytics.chartKey, analytics);
    }
  }

  return {
    loadSummary: dependencies.has('summary'),
    loadAlerts: dependencies.has('alerts'),
    loadActivity: dependencies.has('activity'),
    loadTodos: dependencies.has('todos'),
    analytics: [...analyticsByChartKey.values()],
  };
}
