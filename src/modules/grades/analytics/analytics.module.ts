import { Module } from '@nestjs/common';
import { AuthModule } from '../../iam/auth/auth.module';
import { GetGradesAnalyticsDistributionUseCase } from './application/get-grades-analytics-distribution.use-case';
import { GetGradesAnalyticsSummaryUseCase } from './application/get-grades-analytics-summary.use-case';
import { GradesAnalyticsController } from './controller/grades-analytics.controller';
import { GradesReadModelRepository } from '../shared/infrastructure/grades-read-model.repository';

@Module({
  imports: [AuthModule],
  controllers: [GradesAnalyticsController],
  providers: [
    GradesReadModelRepository,
    GetGradesAnalyticsSummaryUseCase,
    GetGradesAnalyticsDistributionUseCase,
  ],
})
export class AnalyticsModule {}
