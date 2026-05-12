export const SCHOOL_EMAIL_DELIVERY_QUEUE_NAME = 'school-email-delivery';
export const SCHOOL_EMAIL_DELIVERY_SEND_RECIPIENT_JOB_NAME = 'send-recipient';

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
