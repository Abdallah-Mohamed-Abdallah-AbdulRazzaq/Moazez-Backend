import { Injectable } from '@nestjs/common';
import { AuditOutcome } from '@prisma/client';
import { NotFoundDomainException } from '../../../common/exceptions/domain-exception';
import {
  CommunicationScope,
  requireCommunicationScope,
} from '../communication-context';
import {
  assertCanCreateBlock,
  assertCanDeleteBlock,
  PlainCommunicationUserBlock,
} from '../domain/communication-block-domain';
import { CreateCommunicationUserBlockDto } from '../dto/communication-block.dto';
import {
  CommunicationBlockAuditInput,
  CommunicationBlockRepository,
  CommunicationUserBlockRecord,
} from '../infrastructure/communication-block.repository';
import {
  presentCommunicationUserBlock,
  presentCommunicationUserBlockList,
  summarizeCommunicationUserBlockForAudit,
} from '../presenters/communication-block.presenter';

@Injectable()
export class ListCommunicationUserBlocksUseCase {
  constructor(
    private readonly communicationBlockRepository: CommunicationBlockRepository,
  ) {}

  async execute() {
    const scope = requireCommunicationScope();
    const blocks =
      await this.communicationBlockRepository.listCurrentActorBlocks({
        actorId: scope.actorId,
      });

    return presentCommunicationUserBlockList(blocks);
  }
}

@Injectable()
export class CreateCommunicationUserBlockUseCase {
  constructor(
    private readonly communicationBlockRepository: CommunicationBlockRepository,
  ) {}

  async execute(command: CreateCommunicationUserBlockDto) {
    const scope = requireCommunicationScope();
    const [targetMembership, existingBlock] = await Promise.all([
      this.communicationBlockRepository.findCurrentSchoolUserMembership(
        command.targetUserId,
      ),
      this.communicationBlockRepository.findCurrentSchoolActiveBlock({
        blockerUserId: scope.actorId,
        blockedUserId: command.targetUserId,
      }),
    ]);

    if (!targetMembership) {
      throw new NotFoundDomainException('Target user not found', {
        targetUserId: command.targetUserId,
      });
    }

    assertCanCreateBlock({
      actorId: scope.actorId,
      targetUserId: command.targetUserId,
      hasActiveBlock: Boolean(existingBlock),
    });

    const block =
      await this.communicationBlockRepository.createCurrentSchoolUserBlock({
        schoolId: scope.schoolId,
        blockerUserId: scope.actorId,
        blockedUserId: command.targetUserId,
        reason: command.reason ?? null,
        metadata: command.metadata ?? null,
        buildAuditEntry: (created) =>
          buildBlockAuditEntry({
            scope,
            action: 'communication.user_block.create',
            block: created,
            changedFields: ['blockedUserId', 'reason', 'metadata'],
          }),
      });

    return presentCommunicationUserBlock(block);
  }
}

@Injectable()
export class DeleteCommunicationUserBlockUseCase {
  constructor(
    private readonly communicationBlockRepository: CommunicationBlockRepository,
  ) {}

  async execute(blockId: string) {
    const scope = requireCommunicationScope();
    const block = await this.communicationBlockRepository.findCurrentActorBlockById(
      {
        blockId,
        actorId: scope.actorId,
      },
    );
    if (!block) {
      throw new NotFoundDomainException('Block not found', { blockId });
    }

    assertCanDeleteBlock({
      actorId: scope.actorId,
      block: toPlainBlock(block),
    });

    const deleted =
      await this.communicationBlockRepository.deleteCurrentSchoolUserBlock({
        blockId: block.id,
        buildAuditEntry: (next) =>
          buildBlockAuditEntry({
            scope,
            action: 'communication.user_block.delete',
            block: next,
            before: block,
            changedFields: ['unblockedAt'],
          }),
      });

    return presentCommunicationUserBlock(deleted);
  }
}

function toPlainBlock(
  block: CommunicationUserBlockRecord,
): PlainCommunicationUserBlock {
  return {
    id: block.id,
    blockerUserId: block.blockerUserId,
    blockedUserId: block.blockedUserId,
    unblockedAt: block.unblockedAt,
  };
}

function buildBlockAuditEntry(params: {
  scope: CommunicationScope;
  action: 'communication.user_block.create' | 'communication.user_block.delete';
  block: CommunicationUserBlockRecord;
  before?: CommunicationUserBlockRecord | null;
  changedFields: string[];
}): CommunicationBlockAuditInput {
  return {
    actorId: params.scope.actorId,
    userType: params.scope.userType,
    organizationId: params.scope.organizationId,
    schoolId: params.scope.schoolId,
    module: 'communication',
    action: params.action,
    resourceType: 'communication_user_block',
    resourceId: params.block.id,
    outcome: AuditOutcome.SUCCESS,
    before: params.before
      ? {
          targetSchoolId: params.scope.schoolId,
          block: summarizeCommunicationUserBlockForAudit(params.before),
        }
      : undefined,
    after: {
      targetSchoolId: params.scope.schoolId,
      actorId: params.scope.actorId,
      changedFields: params.changedFields,
      blockId: params.block.id,
      targetUserId: params.block.blockedUserId,
      block: summarizeCommunicationUserBlockForAudit(params.block),
    },
  };
}
