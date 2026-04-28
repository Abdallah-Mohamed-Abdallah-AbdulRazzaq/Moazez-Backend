import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { requireReinforcementScope } from '../../reinforcement-context';
import { DuplicateReinforcementTaskDto } from '../dto/reinforcement-task.dto';
import { ReinforcementTasksRepository } from '../infrastructure/reinforcement-tasks.repository';
import { presentReinforcementTask } from '../presenters/reinforcement-task.presenter';
import {
  buildDuplicateTaskMutationInput,
  buildTaskAuditEntry,
} from './reinforcement-task-use-case.helpers';

@Injectable()
export class DuplicateReinforcementTaskUseCase {
  constructor(
    private readonly reinforcementTasksRepository: ReinforcementTasksRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(taskId: string, command: DuplicateReinforcementTaskDto = {}) {
    const scope = requireReinforcementScope();
    const sourceTask =
      await this.reinforcementTasksRepository.findTaskById(taskId);
    if (!sourceTask) {
      throw new NotFoundDomainException('Reinforcement task not found', {
        taskId,
      });
    }

    const input = await buildDuplicateTaskMutationInput({
      scope,
      repository: this.reinforcementTasksRepository,
      sourceTask,
      command,
    });
    const duplicatedTask =
      await this.reinforcementTasksRepository.duplicateTaskWithTargetsStagesAssignments(
        input,
      );

    await this.authRepository.createAuditLog(
      buildTaskAuditEntry({
        scope,
        action: 'reinforcement.task.duplicate',
        task: duplicatedTask,
        before: sourceTask,
        afterMetadata: {
          sourceTaskId: sourceTask.id,
          newTaskId: duplicatedTask.id,
          assignmentCount: duplicatedTask.assignments.length,
        },
      }),
    );

    return presentReinforcementTask(duplicatedTask);
  }
}
