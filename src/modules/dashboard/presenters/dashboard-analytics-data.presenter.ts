import {
  DashboardAnalyticsChartDataDto,
  DashboardAnalyticsChartDataEmptyStateDto,
  DashboardAnalyticsChartDataFiltersDto,
  DashboardAnalyticsChartDataResponseDto,
  DashboardAnalyticsChartDataSeriesDto,
} from '../dto/dashboard-analytics-data.dto';
import {
  DASHBOARD_ANALYTICS_OPERATIONAL_SNAPSHOT_PACK,
  getDashboardAnalyticsChartComputation,
  isDashboardAnalyticsComputedSnapshotChartKey,
} from '../domain/dashboard-analytics-data-pack';
import { DashboardAnalyticsChartDefinition } from '../domain/dashboard-analytics-catalog';
import { DashboardAlertSignals } from '../infrastructure/dashboard-alerts.repository';
import { DashboardSummarySnapshot } from '../infrastructure/dashboard-summary.repository';
import { dashboardFreshness } from './dashboard-metadata.presenter';

export interface DashboardAnalyticsChartDataPresentationInput {
  generatedAt: Date;
  chart: DashboardAnalyticsChartDefinition;
  filters: DashboardAnalyticsChartDataFiltersDto;
  summary?: DashboardSummarySnapshot;
  alertSignals?: DashboardAlertSignals;
}

export function presentDashboardAnalyticsChartData(
  input: DashboardAnalyticsChartDataPresentationInput,
): DashboardAnalyticsChartDataResponseDto {
  if (
    isDashboardAnalyticsComputedSnapshotChartKey(input.chart.chartKey) &&
    input.summary
  ) {
    return presentComputedSnapshotChartData({
      ...input,
      summary: input.summary,
    });
  }

  return presentUnsupportedChartData(input);
}

function presentComputedSnapshotChartData(
  input: DashboardAnalyticsChartDataPresentationInput & {
    summary: DashboardSummarySnapshot;
  },
): DashboardAnalyticsChartDataResponseDto {
  const data = buildComputedSnapshotData(input);

  return {
    generatedAt: input.generatedAt.toISOString(),
    chartKey: input.chart.chartKey,
    source: input.chart.source,
    title: input.chart.title,
    type: input.chart.type,
    status: input.chart.status,
    range: input.filters.range,
    granularity: input.filters.granularity,
    filters: input.filters,
    data,
    emptyState: data.empty ? noDataEmptyState(input.chart) : null,
    meta: {
      source: 'dashboard_analytics_data_pack',
      pack: DASHBOARD_ANALYTICS_OPERATIONAL_SNAPSHOT_PACK,
      dataAvailability: 'computed_snapshot',
      computation: isDashboardAnalyticsComputedSnapshotChartKey(
        input.chart.chartKey,
      )
        ? getDashboardAnalyticsChartComputation(input.chart.chartKey)
        : null,
      freshness: dashboardFreshness('request_time_snapshot'),
      deferred: {
        historicalSeries: 'deferred',
        drilldown: 'deferred',
        exports: 'deferred',
        realtime: 'deferred',
      },
    },
  };
}

function presentUnsupportedChartData(
  input: DashboardAnalyticsChartDataPresentationInput,
): DashboardAnalyticsChartDataResponseDto {
  return {
    generatedAt: input.generatedAt.toISOString(),
    chartKey: input.chart.chartKey,
    source: input.chart.source,
    title: input.chart.title,
    type: input.chart.type,
    status: input.chart.status,
    range: input.filters.range,
    granularity: input.filters.granularity,
    filters: input.filters,
    data: {
      series: [],
      totals: {},
      summary: null,
      empty: true,
    },
    emptyState: {
      reason: 'not_implemented',
      message:
        'Chart data for this definition will be implemented in a future analytics pack.',
    },
    meta: {
      source: 'dashboard_analytics_data_pack',
      pack: null,
      dataAvailability: 'definition_only',
      computation: null,
      freshness: dashboardFreshness('static_catalog'),
      deferred: {
        computedSeries: 'deferred',
        drilldown: 'deferred',
        exports: 'deferred',
        realtime: 'deferred',
      },
    },
  };
}

