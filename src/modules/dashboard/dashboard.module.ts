import { Module } from '@nestjs/common';
import { AuthModule } from '../iam/auth/auth.module';
import { GetDashboardAnalyticsCatalogUseCase } from './application/get-dashboard-analytics-catalog.use-case';
import { GetDashboardAnalyticsChartDataUseCase } from './application/get-dashboard-analytics-chart-data.use-case';
import { GetDashboardAnalyticsChartUseCase } from './application/get-dashboard-analytics-chart.use-case';
import { GetDashboardCommandCenterUseCase } from './application/get-dashboard-command-center.use-case';
import { GetDashboardModulePageUseCase } from './application/get-dashboard-module-page.use-case';
import { GetDashboardWidgetUseCase } from './application/get-dashboard-widget.use-case';
import { GetDashboardSummaryUseCase } from './application/get-dashboard-summary.use-case';
import { ListDashboardActivityFeedUseCase } from './application/list-dashboard-activity-feed.use-case';
import { ListDashboardAlertsUseCase } from './application/list-dashboard-alerts.use-case';
import { ListDashboardAnalyticsChartsUseCase } from './application/list-dashboard-analytics-charts.use-case';
import { ListDashboardModulesUseCase } from './application/list-dashboard-modules.use-case';
import { ListDashboardWidgetsUseCase } from './application/list-dashboard-widgets.use-case';
import { DashboardController } from './controller/dashboard.controller';
import { DashboardActivityFeedRepository } from './infrastructure/dashboard-activity-feed.repository';
import { DashboardAlertsRepository } from './infrastructure/dashboard-alerts.repository';
import { DashboardSummaryRepository } from './infrastructure/dashboard-summary.repository';

@Module({
  imports: [AuthModule],
  controllers: [DashboardController],
  providers: [
    DashboardSummaryRepository,
    DashboardAlertsRepository,
    DashboardActivityFeedRepository,
    GetDashboardAnalyticsCatalogUseCase,
    GetDashboardAnalyticsChartDataUseCase,
    GetDashboardAnalyticsChartUseCase,
    GetDashboardCommandCenterUseCase,
    GetDashboardModulePageUseCase,
    GetDashboardWidgetUseCase,
    GetDashboardSummaryUseCase,
    ListDashboardAlertsUseCase,
    ListDashboardActivityFeedUseCase,
    ListDashboardAnalyticsChartsUseCase,
    ListDashboardModulesUseCase,
    ListDashboardWidgetsUseCase,
  ],
})
export class DashboardModule {}
