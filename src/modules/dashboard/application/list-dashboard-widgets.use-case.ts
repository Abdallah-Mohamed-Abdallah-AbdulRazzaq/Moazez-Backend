import { Injectable } from '@nestjs/common';
import { DashboardScope, requireDashboardScope } from '../dashboard-context';
import {
  DASHBOARD_WIDGET_DEFAULT_LIMIT,
  DASHBOARD_WIDGET_MAX_LIMIT,
  DASHBOARD_WIDGET_SOURCES,
  DASHBOARD_WIDGET_TYPES,
  DashboardWidgetSource,
  DashboardWidgetType,
  DashboardWidgetsResponseDto,
  ListDashboardWidgetsQueryDto,
} from '../dto/dashboard-widgets.dto';
import {
  compareDashboardActivityItems,
  mapAuditRecordToDashboardActivity,
} from './list-dashboard-activity-feed.use-case';
import { buildDashboardAlertsDateWindow } from './list-dashboard-alerts.use-case';
import { buildDashboardSummaryDateWindow } from './get-dashboard-summary.use-case';
import { DashboardActivityFeedItemDto } from '../dto/dashboard-activity-feed.dto';
import { DashboardActivityFeedRepository } from '../infrastructure/dashboard-activity-feed.repository';
import { DashboardAlertsRepository } from '../infrastructure/dashboard-alerts.repository';
import { DashboardSummaryRepository } from '../infrastructure/dashboard-summary.repository';
import {
  DashboardWidgetsPresentationInput,
  presentDashboardWidgets,
} from '../presenters/dashboard-widgets.presenter';
import { DashboardTimeContextService } from './dashboard-time-context.service';
import { DashboardTimeContext } from '../domain/dashboard-time-context';

export interface NormalizedDashboardWidgetsQuery {
  source?: DashboardWidgetSource;
  type?: DashboardWidgetType;
  limit: number;
}

@Injectable()
export class ListDashboardWidgetsUseCase {
  constructor(
    private readonly dashboardSummaryRepository: DashboardSummaryRepository,
    private readonly dashboardAlertsRepository: DashboardAlertsRepository,
    private readonly dashboardActivityFeedRepository: DashboardActivityFeedRepository,
    private readonly dashboardTimeContextService: DashboardTimeContextService,
  ) {}

  async execute(
    query: ListDashboardWidgetsQueryDto = new ListDashboardWidgetsQueryDto(),
  ): Promise<DashboardWidgetsResponseDto> {
    const scope = requireDashboardScope();
    const timeContext =
      await this.dashboardTimeContextService.resolveForSchool(scope);
    const input = await this.loadPresentationInput(scope, timeContext);

    return presentDashboardWidgets({
      ...input,
      filters: normalizeDashboardWidgetsQuery(query),
    });
  }

  private async loadPresentationInput(
    scope: DashboardScope,
    timeContext: DashboardTimeContext,
  ): Promise<DashboardWidgetsPresentationInput> {
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
    const activityItems = activityAuditRecords
      .map(mapAuditRecordToDashboardActivity)
      .filter((item): item is DashboardActivityFeedItemDto => item !== null)
      .sort(compareDashboardActivityItems)
      .slice(0, 5);

    return {
      generatedAt: timeContext.generatedAt,
      summary,
      alertSignals,
      activityItems,
    };
  }
}

export function normalizeDashboardWidgetsQuery(
  query: ListDashboardWidgetsQueryDto,
): NormalizedDashboardWidgetsQuery {
  return {
    source: isDashboardWidgetSource(query.source) ? query.source : undefined,
    type: isDashboardWidgetType(query.type) ? query.type : undefined,
    limit: normalizeDashboardWidgetsLimit(query.limit),
  };
}

function normalizeDashboardWidgetsLimit(limit: number | undefined): number {
  if (typeof limit !== 'number' || !Number.isFinite(limit)) {
    return DASHBOARD_WIDGET_DEFAULT_LIMIT;
  }

  return Math.min(Math.max(Math.trunc(limit), 1), DASHBOARD_WIDGET_MAX_LIMIT);
}

function isDashboardWidgetSource(
  value: unknown,
): value is DashboardWidgetSource {
  return (
    typeof value === 'string' &&
    (DASHBOARD_WIDGET_SOURCES as readonly string[]).includes(value)
  );
}

function isDashboardWidgetType(value: unknown): value is DashboardWidgetType {
  return (
    typeof value === 'string' &&
    (DASHBOARD_WIDGET_TYPES as readonly string[]).includes(value)
  );
}
