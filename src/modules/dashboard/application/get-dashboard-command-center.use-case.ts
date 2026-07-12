import { Injectable } from '@nestjs/common';
import { requireDashboardScope } from '../dashboard-context';
import {
  compareDashboardActivityItems,
  mapAuditRecordToDashboardActivity,
} from './list-dashboard-activity-feed.use-case';
import {
  buildDashboardAlerts,
  buildDashboardAlertsDateWindow,
} from './list-dashboard-alerts.use-case';
import { buildDashboardSummaryDateWindow } from './get-dashboard-summary.use-case';
import { DashboardCommandCenterResponseDto } from '../dto/dashboard-command-center.dto';
import { DashboardAlertDto } from '../dto/dashboard-alerts.dto';
import { DashboardActivityFeedItemDto } from '../dto/dashboard-activity-feed.dto';
import { DashboardActivityFeedRepository } from '../infrastructure/dashboard-activity-feed.repository';
import { DashboardAlertsRepository } from '../infrastructure/dashboard-alerts.repository';
import { DashboardSummaryRepository } from '../infrastructure/dashboard-summary.repository';
import { presentDashboardCommandCenter } from '../presenters/dashboard-command-center.presenter';
import { DashboardTimeContextService } from './dashboard-time-context.service';

@Injectable()
export class GetDashboardCommandCenterUseCase {
  constructor(
    private readonly dashboardSummaryRepository: DashboardSummaryRepository,
    private readonly dashboardAlertsRepository: DashboardAlertsRepository,
    private readonly dashboardActivityFeedRepository: DashboardActivityFeedRepository,
    private readonly dashboardTimeContextService: DashboardTimeContextService,
  ) {}

  async execute(): Promise<DashboardCommandCenterResponseDto> {
    const scope = requireDashboardScope();
    const timeContext =
      await this.dashboardTimeContextService.resolveForSchool(scope);

    const [summary, alertSignals, activityAuditRecords] = await Promise.all([
      this.dashboardSummaryRepository.loadSummarySnapshot(
        scope,
        buildDashboardSummaryDateWindow(timeContext),
      ),
      this.dashboardAlertsRepository.loadAlertSignals(
        scope,
        buildDashboardAlertsDateWindow(timeContext),
      ),
      this.dashboardActivityFeedRepository.listActivityAuditRecords(scope, {
        take: 20,
      }),
    ]);

    const alerts = buildDashboardAlerts(alertSignals)
      .filter((alert) => alert.count > 0)
      .sort(compareCommandCenterAlerts);
    const activityItems = activityAuditRecords
      .map(mapAuditRecordToDashboardActivity)
      .filter((item): item is DashboardActivityFeedItemDto => item !== null)
      .sort(compareDashboardActivityItems)
      .slice(0, 6);

    return presentDashboardCommandCenter({
      timeContext,
      summary,
      alerts,
      activityItems,
      operator: {
        userType: scope.userType,
      },
    });
  }
}

function compareCommandCenterAlerts(
  left: DashboardAlertDto,
  right: DashboardAlertDto,
): number {
  const severityDiff =
    severityRank(left.severity) - severityRank(right.severity);
  if (severityDiff !== 0) return severityDiff;

  const countDiff = right.count - left.count;
  if (countDiff !== 0) return countDiff;

  const sourceDiff = left.source.localeCompare(right.source);
  if (sourceDiff !== 0) return sourceDiff;

  return left.key.localeCompare(right.key);
}

function severityRank(severity: DashboardAlertDto['severity']): number {
  if (severity === 'critical') return 0;
  if (severity === 'warning') return 1;
  return 2;
}
