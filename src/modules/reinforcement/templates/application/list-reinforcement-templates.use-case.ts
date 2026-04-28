import { Injectable } from '@nestjs/common';
import { requireReinforcementScope } from '../../reinforcement-context';
import { normalizeReinforcementSource } from '../../tasks/domain/reinforcement-task-domain';
import { ListReinforcementTemplatesQueryDto } from '../dto/reinforcement-template.dto';
import { ReinforcementTemplatesRepository } from '../infrastructure/reinforcement-templates.repository';
import { presentReinforcementTaskTemplates } from '../presenters/reinforcement-template.presenter';

@Injectable()
export class ListReinforcementTemplatesUseCase {
  constructor(
    private readonly reinforcementTemplatesRepository: ReinforcementTemplatesRepository,
  ) {}

  async execute(query: ListReinforcementTemplatesQueryDto) {
    requireReinforcementScope();
    const templates =
      await this.reinforcementTemplatesRepository.listTemplates({
        ...(query.search ? { search: query.search } : {}),
        ...(query.source
          ? { source: normalizeReinforcementSource(query.source) }
          : {}),
        includeDeleted: query.includeDeleted ?? false,
      });

    return presentReinforcementTaskTemplates(templates);
  }
}
