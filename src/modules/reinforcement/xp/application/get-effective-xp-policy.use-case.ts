import { Injectable } from '@nestjs/common';
import { requireReinforcementScope } from '../../reinforcement-context';
import { GetEffectiveXpPolicyQueryDto } from '../dto/reinforcement-xp.dto';
import { ReinforcementXpRepository } from '../infrastructure/reinforcement-xp.repository';
import {
  presentDefaultXpPolicy,
  presentXpPolicy,
} from '../presenters/reinforcement-xp.presenter';
import {
  findEffectivePolicyForScope,
  resolveEffectiveXpRequestScope,
  resolveXpAcademicYearId,
  validateXpAcademicContext,
} from './reinforcement-xp-use-case.helpers';

@Injectable()
export class GetEffectiveXpPolicyUseCase {
  constructor(private readonly xpRepository: ReinforcementXpRepository) {}

  async execute(query: GetEffectiveXpPolicyQueryDto) {
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
    const policy = await findEffectivePolicyForScope({
      repository: this.xpRepository,
      schoolId: scope.schoolId,
      academicYearId,
      termId: query.termId,
      scope: resolvedScope,
      now: new Date(),
    });

    return policy
      ? presentXpPolicy(policy)
      : presentDefaultXpPolicy({
          academicYearId,
          termId: query.termId,
          scope: resolvedScope,
        });
  }
}
