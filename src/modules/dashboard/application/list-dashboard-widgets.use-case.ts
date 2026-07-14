import { Injectable } from '@nestjs/common';
import { requireDashboardScope } from '../dashboard-context';
import {
  DASHBOARD_WIDGET_DEFAULT_LIMIT,
  DASHBOARD_WIDGET_MAX_LIMIT,
  DASHBOARD_WIDGET_SOURCES,
  DASHBOARD_WIDGET_TYPES,
  DashboardWidgetSource,
  DashboardWidgetType,
  DashboardWidgetsResponseDto,
  ListDashboardWidgetsQueryDto,
} from '../dto/dashboard-widgets.dto';
import { DASHBOARD_WIDGET_REGISTRY } from '../domain/dashboard-widget-registry';
import { presentDashboardWidgets } from '../presenters/dashboard-widgets.presenter';
import { DashboardTimeContextService } from './dashboard-time-context.service';
import { DashboardWidgetCompositionService } from './dashboard-widget-composition.service';

export interface NormalizedDashboardWidgetsQuery {
  source?: DashboardWidgetSource;
  type?: DashboardWidgetType;
  limit: number;
}

@Injectable()
export class ListDashboardWidgetsUseCase {
  constructor(
    private readonly dashboardTimeContextService: DashboardTimeContextService,
    private readonly dashboardWidgetCompositionService: DashboardWidgetCompositionService,
  ) {}

  async execute(
    query: ListDashboardWidgetsQueryDto = new ListDashboardWidgetsQueryDto(),
  ): Promise<DashboardWidgetsResponseDto> {
    const filters = normalizeDashboardWidgetsQuery(query);
    const definitions = DASHBOARD_WIDGET_REGISTRY.filter(
      (definition) => !filters.source || definition.source === filters.source,
    )
      .filter((definition) => !filters.type || definition.type === filters.type)
      .slice(0, filters.limit);
    const scope = requireDashboardScope();
    const timeContext =
      await this.dashboardTimeContextService.resolveForSchool(scope);
    const widgets = await this.dashboardWidgetCompositionService.compose({
      scope,
      timeContext,
      definitions,
    });

    return presentDashboardWidgets({
      generatedAt: timeContext.generatedAt,
      widgets,
      filters,
    });
  }
}

export function normalizeDashboardWidgetsQuery(
  query: ListDashboardWidgetsQueryDto,
): NormalizedDashboardWidgetsQuery {
  return {
    source: isDashboardWidgetSource(query.source) ? query.source : undefined,
    type: isDashboardWidgetType(query.type) ? query.type : undefined,
    limit: normalizeDashboardWidgetsLimit(query.limit),
  };
}

function normalizeDashboardWidgetsLimit(limit: number | undefined): number {
  if (typeof limit !== 'number' || !Number.isFinite(limit)) {
    return DASHBOARD_WIDGET_DEFAULT_LIMIT;
  }

  return Math.min(Math.max(Math.trunc(limit), 1), DASHBOARD_WIDGET_MAX_LIMIT);
}

function isDashboardWidgetSource(
  value: unknown,
): value is DashboardWidgetSource {
  return (
    typeof value === 'string' &&
    (DASHBOARD_WIDGET_SOURCES as readonly string[]).includes(value)
  );
}

function isDashboardWidgetType(value: unknown): value is DashboardWidgetType {
  return (
    typeof value === 'string' &&
    (DASHBOARD_WIDGET_TYPES as readonly string[]).includes(value)
  );
}
