import {
  CommunicationConversationReadResult,
  CommunicationMessageReadRecord,
  CommunicationReadSummaryResult,
} from '../infrastructure/communication-message.repository';

export function presentCommunicationMessageReadReceipt(
  read: CommunicationMessageReadRecord,
) {
  return {
    id: read.id,
    conversationId: read.conversationId,
    messageId: read.messageId,
    userId: read.userId,
    readAt: read.readAt.toISOString(),
    createdAt: read.createdAt.toISOString(),
    updatedAt: read.updatedAt.toISOString(),
  };
}

export function presentCommunicationConversationReadResult(
  result: CommunicationConversationReadResult,
) {
  return {
    conversationId: result.conversationId,
    readAt: result.readAt.toISOString(),
    markedCount: result.markedCount,
  };
}

export function presentCommunicationReadSummary(
  result: CommunicationReadSummaryResult,
) {
  return {
    conversationId: result.conversationId,
    items: result.items,
    total: result.total,
    limit: result.limit,
    page: result.page,
  };
}
