import { UserType } from '@prisma/client';
import {
  PlatformSupportConversationListResult,
  SupportConversationRecord,
  SupportMessageListResult,
  SupportMessageRecord,
  SupportReadResult,
  SupportUnreadState,
} from '../infrastructure/school-support.repository';
import {
  PlatformSupportConversationResponseDto,
  PlatformSupportConversationsResponseDto,
  PlatformSupportMessagesListResponseDto,
  PlatformSupportReadResponseDto,
  PlatformSupportTransitionResponseDto,
} from '../dto/platform-support.dto';
import {
  SchoolSupportConversationResponseDto,
  SchoolSupportMessageResponseDto,
  SchoolSupportMessagesListResponseDto,
  SchoolSupportReadResponseDto,
} from '../dto/school-support.dto';
import { SCHOOL_SUPPORT_TITLE } from '../domain/school-support.constants';

export function presentSchoolSupportConversation(input: {
  conversation: SupportConversationRecord;
  unread: SupportUnreadState;
}): SchoolSupportConversationResponseDto {
  return {
    conversation: {
      id: input.conversation.id,
      type: 'support',
      status: presentConversationStatus(input.conversation.status),
      title: SCHOOL_SUPPORT_TITLE,
      lastMessageAt: presentNullableDate(input.conversation.lastMessageAt),
    },
    unread: {
      count: input.unread.count,
      lastReadAt: presentNullableDate(input.unread.lastReadAt),
    },
  };
}

export function presentSchoolSupportMessagesList(
  result: SupportMessageListResult,
  actorId: string,
): SchoolSupportMessagesListResponseDto {
  return {
    conversation: {
      id: result.conversation.id,
      status: presentConversationStatus(result.conversation.status),
    },
    items: result.items.map((message) =>
      presentSupportMessage(message, actorId),
    ),
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
    },
  };
}

export function presentSupportMessage(
  message: SupportMessageRecord,
  actorId: string,
): SchoolSupportMessageResponseDto {
  const kind = presentSenderKind(message);

  return {
    id: message.id,
    conversationId: message.conversationId,
    body: shouldHideMessageBody(message) ? null : message.body,
    sender: {
      kind,
      displayName: presentSenderDisplayName(message, kind),
    },
    isMine: message.senderUserId === actorId,
    sentAt: message.sentAt.toISOString(),
  };
}

export function presentSupportRead(
  result: SupportReadResult,
): SchoolSupportReadResponseDto {
  return {
    conversationId: result.conversationId,
    readAt: result.readAt.toISOString(),
    markedCount: result.markedCount,
  };
}

export function presentPlatformSupportConversations(
  result: PlatformSupportConversationListResult,
): PlatformSupportConversationsResponseDto {
  return {
    items: result.items.map(({ conversation, unread }) => {
      const lastMessage = conversation.messages[0] ?? null;

      return {
        conversation: {
          id: conversation.id,
          status: presentConversationStatus(conversation.status),
          lastMessageAt: presentNullableDate(conversation.lastMessageAt),
        },
        school: {
          id: conversation.school.id,
          name: conversation.school.name,
          status: presentSchoolStatus(conversation.school.status),
        },
        organization: {
          id: conversation.school.organization.id,
          name: conversation.school.organization.name,
        },
        lastMessage: lastMessage
          ? {
              preview: previewMessage(lastMessage),
              senderKind: presentSenderKind(lastMessage),
              sentAt: lastMessage.sentAt.toISOString(),
            }
          : null,
        unread: {
          count: unread.count,
        },
      };
    }),
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
    },
  };
}

export function presentPlatformSupportConversation(input: {
  conversation: SupportConversationRecord;
  unread: SupportUnreadState;
}): PlatformSupportConversationResponseDto {
  return {
    conversation: {
      id: input.conversation.id,
      type: 'support',
      status: presentConversationStatus(input.conversation.status),
      lastMessageAt: presentNullableDate(input.conversation.lastMessageAt),
      createdAt: input.conversation.createdAt.toISOString(),
    },
    school: {
      id: input.conversation.school.id,
      name: input.conversation.school.name,
      status: presentSchoolStatus(input.conversation.school.status),
    },
    organization: {
      id: input.conversation.school.organization.id,
      name: input.conversation.school.organization.name,
    },
    unread: {
      count: input.unread.count,
      lastReadAt: presentNullableDate(input.unread.lastReadAt),
    },
  };
}

export function presentPlatformSupportMessagesList(
  result: SupportMessageListResult,
  actorId: string,
): PlatformSupportMessagesListResponseDto {
  return {
    conversation: {
      id: result.conversation.id,
      status: presentConversationStatus(result.conversation.status),
    },
    school: {
      id: result.conversation.school.id,
      name: result.conversation.school.name,
    },
    items: result.items.map((message) =>
      presentSupportMessage(message, actorId),
    ),
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
    },
  };
}

export function presentPlatformSupportRead(
  result: SupportReadResult,
): PlatformSupportReadResponseDto {
  return {
    conversationId: result.conversationId,
    readAt: result.readAt.toISOString(),
    markedCount: result.markedCount,
  };
}

export function presentSupportTransition(
  conversation: SupportConversationRecord,
  transition: 'close' | 'reopen',
): PlatformSupportTransitionResponseDto {
  if (transition === 'close') {
    return {
      conversation: {
        id: conversation.id,
        status: presentConversationStatus(conversation.status),
        closedAt: presentNullableDate(conversation.closedAt),
      },
    };
  }

  return {
    conversation: {
      id: conversation.id,
      status: presentConversationStatus(conversation.status),
      reopenedAt: conversation.updatedAt.toISOString(),
    },
  };
}

function presentSenderKind(message: {
  senderUserId: string | null;
  senderUser: { userType: UserType } | null;
}): 'school' | 'support' | 'system' {
  if (!message.senderUserId || !message.senderUser) return 'system';
  return message.senderUser.userType === UserType.PLATFORM_USER
    ? 'support'
    : 'school';
}

function presentSenderDisplayName(
  message: {
    senderUser: { firstName: string; lastName: string } | null;
  },
  kind: 'school' | 'support' | 'system',
): string {
  if (kind === 'support') return SCHOOL_SUPPORT_TITLE;
  if (kind === 'system') return 'System';

  const displayName =
    `${message.senderUser?.firstName ?? ''} ${
      message.senderUser?.lastName ?? ''
    }`.trim();
  return displayName || 'School Admin';
}

function previewMessage(message: SupportConversationRecord['messages'][number]) {
  if (shouldHideMessageBody(message)) return null;
  const body = message.body?.trim();
  if (!body) return null;
  return body.length > 80 ? `${body.slice(0, 77)}...` : body;
}

function shouldHideMessageBody(message: {
  status: string;
  hiddenAt: Date | null;
  deletedAt: Date | null;
}): boolean {
  return (
    message.status === 'HIDDEN' ||
    message.status === 'DELETED' ||
    Boolean(message.hiddenAt) ||
    Boolean(message.deletedAt)
  );
}

function presentConversationStatus(
  status: string,
): 'active' | 'closed' | 'archived' {
  switch (status) {
    case 'CLOSED':
      return 'closed';
    case 'ARCHIVED':
      return 'archived';
    case 'ACTIVE':
    default:
      return 'active';
  }
}

function presentSchoolStatus(
  status: string,
): 'active' | 'suspended' | 'archived' {
  switch (status) {
    case 'SUSPENDED':
      return 'suspended';
    case 'ARCHIVED':
      return 'archived';
    case 'ACTIVE':
    default:
      return 'active';
  }
}

function presentNullableDate(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}
