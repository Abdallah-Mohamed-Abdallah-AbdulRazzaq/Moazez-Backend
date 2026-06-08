import { Module } from '@nestjs/common';
import { AuthModule } from '../iam/auth/auth.module';
import { GetDashboardSummaryUseCase } from './application/get-dashboard-summary.use-case';
import { ListDashboardActivityFeedUseCase } from './application/list-dashboard-activity-feed.use-case';
import { ListDashboardAlertsUseCase } from './application/list-dashboard-alerts.use-case';
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
    GetDashboardSummaryUseCase,
    ListDashboardAlertsUseCase,
    ListDashboardActivityFeedUseCase,
  ],
})
export class DashboardModule {}
