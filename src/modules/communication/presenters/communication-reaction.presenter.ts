import {
  CommunicationMessageReactionListResult,
  CommunicationMessageReactionRecord,
} from '../infrastructure/communication-reaction.repository';

export interface CommunicationReactionResponse {
  id: string;
  messageId: string;
  userId: string;
  type: string;
  reactionKey: string;
  emoji: string | null;
  createdAt: string;
  updatedAt: string;
}

export function presentCommunicationReactionList(
  result: CommunicationMessageReactionListResult,
) {
  return {
    messageId: result.messageId,
    items: result.items.map((reaction) =>
      presentCommunicationReaction(reaction),
    ),
  };
}

export function presentCommunicationReaction(
  reaction: CommunicationMessageReactionRecord,
): CommunicationReactionResponse {
  const type = reaction.reactionKey.trim().toLowerCase();

  return {
    id: reaction.id,
    messageId: reaction.messageId,
    userId: reaction.userId,
    type,
    reactionKey: type,
    emoji: reaction.emoji,
    createdAt: reaction.createdAt.toISOString(),
    updatedAt: reaction.updatedAt.toISOString(),
  };
}

export function summarizeCommunicationReactionForAudit(
  reaction: CommunicationMessageReactionRecord,
): Record<string, unknown> {
  return {
    id: reaction.id,
    conversationId: reaction.conversationId,
    messageId: reaction.messageId,
    userId: reaction.userId,
    type: reaction.reactionKey.trim().toLowerCase(),
    hasEmoji: Boolean(reaction.emoji),
    createdAt: reaction.createdAt.toISOString(),
    updatedAt: reaction.updatedAt.toISOString(),
  };
}
