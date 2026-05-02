import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../../common/exceptions/domain-exception';
import {
  CommunicationMessageDeletedException,
  CommunicationMessageHiddenException,
} from './communication-message-domain';
import { CommunicationConversationScopeInvalidException } from './communication-conversation-domain';

export type CommunicationModerationActionValue =
  | 'MESSAGE_HIDDEN'
  | 'MESSAGE_UNHIDDEN'
  | 'MESSAGE_DELETED'
  | 'USER_RESTRICTED';

export interface PlainModerationMessage {
  id: string;
  conversationId: string;
  senderUserId: string | null;
  status: 'SENT' | 'HIDDEN' | 'DELETED';
  hiddenAt?: Date | null;
  deletedAt?: Date | null;
}

export const COMMUNICATION_MODERATION_ACTIONS = [
  'hide',
  'unhide',
  'delete',
  'restrict_sender',
  'message_hidden',
  'message_unhidden',
  'message_deleted',
  'user_restricted',
] as const;

const ACTION_MAP: Record<string, CommunicationModerationActionValue> = {
  hide: 'MESSAGE_HIDDEN',
  message_hidden: 'MESSAGE_HIDDEN',
  unhide: 'MESSAGE_UNHIDDEN',
  message_unhidden: 'MESSAGE_UNHIDDEN',
  delete: 'MESSAGE_DELETED',
  message_deleted: 'MESSAGE_DELETED',
  restrict_sender: 'USER_RESTRICTED',
  user_restricted: 'USER_RESTRICTED',
};

export class CommunicationModerationForbiddenException extends DomainException {
  constructor(message = 'Moderation action is not allowed', details?: Record<string, unknown>) {
    super({
      code: 'communication.moderation.forbidden',
      message,
      httpStatus: HttpStatus.FORBIDDEN,
      details,
    });
  }
}

export function normalizeCommunicationModerationAction(
  value: string,
): CommunicationModerationActionValue {
  const normalized = value.trim().toLowerCase();
  const mapped = ACTION_MAP[normalized];
  if (!mapped) {
    throw new CommunicationConversationScopeInvalidException(
      'Moderation action is invalid',
      { field: 'action', value },
    );
  }

  return mapped;
}

export function assertCanCreateModerationAction(params: {
  action: CommunicationModerationActionValue;
  message: PlainModerationMessage;
}): void {
  assertModerationActionCanAffectMessage(params);
}

export function assertModerationActionCanAffectMessage(params: {
  action: CommunicationModerationActionValue;
  message: PlainModerationMessage;
}): void {
  switch (params.action) {
    case 'MESSAGE_HIDDEN':
      if (params.message.status === 'DELETED' || params.message.deletedAt) {
        throw new CommunicationMessageDeletedException({
          messageId: params.message.id,
        });
      }
      if (params.message.status === 'HIDDEN' || params.message.hiddenAt) {
        throw new CommunicationMessageHiddenException({
          messageId: params.message.id,
        });
      }
      return;
    case 'MESSAGE_UNHIDDEN':
      if (params.message.status === 'DELETED' || params.message.deletedAt) {
        throw new CommunicationMessageDeletedException({
          messageId: params.message.id,
        });
      }
      if (params.message.status !== 'HIDDEN' && !params.message.hiddenAt) {
        throw new CommunicationModerationForbiddenException(
          'Only hidden messages can be unhidden',
          { messageId: params.message.id },
        );
      }
      return;
    case 'MESSAGE_DELETED':
      if (params.message.status === 'DELETED' || params.message.deletedAt) {
        throw new CommunicationMessageDeletedException({
          messageId: params.message.id,
        });
      }
      return;
    case 'USER_RESTRICTED':
      if (!params.message.senderUserId) {
        throw new CommunicationModerationForbiddenException(
          'System messages do not have a sender to restrict',
          { messageId: params.message.id },
        );
      }
      return;
  }
}
