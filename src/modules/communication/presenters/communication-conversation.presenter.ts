import {
  ConversationCountsSummary,
  ParticipantCountsSummary,
} from '../domain/communication-conversation-domain';
import { CommunicationConversationRecord } from '../infrastructure/communication-conversation.repository';

export interface CommunicationConversationResponse {
  id: string;
  type: string;
  status: string;
  title: string | null;
  description: string | null;
  avatarFileId: string | null;
  academicYearId: string | null;
  termId: string | null;
  stageId: string | null;
  gradeId: string | null;
  sectionId: string | null;
  classroomId: string | null;
  subjectId: string | null;
  isReadOnly: boolean;
  isOfficial: boolean;
  isPinned: boolean;
  lastMessageAt: string | null;
  participantCount: number;
  activeParticipantsCount: number;
  participantsCount: number;
  unreadCount: number | null;
  isGroup: boolean;
  lastMessage: CommunicationConversationLastMessageResponse | null;
  lastMessageReadCount: number | null;
  participantSummary?: ParticipantCountsSummary;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  closedAt: string | null;
  metadata: Record<string, unknown> | null;
}

export interface CommunicationConversationLastMessageResponse {
  id: string;
  messageId: string;
  conversationId: string;
  senderUserId: string | null;
  type: string;
  status: string;
  body: string | null;
  content: string | null;
  clientMessageId: string | null;
  replyToMessageId: string | null;
  readCount: number;
  sentAt: string;
  createdAt: string;
  updatedAt: string;
}

export function presentCommunicationConversationList(params: {
  items: CommunicationConversationRecord[];
  total: number;
  summary: ConversationCountsSummary;
  limit: number | null;
  page: number | null;
}) {
  return {
    items: params.items.map((conversation) =>
      presentCommunicationConversation(conversation),
    ),
    summary: params.summary,
    total: params.total,
    limit: params.limit,
    page: params.page,
  };
}

export function presentCommunicationConversation(
  conversation: CommunicationConversationRecord,
  options?: { participantSummary?: ParticipantCountsSummary },
): CommunicationConversationResponse {
  const metadata = sanitizeConversationMetadata(conversation.metadata);
  const lastMessage = conversation.messages[0]
    ? presentConversationLastMessage(conversation.messages[0])
    : null;
  const activeParticipantsCount = conversation.participants.length;
  const participantsCount =
    options?.participantSummary?.active !== undefined ||
    options?.participantSummary?.muted !== undefined
      ? (options.participantSummary.active ?? 0) +
        (options.participantSummary.muted ?? 0)
      : activeParticipantsCount;

  return {
    id: conversation.id,
    type: presentEnum(conversation.type),
    status: presentEnum(conversation.status),
    title: conversation.titleEn ?? conversation.titleAr ?? null,
    description:
      conversation.descriptionEn ?? conversation.descriptionAr ?? null,
    avatarFileId: conversation.avatarFileId,
    academicYearId: conversation.academicYearId,
    termId: conversation.termId,
    stageId: conversation.stageId,
    gradeId: conversation.gradeId,
    sectionId: conversation.sectionId,
    classroomId: conversation.classroomId,
    subjectId: conversation.subjectId,
    isReadOnly: metadata?.isReadOnly === true,
    isOfficial: metadata?.isOfficial === true,
    isPinned: metadata?.isPinned === true,
    lastMessageAt: presentNullableDate(conversation.lastMessageAt),
    participantCount:
      options?.participantSummary?.total ?? conversation._count.participants,
    activeParticipantsCount,
    participantsCount,
    unreadCount: null,
    isGroup: isGroupConversationType(presentEnum(conversation.type), {
      participantsCount,
    }),
    lastMessage,
    lastMessageReadCount: lastMessage?.readCount ?? null,
    ...(options?.participantSummary
      ? { participantSummary: options.participantSummary }
      : {}),
    createdById: conversation.createdById,
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString(),
    archivedAt: presentNullableDate(conversation.archivedAt),
    closedAt: presentNullableDate(conversation.closedAt),
    metadata,
  };
}

export function summarizeCommunicationConversationForAudit(
  conversation: CommunicationConversationRecord,
): Record<string, unknown> {
  return {
    id: conversation.id,
    type: presentEnum(conversation.type),
    status: presentEnum(conversation.status),
    title: conversation.titleEn ?? conversation.titleAr ?? null,
    description:
      conversation.descriptionEn ?? conversation.descriptionAr ?? null,
    avatarFileId: conversation.avatarFileId,
    academicYearId: conversation.academicYearId,
    termId: conversation.termId,
    stageId: conversation.stageId,
    gradeId: conversation.gradeId,
    sectionId: conversation.sectionId,
    classroomId: conversation.classroomId,
    subjectId: conversation.subjectId,
    createdById: conversation.createdById,
    archivedAt: presentNullableDate(conversation.archivedAt),
    closedAt: presentNullableDate(conversation.closedAt),
  };
}

function sanitizeConversationMetadata(
  value: unknown,
): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const blockedKeys = new Set([
    'schoolid',
    'body',
    'message',
    'messages',
    'messagebody',
    'lastmessage',
    'lastmessagebody',
    'text',
    'audiourl',
  ]);

  const output: Record<string, unknown> = {};
  for (const [key, rawValue] of Object.entries(value)) {
    if (blockedKeys.has(key.toLowerCase())) continue;
    output[key] = sanitizeMetadataValue(rawValue, blockedKeys);
  }

  return Object.keys(output).length > 0 ? output : null;
}

function sanitizeMetadataValue(
  value: unknown,
  blockedKeys: Set<string>,
): unknown {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeMetadataValue(item, blockedKeys));
  }

  const output: Record<string, unknown> = {};
  for (const [key, rawValue] of Object.entries(value)) {
    if (blockedKeys.has(key.toLowerCase())) continue;
    output[key] = sanitizeMetadataValue(rawValue, blockedKeys);
  }

  return output;
}

function presentConversationLastMessage(
  message: CommunicationConversationRecord['messages'][number],
): CommunicationConversationLastMessageResponse {
  const body = shouldHideMessageBody(message) ? null : message.body;

  return {
    id: message.id,
    messageId: message.id,
    conversationId: message.conversationId,
    senderUserId: message.senderUserId,
    type: presentEnum(message.kind),
    status: presentEnum(message.status),
    body,
    content: body,
    clientMessageId: message.clientMessageId,
    replyToMessageId: message.replyToMessageId,
    readCount: countReadUsersExcludingSender(message),
    sentAt: message.sentAt.toISOString(),
    createdAt: message.createdAt.toISOString(),
    updatedAt: message.updatedAt.toISOString(),
  };
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

function countReadUsersExcludingSender(message: {
  senderUserId: string | null;
  reads: Array<{ userId: string }>;
}): number {
  return message.reads.filter(
    (read) => !message.senderUserId || read.userId !== message.senderUserId,
  ).length;
}

function presentEnum(value: string): string {
  return value.toLowerCase();
}

function presentNullableDate(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}
