import {
  DashboardAnalyticsChartDataDto,
  DashboardAnalyticsChartDataEmptyStateDto,
  DashboardAnalyticsChartDataFiltersDto,
  DashboardAnalyticsChartDataResponseDto,
  DashboardAnalyticsChartDataSeriesDto,
  DashboardAnalyticsQueryMetadataDto,
} from '../dto/dashboard-analytics-data.dto';
import { DashboardAnalyticsChartDefinition } from '../domain/dashboard-analytics-catalog';
import { dashboardAnalyticsSnapshotPoint } from '../domain/dashboard-analytics-coordinate';
import {
  DashboardAnalyticsQueryContext,
  DashboardAnalyticsResolvedHierarchy,
} from '../domain/dashboard-analytics-query';
import {
  DASHBOARD_ANALYTICS_OPERATIONAL_SNAPSHOT_PACK,
  getDashboardAnalyticsChartComputation,
  isDashboardAnalyticsComputedSnapshotChartKey,
} from '../domain/dashboard-analytics-data-pack';
import { DashboardAlertSignals } from '../infrastructure/dashboard-alerts.repository';
import { DashboardSummarySnapshot } from '../infrastructure/dashboard-summary.repository';
import { dashboardFreshness } from './dashboard-metadata.presenter';

export interface DashboardAnalyticsChartDataPresentationInput {
  queryContext: DashboardAnalyticsQueryContext;
  chart: DashboardAnalyticsChartDefinition;
  snapshotValue?: number;
  summary?: DashboardSummarySnapshot;
  alertSignals?: DashboardAlertSignals;
}

export function presentDashboardAnalyticsChartData(
  input: DashboardAnalyticsChartDataPresentationInput,
): DashboardAnalyticsChartDataResponseDto {
  if (
    isDashboardAnalyticsComputedSnapshotChartKey(input.chart.chartKey) &&
    (input.snapshotValue !== undefined || input.summary)
  ) {
    return presentComputedSnapshotChartData(input);
  }

  return presentUnsupportedChartData(input);
}

function presentComputedSnapshotChartData(
  input: DashboardAnalyticsChartDataPresentationInput,
): DashboardAnalyticsChartDataResponseDto {
  const data = buildComputedSnapshotData(input);

  return {
    ...responseIdentity(input),
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
      query: presentQueryMetadata(input.queryContext),
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
    ...responseIdentity(input),
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
      query: presentQueryMetadata(input.queryContext),
      deferred: {
        computedSeries: 'deferred',
        drilldown: 'deferred',
        exports: 'deferred',
        realtime: 'deferred',
      },
    },
  };
}

function responseIdentity(input: DashboardAnalyticsChartDataPresentationInput) {
  return {
    generatedAt: input.queryContext.generatedAt.toISOString(),
    chartKey: input.chart.chartKey,
    source: input.chart.source,
    title: input.chart.title,
    type: input.chart.type,
    status: input.chart.status,
    range: input.queryContext.range,
    granularity: input.queryContext.granularity,
    filters: presentFilters(input.queryContext),
  };
}

