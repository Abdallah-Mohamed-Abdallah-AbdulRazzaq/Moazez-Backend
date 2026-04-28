import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { requireReinforcementScope } from '../../reinforcement-context';
import { ReinforcementTasksRepository } from '../infrastructure/reinforcement-tasks.repository';
import { presentReinforcementTask } from '../presenters/reinforcement-task.presenter';

@Injectable()
export class GetReinforcementTaskUseCase {
  constructor(
    private readonly reinforcementTasksRepository: ReinforcementTasksRepository,
  ) {}

  async execute(taskId: string) {
    requireReinforcementScope();
    const task = await this.reinforcementTasksRepository.findTaskById(taskId);
    if (!task) {
      throw new NotFoundDomainException('Reinforcement task not found', {
        taskId,
      });
    }

    return presentReinforcementTask(task);
  }
}
