import { CommunicationMessageStatus } from '@prisma/client';
import type {
  CommunicationMessageInfoResponse,
  CommunicationMessageReadersResponse,
} from '../../../communication/presenters/communication-message-read.presenter';
import {
  ParentConversationMessageResponseDto,
  ParentConversationMessagesResponseDto,
  ParentConversationReadResponseDto,
  ParentMessageInfoResponseDto,
  ParentMessageConversationCardDto,
  ParentMessageConversationDetailDto,
  ParentMessageConversationResponseDto,
  ParentMessageConversationsResponseDto,
  ParentMessageDto,
  ParentMessageReadersResponseDto,
} from '../dto/parent-messages.dto';
import type {
  ParentMessageConversationListResult,
  ParentMessageConversationRecord,
  ParentMessageListResult,
  ParentMessageRecord,
  ParentMessageUnreadSummary,
} from '../infrastructure/parent-messages-read.adapter';

export class ParentMessagesPresenter {
  static presentConversationList(params: {
    result: ParentMessageConversationListResult;
    parentUserId: string;
    unreadSummary?: ParentMessageUnreadSummary;
  }): ParentMessageConversationsResponseDto {
    const unreadSummary =
      params.unreadSummary ?? summarizeUnread(params.result.unreadCounts);

    return {
      conversations: params.result.items.map((conversation) =>
        presentConversationCard({
          conversation,
          parentUserId: params.parentUserId,
          unreadCount: params.result.unreadCounts.get(conversation.id) ?? 0,
        }),
      ),
      pagination: {
        page: params.result.page,
        limit: params.result.limit,
        total: params.result.total,
      },
      summary: unreadSummary,
    };
  }

  static presentConversation(params: {
    conversation: ParentMessageConversationRecord;
    parentUserId: string;
    unreadCount: number;
  }): ParentMessageConversationResponseDto {
    return {
      conversation: presentConversationDetail(params),
    };
  }

  static presentMessageList(params: {
    result: ParentMessageListResult;
    parentUserId: string;
  }): ParentConversationMessagesResponseDto {
    return {
      conversationId: params.result.conversationId,
      conversation_id: params.result.conversationId,
      messages: params.result.items.map((message) =>
        presentMessage({ message, parentUserId: params.parentUserId }),
      ),
      pagination: {
        page: params.result.page,
        limit: params.result.limit,
        total: params.result.total,
      },
    };
  }

  static presentMessage(params: {
    message: ParentMessageRecord;
    parentUserId: string;
  }): ParentConversationMessageResponseDto {
    return {
      message: presentMessage(params),
    };
  }

  static presentReadResult(result: {
    conversationId: string;
    readAt: string;
    markedCount: number;
  }): ParentConversationReadResponseDto {
    return {
      conversationId: result.conversationId,
      conversation_id: result.conversationId,
      readAt: result.readAt,
      read_at: result.readAt,
      markedCount: result.markedCount,
      marked_count: result.markedCount,
    };
  }

  static presentMessageReaders(
    result: CommunicationMessageReadersResponse,
  ): ParentMessageReadersResponseDto {
    return {
      messageId: result.messageId,
      message_id: result.messageId,
      conversationId: result.conversationId,
      conversation_id: result.conversationId,
      readCount: result.readCount,
      read_count: result.readCount,
      participantsCount: result.participantsCount,
      participants_count: result.participantsCount,
      fullyRead: result.fullyRead,
      fully_read: result.fullyRead,
      readers: result.readers.map((reader) => ({
        userId: reader.userId,
        user_id: reader.userId,
        displayName: reader.displayName,
        display_name: reader.displayName,
        userType: reader.userType,
        user_type: reader.userType,
        isMe: reader.isMe,
        is_me: reader.isMe,
        readAt: reader.readAt,
        read_at: reader.readAt,
      })),
      pagination: result.pagination,
    };
  }

