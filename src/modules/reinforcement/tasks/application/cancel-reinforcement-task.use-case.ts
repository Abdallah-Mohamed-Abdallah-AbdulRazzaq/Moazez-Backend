import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { requireReinforcementScope } from '../../reinforcement-context';
import { assertTaskCancelable } from '../domain/reinforcement-task-domain';
import { CancelReinforcementTaskDto } from '../dto/reinforcement-task.dto';
import { ReinforcementTasksRepository } from '../infrastructure/reinforcement-tasks.repository';
import { presentReinforcementTask } from '../presenters/reinforcement-task.presenter';
import { buildTaskAuditEntry } from './reinforcement-task-use-case.helpers';

@Injectable()
export class CancelReinforcementTaskUseCase {
  constructor(
    private readonly reinforcementTasksRepository: ReinforcementTasksRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(taskId: string, command: CancelReinforcementTaskDto = {}) {
    const scope = requireReinforcementScope();
    const existing = await this.reinforcementTasksRepository.findTaskById(taskId);
    if (!existing) {
      throw new NotFoundDomainException('Reinforcement task not found', {
        taskId,
      });
    }

    assertTaskCancelable(existing);

    const result =
      await this.reinforcementTasksRepository.cancelTaskAndAssignments({
        schoolId: scope.schoolId,
        taskId,
        actorId: scope.actorId,
        reason: command.reason,
      });

    await this.authRepository.createAuditLog(
      buildTaskAuditEntry({
        scope,
        action: 'reinforcement.task.cancel',
        task: result.task,
        before: existing,
        afterMetadata: {
          beforeStatus: existing.status,
          afterStatus: result.task.status,
          affectedAssignmentCount: result.affectedAssignmentCount,
        },
      }),
    );

    return presentReinforcementTask(result.task);
  }
}
