import {
  SchoolEmailDeliveryBatch,
  SchoolEmailDeliveryRecipient,
} from '@prisma/client';
import {
  DeliveryBatchListResponseDto,
  DeliveryBatchSummaryDto,
  DeliveryRecipientListResponseDto,
  DeliveryRecipientPreviewItemDto,
  DeliveryRecipientPreviewResponseDto,
} from '../dto/email-delivery.dto';
import type {
  RecipientTargetPartition,
  ResolvedEmailRecipient,
  SkippedEmailRecipient,
} from '../application/email-recipient-targeting.service';

export function presentRecipientPreview(
  partition: RecipientTargetPartition,
): DeliveryRecipientPreviewResponseDto {
  return {
    totalMatched: partition.totalMatched,
    eligible: partition.eligible.length,
    skipped: partition.skipped.length,
    skippedReasons: partition.skippedReasons,
    sample: {
      eligible: partition.eligible
        .slice(0, partition.sampleLimit)
        .map(presentEligibleRecipientPreview),
      skipped: partition.skipped
        .slice(0, partition.sampleLimit)
        .map(presentSkippedRecipientPreview),
    },
  };
}

export function presentDeliveryBatch(
  batch: SchoolEmailDeliveryBatch,
  options?: { deliveryMode?: 'queued' },
): DeliveryBatchSummaryDto {
  return {
    batchId: batch.id,
    status: batch.status,
    kind: batch.kind,
    templateKey: batch.templateKey,
    subjectSnapshot: batch.subjectSnapshot,
    totalRecipients: batch.totalRecipients,
    queuedCount: batch.queuedCount,
    sentCount: batch.sentCount,
    failedCount: batch.failedCount,
    skippedCount: batch.skippedCount,
    startedAt: batch.startedAt?.toISOString() ?? null,
    completedAt: batch.completedAt?.toISOString() ?? null,
    cancelledAt: batch.cancelledAt?.toISOString() ?? null,
    failureReason: sanitizeReason(batch.failureReason),
    createdAt: batch.createdAt.toISOString(),
    updatedAt: batch.updatedAt.toISOString(),
    ...(options?.deliveryMode ? { deliveryMode: options.deliveryMode } : {}),
  };
}

export function presentDeliveryBatchList(args: {
  items: SchoolEmailDeliveryBatch[];
  page: number;
  limit: number;
  total: number;
}): DeliveryBatchListResponseDto {
  return {
    items: args.items.map((item) => presentDeliveryBatch(item)),
    pagination: {
      page: args.page,
      limit: args.limit,
      total: args.total,
    },
  };
}

export function presentDeliveryRecipients(args: {
  items: SchoolEmailDeliveryRecipient[];
  page: number;
  limit: number;
  total: number;
}): DeliveryRecipientListResponseDto {
  return {
    items: args.items.map((recipient) => ({
      id: recipient.id,
      userId: recipient.userId,
      toEmail: recipient.toEmail,
      displayName: recipient.displayName,
      status: recipient.status,
      attempts: recipient.attempts,
      lastAttemptAt: recipient.lastAttemptAt?.toISOString() ?? null,
      sentAt: recipient.sentAt?.toISOString() ?? null,
      failureReason: sanitizeReason(recipient.failureReason),
      skippedReason: sanitizeReason(recipient.skippedReason),
      createdAt: recipient.createdAt.toISOString(),
      updatedAt: recipient.updatedAt.toISOString(),
    })),
    pagination: {
      page: args.page,
      limit: args.limit,
      total: args.total,
    },
  };
}

export function sanitizeReason(reason: string | null): string | null {
  if (!reason) return null;

  return reason
    .replace(/MZ-[A-Z0-9-]+/g, '[redacted]')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]');
}

function presentEligibleRecipientPreview(
  recipient: ResolvedEmailRecipient,
): DeliveryRecipientPreviewItemDto {
  return {
    userId: recipient.userId,
    fullName: recipient.displayName,
    username: recipient.username,
    loginEmail: recipient.loginEmail,
    contactEmail: recipient.contactEmail,
    toEmail: recipient.toEmail,
    userType: recipient.userType,
    roleKey: recipient.roleKey,
    hasPassword: recipient.hasPassword,
    mustChangePassword: recipient.mustChangePassword,
    credentialVersion: recipient.credentialVersion,
    reason: null,
  };
}

function presentSkippedRecipientPreview(
  recipient: SkippedEmailRecipient,
): DeliveryRecipientPreviewItemDto {
  return {
    userId: recipient.userId,
    fullName: recipient.displayName,
    username: recipient.username,
    loginEmail: recipient.loginEmail,
    contactEmail: recipient.contactEmail,
    toEmail: recipient.toEmail,
    userType: recipient.userType,
    roleKey: recipient.roleKey,
    hasPassword: recipient.hasPassword,
    mustChangePassword: recipient.mustChangePassword,
    credentialVersion: recipient.credentialVersion,
    reason: recipient.reason,
  };
}
