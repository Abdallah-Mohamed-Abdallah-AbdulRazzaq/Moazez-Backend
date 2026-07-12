import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../common/exceptions/domain-exception';
import { requireDashboardScope } from '../dashboard-context';
import {
  DashboardAnalyticsChartDataFiltersDto,
  DashboardAnalyticsChartDataResponseDto,
  GetDashboardAnalyticsChartDataQueryDto,
} from '../dto/dashboard-analytics-data.dto';
import {
  DASHBOARD_ANALYTICS_GRANULARITIES,
  DASHBOARD_ANALYTICS_RANGES,
  DashboardAnalyticsGranularity,
  DashboardAnalyticsRange,
  findDashboardAnalyticsChartDefinition,
} from '../domain/dashboard-analytics-catalog';
import { isDashboardAnalyticsComputedSnapshotChartKey } from '../domain/dashboard-analytics-data-pack';
import { buildDashboardSummaryDateWindow } from './get-dashboard-summary.use-case';
import { buildDashboardAlertsDateWindow } from './list-dashboard-alerts.use-case';
import { DashboardAlertsRepository } from '../infrastructure/dashboard-alerts.repository';
import { DashboardSummaryRepository } from '../infrastructure/dashboard-summary.repository';
import { presentDashboardAnalyticsChartData } from '../presenters/dashboard-analytics-data.presenter';
import { DashboardTimeContextService } from './dashboard-time-context.service';

export const DASHBOARD_ANALYTICS_DATA_DEFAULT_RANGE = '30d' as const;
export const DASHBOARD_ANALYTICS_DATA_DEFAULT_GRANULARITY = 'day' as const;

@Injectable()
export class GetDashboardAnalyticsChartDataUseCase {
  constructor(
    private readonly dashboardSummaryRepository: DashboardSummaryRepository,
    private readonly dashboardAlertsRepository: DashboardAlertsRepository,
    private readonly dashboardTimeContextService: DashboardTimeContextService,
  ) {}

  async execute(
    chartKey: string,
    query: GetDashboardAnalyticsChartDataQueryDto = new GetDashboardAnalyticsChartDataQueryDto(),
  ): Promise<DashboardAnalyticsChartDataResponseDto> {
    const scope = requireDashboardScope();
    const chart = findDashboardAnalyticsChartDefinition(chartKey);

    if (!chart) {
      throw new NotFoundDomainException(
        'Dashboard analytics chart was not found',
      );
    }

    const filters = normalizeDashboardAnalyticsChartDataQuery(query);
    const timeContext =
      await this.dashboardTimeContextService.resolveForSchool(scope);
    const generatedAt = timeContext.generatedAt;

    if (!isDashboardAnalyticsComputedSnapshotChartKey(chart.chartKey)) {
      return presentDashboardAnalyticsChartData({
        generatedAt,
        chart,
        filters,
      });
    }

    const [summary, alertSignals] = await Promise.all([
      this.dashboardSummaryRepository.loadSummarySnapshot(
        scope,
        buildDashboardSummaryDateWindow(timeContext),
      ),
      this.dashboardAlertsRepository.loadAlertSignals(
        scope,
        buildDashboardAlertsDateWindow(timeContext),
      ),
    ]);

    return presentDashboardAnalyticsChartData({
      generatedAt,
      chart,
      filters,
      summary,
      alertSignals,
    });
  }
}

export function normalizeDashboardAnalyticsChartDataQuery(
  query: GetDashboardAnalyticsChartDataQueryDto,
): DashboardAnalyticsChartDataFiltersDto {
  return {
    range: isDashboardAnalyticsRange(query.range)
      ? query.range
      : DASHBOARD_ANALYTICS_DATA_DEFAULT_RANGE,
    granularity: isDashboardAnalyticsGranularity(query.granularity)
      ? query.granularity
      : DASHBOARD_ANALYTICS_DATA_DEFAULT_GRANULARITY,
    dateFrom: query.dateFrom ?? null,
    dateTo: query.dateTo ?? null,
    academicYearId: query.academicYearId ?? null,
    termId: query.termId ?? null,
    gradeId: query.gradeId ?? null,
    sectionId: query.sectionId ?? null,
    classroomId: query.classroomId ?? null,
  };
}

function isDashboardAnalyticsRange(
  value: unknown,
): value is DashboardAnalyticsRange {
  return (
    typeof value === 'string' &&
    (DASHBOARD_ANALYTICS_RANGES as readonly string[]).includes(value)
  );
}

function isDashboardAnalyticsGranularity(
  value: unknown,
): value is DashboardAnalyticsGranularity {
  return (
    typeof value === 'string' &&
    (DASHBOARD_ANALYTICS_GRANULARITIES as readonly string[]).includes(value)
  );
}
