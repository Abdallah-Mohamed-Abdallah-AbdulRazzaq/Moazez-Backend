import { Injectable } from '@nestjs/common';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { requireReinforcementScope } from '../../reinforcement-context';
import { CreateReinforcementTaskDto } from '../dto/reinforcement-task.dto';
import { ReinforcementTasksRepository } from '../infrastructure/reinforcement-tasks.repository';
import { presentReinforcementTask } from '../presenters/reinforcement-task.presenter';
import {
  buildCreateTaskMutationInput,
  buildTaskAuditEntry,
} from './reinforcement-task-use-case.helpers';

@Injectable()
export class CreateReinforcementTaskUseCase {
  constructor(
    private readonly reinforcementTasksRepository: ReinforcementTasksRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(command: CreateReinforcementTaskDto) {
    const scope = requireReinforcementScope();
    const input = await buildCreateTaskMutationInput({
      scope,
      repository: this.reinforcementTasksRepository,
      command,
    });

    const task =
      await this.reinforcementTasksRepository.createTaskWithTargetsStagesAssignments(
        input,
      );

    await this.authRepository.createAuditLog(
      buildTaskAuditEntry({
        scope,
        action: 'reinforcement.task.create',
        task,
        afterMetadata: {
          targetCount: task.targets.length,
          assignmentCount: task.assignments.length,
          stageCount: task.stages.length,
          source: task.source,
          rewardType: task.rewardType,
        },
      }),
    );

    return presentReinforcementTask(task);
  }
}
