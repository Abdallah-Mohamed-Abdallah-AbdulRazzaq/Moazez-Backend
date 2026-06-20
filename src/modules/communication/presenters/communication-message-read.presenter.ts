import {
  CommunicationConversationReadResult,
  CommunicationMessageReadResult,
  CommunicationReadSummaryResult,
} from '../infrastructure/communication-message.repository';

export function presentCommunicationMessageReadReceipt(
  read: CommunicationMessageReadResult,
) {
  return {
    id: read.id,
    conversationId: read.conversationId,
    messageId: read.messageId,
    userId: read.userId,
    readAt: read.readAt.toISOString(),
    readCount: read.readCount,
    createdAt: presentNullableDate(read.createdAt),
    updatedAt: presentNullableDate(read.updatedAt),
  };
}

export function presentCommunicationConversationReadResult(
  result: CommunicationConversationReadResult,
) {
  return {
    conversationId: result.conversationId,
    readAt: result.readAt.toISOString(),
    markedCount: result.markedCount,
    messages: result.messages,
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

function presentNullableDate(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}