function buildComputedSnapshotData(
  input: DashboardAnalyticsChartDataPresentationInput,
): DashboardAnalyticsChartDataDto {
  const cards = input.summary?.cards;

  switch (input.chart.chartKey) {
    case 'attendance.pending_sessions':
      return countSnapshotData({
        value:
          input.snapshotValue ?? cards?.attendance.pendingSessionsToday ?? 0,
        seriesKey: 'pending',
        seriesLabel: 'Pending',
        totalKey: 'pending',
        summaryLabel: input.chart.title,
      });

    case 'grades.pending_submission_reviews':
      return countSnapshotData({
        value: input.snapshotValue ?? cards?.grades.pendingSubmissions ?? 0,
        seriesKey: 'pending_submissions',
        seriesLabel: 'Pending submissions',
        totalKey: 'pendingSubmissions',
        summaryLabel: input.chart.title,
      });

    case 'grades.pending_answer_reviews':
      return countSnapshotData({
        value: input.snapshotValue ?? cards?.grades.pendingAnswerReviews ?? 0,
        seriesKey: 'pending_answer_reviews',
        seriesLabel: 'Pending answer reviews',
        totalKey: 'pendingAnswerReviews',
        summaryLabel: input.chart.title,
      });

    case 'communication.moderation_queue':
      return countSnapshotData({
        value:
          input.snapshotValue ??
          cards?.communication.pendingModerationReports ??
          0,
        seriesKey: 'pending_moderation_reports',
        seriesLabel: 'Pending moderation reports',
        totalKey: 'pendingModerationReports',
        summaryLabel: input.chart.title,
      });

    case 'settings.email_connection_readiness':
      return readinessSnapshotData({
        value:
          input.snapshotValue ??
          ((input.alertSignals?.settings.missingActiveEmailConnection ?? 1) ===
          0
            ? 100
            : 0),
        seriesKey: 'ready',
        seriesLabel: 'Ready',
        summaryLabel: input.chart.title,
      });

    case 'settings.login_identity_readiness':
      return readinessSnapshotData({
        value:
          input.snapshotValue ??
          ((input.alertSignals?.settings.missingLoginIdentity ?? 1) === 0
            ? 100
            : 0),
        seriesKey: 'configured',
        seriesLabel: 'Configured',
        summaryLabel: input.chart.title,
      });

    default:
      return { series: [], totals: {}, summary: null, empty: true };
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
    totals: { [input.totalKey]: input.value },
    summary: { value: input.value, label: input.summaryLabel },
    empty: input.value === 0,
  };
}

function readinessSnapshotData(input: {
  value: number;
  seriesKey: string;
  seriesLabel: string;
  summaryLabel: string;
}): DashboardAnalyticsChartDataDto {
  const ready = input.value === 100;
  return {
    series: [snapshotSeries(input.seriesKey, input.seriesLabel, input.value)],
    totals: { ready: ready ? 1 : 0, missing: ready ? 0 : 1 },
    summary: { value: input.value, label: input.summaryLabel },
    empty: false,
  };
}

function snapshotSeries(
  key: string,
  label: string,
  value: number,
): DashboardAnalyticsChartDataSeriesDto {
  return { key, label, points: [dashboardAnalyticsSnapshotPoint(value)] };
}

function presentFilters(
  context: DashboardAnalyticsQueryContext,
): DashboardAnalyticsChartDataFiltersDto {
  const explicitlySupplied = new Set(context.explicitlySuppliedKeys);
  return {
    range: context.range,
    granularity: context.granularity,
    dateFrom: context.range === 'custom' ? context.startCivilDate : null,
    dateTo: context.range === 'custom' ? context.endCivilDate : null,
    academicYearId: explicitlySupplied.has('academicYearId')
      ? context.hierarchy.academicYearId
      : null,
    termId: explicitlySupplied.has('termId') ? context.hierarchy.termId : null,
    gradeId: explicitlySupplied.has('gradeId')
      ? context.hierarchy.gradeId
      : null,
    sectionId: explicitlySupplied.has('sectionId')
      ? context.hierarchy.sectionId
      : null,
    classroomId: explicitlySupplied.has('classroomId')
      ? context.hierarchy.classroomId
      : null,
  };
}

function presentQueryMetadata(
  context: DashboardAnalyticsQueryContext,
): DashboardAnalyticsQueryMetadataDto {
  return {
    effectiveTimezone: context.timezone,
    requestedFilters: [...context.explicitlySuppliedKeys],
    appliedFilters: [...context.filtersApplied],
    notApplicableFilters: [...context.filtersNotApplicable],
    resolvedWindow: {
      startInclusive: context.startInclusive.toISOString(),
      endExclusive: context.endExclusive.toISOString(),
      startCivilDate: context.startCivilDate,
      endCivilDate: context.endCivilDate,
    },
  };
}

function noDataEmptyState(
  chart: DashboardAnalyticsChartDefinition,
): DashboardAnalyticsChartDataEmptyStateDto {
  return { reason: 'no_data', message: chart.emptyState.message };
}

export function dashboardAnalyticsPresentationHierarchy(
  hierarchy: Partial<DashboardAnalyticsResolvedHierarchy>,
): DashboardAnalyticsResolvedHierarchy {
  return {
    academicYearId: hierarchy.academicYearId ?? null,
    termId: hierarchy.termId ?? null,
    gradeId: hierarchy.gradeId ?? null,
    sectionId: hierarchy.sectionId ?? null,
    classroomId: hierarchy.classroomId ?? null,
  };
}
