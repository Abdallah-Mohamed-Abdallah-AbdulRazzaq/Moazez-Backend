import { Injectable } from '@nestjs/common';
import { requireDashboardScope } from '../dashboard-context';
import { DashboardAnalyticsCatalogResponseDto } from '../dto/dashboard-analytics.dto';
import { DASHBOARD_ANALYTICS_CATALOG } from '../domain/dashboard-analytics-catalog';
import { presentDashboardAnalyticsCatalog } from '../presenters/dashboard-analytics.presenter';

@Injectable()
export class GetDashboardAnalyticsCatalogUseCase {
  execute(): DashboardAnalyticsCatalogResponseDto {
    requireDashboardScope();

    return presentDashboardAnalyticsCatalog({
      generatedAt: new Date(),
      catalog: DASHBOARD_ANALYTICS_CATALOG,
    });
  }
}
