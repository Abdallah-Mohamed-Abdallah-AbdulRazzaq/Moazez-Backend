import {
  CommunicationAnnouncementAudienceType,
  CommunicationAnnouncementPriority,
  CommunicationMessageKind,
  CommunicationNotificationPriority,
  UserType,
  Prisma,
} from '@prisma/client';
import { normalizeAcademicContentReminderOffsets } from '../../academics/academic-content/domain/academic-content-notification.policy';

export const COMMUNICATION_NOTIFICATION_QUEUE_NAME =
  'communication-notifications';
export const COMMUNICATION_ACADEMIC_CONTENT_NOTIFICATIONS_GENERATE_JOB_NAME =
  'communication.academic-content.notifications.generate';
export const COMMUNICATION_ACADEMIC_CONTENT_CANCELLATION_GENERATE_JOB_NAME =
  'communication.academic-content.cancellation.generate';
export const COMMUNICATION_ACADEMIC_CONTENT_SESSION_REMINDER_GENERATE_JOB_NAME =
  'communication.academic-content.session-reminder.generate';
export const COMMUNICATION_PREPARED_NOTIFICATION_BATCH_MAX_USERS = 500;

export const COMMUNICATION_ACADEMIC_CONTENT_REVIEW_DECISION_GENERATE_JOB_NAME =
  'communication.academic-content.review-decision.generate';

export interface CommunicationAcademicContentReviewDecisionJobData {
  schoolId: string;
  organizationId: string;
  approvalId: string;
  actorUserId: string | null;
  actorUserType: UserType | null;
}

export interface CommunicationPreparedAcademicContentReviewDecision extends CommunicationAcademicContentReviewDecisionJobData {
  academicContentId: string;
  revisionId: string;
  roundNumber: number;
  decision: 'APPROVED' | 'CHANGES_REQUESTED';
  recipientUserId: string;
  title: string;
  body: string;
  now: Date;
}

export type CommunicationAcademicContentReviewDecisionAuthorization = (
  tx: Prisma.TransactionClient,
) => Promise<CommunicationPreparedAcademicContentReviewDecision | null>;

export function buildAcademicContentReviewDecisionJobId(input: {
  schoolId: string;
  approvalId: string;
}): string {
  return `communication-academic-content-review-decision-${input.schoolId}-${input.approvalId}`;
}

export function isAcademicContentReviewDecisionJobData(
  data: unknown,
): data is CommunicationAcademicContentReviewDecisionJobData {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  const row = data as Record<string, unknown>;
  const keys = [
    'schoolId',
    'organizationId',
    'approvalId',
    'actorUserId',
    'actorUserType',
  ];
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return (
    Object.keys(row).length === keys.length &&
    keys.every((key) => Object.prototype.hasOwnProperty.call(row, key)) &&
    ['schoolId', 'organizationId', 'approvalId'].every(
      (key) => typeof row[key] === 'string' && uuid.test(row[key]),
    ) &&
    ((row.actorUserId === null && row.actorUserType === null) ||
      (typeof row.actorUserId === 'string' &&
        uuid.test(row.actorUserId) &&
        Object.values(UserType).includes(row.actorUserType as UserType)))
  );
}

export interface CommunicationAcademicContentNotificationGenerationJobData {
  schoolId: string;
  organizationId: string;
  contentId: string;
  publicationId: string;
  actorUserId: string | null;
  actorUserType: UserType | null;
}

export type CommunicationAcademicContentNotificationEvent =
  | 'academic_content_published'
  | 'academic_content_updated'
  | 'academic_content_cancelled'
  | 'online_session_reminder';

export interface CommunicationAcademicContentSessionReminderJobData extends CommunicationAcademicContentNotificationGenerationJobData {
  reminderOffsetMinutes: number;
}

export interface CommunicationPreparedAcademicContentRecipient {
  recipientUserId: string;
  metadata: {
    academicContentId: string;
    publicationId: string;
    revisionId: string;
    contentType: string;
    eventType: CommunicationAcademicContentNotificationEvent;
    publishedAt: string;
    studentIds: string[];
    childContextCount: number;
  };
}

