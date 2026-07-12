import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../common/exceptions/domain-exception';
import { requireDashboardScope } from '../dashboard-context';
import {
  DashboardAnalyticsChartDataFiltersDto,
  DashboardAnalyticsChartDataResponseDto,
  GetDashboardAnalyticsChartDataQueryDto,
} from '../dto/dashboard-analytics-data.dto';
import { findDashboardAnalyticsChartDefinition } from '../domain/dashboard-analytics-catalog';
import { isDashboardAnalyticsComputedSnapshotChartKey } from '../domain/dashboard-analytics-data-pack';
import { normalizeDashboardAnalyticsQuery } from '../domain/dashboard-analytics-query';
import { DashboardAnalyticsSnapshotRepository } from '../infrastructure/dashboard-analytics-snapshot.repository';
import { presentDashboardAnalyticsChartData } from '../presenters/dashboard-analytics-data.presenter';
import { DashboardAnalyticsQueryContextService } from './dashboard-analytics-query-context.service';

export const DASHBOARD_ANALYTICS_DATA_DEFAULT_RANGE = '30d' as const;
export const DASHBOARD_ANALYTICS_DATA_DEFAULT_GRANULARITY = 'day' as const;

@Injectable()
export class GetDashboardAnalyticsChartDataUseCase {
  constructor(
    private readonly dashboardAnalyticsQueryContextService: DashboardAnalyticsQueryContextService,
    private readonly dashboardAnalyticsSnapshotRepository: DashboardAnalyticsSnapshotRepository,
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

    const queryContext =
      await this.dashboardAnalyticsQueryContextService.resolve(
        scope,
        chart,
        query,
      );

    if (!isDashboardAnalyticsComputedSnapshotChartKey(chart.chartKey)) {
      return presentDashboardAnalyticsChartData({ queryContext, chart });
    }

    const snapshotValue =
      await this.dashboardAnalyticsSnapshotRepository.loadChartValue(
        scope,
        chart.chartKey,
        queryContext,
      );

    return presentDashboardAnalyticsChartData({
      queryContext,
      chart,
      snapshotValue,
    });
  }
}

export function normalizeDashboardAnalyticsChartDataQuery(
  query: GetDashboardAnalyticsChartDataQueryDto,
): DashboardAnalyticsChartDataFiltersDto {
  return normalizeDashboardAnalyticsQuery(query);
}
