import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../../common/exceptions/domain-exception';
import {
  CommunicationConversationArchivedException,
  CommunicationConversationClosedException,
  CommunicationConversationScopeInvalidException,
  CommunicationPolicyDisabledException,
} from './communication-conversation-domain';
import {
  CommunicationMessageDeletedException,
  CommunicationMessageHiddenException,
} from './communication-message-domain';
import {
  CommunicationConversationNotMemberException,
  CommunicationParticipantNotActiveException,
  CommunicationParticipantRoleForbiddenException,
} from './communication-participant-domain';
import { PlainCommunicationPolicy } from './communication-policy-domain';

export const COMMUNICATION_REACTION_TYPES = [
  'like',
  'love',
  'laugh',
  'wow',
  'sad',
  'angry',
  'thumbs_up',
  'thumbs_down',
] as const;

export type CommunicationReactionTypeValue =
  (typeof COMMUNICATION_REACTION_TYPES)[number];

export type ReactionConversationStatusValue =
  | 'ACTIVE'
  | 'ARCHIVED'
  | 'CLOSED';

export type ReactionMessageStatusValue = 'SENT' | 'HIDDEN' | 'DELETED';

export type ReactionParticipantRoleValue =
  | 'OWNER'
  | 'ADMIN'
  | 'MODERATOR'
  | 'MEMBER'
  | 'READ_ONLY'
  | 'SYSTEM';

export type ReactionParticipantStatusValue =
  | 'ACTIVE'
  | 'INVITED'
  | 'LEFT'
  | 'REMOVED'
  | 'MUTED'
  | 'BLOCKED';

export interface PlainReactionConversation {
  id: string;
  status: ReactionConversationStatusValue;
}

export interface PlainReactionMessage {
  id: string;
  conversationId: string;
  senderUserId: string | null;
  status: ReactionMessageStatusValue;
  hiddenAt?: Date | null;
  deletedAt?: Date | null;
}

export interface PlainReactionParticipant {
  id: string;
  conversationId: string;
  userId: string;
  role: ReactionParticipantRoleValue;
  status: ReactionParticipantStatusValue;
  mutedUntil?: Date | null;
}

export interface PlainCommunicationReaction {
  id: string;
  messageId: string;
  userId: string;
  reactionKey: string;
}

const REACTION_TYPE_SET = new Set<string>(COMMUNICATION_REACTION_TYPES);

export class CommunicationReactionNotAllowedException extends DomainException {
  constructor(message = 'Message reactions are not allowed', details?: Record<string, unknown>) {
    super({
      code: 'communication.policy.disabled',
      message,
      httpStatus: HttpStatus.FORBIDDEN,
      details,
    });
  }
}

export function normalizeCommunicationReactionType(
  value: string,
): CommunicationReactionTypeValue {
  const trimmed = value.trim();
  const normalized = trimmed.toLowerCase();

  if (trimmed !== normalized || !REACTION_TYPE_SET.has(normalized)) {
    throw new CommunicationConversationScopeInvalidException(
      'Reaction type is invalid',
      { field: 'type', value },
    );
  }

  return normalized as CommunicationReactionTypeValue;
}

export function assertReactionAllowedByPolicy(
  policy: Pick<PlainCommunicationPolicy, 'isEnabled' | 'allowReactions'>,
): void {
  if (!policy.isEnabled) {
    throw new CommunicationPolicyDisabledException();
  }

  if (!policy.allowReactions) {
    throw new CommunicationReactionNotAllowedException(
      'Message reactions are disabled by communication policy',
    );
  }
}

export function assertMessageAllowsReaction(params: {
  conversation: PlainReactionConversation;
  message: PlainReactionMessage;
}): void {
  assertReactionConversationIsOpen(params.conversation);
  assertReactionMessageIsVisible(params.message);
}

export function assertParticipantAllowsReaction(
  participant: PlainReactionParticipant,
): void {
  if (participant.status !== 'ACTIVE') {
    throw new CommunicationParticipantNotActiveException({
      participantId: participant.id,
      status: participant.status,
    });
  }

  if (participant.role === 'READ_ONLY') {
    throw new CommunicationParticipantRoleForbiddenException(
      'Read-only participants cannot react to messages',
      { participantId: participant.id },
    );
  }
}

export function assertCanDeleteReaction(params: {
  reaction: PlainCommunicationReaction;
  actorId: string;
  canManageReaction: boolean;
}): void {
  if (params.canManageReaction || params.reaction.userId === params.actorId) {
    return;
  }

  throw new CommunicationConversationNotMemberException({
    reactionId: params.reaction.id,
  });
}

function assertReactionConversationIsOpen(
  conversation: PlainReactionConversation,
): void {
  if (conversation.status === 'ARCHIVED') {
    throw new CommunicationConversationArchivedException();
  }
  if (conversation.status === 'CLOSED') {
    throw new CommunicationConversationClosedException();
  }
}

function assertReactionMessageIsVisible(message: PlainReactionMessage): void {
  if (message.status === 'DELETED' || Boolean(message.deletedAt)) {
    throw new CommunicationMessageDeletedException({
      messageId: message.id,
    });
  }

  if (message.status === 'HIDDEN' || Boolean(message.hiddenAt)) {
    throw new CommunicationMessageHiddenException({
      messageId: message.id,
    });
  }
}
