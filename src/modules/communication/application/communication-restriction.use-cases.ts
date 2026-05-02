import { Injectable } from '@nestjs/common';
import { AuditOutcome, CommunicationRestrictionType } from '@prisma/client';
import { NotFoundDomainException } from '../../../common/exceptions/domain-exception';
import {
  CommunicationScope,
  requireCommunicationScope,
} from '../communication-context';
import {
  assertCanCreateRestriction,
  assertCanRevokeRestriction,
  assertCanUpdateRestriction,
  normalizeCommunicationRestrictionStatus,
  normalizeCommunicationRestrictionType,
  PlainCommunicationUserRestriction,
} from '../domain/communication-restriction-domain';
import {
  CreateCommunicationUserRestrictionDto,
  ListCommunicationUserRestrictionsQueryDto,
  UpdateCommunicationUserRestrictionDto,
} from '../dto/communication-restriction.dto';
import {
  CommunicationRestrictionAuditInput,
  CommunicationRestrictionRepository,
  CommunicationUserRestrictionRecord,
} from '../infrastructure/communication-restriction.repository';
import {
  presentCommunicationUserRestriction,
  presentCommunicationUserRestrictionList,
  summarizeCommunicationUserRestrictionForAudit,
} from '../presenters/communication-restriction.presenter';

@Injectable()
export class ListCommunicationUserRestrictionsUseCase {
  constructor(
    private readonly communicationRestrictionRepository: CommunicationRestrictionRepository,
  ) {}

  async execute(query: ListCommunicationUserRestrictionsQueryDto) {
    requireCommunicationScope();

    const result =
      await this.communicationRestrictionRepository.listCurrentSchoolUserRestrictions(
        {
          ...(query.targetUserId || query.userId
            ? { targetUserId: query.targetUserId ?? query.userId }
            : {}),
          ...(query.type
            ? {
                restrictionType: normalizeCommunicationRestrictionType(
                  query.type,
                ) as CommunicationRestrictionType,
              }
            : {}),
          ...(query.status
            ? { status: normalizeCommunicationRestrictionStatus(query.status) }
            : {}),
          ...(query.activeOnly !== undefined
            ? { activeOnly: query.activeOnly }
            : {}),
          ...(query.limit !== undefined ? { limit: query.limit } : {}),
          ...(query.page !== undefined ? { page: query.page } : {}),
        },
      );

    return presentCommunicationUserRestrictionList(result);
  }
}

@Injectable()
export class CreateCommunicationUserRestrictionUseCase {
  constructor(
    private readonly communicationRestrictionRepository: CommunicationRestrictionRepository,
  ) {}

  async execute(command: CreateCommunicationUserRestrictionDto) {
    const scope = requireCommunicationScope();
    const restrictionType = normalizeCommunicationRestrictionType(
      command.type,
    ) as CommunicationRestrictionType;
    const startsAt = command.startsAt ? new Date(command.startsAt) : null;
    const expiresAt = command.expiresAt ? new Date(command.expiresAt) : null;
    const [targetMembership, activeConflict] = await Promise.all([
      this.communicationRestrictionRepository.findCurrentSchoolUserMembership(
        command.targetUserId,
      ),
      this.communicationRestrictionRepository.findCurrentSchoolActiveRestriction(
        {
          targetUserId: command.targetUserId,
          restrictionType,
        },
      ),
    ]);

    if (!targetMembership) {
      throw new NotFoundDomainException('Target user not found', {
        targetUserId: command.targetUserId,
      });
    }

    assertCanCreateRestriction({
      targetUserId: command.targetUserId,
      restrictionType,
      hasActiveConflict: Boolean(activeConflict),
      startsAt,
      expiresAt,
    });

    const restriction =
      await this.communicationRestrictionRepository.createCurrentSchoolUserRestriction(
        {
          schoolId: scope.schoolId,
          targetUserId: command.targetUserId,
          restrictedById: scope.actorId,
          restrictionType,
          reason: command.reason ?? null,
          startsAt,
          expiresAt,
          metadata: command.metadata ?? null,
          buildAuditEntry: (created) =>
            buildRestrictionAuditEntry({
              scope,
              action: 'communication.user_restriction.create',
              restriction: created,
              changedFields: [
                'targetUserId',
                'restrictionType',
                'reason',
                'startsAt',
                'expiresAt',
                'metadata',
              ],
            }),
        },
      );

    return presentCommunicationUserRestriction(restriction);
  }
}

