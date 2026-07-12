import {
  DashboardAnalyticsCatalogResponseDto,
  DashboardAnalyticsChartDetailDto,
  DashboardAnalyticsChartDto,
  DashboardAnalyticsChartResponseDto,
  DashboardAnalyticsChartsResponseDto,
  DashboardAnalyticsFilterDto,
} from '../dto/dashboard-analytics.dto';
import {
  DASHBOARD_ANALYTICS_CATALOG,
  DashboardAnalyticsCatalogDefinition,
  DashboardAnalyticsChartDefinition,
  DashboardAnalyticsChartType,
  DashboardAnalyticsSource,
  DashboardAnalyticsStatus,
} from '../domain/dashboard-analytics-catalog';
import { dashboardFreshness } from './dashboard-metadata.presenter';

export interface DashboardAnalyticsCatalogPresentationInput {
  generatedAt: Date;
  catalog?: DashboardAnalyticsCatalogDefinition;
}

export interface DashboardAnalyticsChartsPresentationInput {
  generatedAt: Date;
  charts: readonly DashboardAnalyticsChartDefinition[];
  filters: {
    source?: DashboardAnalyticsSource;
    type?: DashboardAnalyticsChartType;
    status?: DashboardAnalyticsStatus;
    limit: number;
  };
}

export interface DashboardAnalyticsChartPresentationInput {
  generatedAt: Date;
  chart: DashboardAnalyticsChartDefinition;
}

export function presentDashboardAnalyticsCatalog(
  input: DashboardAnalyticsCatalogPresentationInput,
): DashboardAnalyticsCatalogResponseDto {
  const catalog = input.catalog ?? DASHBOARD_ANALYTICS_CATALOG;

  return {
    generatedAt: input.generatedAt.toISOString(),
    catalog: {
      version: catalog.version,
      sources: catalog.sources.map((source) => ({ ...source })),
      supportedChartTypes: catalog.supportedChartTypes,
      supportedRanges: catalog.supportedRanges,
      supportedGranularities: catalog.supportedGranularities,
      filters: catalog.filters.map(presentFilter),
      metrics: catalog.metrics.map((metric) => ({ ...metric })),
      kpis: catalog.kpis.map((kpi) => ({ ...kpi })),
      charts: catalog.charts.map(presentChartDefinition),
    },
    deferred: dashboardAnalyticsCatalogDeferred(),
    meta: {
      source: 'dashboard_analytics_catalog',
      dataFreshness: 'catalog',
      freshness: dashboardFreshness('static_catalog'),
    },
  };
}

export function presentDashboardAnalyticsCharts(
  input: DashboardAnalyticsChartsPresentationInput,
): DashboardAnalyticsChartsResponseDto {
  const charts = input.charts.map(presentChartDefinition);

  return {
    generatedAt: input.generatedAt.toISOString(),
    charts,
    summary: summarizeCharts(charts),
    filters: {
      source: input.filters.source ?? null,
      type: input.filters.type ?? null,
      status: input.filters.status ?? null,
      limit: input.filters.limit,
    },
    deferred: dashboardAnalyticsChartsDeferred(input.charts),
  };
}

export function presentDashboardAnalyticsChart(
  input: DashboardAnalyticsChartPresentationInput,
): DashboardAnalyticsChartResponseDto {
  return {
    generatedAt: input.generatedAt.toISOString(),
    chart: presentChartDetail(input.chart),
    deferred: dashboardAnalyticsChartsDeferred([input.chart]),
  };
}

function presentFilter(filter: {
  key: DashboardAnalyticsFilterDto['key'];
  type: DashboardAnalyticsFilterDto['type'];
  values?: readonly string[];
  description: string;
  requiredWhen?: string;
  validation?: string;
}): DashboardAnalyticsFilterDto {
  return {
    key: filter.key,
    type: filter.type,
    values: filter.values ?? null,
    description: filter.description,
    requiredWhen: filter.requiredWhen ?? null,
    validation: filter.validation ?? null,
  };
}

function presentChartDefinition(
  chart: DashboardAnalyticsChartDefinition,
): DashboardAnalyticsChartDto {
  return {
    chartKey: chart.chartKey,
    source: chart.source,
    title: chart.title,
    description: chart.description,
    type: chart.type,
    status: chart.status,
    defaultRange: chart.defaultRange,
    supportedRanges: chart.supportedRanges,
    supportedGranularities: chart.supportedGranularities,
    requiredPermission: chart.requiredPermission,
    endpoint: chart.endpoint,
    definitionEndpoint: chart.definitionEndpoint,
    dataEndpoint: chart.dataEndpoint,
    endpointPurpose: chart.endpointPurpose,
    series: chart.series.map((series) => ({ ...series })),
    filters: chart.filters,
    emptyState: { ...chart.emptyState },
    meta: { ...chart.meta },
    queryCapabilities: {
      ...chart.queryCapabilities,
      supportedRanges: [...chart.queryCapabilities.supportedRanges],
      supportedGranularities: [
        ...chart.queryCapabilities.supportedGranularities,
      ],
      supportedHierarchyFilters: [
        ...chart.queryCapabilities.supportedHierarchyFilters,
      ],
    },
  };
}

function presentChartDetail(
  chart: DashboardAnalyticsChartDefinition,
): DashboardAnalyticsChartDetailDto {
  return {
    ...presentChartDefinition(chart),
    futureDataContract: {
      series: chart.series.map((series) => ({
        key: series.key,
        label: series.label,
        points: [
          {
            x: 'YYYY-MM-DD',
            y: 0,
            metadata: {
              drilldown: {
                source: chart.source,
                filters: {},
              },
            },
          },
        ],
      })),
    },
  };
}

function summarizeCharts(charts: readonly DashboardAnalyticsChartDto[]) {
  return charts.reduce(
    (summary, chart) => {
      summary.total += 1;
      summary.bySource[chart.source] =
        (summary.bySource[chart.source] ?? 0) + 1;
      summary.byType[chart.type] = (summary.byType[chart.type] ?? 0) + 1;
      summary.byStatus[chart.status] =
        (summary.byStatus[chart.status] ?? 0) + 1;
      return summary;
    },
    {
      total: 0,
      bySource: {},
      byType: {},
      byStatus: {},
    } as DashboardAnalyticsChartsResponseDto['summary'],
  );
}

function dashboardAnalyticsCatalogDeferred() {
  return {
    computedSeries: 'available',
    historicalSeries: 'available',
    drilldownData: 'deferred',
    savedReports: 'deferred',
    customDashboards: 'deferred',
    exports: 'deferred',
    realtime: 'deferred',
  } as const;
}

function dashboardAnalyticsChartsDeferred(
  charts: readonly DashboardAnalyticsChartDefinition[],
) {
  const hasComputedSnapshot = charts.some(
    (chart) => chart.meta.dataAvailability === 'computed_snapshot',
  );
  const hasComputedData = charts.some(
    (chart) =>
      chart.meta.dataAvailability === 'computed_series' ||
      chart.meta.dataAvailability === 'computed_category',
  );
  const hasHistoricalSeries = charts.some(
    (chart) => chart.meta.dataAvailability === 'computed_series',
  );

  return {
    computedSeries: hasComputedData
      ? 'available'
      : hasComputedSnapshot
        ? 'snapshot_only'
        : 'deferred',
    historicalSeries: hasHistoricalSeries ? 'available' : 'deferred',
    drilldownData: 'deferred',
  } as const;
}
