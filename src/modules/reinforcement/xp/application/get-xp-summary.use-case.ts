import { Injectable } from '@nestjs/common';
import { summarizeXpLedger } from '../domain/reinforcement-xp-domain';
import { GetXpSummaryQueryDto } from '../dto/reinforcement-xp.dto';
import { ReinforcementXpRepository } from '../infrastructure/reinforcement-xp.repository';
import { presentXpSummary } from '../presenters/reinforcement-xp.presenter';
import { requireReinforcementScope } from '../../reinforcement-context';
import {
  normalizeSummaryLedgerFilters,
  resolveEffectiveXpRequestScope,
  resolveXpAcademicYearId,
  validateXpAcademicContext,
} from './reinforcement-xp-use-case.helpers';

@Injectable()
export class GetXpSummaryUseCase {
  constructor(private readonly xpRepository: ReinforcementXpRepository) {}

  async execute(query: GetXpSummaryQueryDto) {
    const scope = requireReinforcementScope();
    const academicYearId = resolveXpAcademicYearId(query);
    await validateXpAcademicContext({
      repository: this.xpRepository,
      academicYearId,
      termId: query.termId,
    });

    const resolvedScope = await resolveEffectiveXpRequestScope({
      scope,
      repository: this.xpRepository,
      query,
      academicYearId,
      termId: query.termId,
    });
    const entries = await this.xpRepository.findLedgerForSummary(
      normalizeSummaryLedgerFilters({
        query,
        academicYearId,
        scope: resolvedScope,
      }),
    );

    return presentXpSummary({
      academicYearId,
      termId: query.termId,
      scope: resolvedScope,
      summary: summarizeXpLedger(entries),
    });
  }
}
