import {
  CommunicationConversationReadResult,
  CommunicationMessageReadersResult,
  CommunicationMessageReadResult,
  CommunicationReadSummaryResult,
} from '../infrastructure/communication-message.repository';

export interface CommunicationMessageReaderCardResponse {
  userId: string;
  displayName: string;
  userType: string;
  isMe: boolean;
  readAt: string;
}

export interface CommunicationMessageReadersResponse {
  messageId: string;
  conversationId: string;
  readCount: number;
  participantsCount: number;
  fullyRead: boolean;
  readers: CommunicationMessageReaderCardResponse[];
  pagination: {
    page: number;
    limit: number;
    total: number;
  };
}

export interface CommunicationMessageInfoMessageResponse {
  messageId: string;
  conversationId: string;
  sender: {
    userId: string | null;
    displayName: string | null;
    userType: string | null;
    isMe: boolean;
  };
  type: string;
  status: string;
  body: string | null;
  content: string | null;
  createdAt: string;
  readCount: number;
}

export interface CommunicationMessageInfoResponse {
  message: CommunicationMessageInfoMessageResponse;
  readers: CommunicationMessageReaderCardResponse[];
  readCount: number;
  participantsCount: number;
  fullyRead: boolean;
  pagination: {
    page: number;
    limit: number;
    total: number;
  };
}

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

export function presentCommunicationMessageReaders(
  result: CommunicationMessageReadersResult,
  actorId: string,
): CommunicationMessageReadersResponse {
  return {
    messageId: result.message.id,
    conversationId: result.message.conversationId,
    readCount: result.readCount,
    participantsCount: result.participantsCount,
    fullyRead: result.fullyRead,
    readers: result.readers.map((reader) =>
      presentReaderCard(reader, actorId),
    ),
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
    },
  };
}

export function presentCommunicationMessageInfo(
  result: CommunicationMessageReadersResult,
  actorId: string,
): CommunicationMessageInfoResponse {
  const body = shouldHideMessageBody(result.message)
    ? null
    : result.message.body;

  return {
    message: {
      messageId: result.message.id,
      conversationId: result.message.conversationId,
      sender: {
        userId: result.message.senderUserId,
        displayName: result.message.senderUser
          ? fullName(result.message.senderUser)
          : null,
        userType: result.message.senderUser
          ? result.message.senderUser.userType.toLowerCase()
          : null,
        isMe: result.message.senderUserId === actorId,
      },
      type: result.message.kind.toLowerCase(),
      status: result.message.status.toLowerCase(),
      body,
      content: body,
      createdAt: result.message.sentAt.toISOString(),
      readCount: result.readCount,
    },
    readers: result.readers.map((reader) =>
      presentReaderCard(reader, actorId),
    ),
    readCount: result.readCount,
    participantsCount: result.participantsCount,
    fullyRead: result.fullyRead,
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
    },
  };
}

function presentReaderCard(
  reader: CommunicationMessageReadersResult['readers'][number],
  actorId: string,
): CommunicationMessageReaderCardResponse {
  return {
    userId: reader.userId,
    displayName: fullName(reader.user),
    userType: reader.user.userType.toLowerCase(),
    isMe: reader.userId === actorId,
    readAt: reader.readAt.toISOString(),
  };
}

function presentNullableDate(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function shouldHideMessageBody(
  message: Pick<
    CommunicationMessageReadersResult['message'],
    'status' | 'hiddenAt' | 'deletedAt'
  >,
): boolean {
  return (
    message.status === 'HIDDEN' ||
    message.status === 'DELETED' ||
    Boolean(message.hiddenAt) ||
    Boolean(message.deletedAt)
  );
}

function fullName(user: { firstName: string; lastName: string }): string {
  return `${user.firstName} ${user.lastName}`.trim();
}
