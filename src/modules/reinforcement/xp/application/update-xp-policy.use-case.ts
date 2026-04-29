import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { requireReinforcementScope } from '../../reinforcement-context';
import { UpdateXpPolicyDto } from '../dto/reinforcement-xp.dto';
import { ReinforcementXpRepository } from '../infrastructure/reinforcement-xp.repository';
import { presentXpPolicy } from '../presenters/reinforcement-xp.presenter';
import {
  assertActivePolicyConflictFree,
  buildPolicyAuditEntry,
  buildUpdateXpPolicyData,
  translatePolicyConflict,
} from './reinforcement-xp-use-case.helpers';

@Injectable()
export class UpdateXpPolicyUseCase {
  constructor(
    private readonly xpRepository: ReinforcementXpRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(policyId: string, command: UpdateXpPolicyDto) {
    const scope = requireReinforcementScope();
    const existing = await this.xpRepository.findPolicyById(policyId);
    if (!existing) {
      throw new NotFoundDomainException('XP policy not found', { policyId });
    }

    const data = buildUpdateXpPolicyData({ existing, command });
    const nextActive =
      command.isActive === undefined ? existing.isActive : command.isActive;
    await assertActivePolicyConflictFree({
      repository: this.xpRepository,
      policy: {
        academicYearId: existing.academicYearId,
        termId: existing.termId,
        scopeType: existing.scopeType,
        scopeKey: existing.scopeKey,
        isActive: nextActive,
      },
      excludeId: existing.id,
    });

    try {
      const policy = await this.xpRepository.updatePolicy(policyId, data);
      await this.authRepository.createAuditLog(
        buildPolicyAuditEntry({
          scope,
          action: 'reinforcement.xp.policy.update',
          before: existing,
          policy,
        }),
      );

      return presentXpPolicy(policy);
    } catch (error) {
      translatePolicyConflict(error);
    }
  }
}