function buildComputedSnapshotData(
  input: DashboardAnalyticsChartDataPresentationInput & {
    summary: DashboardSummarySnapshot;
  },
): DashboardAnalyticsChartDataDto {
  const cards = input.summary.cards;

  switch (input.chart.chartKey) {
    case 'attendance.pending_sessions':
      return countSnapshotData({
        value: cards.attendance.pendingSessionsToday,
        seriesKey: 'pending',
        seriesLabel: 'Pending',
        totalKey: 'pending',
        summaryLabel: input.chart.title,
      });

    case 'grades.pending_submission_reviews':
      return countSnapshotData({
        value: cards.grades.pendingSubmissions,
        seriesKey: 'pending_submissions',
        seriesLabel: 'Pending submissions',
        totalKey: 'pendingSubmissions',
        summaryLabel: input.chart.title,
      });

    case 'grades.pending_answer_reviews':
      return countSnapshotData({
        value: cards.grades.pendingAnswerReviews,
        seriesKey: 'pending_answer_reviews',
        seriesLabel: 'Pending answer reviews',
        totalKey: 'pendingAnswerReviews',
        summaryLabel: input.chart.title,
      });

    case 'communication.moderation_queue':
      return countSnapshotData({
        value: cards.communication.pendingModerationReports,
        seriesKey: 'pending_moderation_reports',
        seriesLabel: 'Pending moderation reports',
        totalKey: 'pendingModerationReports',
        summaryLabel: input.chart.title,
      });

    case 'settings.email_connection_readiness':
      return readinessSnapshotData({
        missing: input.alertSignals?.settings.missingActiveEmailConnection ?? 1,
        seriesKey: 'ready',
        seriesLabel: 'Ready',
        summaryLabel: input.chart.title,
      });

    case 'settings.login_identity_readiness':
      return readinessSnapshotData({
        missing: input.alertSignals?.settings.missingLoginIdentity ?? 1,
        seriesKey: 'configured',
        seriesLabel: 'Configured',
        summaryLabel: input.chart.title,
      });

    default:
      return {
        series: [],
        totals: {},
        summary: null,
        empty: true,
      };
  }
}

function countSnapshotData(input: {
  value: number;
  seriesKey: string;
  seriesLabel: string;
  totalKey: string;
  summaryLabel: string;
}): DashboardAnalyticsChartDataDto {
  return {
    series: [snapshotSeries(input.seriesKey, input.seriesLabel, input.value)],
    totals: {
      [input.totalKey]: input.value,
    },
    summary: {
      value: input.value,
      label: input.summaryLabel,
    },
    empty: input.value === 0,
  };
}

function readinessSnapshotData(input: {
  missing: number;
  seriesKey: string;
  seriesLabel: string;
  summaryLabel: string;
}): DashboardAnalyticsChartDataDto {
  const ready = input.missing === 0;
  const value = ready ? 100 : 0;

  return {
    series: [snapshotSeries(input.seriesKey, input.seriesLabel, value)],
    totals: {
      ready: ready ? 1 : 0,
      missing: ready ? 0 : 1,
    },
    summary: {
      value,
      label: input.summaryLabel,
    },
    empty: false,
  };
}

function snapshotSeries(
  key: string,
  label: string,
  value: number,
): DashboardAnalyticsChartDataSeriesDto {
  return {
    key,
    label,
    points: [
      {
        x: 'snapshot',
        y: value,
      },
    ],
  };
}

function noDataEmptyState(
  chart: DashboardAnalyticsChartDefinition,
): DashboardAnalyticsChartDataEmptyStateDto {
  return {
    reason: 'no_data',
    message: chart.emptyState.message,
  };
}
