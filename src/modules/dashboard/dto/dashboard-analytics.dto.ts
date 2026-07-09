import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import {
  DASHBOARD_ANALYTICS_CHART_TYPES,
  DASHBOARD_ANALYTICS_DEFAULT_CHART_LIMIT,
  DASHBOARD_ANALYTICS_FILTER_KEYS,
  DASHBOARD_ANALYTICS_GRANULARITIES,
  DASHBOARD_ANALYTICS_MAX_CHART_LIMIT,
  DASHBOARD_ANALYTICS_RANGES,
  DASHBOARD_ANALYTICS_SOURCES,
  DASHBOARD_ANALYTICS_STATUSES,
} from '../domain/dashboard-analytics-catalog';
import type {
  DashboardAnalyticsChartType,
  DashboardAnalyticsDataAvailability,
  DashboardAnalyticsFilterKey,
  DashboardAnalyticsGranularity,
  DashboardAnalyticsMetricAggregation,
  DashboardAnalyticsMetricValueType,
  DashboardAnalyticsRange,
  DashboardAnalyticsSource,
  DashboardAnalyticsStatus,
  DashboardAnalyticsTone,
} from '../domain/dashboard-analytics-catalog';

export class ListDashboardAnalyticsChartsQueryDto {
  @IsOptional()
  @IsIn(DASHBOARD_ANALYTICS_SOURCES)
  source?: DashboardAnalyticsSource;

  @IsOptional()
  @IsIn(DASHBOARD_ANALYTICS_CHART_TYPES)
  type?: DashboardAnalyticsChartType;

  @IsOptional()
  @IsIn(DASHBOARD_ANALYTICS_STATUSES)
  status?: DashboardAnalyticsStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(DASHBOARD_ANALYTICS_MAX_CHART_LIMIT)
  limit = DASHBOARD_ANALYTICS_DEFAULT_CHART_LIMIT;
}

export class DashboardAnalyticsSourceDto {
  source!: DashboardAnalyticsSource;
  label!: string;
  status!: DashboardAnalyticsStatus;
  description!: string;
}

export class DashboardAnalyticsFilterDto {
  key!: DashboardAnalyticsFilterKey;
  type!: 'enum' | 'date' | 'id';
  values!: readonly string[] | null;
  description!: string;
  requiredWhen!: string | null;
  validation!: string | null;
}

export class DashboardAnalyticsMetricDto {
  metricKey!: string;
  source!: DashboardAnalyticsSource;
  label!: string;
  description!: string;
  valueType!: DashboardAnalyticsMetricValueType;
  unit!: string | null;
  aggregation!: DashboardAnalyticsMetricAggregation;
  status!: DashboardAnalyticsStatus;
  sourceModels!: readonly string[];
  noLeakNotes!: string;
}

export class DashboardAnalyticsKpiDto {
  kpiKey!: string;
  source!: DashboardAnalyticsSource;
  label!: string;
  description!: string;
  metricKeys!: readonly string[];
  status!: DashboardAnalyticsStatus;
  defaultTone!: DashboardAnalyticsTone;
  actionTarget!: string;
}

export class DashboardAnalyticsSeriesDto {
  key!: string;
  label!: string;
}

export class DashboardAnalyticsChartEmptyStateDto {
  reason!: 'not_implemented';
  message!: string;
}

export class DashboardAnalyticsChartMetaDto {
  dataAvailability!: DashboardAnalyticsDataAvailability;
}

export class DashboardAnalyticsChartDto {
  chartKey!: string;
  source!: DashboardAnalyticsSource;
  title!: string;
  description!: string;
  type!: DashboardAnalyticsChartType;
  status!: DashboardAnalyticsStatus;
  defaultRange!: DashboardAnalyticsRange;
  supportedRanges!: readonly DashboardAnalyticsRange[];
  supportedGranularities!: readonly DashboardAnalyticsGranularity[];
  requiredPermission!: 'dashboard.analytics.view';
  endpoint!: string;
  series!: readonly DashboardAnalyticsSeriesDto[];
  filters!: readonly DashboardAnalyticsFilterKey[];
  emptyState!: DashboardAnalyticsChartEmptyStateDto;
  meta!: DashboardAnalyticsChartMetaDto;
}

export class DashboardAnalyticsFuturePointDto {
  x!: 'YYYY-MM-DD';
  y!: 0;
  metadata!: {
    drilldown: {
      source: DashboardAnalyticsSource;
      filters: Record<string, never>;
    };
  };
}

export class DashboardAnalyticsFutureSeriesDto {
  key!: string;
  label!: string;
  points!: readonly DashboardAnalyticsFuturePointDto[];
}

export class DashboardAnalyticsFutureDataContractDto {
  series!: readonly DashboardAnalyticsFutureSeriesDto[];
}

export class DashboardAnalyticsChartDetailDto extends DashboardAnalyticsChartDto {
  futureDataContract!: DashboardAnalyticsFutureDataContractDto;
}

export class DashboardAnalyticsCatalogDto {
  version!: 'v1';
  sources!: readonly DashboardAnalyticsSourceDto[];
  supportedChartTypes!: readonly DashboardAnalyticsChartType[];
  supportedRanges!: readonly DashboardAnalyticsRange[];
  supportedGranularities!: readonly DashboardAnalyticsGranularity[];
  filters!: readonly DashboardAnalyticsFilterDto[];
  metrics!: readonly DashboardAnalyticsMetricDto[];
  kpis!: readonly DashboardAnalyticsKpiDto[];
  charts!: readonly DashboardAnalyticsChartDto[];
}

export class DashboardAnalyticsCatalogDeferredDto {
  computedSeries!: 'deferred';
  drilldownData!: 'deferred';
  savedReports!: 'deferred';
  customDashboards!: 'deferred';
  exports!: 'deferred';
  realtime!: 'deferred';
}

export class DashboardAnalyticsCatalogMetaDto {
  source!: 'dashboard_analytics_catalog';
  dataFreshness!: 'catalog';
}

export class DashboardAnalyticsCatalogResponseDto {
  generatedAt!: string;
  catalog!: DashboardAnalyticsCatalogDto;
  deferred!: DashboardAnalyticsCatalogDeferredDto;
  meta!: DashboardAnalyticsCatalogMetaDto;
}

export class DashboardAnalyticsChartsSummaryDto {
  total!: number;
  bySource!: Partial<Record<DashboardAnalyticsSource, number>>;
  byType!: Partial<Record<DashboardAnalyticsChartType, number>>;
  byStatus!: Partial<Record<DashboardAnalyticsStatus, number>>;
}

export class DashboardAnalyticsChartsFiltersDto {
  source!: DashboardAnalyticsSource | null;
  type!: DashboardAnalyticsChartType | null;
  status!: DashboardAnalyticsStatus | null;
  limit!: number;
}

export class DashboardAnalyticsChartsDeferredDto {
  computedSeries!: 'deferred';
  drilldownData!: 'deferred';
}

export class DashboardAnalyticsChartsResponseDto {
  generatedAt!: string;
  charts!: readonly DashboardAnalyticsChartDto[];
  summary!: DashboardAnalyticsChartsSummaryDto;
  filters!: DashboardAnalyticsChartsFiltersDto;
  deferred!: DashboardAnalyticsChartsDeferredDto;
}

export class DashboardAnalyticsChartResponseDto {
  generatedAt!: string;
  chart!: DashboardAnalyticsChartDetailDto;
  deferred!: DashboardAnalyticsChartsDeferredDto;
}

export { DASHBOARD_ANALYTICS_FILTER_KEYS };