  static presentMessageInfo(
    result: CommunicationMessageInfoResponse,
  ): ParentMessageInfoResponseDto {
    return {
      message: {
        messageId: result.message.messageId,
        message_id: result.message.messageId,
        conversationId: result.message.conversationId,
        conversation_id: result.message.conversationId,
        sender: result.message.sender,
        type: result.message.type,
        status: result.message.status,
        body: result.message.body,
        content: result.message.content,
        createdAt: result.message.createdAt,
        created_at: result.message.createdAt,
        readCount: result.message.readCount,
        read_count: result.message.readCount,
      },
      readers: this.presentMessageReaders({
        messageId: result.message.messageId,
        conversationId: result.message.conversationId,
        readCount: result.readCount,
        participantsCount: result.participantsCount,
        fullyRead: result.fullyRead,
        readers: result.readers,
        pagination: result.pagination,
      }).readers,
      readCount: result.readCount,
      read_count: result.readCount,
      participantsCount: result.participantsCount,
      participants_count: result.participantsCount,
      fullyRead: result.fullyRead,
      fully_read: result.fullyRead,
      pagination: result.pagination,
    };
  }
}

function presentConversationCard(params: {
  conversation: ParentMessageConversationRecord;
  parentUserId: string;
  unreadCount: number;
}): ParentMessageConversationCardDto {
  const lastMessage = params.conversation.messages[0] ?? null;
  const lastMessagePreview = lastMessage
    ? presentLastMessage({
        message: lastMessage,
        parentUserId: params.parentUserId,
      })
    : null;
  const type = params.conversation.type.toLowerCase();
  const participantsCount = params.conversation.participants.length;
  const isGroup = isGroupConversationType(type, { participantsCount });
  const displayName = conversationDisplayName(
    params.conversation,
    params.parentUserId,
  );
  const lastActivityAt = presentNullableDate(params.conversation.lastMessageAt);
  const updatedAt = params.conversation.updatedAt.toISOString();

  return {
    id: params.conversation.id,
    conversationId: params.conversation.id,
    conversation_id: params.conversation.id,
    type,
    title: conversationTitle(params.conversation),
    displayName,
    display_name: displayName,
    status: params.conversation.status.toLowerCase(),
    category: categoryForConversationType(type),
    isGroup,
    is_group: isGroup,
    avatar_url: null,
    lastMessage: lastMessagePreview,
    last_message: lastMessagePreview,
    unreadCount: params.unreadCount,
    unread_count: params.unreadCount,
    participantsCount,
    participants_count: participantsCount,
    lastMessageReadCount: lastMessagePreview?.readCount ?? 0,
    last_message_read_count: lastMessagePreview?.readCount ?? 0,
    lastActivityAt,
    last_activity_at: lastActivityAt,
    updatedAt,
    updated_at: updatedAt,
  };
}

function presentConversationDetail(params: {
  conversation: ParentMessageConversationRecord;
  parentUserId: string;
  unreadCount: number;
}): ParentMessageConversationDetailDto {
  const card = presentConversationCard(params);
  const metadata = plainMetadata(params.conversation.metadata);
  const ownParticipant =
    params.conversation.participants.find(
      (participant) => participant.userId === params.parentUserId,
    ) ?? null;
  const lastReadAt = presentNullableDate(ownParticipant?.lastReadAt ?? null);
  const createdAt = params.conversation.createdAt.toISOString();

  return {
    ...card,
    readOnly: metadata?.isReadOnly === true,
    read_only: metadata?.isReadOnly === true,
    participants: params.conversation.participants.map((participant) => ({
      userId: participant.userId,
      displayName: fullName(participant.user),
      userType: participant.user.userType.toLowerCase(),
      role: participant.role.toLowerCase(),
      isMe: participant.userId === params.parentUserId,
    })),
    ownReadState: {
      lastReadMessageId: ownParticipant?.lastReadMessageId ?? null,
      lastReadAt,
    },
    own_read_state: {
      last_read_message_id: ownParticipant?.lastReadMessageId ?? null,
      last_read_at: lastReadAt,
    },
    createdAt,
    created_at: createdAt,
  };
}

function presentLastMessage(params: {
  message: ParentMessageRecord;
  parentUserId: string;
}) {
  const message = presentMessage(params);

  return {
    id: message.id,
    messageId: message.messageId,
    message_id: message.message_id,
    sender: message.sender,
    senderType: message.senderType,
    sender_type: message.sender_type,
    type: message.type,
    status: message.status,
    text: message.text,
    body: message.body,
    content: message.content,
    readCount: message.readCount,
    read_count: message.read_count,
    createdAt: message.createdAt,
    created_at: message.created_at,
  };
}

