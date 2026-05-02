import {
  CommunicationMessageReportRecord,
  CommunicationReportListResult,
} from '../infrastructure/communication-report.repository';

export interface CommunicationMessageReportResponse {
  id: string;
  messageId: string;
  conversationId: string;
  reporterId: string;
  reporterUserId: string;
  reportedUserId: string | null;
  reason: string | null;
  reasonCode: string | null;
  description: string | null;
  reasonText: string | null;
  status: string;
  reviewedById: string | null;
  reviewedAt: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown> | null;
  message: {
    id: string;
    conversationId: string;
    senderUserId: string | null;
    type: string;
    status: string;
    sentAt: string;
    hiddenAt: string | null;
    deletedAt: string | null;
  };
}

export function presentCommunicationMessageReportList(
  result: CommunicationReportListResult,
) {
  return {
    items: result.items.map((report) =>
      presentCommunicationMessageReport(report),
    ),
    total: result.total,
    limit: result.limit,
    page: result.page,
  };
}

export function presentCommunicationMessageReport(
  report: CommunicationMessageReportRecord,
): CommunicationMessageReportResponse {
  return {
    id: report.id,
    messageId: report.messageId,
    conversationId: report.conversationId,
    reporterId: report.reporterUserId,
    reporterUserId: report.reporterUserId,
    reportedUserId: report.message.senderUserId,
    reason: report.reasonCode,
    reasonCode: report.reasonCode,
    description: report.reasonText,
    reasonText: report.reasonText,
    status: presentEnum(report.status),
    reviewedById: report.reviewedById,
    reviewedAt: presentNullableDate(report.reviewedAt),
    resolvedAt: presentNullableDate(report.reviewedAt),
    resolutionNote: report.resolutionNote,
    createdAt: report.createdAt.toISOString(),
    updatedAt: report.updatedAt.toISOString(),
    metadata: sanitizeSafetyMetadata(report.metadata),
    message: {
      id: report.message.id,
      conversationId: report.message.conversationId,
      senderUserId: report.message.senderUserId,
      type: presentEnum(report.message.kind),
      status: presentEnum(report.message.status),
      sentAt: report.message.sentAt.toISOString(),
      hiddenAt: presentNullableDate(report.message.hiddenAt),
      deletedAt: presentNullableDate(report.message.deletedAt),
    },
  };
}

export function summarizeCommunicationReportForAudit(
  report: CommunicationMessageReportRecord,
): Record<string, unknown> {
  return {
    id: report.id,
    conversationId: report.conversationId,
    messageId: report.messageId,
    reporterUserId: report.reporterUserId,
    reportedUserId: report.message.senderUserId,
    status: presentEnum(report.status),
    reasonCode: report.reasonCode,
    hasReasonText: Boolean(report.reasonText),
    reviewedById: report.reviewedById,
    reviewedAt: presentNullableDate(report.reviewedAt),
    createdAt: report.createdAt.toISOString(),
    updatedAt: report.updatedAt.toISOString(),
  };
}

export function sanitizeSafetyMetadata(
  value: unknown,
): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const blockedKeys = new Set([
    'schoolid',
    'school_id',
    'body',
    'content',
    'message',
    'messages',
    'text',
    'attachment',
    'attachments',
    'reaction',
    'reactions',
    'notification',
    'notifications',
    'announcement',
    'announcements',
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
