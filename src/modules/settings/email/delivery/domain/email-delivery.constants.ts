export const SCHOOL_EMAIL_DELIVERY_QUEUE_NAME = 'school-email-delivery';
export const SCHOOL_EMAIL_DELIVERY_SEND_RECIPIENT_JOB_NAME = 'send-recipient';
export const SCHOOL_EMAIL_DELIVERY_RECONCILE_JOB_NAME =
  'school.email.delivery.reconcile';
export const SCHOOL_EMAIL_DELIVERY_RECONCILE_INTERVAL_MS = 5 * 60 * 1000;
export const SCHOOL_EMAIL_DELIVERY_RECOVERY_WINDOW_MS = 72 * 60 * 60 * 1000;
export const SCHOOL_EMAIL_DELIVERY_SENDING_LEASE_MS = 5 * 60 * 1000;
export const SCHOOL_EMAIL_OUTCOME_UNKNOWN_REASON = 'recovery_outcome_unknown';
export const SCHOOL_EMAIL_RECOVERY_WINDOW_EXPIRED_REASON =
  'recovery_terminal_window_expired';
export const SCHOOL_EMAIL_RETRYABLE_REASON_PREFIX = 'recovery_retryable:';
export const SCHOOL_EMAIL_TERMINAL_REASON_PREFIX = 'recovery_terminal:';

export interface SchoolEmailDeliveryRecipientJobData {
  schoolId: string;
  organizationId: string;
  batchId: string;
  recipientId: string;
  actorUserId: string | null;
  actorUserType: string | null;
}

export function buildSchoolEmailDeliveryRecipientJobId(params: {
  batchId: string;
  recipientId: string;
}): string {
  return `school-email-delivery:${params.batchId}:${params.recipientId}`;
}

export function buildSchoolEmailMessageId(params: {
  batchId: string;
  recipientId: string;
}): string {
  return `<school-email-delivery.${params.batchId}.${params.recipientId}@moazez.invalid>`;
}

export function isRetryableSchoolEmailFailureReason(
  value: string | null,
): boolean {
  return value?.startsWith(SCHOOL_EMAIL_RETRYABLE_REASON_PREFIX) === true;
}
