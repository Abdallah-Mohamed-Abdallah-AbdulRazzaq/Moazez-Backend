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
  participantSummary?: ParticipantCountsSummary;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  closedAt: string | null;
  metadata: Record<string, unknown> | null;
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

  return {
    id: conversation.id,
    type: presentEnum(conversation.type),
    status: presentEnum(conversation.status),
    title: conversation.titleEn ?? conversation.titleAr ?? null,
    description: conversation.descriptionEn ?? conversation.descriptionAr ?? null,
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
    description: conversation.descriptionEn ?? conversation.descriptionAr ?? null,
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

function presentEnum(value: string): string {
  return value.toLowerCase();
}

function presentNullableDate(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}