function presentMessage(params: {
  message: ParentMessageRecord;
  parentUserId: string;
}): ParentMessageDto {
  const visible = isVisibleMessage(params.message);
  const body = visible ? params.message.body : null;
  const createdAt = params.message.sentAt.toISOString();
  const senderType =
    params.message.senderUserId === params.parentUserId ? 'me' : 'other';
  const readByParent = params.message.reads.some(
    (read) => read.userId === params.parentUserId,
  );
  const readCount = countReadUsersExcludingSender(params.message);
  const isRead = senderType === 'me' ? readCount > 0 : readByParent;

  return {
    id: params.message.id,
    messageId: params.message.id,
    message_id: params.message.id,
    sender: {
      userId: params.message.senderUserId,
      displayName: params.message.senderUser
        ? fullName(params.message.senderUser)
        : null,
      userType: params.message.senderUser
        ? params.message.senderUser.userType.toLowerCase()
        : null,
      isMe: senderType === 'me',
    },
    senderType,
    sender_type: senderType,
    type: params.message.kind.toLowerCase(),
    status: params.message.status.toLowerCase(),
    text: body,
    body,
    content: body,
    replyToMessageId: params.message.replyToMessageId,
    reply_to_message_id: params.message.replyToMessageId,
    editedAt: presentNullableDate(params.message.editedAt),
    edited_at: presentNullableDate(params.message.editedAt),
    createdAt,
    created_at: createdAt,
    date: createdAt.slice(0, 10),
    time: createdAt.slice(11, 16),
    isRead,
    is_read: isRead,
    readCount,
    read_count: readCount,
    audio_url: null,
    audio_duration: null,
  };
}

function conversationTitle(
  conversation: Pick<ParentMessageConversationRecord, 'titleEn' | 'titleAr'>,
): string | null {
  return conversation.titleEn ?? conversation.titleAr ?? null;
}

function conversationDisplayName(
  conversation: ParentMessageConversationRecord,
  parentUserId: string,
): string {
  const title = conversationTitle(conversation);
  if (title) return title;

  const otherParticipants = conversation.participants.filter(
    (participant) => participant.userId !== parentUserId,
  );
  if (otherParticipants.length > 0) {
    return otherParticipants
      .slice(0, 3)
      .map((participant) => fullName(participant.user))
      .join(', ');
  }

  return 'Conversation';
}

function categoryForConversationType(type: string): string {
  switch (type) {
    case 'classroom':
    case 'grade':
    case 'section':
    case 'stage':
    case 'school_wide':
      return 'school';
    case 'support':
      return 'support';
    case 'group':
      return 'group';
    case 'system':
      return 'system';
    case 'direct':
    default:
      return 'direct';
  }
}

function isGroupConversationType(
  type: string,
  params: { participantsCount: number },
): boolean {
  switch (type) {
    case 'group':
    case 'classroom':
    case 'grade':
    case 'section':
    case 'stage':
    case 'school_wide':
      return true;
    case 'support':
      return params.participantsCount > 2;
    case 'system':
    case 'direct':
    default:
      return false;
  }
}

function summarizeUnread(
  unreadCounts: Map<string, number>,
): ParentMessageUnreadSummary {
  const unreadMessagesCount = [...unreadCounts.values()].reduce(
    (total, count) => total + count,
    0,
  );

  return {
    unreadConversationsCount: [...unreadCounts.values()].filter(
      (count) => count > 0,
    ).length,
    unreadMessagesCount,
  };
}

function plainMetadata(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function isVisibleMessage(
  message: Pick<ParentMessageRecord, 'status' | 'hiddenAt' | 'deletedAt'>,
): boolean {
  return (
    message.status !== CommunicationMessageStatus.HIDDEN &&
    message.status !== CommunicationMessageStatus.DELETED &&
    !message.hiddenAt &&
    !message.deletedAt
  );
}

function fullName(user: { firstName: string; lastName: string }): string {
  return `${user.firstName} ${user.lastName}`.trim();
}

function presentNullableDate(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function countReadUsersExcludingSender(message: {
  senderUserId: string | null;
  reads: Array<{ userId: string }>;
}): number {
  return message.reads.filter(
    (read) => !message.senderUserId || read.userId !== message.senderUserId,
  ).length;
}
