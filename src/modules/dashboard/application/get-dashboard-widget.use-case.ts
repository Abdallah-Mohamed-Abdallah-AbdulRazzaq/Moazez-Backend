import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../common/exceptions/domain-exception';
import { DashboardScope, requireDashboardScope } from '../dashboard-context';
import { DashboardActivityFeedItemDto } from '../dto/dashboard-activity-feed.dto';
import { DashboardWidgetResponseDto } from '../dto/dashboard-widgets.dto';
import { DashboardActivityFeedRepository } from '../infrastructure/dashboard-activity-feed.repository';
import { DashboardAlertsRepository } from '../infrastructure/dashboard-alerts.repository';
import { DashboardSummaryRepository } from '../infrastructure/dashboard-summary.repository';
import {
  DashboardWidgetsPresentationInput,
  presentDashboardWidget,
} from '../presenters/dashboard-widgets.presenter';
import { buildDashboardSummaryDateWindow } from './get-dashboard-summary.use-case';
import {
  compareDashboardActivityItems,
  mapAuditRecordToDashboardActivity,
} from './list-dashboard-activity-feed.use-case';
import { buildDashboardAlertsDateWindow } from './list-dashboard-alerts.use-case';

@Injectable()
export class GetDashboardWidgetUseCase {
  constructor(
    private readonly dashboardSummaryRepository: DashboardSummaryRepository,
    private readonly dashboardAlertsRepository: DashboardAlertsRepository,
    private readonly dashboardActivityFeedRepository: DashboardActivityFeedRepository,
  ) {}

  async execute(widgetKey: string): Promise<DashboardWidgetResponseDto> {
    const scope = requireDashboardScope();
    const now = new Date();
    const input = await this.loadPresentationInput(scope, now);
    const response = presentDashboardWidget({
      ...input,
      widgetKey,
    });

    if (!response) {
      throw new NotFoundDomainException('Dashboard widget was not found');
    }

    return response;
  }

  private async loadPresentationInput(
    scope: DashboardScope,
    now: Date,
  ): Promise<DashboardWidgetsPresentationInput> {
    const [summary, alertSignals, activityAuditRecords] = await Promise.all([
      this.dashboardSummaryRepository.loadSummarySnapshot(
        scope,
        buildDashboardSummaryDateWindow(now),
      ),
      this.dashboardAlertsRepository.loadAlertSignals(
        scope,
        buildDashboardAlertsDateWindow(now),
      ),
      this.dashboardActivityFeedRepository.listActivityAuditRecords(scope, {
        take: 20,
      }),
    ]);
    const activityItems = activityAuditRecords
      .map(mapAuditRecordToDashboardActivity)
      .filter((item): item is DashboardActivityFeedItemDto => item !== null)
      .sort(compareDashboardActivityItems)
      .slice(0, 5);

    return {
      generatedAt: now,
      summary,
      alertSignals,
      activityItems,
    };
  }
}
