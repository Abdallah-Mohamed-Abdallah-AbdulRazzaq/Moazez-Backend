import { Injectable } from '@nestjs/common';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { requireReinforcementScope } from '../../reinforcement-context';
import { CreateXpPolicyDto } from '../dto/reinforcement-xp.dto';
import { ReinforcementXpRepository } from '../infrastructure/reinforcement-xp.repository';
import { presentXpPolicy } from '../presenters/reinforcement-xp.presenter';
import {
  assertActivePolicyConflictFree,
  buildCreateXpPolicyData,
  buildPolicyAuditEntry,
  resolvePolicyScope,
  resolveXpAcademicYearId,
  translatePolicyConflict,
  validateXpAcademicContext,
} from './reinforcement-xp-use-case.helpers';

@Injectable()
export class CreateXpPolicyUseCase {
  constructor(
    private readonly xpRepository: ReinforcementXpRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(command: CreateXpPolicyDto) {
    const scope = requireReinforcementScope();
    const academicYearId = resolveXpAcademicYearId(command);
    await validateXpAcademicContext({
      repository: this.xpRepository,
      academicYearId,
      termId: command.termId,
    });

    const policyScope = await resolvePolicyScope({
      scope,
      repository: this.xpRepository,
      scopeType: command.scopeType,
      scopeId: command.scopeId,
    });
    const data = buildCreateXpPolicyData({
      schoolId: scope.schoolId,
      academicYearId,
      termId: command.termId,
      scope: policyScope,
      command,
    });
    await assertActivePolicyConflictFree({
      repository: this.xpRepository,
      policy: {
        academicYearId,
        termId: command.termId,
        scopeType: policyScope.scopeType,
        scopeKey: policyScope.scopeKey,
        isActive: data.isActive as boolean,
      },
    });

    try {
      const policy = await this.xpRepository.createPolicy(data);
      await this.authRepository.createAuditLog(
        buildPolicyAuditEntry({
          scope,
          action: 'reinforcement.xp.policy.create',
          policy,
        }),
      );

      return presentXpPolicy(policy);
    } catch (error) {
      translatePolicyConflict(error);
    }
  }
}