interface CommunicationPreparedAcademicContentBatchFields extends CommunicationAcademicContentNotificationGenerationJobData {
  recipients: CommunicationPreparedAcademicContentRecipient[];
  title: string;
  body: string;
  expiresAt: Date | null;
  now: Date;
}

export type CommunicationPreparedAcademicContentBatch =
  CommunicationPreparedAcademicContentBatchFields &
    (
      | {
          eventType:
            | 'academic_content_published'
            | 'academic_content_updated'
            | 'academic_content_cancelled';
        }
      | {
          eventType: 'online_session_reminder';
          reminderOffsetMinutes: number;
          sessionStartAt: string;
        }
    );

/** Source-owned DB authorization, executed inside Communication's generation transaction. */
export type CommunicationAcademicContentBatchAuthorization = (
  tx: Prisma.TransactionClient,
) => Promise<CommunicationPreparedAcademicContentBatch | null>;

export function buildAcademicContentCancellationJobId(input: {
  schoolId: string;
  publicationId: string;
}): string {
  return `communication-academic-content-cancellation-${input.schoolId}-${input.publicationId}`;
}

export function buildAcademicContentSessionReminderJobId(input: {
  schoolId: string;
  publicationId: string;
  reminderOffsetMinutes: number;
}): string {
  return `communication-academic-content-session-reminder-${input.schoolId}-${input.publicationId}-${input.reminderOffsetMinutes}`;
}

export function isAcademicContentSessionReminderJobData(
  data: unknown,
): data is CommunicationAcademicContentSessionReminderJobData {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  const { reminderOffsetMinutes, ...identity } = data as Record<
    string,
    unknown
  >;
  if (!isAcademicContentNotificationGenerationJobData(identity)) return false;
  try {
    normalizeAcademicContentReminderOffsets([reminderOffsetMinutes]);
    return true;
  } catch {
    return false;
  }
}

export function buildAcademicContentNotificationGenerationJobId(input: {
  schoolId: string;
  publicationId: string;
}): string {
  return `communication-academic-content-notifications-${input.schoolId}-${input.publicationId}`;
}

export function isAcademicContentNotificationGenerationJobData(
  data: unknown,
): data is CommunicationAcademicContentNotificationGenerationJobData {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  const row = data as Record<string, unknown>;
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return (
    Object.keys(row).length === 6 &&
    ['schoolId', 'organizationId', 'contentId', 'publicationId'].every(
      (key) => typeof row[key] === 'string' && uuid.test(row[key]),
    ) &&
    ((row.actorUserId === null && row.actorUserType === null) ||
      (typeof row.actorUserId === 'string' &&
        uuid.test(row.actorUserId) &&
        Object.values(UserType).includes(row.actorUserType as UserType)))
  );
}
export const COMMUNICATION_ANNOUNCEMENT_NOTIFICATIONS_GENERATE_JOB_NAME =
  'communication.announcement.notifications.generate';
export const COMMUNICATION_ANNOUNCEMENT_NOTIFICATION_SOURCE_TYPE =
  'communication_announcement';
export const COMMUNICATION_MESSAGE_NOTIFICATION_SOURCE_TYPE =
  'communication_message';
export const COMMUNICATION_IN_APP_NOTIFICATION_PROVIDER = 'in_app';
export const COMMUNICATION_PUSH_NOTIFICATION_PROVIDER = 'firebase_fcm';
export const COMMUNICATION_NOTIFICATION_PUSH_QUEUE_NAME =
  'communication-notification-push';
export const COMMUNICATION_NOTIFICATION_PUSH_SEND_JOB_NAME =
  'communication.notification.push.send';
export const COMMUNICATION_ANNOUNCEMENT_NOTIFICATIONS_RECONCILE_JOB_NAME =
  'communication.announcement.notifications.reconcile';
export const COMMUNICATION_NOTIFICATION_PUSH_RECONCILE_JOB_NAME =
  'communication.notification.push.reconcile';
