import { Module } from '@nestjs/common';
import { AuthModule } from '../iam/auth/auth.module';
import { GetDashboardSummaryUseCase } from './application/get-dashboard-summary.use-case';
import { DashboardController } from './controller/dashboard.controller';
import { DashboardSummaryRepository } from './infrastructure/dashboard-summary.repository';

@Module({
  imports: [AuthModule],
  controllers: [DashboardController],
  providers: [DashboardSummaryRepository, GetDashboardSummaryUseCase],
})
export class DashboardModule {}
