import { Module } from '@nestjs/common';
import { AuthModule } from '../iam/auth/auth.module';
import { GetDashboardAnalyticsCatalogUseCase } from './application/get-dashboard-analytics-catalog.use-case';
import { DashboardTimeContextService } from './application/dashboard-time-context.service';
import { GetDashboardAnalyticsChartDataUseCase } from './application/get-dashboard-analytics-chart-data.use-case';
import { GetDashboardAnalyticsChartUseCase } from './application/get-dashboard-analytics-chart.use-case';
import { GetDashboardCommandCenterUseCase } from './application/get-dashboard-command-center.use-case';
import { GetDashboardLightModeDropdownUseCase } from './application/get-dashboard-light-mode-dropdown.use-case';
import { GetDashboardModulePageUseCase } from './application/get-dashboard-module-page.use-case';
import { GetDashboardWidgetUseCase } from './application/get-dashboard-widget.use-case';
import { GetDashboardSummaryUseCase } from './application/get-dashboard-summary.use-case';
import { CreateDashboardTodoUseCase } from './application/create-dashboard-todo.use-case';
import { DeleteDashboardTodoUseCase } from './application/delete-dashboard-todo.use-case';
import { ListDashboardActivityFeedUseCase } from './application/list-dashboard-activity-feed.use-case';
import { ListDashboardAlertsUseCase } from './application/list-dashboard-alerts.use-case';
import { ListDashboardAnalyticsChartsUseCase } from './application/list-dashboard-analytics-charts.use-case';
import { ListDashboardModulesUseCase } from './application/list-dashboard-modules.use-case';
import { ListDashboardTodosUseCase } from './application/list-dashboard-todos.use-case';
import { ListDashboardWidgetsUseCase } from './application/list-dashboard-widgets.use-case';
import { UpdateDashboardTodoUseCase } from './application/update-dashboard-todo.use-case';
import { DashboardTodosController } from './controller/dashboard-todos.controller';
import { DashboardController } from './controller/dashboard.controller';
import { DashboardActivityFeedRepository } from './infrastructure/dashboard-activity-feed.repository';
import { DashboardAlertsRepository } from './infrastructure/dashboard-alerts.repository';
import { DashboardLightModeDropdownRepository } from './infrastructure/dashboard-light-mode-dropdown.repository';
import { DashboardSummaryRepository } from './infrastructure/dashboard-summary.repository';
import { DashboardTodosRepository } from './infrastructure/dashboard-todos.repository';
import { DashboardTimeContextRepository } from './infrastructure/dashboard-time-context.repository';

@Module({
  imports: [AuthModule],
  controllers: [DashboardController, DashboardTodosController],
  providers: [
    DashboardSummaryRepository,
    DashboardAlertsRepository,
    DashboardActivityFeedRepository,
    DashboardLightModeDropdownRepository,
    DashboardTodosRepository,
    DashboardTimeContextRepository,
    DashboardTimeContextService,
    GetDashboardAnalyticsCatalogUseCase,
    GetDashboardAnalyticsChartDataUseCase,
    GetDashboardAnalyticsChartUseCase,
    GetDashboardCommandCenterUseCase,
    GetDashboardLightModeDropdownUseCase,
    GetDashboardModulePageUseCase,
    GetDashboardWidgetUseCase,
    GetDashboardSummaryUseCase,
    CreateDashboardTodoUseCase,
    DeleteDashboardTodoUseCase,
    ListDashboardAlertsUseCase,
    ListDashboardActivityFeedUseCase,
    ListDashboardAnalyticsChartsUseCase,
    ListDashboardModulesUseCase,
    ListDashboardTodosUseCase,
    ListDashboardWidgetsUseCase,
    UpdateDashboardTodoUseCase,
  ],
})
export class DashboardModule {}
