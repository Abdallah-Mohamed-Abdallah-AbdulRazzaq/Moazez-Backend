import type {
  AndroidConfig,
  ApnsConfig,
  WebpushConfig,
} from 'firebase-admin/messaging';

export const FIREBASE_PUSH_PROVIDER = 'firebase_fcm' as const;
export const FIREBASE_PUSH_DEFAULT_MAX_BATCH_SIZE = 500;
export const FIREBASE_PUSH_MAX_BATCH_SIZE = 500;

export type FirebasePushSingleStatus = 'sent' | 'skipped' | 'failed';
export type FirebasePushBatchStatus =
  | 'sent'
  | 'partial'
  | 'skipped'
  | 'failed';
export type FirebasePushItemStatus = 'sent' | 'skipped' | 'failed';
export type FirebasePushSkippedReason =
  | 'disabled'
  | 'dry_run'
  | 'no_token'
  | 'invalid_payload';
export type FirebasePushErrorCode =
  | 'fcm/registration-token-not-registered'
  | 'fcm/invalid-registration-token'
  | 'fcm/invalid-argument'
  | 'fcm/quota-exceeded'
  | 'fcm/sender-id-mismatch'
  | 'fcm/unavailable'
  | 'fcm/internal'
  | 'fcm/unknown';

export interface FirebasePushNotificationInput {
  title: string;
  body?: string | null;
}

export interface FirebasePushBaseInput {
  notification: FirebasePushNotificationInput;
  data?: Record<string, string>;
  android?: AndroidConfig;
  apns?: ApnsConfig;
  webpush?: WebpushConfig;
}

export interface FirebasePushSendInput extends FirebasePushBaseInput {
  token: string;
}

export interface FirebasePushBatchSendInput extends FirebasePushBaseInput {
  tokens: string[];
  maxBatchSize?: number;
}

export interface FirebasePushSingleResult {
  status: FirebasePushSingleStatus;
  provider: typeof FIREBASE_PUSH_PROVIDER;
  providerMessageId?: string;
  skippedReason?: FirebasePushSkippedReason;
  errorCode?: FirebasePushErrorCode;
  errorMessage?: string;
}

export interface FirebasePushBatchItemResult {
  tokenIndex: number;
  status: FirebasePushItemStatus;
  providerMessageId?: string;
  skippedReason?: FirebasePushSkippedReason;
  errorCode?: FirebasePushErrorCode;
  errorMessage?: string;
}

export interface FirebasePushBatchResult {
  status: FirebasePushBatchStatus;
  provider: typeof FIREBASE_PUSH_PROVIDER;
  successCount: number;
  failureCount: number;
  skippedReason?: FirebasePushSkippedReason;
  errorCode?: FirebasePushErrorCode;
  errorMessage?: string;
  results: FirebasePushBatchItemResult[];
}