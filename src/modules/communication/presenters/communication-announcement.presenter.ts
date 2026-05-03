import {
  CommunicationAnnouncementAudienceRecord,
  CommunicationAnnouncementDetailRecord,
  CommunicationAnnouncementListRecord,
  CommunicationAnnouncementListResult,
} from '../infrastructure/communication-announcement.repository';
import { presentCommunicationAnnouncementAttachment } from './communication-announcement-attachment.presenter';

export interface CommunicationAnnouncementListItemResponse {
  id: string;
  title: string;
  status: string;
  priority: string;
  audienceType: string;
  scheduledAt: string | null;
  publishedAt: string | null;
  archivedAt: string | null;
  expiresAt: string | null;
  createdById: string | null;
  updatedById: string | null;
  publishedById: string | null;
  archivedById: string | null;
  createdAt: string;
  updatedAt: string;
  audienceSummary: {
    type: string;
    rowCount: number;
  };
  attachmentCount: number;
  readCount: number;
}

export interface CommunicationAnnouncementDetailResponse extends CommunicationAnnouncementListItemResponse {
  body: string;
  content: string;
  metadata: Record<string, unknown> | null;
  audiences: Array<{
    id: string;
    audienceType: string;
    stageId: string | null;
    gradeId: string | null;
    sectionId: string | null;
    classroomId: string | null;
    studentId: string | null;
    guardianId: string | null;
    userId: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  attachments: ReturnType<typeof presentCommunicationAnnouncementAttachment>[];
  readSummary: {
    readCount: number;
    totalTargetCount: number | null;
    totalTargetCountReason: string;
  };
}

export function presentCommunicationAnnouncementList(
  result: CommunicationAnnouncementListResult,
) {
  return {
    items: result.items.map((announcement) =>
      presentCommunicationAnnouncementListItem(announcement),
    ),
    total: result.total,
    limit: result.limit,
    page: result.page,
  };
}

export function presentCommunicationAnnouncementListItem(
  announcement: CommunicationAnnouncementListRecord,
): CommunicationAnnouncementListItemResponse {
  return {
    id: announcement.id,
    title: announcement.title,
    status: presentEnum(announcement.status),
    priority: presentEnum(announcement.priority),
    audienceType: presentEnum(announcement.audienceType),
    scheduledAt: presentNullableDate(announcement.scheduledAt),
    publishedAt: presentNullableDate(announcement.publishedAt),
    archivedAt: presentNullableDate(announcement.archivedAt),
    expiresAt: presentNullableDate(announcement.expiresAt),
    createdById: announcement.createdById,
    updatedById: announcement.updatedById,
    publishedById: announcement.publishedById,
    archivedById: announcement.archivedById,
    createdAt: announcement.createdAt.toISOString(),
    updatedAt: announcement.updatedAt.toISOString(),
    audienceSummary: {
      type: presentEnum(announcement.audienceType),
      rowCount: announcement.audiences.length,
    },
    attachmentCount: announcement._count.attachments,
    readCount: announcement._count.reads,
  };
}

export function presentCommunicationAnnouncement(
  announcement: CommunicationAnnouncementDetailRecord,
): CommunicationAnnouncementDetailResponse {
  return {
    ...presentCommunicationAnnouncementListItem(announcement),
    body: announcement.body,
    content: announcement.body,
    metadata: sanitizeCommunicationAnnouncementMetadata(announcement.metadata),
    audiences: announcement.audiences.map((audience) =>
      presentCommunicationAnnouncementAudience(audience),
    ),
    attachments: announcement.attachments.map((attachment) =>
      presentCommunicationAnnouncementAttachment(attachment),
    ),
    readSummary: {
      readCount: announcement._count.reads,
      totalTargetCount: null,
      totalTargetCountReason:
        'audience_target_count_deferred_until_app_audience_resolution',
    },
  };
}

export function summarizeCommunicationAnnouncementForAudit(
  announcement: CommunicationAnnouncementDetailRecord,
): Record<string, unknown> {
  return {
    id: announcement.id,
    title: announcement.title,
    status: presentEnum(announcement.status),
    priority: presentEnum(announcement.priority),
    audienceType: presentEnum(announcement.audienceType),
    bodyLength: announcement.body.length,
    hasBody: announcement.body.length > 0,
    scheduledAt: presentNullableDate(announcement.scheduledAt),
    publishedAt: presentNullableDate(announcement.publishedAt),
    archivedAt: presentNullableDate(announcement.archivedAt),
    expiresAt: presentNullableDate(announcement.expiresAt),
    createdById: announcement.createdById,
    updatedById: announcement.updatedById,
    publishedById: announcement.publishedById,
    archivedById: announcement.archivedById,
    audienceCount: announcement.audiences.length,
    attachmentCount: announcement._count.attachments,
    readCount: announcement._count.reads,
  };
}

export function sanitizeCommunicationAnnouncementMetadata(
  value: unknown,
): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const blockedKeys = new Set([
    'schoolid',
    'body',
    'content',
    'announcementbody',
    'message',
    'notification',
    'notifications',
    'delivery',
    'deliveries',
    'queue',
    'job',
    'jobs',
  ]);

  const output: Record<string, unknown> = {};
  for (const [key, rawValue] of Object.entries(value)) {
    if (blockedKeys.has(key.toLowerCase())) continue;
    output[key] = sanitizeMetadataValue(rawValue, blockedKeys);
  }

  return Object.keys(output).length > 0 ? output : null;
}

function presentCommunicationAnnouncementAudience(
  audience: CommunicationAnnouncementAudienceRecord,
) {
  return {
    id: audience.id,
    audienceType: presentEnum(audience.audienceType),
    stageId: audience.stageId,
    gradeId: audience.gradeId,
    sectionId: audience.sectionId,
    classroomId: audience.classroomId,
    studentId: audience.studentId,
    guardianId: audience.guardianId,
    userId: audience.userId,
    createdAt: audience.createdAt.toISOString(),
    updatedAt: audience.updatedAt.toISOString(),
  };
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
