import {
  DashboardAlertDto,
  DashboardAlertsResponseDto,
  DashboardAlertsSummaryDto,
} from '../dto/dashboard-alerts.dto';

export interface DashboardAlertsPresentationInput {
  generatedAt: Date;
  alerts: DashboardAlertDto[];
}

export function presentDashboardAlerts(
  input: DashboardAlertsPresentationInput,
): DashboardAlertsResponseDto {
  const alerts = input.alerts.map((alert) => ({
    key: alert.key,
    source: alert.source,
    severity: alert.severity,
    title: alert.title,
    description: alert.description,
    count: alert.count,
    action: {
      label: alert.action.label,
      target: alert.action.target,
    },
  }));

  return {
    generatedAt: input.generatedAt.toISOString(),
    alerts,
    summary: buildSummary(alerts),
    deferred: {
      persistence: 'deferred',
      acknowledge: 'deferred',
      dismiss: 'deferred',
      activityFeed: 'deferred',
    },
  };
}

function buildSummary(alerts: DashboardAlertDto[]): DashboardAlertsSummaryDto {
  return alerts.reduce<DashboardAlertsSummaryDto>(
    (summary, alert) => {
      summary.total += alert.count;
      summary[alert.severity] += alert.count;
      summary.bySource[alert.source] =
        (summary.bySource[alert.source] ?? 0) + alert.count;
      return summary;
    },
    {
      total: 0,
      critical: 0,
      warning: 0,
      info: 0,
      bySource: {},
    },
  );
}
