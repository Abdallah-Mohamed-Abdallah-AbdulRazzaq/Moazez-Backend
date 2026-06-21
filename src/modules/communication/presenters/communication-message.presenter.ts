import {
  CommunicationMessageRecord,
  CommunicationMessageListResult,
} from '../infrastructure/communication-message.repository';
import {
  CommunicationAppAttachmentCamelResponse,
  presentCommunicationAppMessageAttachments,
} from './communication-app-message-attachment.presenter';

export interface CommunicationMessageResponse {
  id: string;
  conversationId: string;
  senderUserId: string | null;
  type: string;
  status: string;
  body: string | null;
  content: string | null;
  clientMessageId: string | null;
  replyToMessageId: string | null;
  editedAt: string | null;
  hiddenAt: string | null;
  hiddenById: string | null;
  hiddenReason: string | null;
  deletedAt: string | null;
  deletedById: string | null;
  sentAt: string;
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown> | null;
  readCount: number;
  attachments: CommunicationAppAttachmentCamelResponse[];
  attachmentsCount: number;
}

export function presentCommunicationMessageList(
  result: CommunicationMessageListResult,
) {
  return {
    conversationId: result.conversationId,
    items: result.items.map((message) => presentCommunicationMessage(message)),
    total: result.total,
    limit: result.limit,
    page: result.page,
  };
}

export function presentCommunicationMessage(
  message: CommunicationMessageRecord,
): CommunicationMessageResponse {
  const hidden = shouldHideBody(message);
  const body = hidden ? null : message.body;
  const attachments = hidden
    ? []
    : presentCommunicationAppMessageAttachments(message.attachments ?? [], {
        aliasStyle: 'camel',
      });

  return {
    id: message.id,
    conversationId: message.conversationId,
    senderUserId: message.senderUserId,
    type: presentEnum(message.kind),
    status: presentEnum(message.status),
    body,
    content: body,
    clientMessageId: message.clientMessageId,
    replyToMessageId: message.replyToMessageId,
    editedAt: presentNullableDate(message.editedAt),
    hiddenAt: presentNullableDate(message.hiddenAt),
    hiddenById: message.hiddenById,
    hiddenReason: message.hiddenReason,
    deletedAt: presentNullableDate(message.deletedAt),
    deletedById: message.deletedById,
    sentAt: message.sentAt.toISOString(),
    createdAt: message.createdAt.toISOString(),
    updatedAt: message.updatedAt.toISOString(),
    metadata: sanitizeCommunicationMessageMetadata(message.metadata),
    readCount: countReadUsersExcludingSender(message),
    attachments,
    attachmentsCount: attachments.length,
  };
}

export function summarizeCommunicationMessageForAudit(
  message: CommunicationMessageRecord,
): Record<string, unknown> {
  return {
    id: message.id,
    conversationId: message.conversationId,
    senderUserId: message.senderUserId,
    type: presentEnum(message.kind),
    status: presentEnum(message.status),
    bodyLength: message.body?.length ?? 0,
    hasBody: Boolean(message.body),
    clientMessageId: message.clientMessageId,
    replyToMessageId: message.replyToMessageId,
    editedAt: presentNullableDate(message.editedAt),
    hiddenAt: presentNullableDate(message.hiddenAt),
    deletedAt: presentNullableDate(message.deletedAt),
    sentAt: message.sentAt.toISOString(),
    attachmentsCount: message.attachments?.length ?? 0,
  };
}

export function sanitizeCommunicationMessageMetadata(
  value: unknown,
): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const blockedKeys = new Set([
    'schoolid',
    'body',
    'content',
    'message',
    'messages',
    'messagebody',
    'lastmessage',
    'lastmessagebody',
    'text',
    'audiourl',
    'attachment',
    'attachments',
    'reaction',
    'reactions',
    'report',
    'reports',
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

function shouldHideBody(
  message: Pick<
    CommunicationMessageRecord,
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

function presentEnum(value: string): string {
  return value.toLowerCase();
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
