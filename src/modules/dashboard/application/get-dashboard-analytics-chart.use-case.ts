import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../common/exceptions/domain-exception';
import { requireDashboardScope } from '../dashboard-context';
import { DashboardAnalyticsChartResponseDto } from '../dto/dashboard-analytics.dto';
import { findDashboardAnalyticsChartDefinition } from '../domain/dashboard-analytics-catalog';
import { presentDashboardAnalyticsChart } from '../presenters/dashboard-analytics.presenter';

@Injectable()
export class GetDashboardAnalyticsChartUseCase {
  execute(chartKey: string): DashboardAnalyticsChartResponseDto {
    requireDashboardScope();

    const chart = findDashboardAnalyticsChartDefinition(chartKey);

    if (!chart) {
      throw new NotFoundDomainException('Dashboard analytics chart was not found');
    }

    return presentDashboardAnalyticsChart({
      generatedAt: new Date(),
      chart,
    });
  }
}
