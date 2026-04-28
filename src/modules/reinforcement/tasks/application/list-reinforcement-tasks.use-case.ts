import { Injectable } from '@nestjs/common';
import { requireReinforcementScope } from '../../reinforcement-context';
import { ListReinforcementTasksQueryDto } from '../dto/reinforcement-task.dto';
import { ReinforcementTasksRepository } from '../infrastructure/reinforcement-tasks.repository';
import { presentReinforcementTasks } from '../presenters/reinforcement-task.presenter';
import { normalizeTaskListFilters } from './reinforcement-task-use-case.helpers';

@Injectable()
export class ListReinforcementTasksUseCase {
  constructor(
    private readonly reinforcementTasksRepository: ReinforcementTasksRepository,
  ) {}

  async execute(query: ListReinforcementTasksQueryDto) {
    requireReinforcementScope();
    const filters = normalizeTaskListFilters(query);
    const result = await this.reinforcementTasksRepository.listTasks(filters);

    return presentReinforcementTasks({
      items: result.items,
      total: result.total,
      limit: filters.limit ?? null,
      offset: filters.offset ?? null,
    });
  }
}
