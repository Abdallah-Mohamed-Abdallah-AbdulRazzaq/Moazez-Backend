import {
  CommunicationMessageInfoResponse,
  CommunicationMessageReadersResponse,
} from '../../../communication/presenters/communication-message-read.presenter';
import { presentCommunicationAppMessageAttachments } from '../../../communication/presenters/communication-app-message-attachment.presenter';
import {
  TeacherConversationMessageSearchResponseDto,
  TeacherConversationMessageResponseDto,
  TeacherConversationMessagesResponseDto,
  TeacherConversationReadResponseDto,
  TeacherMessageInfoResponseDto,
  TeacherMessageConversationCardDto,
  TeacherMessageConversationDetailDto,
  TeacherMessageConversationResponseDto,
  TeacherMessageConversationsResponseDto,
  TeacherMessageDto,
  TeacherMessageReadersResponseDto,
} from '../dto/teacher-messages.dto';
import type {
  TeacherMessageConversationListResult,
  TeacherMessageConversationRecord,
  TeacherMessageListResult,
  TeacherMessageRecord,
  TeacherMessageUnreadSummary,
} from '../infrastructure/teacher-messages-read.adapter';

export class TeacherMessagesPresenter {
  static presentConversationList(params: {
    result: TeacherMessageConversationListResult;
    teacherUserId: string;
    unreadSummary?: TeacherMessageUnreadSummary;
  }): TeacherMessageConversationsResponseDto {
    const unreadSummary =
      params.unreadSummary ?? summarizeUnread(params.result.unreadCounts);

    return {
      conversations: params.result.items.map((conversation) =>
        presentConversationCard({
          conversation,
          teacherUserId: params.teacherUserId,
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

  static presentHomeSummary(params: {
    result: TeacherMessageConversationListResult;
    teacherUserId: string;
    unreadSummary: TeacherMessageUnreadSummary;
  }) {
    return {
      unreadConversationsCount: params.unreadSummary.unreadConversationsCount,
      unreadMessagesCount: params.unreadSummary.unreadMessagesCount,
      recentConversations: params.result.items.map((conversation) =>
        presentConversationCard({
          conversation,
          teacherUserId: params.teacherUserId,
          unreadCount: params.result.unreadCounts.get(conversation.id) ?? 0,
        }),
      ),
    };
  }

  static presentConversation(params: {
    conversation: TeacherMessageConversationRecord;
    teacherUserId: string;
    unreadCount: number;
  }): TeacherMessageConversationResponseDto {
    return {
      conversation: presentConversationDetail(params),
    };
  }

  static presentMessageList(params: {
    result: TeacherMessageListResult;
    teacherUserId: string;
  }): TeacherConversationMessagesResponseDto {
    return {
      conversationId: params.result.conversationId,
      messages: params.result.items.map((message) =>
        presentMessage({ message, teacherUserId: params.teacherUserId }),
      ),
      pagination: {
        page: params.result.page,
        limit: params.result.limit,
        total: params.result.total,
      },
    };
  }

  static presentMessageSearch(params: {
    result: TeacherMessageListResult;
    teacherUserId: string;
    query: string;
  }): TeacherConversationMessageSearchResponseDto {
    return {
      ...this.presentMessageList(params),
      query: params.query,
    };
  }

  static presentMessage(params: {
    message: TeacherMessageRecord;
    teacherUserId: string;
  }): TeacherConversationMessageResponseDto {
    return {
      message: presentMessage(params),
    };
  }

  static presentReadResult(result: {
    conversationId: string;
    readAt: string;
    markedCount: number;
  }): TeacherConversationReadResponseDto {
    return {
      conversationId: result.conversationId,
      readAt: result.readAt,
      markedCount: result.markedCount,
    };
  }

  static presentMessageReaders(
    result: CommunicationMessageReadersResponse,
  ): TeacherMessageReadersResponseDto {
    return result;
  }

  static presentMessageInfo(
    result: CommunicationMessageInfoResponse,
  ): TeacherMessageInfoResponseDto {
    return result;
  }
}

function presentConversationCard(params: {
  conversation: TeacherMessageConversationRecord;
  teacherUserId: string;
  unreadCount: number;
}): TeacherMessageConversationCardDto {
  const lastMessage = params.conversation.messages[0] ?? null;
  const lastMessagePreview = lastMessage
    ? presentLastMessage({
        message: lastMessage,
        teacherUserId: params.teacherUserId,
      })
    : null;
  const type = params.conversation.type.toLowerCase();
  const participantsCount = params.conversation.participants.length;

  return {
    conversationId: params.conversation.id,
    type,
    title: conversationTitle(params.conversation),
    displayName: conversationDisplayName(
      params.conversation,
      params.teacherUserId,
    ),
    status: params.conversation.status.toLowerCase(),
    isGroup: isGroupConversationType(type, { participantsCount }),
    lastMessage: lastMessagePreview,
    unreadCount: params.unreadCount,
    participantsCount,
    lastMessageReadCount: lastMessagePreview?.readCount ?? 0,
    lastActivityAt: presentNullableDate(params.conversation.lastMessageAt),
    updatedAt: params.conversation.updatedAt.toISOString(),
  };
}

function presentConversationDetail(params: {
  conversation: TeacherMessageConversationRecord;
  teacherUserId: string;
  unreadCount: number;
}): TeacherMessageConversationDetailDto {
  const metadata = plainMetadata(params.conversation.metadata);
  const ownParticipant =
    params.conversation.participants.find(
      (participant) => participant.userId === params.teacherUserId,
    ) ?? null;

  return {
    conversationId: params.conversation.id,
    type: params.conversation.type.toLowerCase(),
    title: conversationTitle(params.conversation),
    displayName: conversationDisplayName(
      params.conversation,
      params.teacherUserId,
    ),
    status: params.conversation.status.toLowerCase(),
    readOnly: metadata?.isReadOnly === true,
    pinned: metadata?.isPinned === true,
    participantsCount: params.conversation.participants.length,
    participants: params.conversation.participants.map((participant) => ({
      userId: participant.userId,
      displayName: fullName(participant.user),
      userType: participant.user.userType.toLowerCase(),
      role: participant.role.toLowerCase(),
      isMe: participant.userId === params.teacherUserId,
    })),
    ownReadState: {
      lastReadMessageId: ownParticipant?.lastReadMessageId ?? null,
      lastReadAt: presentNullableDate(ownParticipant?.lastReadAt ?? null),
    },
    lastActivityAt: presentNullableDate(params.conversation.lastMessageAt),
    createdAt: params.conversation.createdAt.toISOString(),
    updatedAt: params.conversation.updatedAt.toISOString(),
  };
}

function presentLastMessage(params: {
  message: TeacherMessageRecord;
  teacherUserId: string;
}) {
  const message = presentMessage(params);
  const senderType: 'me' | 'other' =
    params.message.senderUserId === params.teacherUserId ? 'me' : 'other';

  return {
    id: message.messageId,
    messageId: message.messageId,
    sender: message.sender,
    senderType,
    type: message.type,
    status: message.status,
    text: message.body,
    body: message.body,
    content: message.content,
    readCount: message.readCount,
    attachmentsCount: message.attachmentsCount,
    createdAt: message.createdAt,
  };
}

function presentMessage(params: {
  message: TeacherMessageRecord;
  teacherUserId: string;
}): TeacherMessageDto {
  const visible = isVisibleMessage(params.message);
  const body = visible ? params.message.body : null;
  const attachments = visible ? presentAttachments(params.message) : [];

  return {
    messageId: params.message.id,
    sender: {
      userId: params.message.senderUserId,
      displayName: params.message.senderUser
        ? fullName(params.message.senderUser)
        : null,
      userType: params.message.senderUser
        ? params.message.senderUser.userType.toLowerCase()
        : null,
      isMe: params.message.senderUserId === params.teacherUserId,
    },
    type: params.message.kind.toLowerCase(),
    status: params.message.status.toLowerCase(),
    body,
    content: body,
    replyToMessageId: params.message.replyToMessageId,
    editedAt: presentNullableDate(params.message.editedAt),
    createdAt: params.message.sentAt.toISOString(),
    reactions: visible
      ? presentReactions(params.message, params.teacherUserId)
      : [],
    attachments,
    attachmentsCount: attachments.length,
    readCount: countReadUsersExcludingSender(params.message),
  };
}

function presentReactions(
  message: TeacherMessageRecord,
  teacherUserId: string,
) {
  const byKey = new Map<
    string,
    { key: string; emoji: string | null; count: number; reactedByMe: boolean }
  >();

  for (const reaction of message.reactions) {
    const mapKey = `${reaction.reactionKey}:${reaction.emoji ?? ''}`;
    const current = byKey.get(mapKey) ?? {
      key: reaction.reactionKey,
      emoji: reaction.emoji,
      count: 0,
      reactedByMe: false,
    };
    current.count += 1;
    current.reactedByMe ||= reaction.userId === teacherUserId;
    byKey.set(mapKey, current);
  }

  return [...byKey.values()].sort((left, right) =>
    left.key.localeCompare(right.key),
  );
}

function presentAttachments(message: TeacherMessageRecord) {
  const messageAttachments = message.attachments ?? [];
  const safeAttachments = presentCommunicationAppMessageAttachments(
    messageAttachments,
    {
      aliasStyle: 'camel',
      authorizedRoute: {
        surface: 'teacher',
        conversationId: message.conversationId,
        messageId: message.id,
      },
    },
  );

  return safeAttachments.map((attachment, index) => ({
    ...attachment,
    originalName: messageAttachments[index].file.originalName,
    visibility: messageAttachments[index].file.visibility.toLowerCase(),
  }));
}

function conversationTitle(
  conversation: Pick<TeacherMessageConversationRecord, 'titleEn' | 'titleAr'>,
): string | null {
  return conversation.titleEn ?? conversation.titleAr ?? null;
}

function conversationDisplayName(
  conversation: TeacherMessageConversationRecord,
  teacherUserId: string,
): string {
  const title = conversationTitle(conversation);
  if (title) return title;

  const otherParticipants = conversation.participants.filter(
    (participant) => participant.userId !== teacherUserId,
  );
  if (otherParticipants.length > 0) {
    return otherParticipants
      .slice(0, 3)
      .map((participant) => fullName(participant.user))
      .join(', ');
  }

  return 'Conversation';
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
): TeacherMessageUnreadSummary {
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
  message: Pick<TeacherMessageRecord, 'status' | 'hiddenAt' | 'deletedAt'>,
): boolean {
  return (
    message.status !== 'HIDDEN' &&
    message.status !== 'DELETED' &&
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
