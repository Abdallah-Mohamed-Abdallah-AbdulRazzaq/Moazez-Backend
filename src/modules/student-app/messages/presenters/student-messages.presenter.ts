import { CommunicationMessageStatus } from '@prisma/client';
import {
  StudentConversationMessageResponseDto,
  StudentConversationMessagesResponseDto,
  StudentConversationReadResponseDto,
  StudentMessageConversationCardDto,
  StudentMessageConversationDetailDto,
  StudentMessageConversationResponseDto,
  StudentMessageConversationsResponseDto,
  StudentMessageDto,
} from '../dto/student-messages.dto';
import type {
  StudentMessageConversationListResult,
  StudentMessageConversationRecord,
  StudentMessageListResult,
  StudentMessageRecord,
  StudentMessageUnreadSummary,
} from '../infrastructure/student-messages-read.adapter';

export class StudentMessagesPresenter {
  static presentConversationList(params: {
    result: StudentMessageConversationListResult;
    studentUserId: string;
    unreadSummary?: StudentMessageUnreadSummary;
  }): StudentMessageConversationsResponseDto {
    const unreadSummary =
      params.unreadSummary ?? summarizeUnread(params.result.unreadCounts);

    return {
      conversations: params.result.items.map((conversation) =>
        presentConversationCard({
          conversation,
          studentUserId: params.studentUserId,
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
    conversation: StudentMessageConversationRecord;
    studentUserId: string;
    unreadCount: number;
  }): StudentMessageConversationResponseDto {
    return {
      conversation: presentConversationDetail(params),
    };
  }

  static presentMessageList(params: {
    result: StudentMessageListResult;
    studentUserId: string;
  }): StudentConversationMessagesResponseDto {
    return {
      conversationId: params.result.conversationId,
      conversation_id: params.result.conversationId,
      messages: params.result.items.map((message) =>
        presentMessage({ message, studentUserId: params.studentUserId }),
      ),
      pagination: {
        page: params.result.page,
        limit: params.result.limit,
        total: params.result.total,
      },
    };
  }

  static presentMessage(params: {
    message: StudentMessageRecord;
    studentUserId: string;
  }): StudentConversationMessageResponseDto {
    return {
      message: presentMessage(params),
    };
  }

  static presentReadResult(result: {
    conversationId: string;
    readAt: string;
    markedCount: number;
  }): StudentConversationReadResponseDto {
    return {
      conversationId: result.conversationId,
      conversation_id: result.conversationId,
      readAt: result.readAt,
      read_at: result.readAt,
      markedCount: result.markedCount,
      marked_count: result.markedCount,
    };
  }
}

function presentConversationCard(params: {
  conversation: StudentMessageConversationRecord;
  studentUserId: string;
  unreadCount: number;
}): StudentMessageConversationCardDto {
  const lastMessage = params.conversation.messages[0] ?? null;
  const type = params.conversation.type.toLowerCase();
  const displayName = conversationDisplayName(
    params.conversation,
    params.studentUserId,
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
    isGroup: params.conversation.participants.length > 2,
    is_group: params.conversation.participants.length > 2,
    avatar_url: null,
    lastMessage: lastMessage
      ? presentLastMessage({
          message: lastMessage,
          studentUserId: params.studentUserId,
        })
      : null,
    last_message: lastMessage
      ? presentLastMessage({
          message: lastMessage,
          studentUserId: params.studentUserId,
        })
      : null,
    unreadCount: params.unreadCount,
    unread_count: params.unreadCount,
    participantsCount: params.conversation.participants.length,
    participants_count: params.conversation.participants.length,
    lastActivityAt,
    last_activity_at: lastActivityAt,
    updatedAt,
    updated_at: updatedAt,
  };
}

function presentConversationDetail(params: {
  conversation: StudentMessageConversationRecord;
  studentUserId: string;
  unreadCount: number;
}): StudentMessageConversationDetailDto {
  const card = presentConversationCard(params);
  const metadata = plainMetadata(params.conversation.metadata);
  const ownParticipant =
    params.conversation.participants.find(
      (participant) => participant.userId === params.studentUserId,
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
      isMe: participant.userId === params.studentUserId,
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
  message: StudentMessageRecord;
  studentUserId: string;
}) {
  const message = presentMessage(params);

  return {
    messageId: message.messageId,
    sender: message.sender,
    type: message.type,
    status: message.status,
    body: message.body,
    content: message.content,
    createdAt: message.createdAt,
  };
}

function presentMessage(params: {
  message: StudentMessageRecord;
  studentUserId: string;
}): StudentMessageDto {
  const visible = isVisibleMessage(params.message);
  const body = visible ? params.message.body : null;
  const createdAt = params.message.sentAt.toISOString();
  const senderType =
    params.message.senderUserId === params.studentUserId ? 'me' : 'other';
  const readByStudent = params.message.reads.some(
    (read) => read.userId === params.studentUserId,
  );
  const isRead =
    senderType === 'me' ? params.message._count.reads > 0 : readByStudent;

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
    audio_url: null,
    audio_duration: null,
  };
}

function conversationTitle(
  conversation: Pick<StudentMessageConversationRecord, 'titleEn' | 'titleAr'>,
): string | null {
  return conversation.titleEn ?? conversation.titleAr ?? null;
}

function conversationDisplayName(
  conversation: StudentMessageConversationRecord,
  studentUserId: string,
): string {
  const title = conversationTitle(conversation);
  if (title) return title;

  const otherParticipants = conversation.participants.filter(
    (participant) => participant.userId !== studentUserId,
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

function summarizeUnread(
  unreadCounts: Map<string, number>,
): StudentMessageUnreadSummary {
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
  message: Pick<StudentMessageRecord, 'status' | 'hiddenAt' | 'deletedAt'>,
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
