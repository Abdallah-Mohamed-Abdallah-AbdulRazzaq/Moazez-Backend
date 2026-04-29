import { Injectable } from '@nestjs/common';
import { requireReinforcementScope } from '../../reinforcement-context';
import { ListXpPoliciesQueryDto } from '../dto/reinforcement-xp.dto';
import { ReinforcementXpRepository } from '../infrastructure/reinforcement-xp.repository';
import { presentXpPolicies } from '../presenters/reinforcement-xp.presenter';
import { normalizePolicyFilters } from './reinforcement-xp-use-case.helpers';

@Injectable()
export class ListXpPoliciesUseCase {
  constructor(private readonly xpRepository: ReinforcementXpRepository) {}

  async execute(query: ListXpPoliciesQueryDto) {
    requireReinforcementScope();

    const policies = await this.xpRepository.listPolicies(
      normalizePolicyFilters(query),
    );
    return presentXpPolicies(policies);
  }
}
