import { Injectable } from '@nestjs/common';
import { requireReinforcementScope } from '../../reinforcement-context';
import { GetReinforcementOverviewQueryDto } from '../dto/reinforcement-overview.dto';
import { ReinforcementOverviewRepository } from '../infrastructure/reinforcement-overview.repository';
import { presentReinforcementOverview } from '../presenters/reinforcement-overview.presenter';
import { buildOverviewReadFilters } from './reinforcement-overview-use-case.helpers';

@Injectable()
export class GetReinforcementOverviewUseCase {
  constructor(
    private readonly reinforcementOverviewRepository: ReinforcementOverviewRepository,
  ) {}

  async execute(query: GetReinforcementOverviewQueryDto) {
    const scopeContext = requireReinforcementScope();
    const { scope, filters } = await buildOverviewReadFilters({
      repository: this.reinforcementOverviewRepository,
      schoolId: scopeContext.schoolId,
      query,
    });
    const dataset =
      await this.reinforcementOverviewRepository.loadOverviewData(filters);

    return presentReinforcementOverview({ scope, dataset });
  }
}