export const COMMUNICATION_NOTIFICATION_RECONCILE_INTERVAL_MS = 5 * 60 * 1000;
export const COMMUNICATION_NOTIFICATION_RECOVERY_WINDOW_MS =
  24 * 60 * 60 * 1000;
export const COMMUNICATION_PUSH_RECOVERY_WINDOW_EXPIRED_CODE =
  'push/recovery-window-expired';

const RETRYABLE_PUSH_ERROR_CODES = new Set([
  'fcm/quota-exceeded',
  'fcm/unavailable',
  'fcm/internal',
  'fcm/unknown',
]);

const ANNOUNCEMENT_NOTIFICATION_PREVIEW_MAX_LENGTH = 240;
const MESSAGE_NOTIFICATION_PREVIEW_MAX_LENGTH = 160;

export interface CommunicationGeneratedPushDeliveryRecord {
  id: string;
  notificationId: string;
}

export interface CommunicationAnnouncementNotificationGenerationJobData {
  schoolId: string;
  organizationId: string;
  announcementId: string;
  actorUserId: string | null;
  actorUserType: UserType | null;
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

export interface CommunicationMessageNotificationGenerationInput {
  schoolId: string;
  organizationId: string;
  messageId: string;
  actorUserId: string | null;
  actorUserType: UserType;
}

export interface CommunicationMessageNotificationGenerationResult {
  messageId: string;
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
  return `communication-announcement-notifications-${input.schoolId}-${input.announcementId}`;
}

export function buildCommunicationNotificationPushJobId(input: {
  deliveryId: string;
}): string {
  return `communication-push-${input.deliveryId}`;
}

export function isRetryableCommunicationPushErrorCode(
  errorCode: string | null,
): boolean {
  return errorCode !== null && RETRYABLE_PUSH_ERROR_CODES.has(errorCode);
}

export function buildAnnouncementNotificationPreview(body: string): string {
  const preview = body.replace(/\s+/g, ' ').trim();
  if (preview.length <= ANNOUNCEMENT_NOTIFICATION_PREVIEW_MAX_LENGTH) {
    return preview;
  }

  return `${preview.slice(0, ANNOUNCEMENT_NOTIFICATION_PREVIEW_MAX_LENGTH - 3)}...`;
}

export function buildMessageNotificationPreview(input: {
  kind: CommunicationMessageKind;
  body: string | null;
}): string {
  switch (input.kind) {
    case CommunicationMessageKind.IMAGE:
      return 'Photo';
    case CommunicationMessageKind.VIDEO:
      return 'Video';
    case CommunicationMessageKind.FILE:
      return 'File';
    case CommunicationMessageKind.AUDIO:
      return 'Voice message';
    case CommunicationMessageKind.SYSTEM:
      return 'New message';
    case CommunicationMessageKind.TEXT: {
      const preview = (input.body ?? '').replace(/\s+/g, ' ').trim();
      if (preview.length === 0) return 'New message';
      if (preview.length <= MESSAGE_NOTIFICATION_PREVIEW_MAX_LENGTH) {
        return preview;
      }

      return `${preview.slice(0, MESSAGE_NOTIFICATION_PREVIEW_MAX_LENGTH - 3)}...`;
    }
  }
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

export function buildMessageNotificationMetadata(input: {
  conversationId: string;
  messageId: string;
  sentAt: Date;
}): Record<string, unknown> {
  return {
    conversationId: input.conversationId,
    messageId: input.messageId,
    sentAt: input.sentAt.toISOString(),
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

export function buildSkippedMessageNotificationGenerationResult(input: {
  messageId: string;
  reason: string;
}): CommunicationMessageNotificationGenerationResult {
  return {
    messageId: input.messageId,
    recipientCount: 0,
    createdNotificationCount: 0,
    existingNotificationCount: 0,
    createdDeliveryCount: 0,
    existingDeliveryCount: 0,
    skippedReason: input.reason,
  };
}
