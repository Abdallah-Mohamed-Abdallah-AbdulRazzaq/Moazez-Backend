export interface DismissalRequestExpiryJobData {
  batchSize?: number;
}

export const DISMISSAL_REQUEST_EXPIRY_QUEUE_NAME = 'dismissal-request-expiry';
export const DISMISSAL_REQUEST_EXPIRY_JOB_NAME =
  'expire-stale-dismissal-requests';
export const DISMISSAL_REQUEST_EXPIRY_REPEAT_JOB_ID =
  'dismissal-request-expiry-every-minute';
export const DISMISSAL_REQUEST_EXPIRY_REPEAT_PATTERN = '* * * * *';
