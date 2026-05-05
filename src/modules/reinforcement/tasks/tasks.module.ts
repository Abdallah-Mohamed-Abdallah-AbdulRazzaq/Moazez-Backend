import { Module } from '@nestjs/common';
import { AuthModule } from '../../iam/auth/auth.module';
import { CancelReinforcementTaskUseCase } from './application/cancel-reinforcement-task.use-case';
import { CreateReinforcementTaskUseCase } from './application/create-reinforcement-task.use-case';
import { DuplicateReinforcementTaskUseCase } from './application/duplicate-reinforcement-task.use-case';
import { GetReinforcementFilterOptionsUseCase } from './application/get-reinforcement-filter-options.use-case';
import { GetReinforcementTaskUseCase } from './application/get-reinforcement-task.use-case';
import { ListReinforcementTasksUseCase } from './application/list-reinforcement-tasks.use-case';
import { ReinforcementTasksController } from './controller/reinforcement-tasks.controller';
import { ReinforcementTasksRepository } from './infrastructure/reinforcement-tasks.repository';

@Module({
  imports: [AuthModule],
  controllers: [ReinforcementTasksController],
  providers: [
    ReinforcementTasksRepository,
    GetReinforcementFilterOptionsUseCase,
    ListReinforcementTasksUseCase,
    CreateReinforcementTaskUseCase,
    GetReinforcementTaskUseCase,
    DuplicateReinforcementTaskUseCase,
    CancelReinforcementTaskUseCase,
  ],
  exports: [CreateReinforcementTaskUseCase],
})
export class TasksModule {}
