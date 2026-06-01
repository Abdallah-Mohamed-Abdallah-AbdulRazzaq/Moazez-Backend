import { Module } from '@nestjs/common';
import { AuthModule } from '../iam/auth/auth.module';
import { GetDashboardSummaryUseCase } from './application/get-dashboard-summary.use-case';
import { ListDashboardAlertsUseCase } from './application/list-dashboard-alerts.use-case';
import { DashboardController } from './controller/dashboard.controller';
import { DashboardAlertsRepository } from './infrastructure/dashboard-alerts.repository';
import { DashboardSummaryRepository } from './infrastructure/dashboard-summary.repository';

@Module({
  imports: [AuthModule],
  controllers: [DashboardController],
  providers: [
    DashboardSummaryRepository,
    DashboardAlertsRepository,
    GetDashboardSummaryUseCase,
    ListDashboardAlertsUseCase,
  ],
})
export class DashboardModule {}
