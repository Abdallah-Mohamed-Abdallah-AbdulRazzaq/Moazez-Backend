import { Injectable } from '@nestjs/common';
import { requireReinforcementScope } from '../../reinforcement-context';
import { ListXpLedgerQueryDto } from '../dto/reinforcement-xp.dto';
import { ReinforcementXpRepository } from '../infrastructure/reinforcement-xp.repository';
import { presentXpLedger } from '../presenters/reinforcement-xp.presenter';
import { normalizeLedgerFilters } from './reinforcement-xp-use-case.helpers';

@Injectable()
export class ListXpLedgerUseCase {
  constructor(private readonly xpRepository: ReinforcementXpRepository) {}

  async execute(query: ListXpLedgerQueryDto) {
    requireReinforcementScope();

    const filters = normalizeLedgerFilters(query);
    const result = await this.xpRepository.listLedger(filters);
    return presentXpLedger({
      ...result,
      limit: filters.limit ?? null,
      offset: filters.offset ?? null,
    });
  }
}
