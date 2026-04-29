import { Module } from '@nestjs/common';
import { GetClassroomReinforcementSummaryUseCase } from './application/get-classroom-reinforcement-summary.use-case';
import { GetReinforcementOverviewUseCase } from './application/get-reinforcement-overview.use-case';
import { GetStudentReinforcementProgressUseCase } from './application/get-student-reinforcement-progress.use-case';
import { ReinforcementOverviewController } from './controller/reinforcement-overview.controller';
import { ReinforcementOverviewRepository } from './infrastructure/reinforcement-overview.repository';

@Module({
  controllers: [ReinforcementOverviewController],
  providers: [
    ReinforcementOverviewRepository,
    GetReinforcementOverviewUseCase,
    GetStudentReinforcementProgressUseCase,
    GetClassroomReinforcementSummaryUseCase,
  ],
})
export class OverviewModule {}
