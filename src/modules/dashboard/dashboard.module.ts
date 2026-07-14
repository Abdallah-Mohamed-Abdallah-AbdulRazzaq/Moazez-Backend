import { Module } from '@nestjs/common';
import { AuthModule } from '../iam/auth/auth.module';
import { ReportsModule } from '../attendance/reports/reports.module';
import { GetDashboardAnalyticsCatalogUseCase } from './application/get-dashboard-analytics-catalog.use-case';
import { DashboardTimeContextService } from './application/dashboard-time-context.service';
import { DashboardAnalyticsQueryContextService } from './application/dashboard-analytics-query-context.service';
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
import { DashboardAnalyticsHierarchyRepository } from './infrastructure/dashboard-analytics-hierarchy.repository';
import { DashboardAnalyticsSnapshotRepository } from './infrastructure/dashboard-analytics-snapshot.repository';
import { DashboardAdmissionsAnalyticsRepository } from './infrastructure/dashboard-admissions-analytics.repository';
import { DashboardStudentsAnalyticsRepository } from './infrastructure/dashboard-students-analytics.repository';
import { DashboardAcademicsAnalyticsRepository } from './infrastructure/dashboard-academics-analytics.repository';
import { DashboardGradesAnalyticsRepository } from './infrastructure/dashboard-grades-analytics.repository';
import { DashboardHomeworkAnalyticsRepository } from './infrastructure/dashboard-homework-analytics.repository';
import { DashboardBehaviorAnalyticsRepository } from './infrastructure/dashboard-behavior-analytics.repository';
import { DashboardReinforcementAnalyticsRepository } from './infrastructure/dashboard-reinforcement-analytics.repository';
import { DashboardCommunicationAnalyticsRepository } from './infrastructure/dashboard-communication-analytics.repository';
import { DashboardWidgetCompositionService } from './application/dashboard-widget-composition.service';

@Module({
  imports: [AuthModule, ReportsModule],
  controllers: [DashboardController, DashboardTodosController],
  providers: [
    DashboardSummaryRepository,
    DashboardAlertsRepository,
    DashboardActivityFeedRepository,
    DashboardLightModeDropdownRepository,
    DashboardTodosRepository,
    DashboardTimeContextRepository,
    DashboardAnalyticsHierarchyRepository,
    DashboardAnalyticsSnapshotRepository,
    DashboardAdmissionsAnalyticsRepository,
    DashboardStudentsAnalyticsRepository,
    DashboardAcademicsAnalyticsRepository,
    DashboardGradesAnalyticsRepository,
    DashboardHomeworkAnalyticsRepository,
    DashboardBehaviorAnalyticsRepository,
    DashboardReinforcementAnalyticsRepository,
    DashboardCommunicationAnalyticsRepository,
    DashboardTimeContextService,
    DashboardAnalyticsQueryContextService,
    DashboardWidgetCompositionService,
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
