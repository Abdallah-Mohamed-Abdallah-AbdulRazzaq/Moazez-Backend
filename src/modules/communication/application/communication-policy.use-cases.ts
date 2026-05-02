import { Injectable } from '@nestjs/common';
import { AuditOutcome } from '@prisma/client';
import { AuthRepository } from '../../iam/auth/infrastructure/auth.repository';
import {
  CommunicationScope,
  requireCommunicationScope,
} from '../communication-context';
import {
  buildDefaultCommunicationPolicy,
  CommunicationPolicyPatch,
  mergeCommunicationPolicyPatch,
  PlainCommunicationPolicy,
} from '../domain/communication-policy-domain';
import { UpdateCommunicationPolicyDto } from '../dto/communication-policy.dto';
import { CommunicationPolicyRepository } from '../infrastructure/communication-policy.repository';
import { presentCommunicationAdminOverview } from '../presenters/communication-admin.presenter';
import {
  presentCommunicationPolicy,
  summarizeCommunicationPolicyForAudit,
} from '../presenters/communication-policy.presenter';

@Injectable()
export class GetCommunicationPolicyUseCase {
  constructor(
    private readonly communicationPolicyRepository: CommunicationPolicyRepository,
  ) {}

  async execute() {
    requireCommunicationScope();
    const policy =
      await this.communicationPolicyRepository.findCurrentSchoolPolicy();

    return presentCommunicationPolicy(
      policy ?? buildDefaultCommunicationPolicy(),
      { isConfigured: Boolean(policy) },
    );
  }
}

@Injectable()
export class UpdateCommunicationPolicyUseCase {
  constructor(
    private readonly communicationPolicyRepository: CommunicationPolicyRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(command: UpdateCommunicationPolicyDto) {
    const scope = requireCommunicationScope();
    const existing =
      await this.communicationPolicyRepository.findCurrentSchoolPolicy();
    const basePolicy = existing ?? buildDefaultCommunicationPolicy();
    const normalized = mergeCommunicationPolicyPatch(
      basePolicy,
      command as CommunicationPolicyPatch,
    );
    const updated =
      await this.communicationPolicyRepository.upsertCurrentSchoolPolicy({
        schoolId: scope.schoolId,
        actorId: scope.actorId,
        data: normalized.data,
      });

    await this.authRepository.createAuditLog(
      buildCommunicationPolicyAuditEntry({
        scope,
        action: existing
          ? 'communication.policy.update'
          : 'communication.policy.create',
        policy: updated,
        before: existing,
        changedFields: normalized.changedFields,
      }),
    );

    return presentCommunicationPolicy(updated, { isConfigured: true });
  }
}

@Injectable()
export class GetCommunicationAdminOverviewUseCase {
  constructor(
    private readonly communicationPolicyRepository: CommunicationPolicyRepository,
  ) {}

  async execute() {
    requireCommunicationScope();
    const [policy, dataset] = await Promise.all([
      this.communicationPolicyRepository.findCurrentSchoolPolicy(),
      this.communicationPolicyRepository.loadSchoolAdminOverview(),
    ]);

    return presentCommunicationAdminOverview({
      policy: policy ?? buildDefaultCommunicationPolicy(),
      isConfigured: Boolean(policy),
      dataset,
    });
  }
}

function buildCommunicationPolicyAuditEntry(params: {
  scope: CommunicationScope;
  action: 'communication.policy.create' | 'communication.policy.update';
  policy: PlainCommunicationPolicy;
  before?: PlainCommunicationPolicy | null;
  changedFields: string[];
}) {
  return {
    actorId: params.scope.actorId,
    userType: params.scope.userType,
    organizationId: params.scope.organizationId,
    schoolId: params.scope.schoolId,
    module: 'communication',
    action: params.action,
    resourceType: 'communication_policy',
    resourceId: params.policy.id,
    outcome: AuditOutcome.SUCCESS,
    before: params.before
      ? {
          targetSchoolId: params.scope.schoolId,
          policy: summarizeCommunicationPolicyForAudit(params.before),
        }
      : undefined,
    after: {
      targetSchoolId: params.scope.schoolId,
      actorId: params.scope.actorId,
      changedFields: params.changedFields,
      policy: summarizeCommunicationPolicyForAudit(params.policy),
    },
  };
}
