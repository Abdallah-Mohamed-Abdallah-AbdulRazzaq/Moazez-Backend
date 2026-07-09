import {
  DASHBOARD_ANALYTICS_COMPUTED_SNAPSHOT_CHART_KEYS,
  DashboardAnalyticsComputedSnapshotChartKey,
} from './dashboard-analytics-catalog';

export const DASHBOARD_ANALYTICS_OPERATIONAL_SNAPSHOT_PACK =
  'operational_snapshot_v1' as const;

export type DashboardAnalyticsOperationalSnapshotPack =
  typeof DASHBOARD_ANALYTICS_OPERATIONAL_SNAPSHOT_PACK;

export type DashboardAnalyticsDataComputation =
  | 'dashboard_summary_snapshot'
  | 'dashboard_alert_readiness_snapshot';

export function isDashboardAnalyticsComputedSnapshotChartKey(
  chartKey: string,
): chartKey is DashboardAnalyticsComputedSnapshotChartKey {
  return (
    DASHBOARD_ANALYTICS_COMPUTED_SNAPSHOT_CHART_KEYS as readonly string[]
  ).includes(chartKey);
}

export function getDashboardAnalyticsChartComputation(
  chartKey: DashboardAnalyticsComputedSnapshotChartKey,
): DashboardAnalyticsDataComputation {
  if (
    chartKey === 'settings.email_connection_readiness' ||
    chartKey === 'settings.login_identity_readiness'
  ) {
    return 'dashboard_alert_readiness_snapshot';
  }

  return 'dashboard_summary_snapshot';
}
