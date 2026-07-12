import {
  DASHBOARD_ANALYTICS_ATTENDANCE_PACK_CHART_KEYS,
  DASHBOARD_ANALYTICS_COMPUTED_SNAPSHOT_CHART_KEYS,
  DashboardAnalyticsAttendancePackChartKey,
  DashboardAnalyticsComputedSnapshotChartKey,
} from './dashboard-analytics-catalog';

export const DASHBOARD_ANALYTICS_OPERATIONAL_SNAPSHOT_PACK =
  'operational_snapshot_v1' as const;

export type DashboardAnalyticsOperationalSnapshotPack =
  typeof DASHBOARD_ANALYTICS_OPERATIONAL_SNAPSHOT_PACK;

export const DASHBOARD_ANALYTICS_ATTENDANCE_PACK = 'attendance_v1' as const;

export type DashboardAnalyticsAttendancePack =
  typeof DASHBOARD_ANALYTICS_ATTENDANCE_PACK;

export type DashboardAnalyticsDataComputation =
  | 'dashboard_summary_snapshot'
  | 'dashboard_alert_readiness_snapshot'
  | 'attendance_observation_daily_trend'
  | 'attendance_observation_status_distribution'
  | 'attendance_observation_absence_rate'
  | 'attendance_observation_late_rate'
  | 'attendance_excuse_status_distribution';

export function isDashboardAnalyticsComputedSnapshotChartKey(
  chartKey: string,
): chartKey is DashboardAnalyticsComputedSnapshotChartKey {
  return (
    DASHBOARD_ANALYTICS_COMPUTED_SNAPSHOT_CHART_KEYS as readonly string[]
  ).includes(chartKey);
}

export function isDashboardAnalyticsAttendancePackChartKey(
  chartKey: string,
): chartKey is DashboardAnalyticsAttendancePackChartKey {
  return (
    DASHBOARD_ANALYTICS_ATTENDANCE_PACK_CHART_KEYS as readonly string[]
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

export function getDashboardAnalyticsAttendanceComputation(
  chartKey: DashboardAnalyticsAttendancePackChartKey,
): DashboardAnalyticsDataComputation {
  switch (chartKey) {
    case 'attendance.daily_trend':
      return 'attendance_observation_daily_trend';
    case 'attendance.status_distribution':
      return 'attendance_observation_status_distribution';
    case 'attendance.absence_rate':
      return 'attendance_observation_absence_rate';
    case 'attendance.late_rate':
      return 'attendance_observation_late_rate';
    case 'attendance.excuse_status':
      return 'attendance_excuse_status_distribution';
  }
}
