import { Module } from '@nestjs/common';
import { AuthModule } from '../../iam/auth/auth.module';
import { GradesReadModelRepository } from '../shared/infrastructure/grades-read-model.repository';
import { GetGradesBootstrapUseCase } from './application/get-grades-bootstrap.use-case';
import { GetGradesOverviewUseCase } from './application/get-grades-overview.use-case';
import { GradesDashboardController } from './controller/grades-dashboard.controller';
import { GradesDashboardReadRepository } from './infrastructure/grades-dashboard-read.repository';

@Module({
  imports: [AuthModule],
  controllers: [GradesDashboardController],
  providers: [
    GradesReadModelRepository,
    GradesDashboardReadRepository,
    GetGradesBootstrapUseCase,
    GetGradesOverviewUseCase,
  ],
})
export class DashboardModule {}