@Injectable()
export class UpdateCommunicationUserRestrictionUseCase {
  constructor(
    private readonly communicationRestrictionRepository: CommunicationRestrictionRepository,
  ) {}

  async execute(
    restrictionId: string,
    command: UpdateCommunicationUserRestrictionDto,
  ) {
    const scope = requireCommunicationScope();
    const restriction = await requireRestriction(
      this.communicationRestrictionRepository,
      restrictionId,
    );
    const startsAt = command.startsAt ? new Date(command.startsAt) : undefined;
    const expiresAt =
      command.expiresAt !== undefined ? new Date(command.expiresAt) : undefined;

    assertCanUpdateRestriction({
      restriction: toPlainRestriction(restriction),
      startsAt,
      expiresAt,
    });

    const updated =
      await this.communicationRestrictionRepository.updateCurrentSchoolUserRestriction(
        {
          restrictionId: restriction.id,
          reason: command.reason,
          startsAt,
          expiresAt,
          metadata: command.metadata,
          buildAuditEntry: (next) =>
            buildRestrictionAuditEntry({
              scope,
              action: 'communication.user_restriction.update',
              restriction: next,
              before: restriction,
              changedFields: ['reason', 'startsAt', 'expiresAt', 'metadata'],
            }),
        },
      );

    return presentCommunicationUserRestriction(updated);
  }
}

@Injectable()
export class RevokeCommunicationUserRestrictionUseCase {
  constructor(
    private readonly communicationRestrictionRepository: CommunicationRestrictionRepository,
  ) {}

  async execute(restrictionId: string) {
    const scope = requireCommunicationScope();
    const restriction = await requireRestriction(
      this.communicationRestrictionRepository,
      restrictionId,
    );

    assertCanRevokeRestriction({
      restriction: toPlainRestriction(restriction),
    });

    const revoked =
      await this.communicationRestrictionRepository.revokeCurrentSchoolUserRestriction(
        {
          restrictionId: restriction.id,
          liftedById: scope.actorId,
          buildAuditEntry: (next) =>
            buildRestrictionAuditEntry({
              scope,
              action: 'communication.user_restriction.revoke',
              restriction: next,
              before: restriction,
              changedFields: ['liftedAt', 'liftedById'],
            }),
        },
      );

    return presentCommunicationUserRestriction(revoked);
  }
}

async function requireRestriction(
  repository: CommunicationRestrictionRepository,
  restrictionId: string,
): Promise<CommunicationUserRestrictionRecord> {
  const restriction =
    await repository.findCurrentSchoolUserRestrictionById(restrictionId);
  if (!restriction) {
    throw new NotFoundDomainException('Restriction not found', {
      restrictionId,
    });
  }

  return restriction;
}

function toPlainRestriction(
  restriction: CommunicationUserRestrictionRecord,
): PlainCommunicationUserRestriction {
  return {
    id: restriction.id,
    targetUserId: restriction.targetUserId,
    restrictionType: restriction.restrictionType,
    startsAt: restriction.startsAt,
    expiresAt: restriction.expiresAt,
    liftedAt: restriction.liftedAt,
  };
}

function buildRestrictionAuditEntry(params: {
  scope: CommunicationScope;
  action:
    | 'communication.user_restriction.create'
    | 'communication.user_restriction.update'
    | 'communication.user_restriction.revoke';
  restriction: CommunicationUserRestrictionRecord;
  before?: CommunicationUserRestrictionRecord | null;
  changedFields: string[];
}): CommunicationRestrictionAuditInput {
  return {
    actorId: params.scope.actorId,
    userType: params.scope.userType,
    organizationId: params.scope.organizationId,
    schoolId: params.scope.schoolId,
    module: 'communication',
    action: params.action,
    resourceType: 'communication_user_restriction',
    resourceId: params.restriction.id,
    outcome: AuditOutcome.SUCCESS,
    before: params.before
      ? {
          targetSchoolId: params.scope.schoolId,
          restriction:
            summarizeCommunicationUserRestrictionForAudit(params.before),
        }
      : undefined,
    after: {
      targetSchoolId: params.scope.schoolId,
      actorId: params.scope.actorId,
      changedFields: params.changedFields,
      restrictionId: params.restriction.id,
      targetUserId: params.restriction.targetUserId,
      restriction:
        summarizeCommunicationUserRestrictionForAudit(params.restriction),
    },
  };
}
