import { Injectable } from '@nestjs/common';
import { requireReinforcementScope } from '../../reinforcement-context';
import { ReinforcementFilterOptionsQueryDto } from '../dto/reinforcement-task.dto';
import { ReinforcementTasksRepository } from '../infrastructure/reinforcement-tasks.repository';
import { presentReinforcementFilterOptions } from '../presenters/reinforcement-task.presenter';

@Injectable()
export class GetReinforcementFilterOptionsUseCase {
  constructor(
    private readonly reinforcementTasksRepository: ReinforcementTasksRepository,
  ) {}

  async execute(query: ReinforcementFilterOptionsQueryDto) {
    requireReinforcementScope();
    const options = await this.reinforcementTasksRepository.listFilterOptions({
      academicYearId: query.academicYearId ?? query.yearId,
      termId: query.termId,
    });

    return presentReinforcementFilterOptions(options);
  }
}
