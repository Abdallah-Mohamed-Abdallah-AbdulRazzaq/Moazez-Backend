import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../../common/exceptions/domain-exception';
import { CommunicationConversationScopeInvalidException } from './communication-conversation-domain';

export interface PlainCommunicationUserBlock {
  id: string;
  blockerUserId: string;
  blockedUserId: string;
  unblockedAt?: Date | null;
}

export class CommunicationUserBlockedException extends DomainException {
  constructor(message = 'User is blocked', details?: Record<string, unknown>) {
    super({
      code: 'communication.user.blocked',
      message,
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export function assertCanCreateBlock(params: {
  actorId: string;
  targetUserId: string;
  hasActiveBlock: boolean;
}): void {
  if (params.actorId === params.targetUserId) {
    throw new CommunicationConversationScopeInvalidException(
      'A user cannot block themselves',
      { targetUserId: params.targetUserId },
    );
  }

  if (params.hasActiveBlock) {
    throw new CommunicationUserBlockedException('Active block already exists', {
      targetUserId: params.targetUserId,
    });
  }
}

export function assertCanDeleteBlock(params: {
  actorId: string;
  block: PlainCommunicationUserBlock;
}): void {
  if (params.block.blockerUserId !== params.actorId) {
    throw new CommunicationConversationScopeInvalidException(
      'Only the blocker can remove this block',
      { blockId: params.block.id },
    );
  }

  if (params.block.unblockedAt) {
    throw new CommunicationUserBlockedException('Block is already inactive', {
      blockId: params.block.id,
    });
  }
}
