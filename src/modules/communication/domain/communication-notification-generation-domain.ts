import {
  CommunicationAnnouncementAudienceType,
  CommunicationAnnouncementPriority,
  CommunicationNotificationPriority,
  UserType,
} from '@prisma/client';

export const COMMUNICATION_NOTIFICATION_QUEUE_NAME =
  'communication-notifications';
export const COMMUNICATION_ANNOUNCEMENT_NOTIFICATIONS_GENERATE_JOB_NAME =
  'communication.announcement.notifications.generate';
export const COMMUNICATION_ANNOUNCEMENT_NOTIFICATION_SOURCE_TYPE =
  'communication_announcement';
export const COMMUNICATION_IN_APP_NOTIFICATION_PROVIDER = 'in_app';

const ANNOUNCEMENT_NOTIFICATION_PREVIEW_MAX_LENGTH = 240;

export interface CommunicationAnnouncementNotificationGenerationJobData {
  schoolId: string;
  organizationId: string;
  announcementId: string;
  actorUserId: string;
  actorUserType: UserType;
}

export interface CommunicationAnnouncementNotificationGenerationResult {
  announcementId: string;
  recipientCount: number;
  createdNotificationCount: number;
  existingNotificationCount: number;
  createdDeliveryCount: number;
  existingDeliveryCount: number;
  skippedReason: string | null;
}

export function buildAnnouncementNotificationGenerationJobId(input: {
  schoolId: string;
  announcementId: string;
}): string {
  return `communication-announcement-notifications:${input.schoolId}:${input.announcementId}`;
}

export function buildAnnouncementNotificationPreview(body: string): string {
  const preview = body.replace(/\s+/g, ' ').trim();
  if (preview.length <= ANNOUNCEMENT_NOTIFICATION_PREVIEW_MAX_LENGTH) {
    return preview;
  }

  return `${preview.slice(0, ANNOUNCEMENT_NOTIFICATION_PREVIEW_MAX_LENGTH - 3)}...`;
}

export function deduplicateRecipientUserIds(userIds: string[]): string[] {
  return [...new Set(userIds.filter((userId) => userId.trim().length > 0))];
}

export function mapAnnouncementPriorityToNotificationPriority(
  priority: CommunicationAnnouncementPriority,
): CommunicationNotificationPriority {
  switch (priority) {
    case CommunicationAnnouncementPriority.LOW:
      return CommunicationNotificationPriority.LOW;
    case CommunicationAnnouncementPriority.HIGH:
      return CommunicationNotificationPriority.HIGH;
    case CommunicationAnnouncementPriority.URGENT:
      return CommunicationNotificationPriority.URGENT;
    case CommunicationAnnouncementPriority.NORMAL:
      return CommunicationNotificationPriority.NORMAL;
  }
}

export function buildAnnouncementNotificationMetadata(input: {
  announcementId: string;
  audienceType: CommunicationAnnouncementAudienceType;
  publishedAt: Date | null;
}): Record<string, unknown> {
  return {
    announcementId: input.announcementId,
    audienceType: input.audienceType,
    publishedAt: input.publishedAt?.toISOString() ?? null,
  };
}

export function buildSkippedAnnouncementNotificationGenerationResult(input: {
  announcementId: string;
  reason: string;
}): CommunicationAnnouncementNotificationGenerationResult {
  return {
    announcementId: input.announcementId,
    recipientCount: 0,
    createdNotificationCount: 0,
    existingNotificationCount: 0,
    createdDeliveryCount: 0,
    existingDeliveryCount: 0,
    skippedReason: input.reason,
  };
}
