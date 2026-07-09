import { Module } from '@nestjs/common';
import { AuthModule } from '../iam/auth/auth.module';
import { GetDashboardCommandCenterUseCase } from './application/get-dashboard-command-center.use-case';
import { GetDashboardWidgetUseCase } from './application/get-dashboard-widget.use-case';
import { GetDashboardSummaryUseCase } from './application/get-dashboard-summary.use-case';
import { ListDashboardActivityFeedUseCase } from './application/list-dashboard-activity-feed.use-case';
import { ListDashboardAlertsUseCase } from './application/list-dashboard-alerts.use-case';
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
    GetDashboardCommandCenterUseCase,
    GetDashboardWidgetUseCase,
    GetDashboardSummaryUseCase,
    ListDashboardAlertsUseCase,
    ListDashboardActivityFeedUseCase,
    ListDashboardWidgetsUseCase,
  ],
})
export class DashboardModule {}
