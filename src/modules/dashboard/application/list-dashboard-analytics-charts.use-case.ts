import { Injectable } from '@nestjs/common';
import { requireDashboardScope } from '../dashboard-context';
import { DashboardAnalyticsChartsResponseDto, ListDashboardAnalyticsChartsQueryDto } from '../dto/dashboard-analytics.dto';
import {
  DASHBOARD_ANALYTICS_CHARTS,
  DASHBOARD_ANALYTICS_CHART_TYPES,
  DASHBOARD_ANALYTICS_DEFAULT_CHART_LIMIT,
  DASHBOARD_ANALYTICS_MAX_CHART_LIMIT,
  DASHBOARD_ANALYTICS_SOURCES,
  DASHBOARD_ANALYTICS_STATUSES,
  DashboardAnalyticsChartType,
  DashboardAnalyticsSource,
  DashboardAnalyticsStatus,
} from '../domain/dashboard-analytics-catalog';
import { presentDashboardAnalyticsCharts } from '../presenters/dashboard-analytics.presenter';

export interface NormalizedDashboardAnalyticsChartsQuery {
  source?: DashboardAnalyticsSource;
  type?: DashboardAnalyticsChartType;
  status?: DashboardAnalyticsStatus;
  limit: number;
}

@Injectable()
export class ListDashboardAnalyticsChartsUseCase {
  execute(
    query: ListDashboardAnalyticsChartsQueryDto = new ListDashboardAnalyticsChartsQueryDto(),
  ): DashboardAnalyticsChartsResponseDto {
    requireDashboardScope();

    const filters = normalizeDashboardAnalyticsChartsQuery(query);
    const charts = DASHBOARD_ANALYTICS_CHARTS.filter(
      (chart) => !filters.source || chart.source === filters.source,
    )
      .filter((chart) => !filters.type || chart.type === filters.type)
      .filter((chart) => !filters.status || chart.status === filters.status)
      .slice(0, filters.limit);

    return presentDashboardAnalyticsCharts({
      generatedAt: new Date(),
      charts,
      filters,
    });
  }
}

export function normalizeDashboardAnalyticsChartsQuery(
  query: ListDashboardAnalyticsChartsQueryDto,
): NormalizedDashboardAnalyticsChartsQuery {
  return {
    source: isDashboardAnalyticsSource(query.source) ? query.source : undefined,
    type: isDashboardAnalyticsChartType(query.type) ? query.type : undefined,
    status: isDashboardAnalyticsStatus(query.status) ? query.status : undefined,
    limit: normalizeDashboardAnalyticsChartsLimit(query.limit),
  };
}

function normalizeDashboardAnalyticsChartsLimit(
  limit: number | undefined,
): number {
  if (typeof limit !== 'number' || !Number.isFinite(limit)) {
    return DASHBOARD_ANALYTICS_DEFAULT_CHART_LIMIT;
  }

  return Math.min(
    Math.max(Math.trunc(limit), 1),
    DASHBOARD_ANALYTICS_MAX_CHART_LIMIT,
  );
}

function isDashboardAnalyticsSource(
  value: unknown,
): value is DashboardAnalyticsSource {
  return (
    typeof value === 'string' &&
    (DASHBOARD_ANALYTICS_SOURCES as readonly string[]).includes(value)
  );
}

function isDashboardAnalyticsChartType(
  value: unknown,
): value is DashboardAnalyticsChartType {
  return (
    typeof value === 'string' &&
    (DASHBOARD_ANALYTICS_CHART_TYPES as readonly string[]).includes(value)
  );
}

function isDashboardAnalyticsStatus(
  value: unknown,
): value is DashboardAnalyticsStatus {
  return (
    typeof value === 'string' &&
    (DASHBOARD_ANALYTICS_STATUSES as readonly string[]).includes(value)
  );
}
