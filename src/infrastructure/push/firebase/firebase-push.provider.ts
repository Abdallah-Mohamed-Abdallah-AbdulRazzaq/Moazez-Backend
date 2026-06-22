import { Injectable } from '@nestjs/common';
import type { Message, MulticastMessage } from 'firebase-admin/messaging';
import { normalizeFirebasePushError } from './firebase-push-error-normalizer';
import {
  FIREBASE_PUSH_DEFAULT_MAX_BATCH_SIZE,
  FIREBASE_PUSH_MAX_BATCH_SIZE,
  FIREBASE_PUSH_PROVIDER,
  FirebasePushBaseInput,
  FirebasePushBatchItemResult,
  FirebasePushBatchResult,
  FirebasePushBatchSendInput,
  FirebasePushNotificationInput,
  FirebasePushSendInput,
  FirebasePushSingleResult,
  FirebasePushSkippedReason,
} from './firebase-push.types';
import { FirebaseAdminService } from './firebase-admin.service';

export const FIREBASE_PUSH_FORBIDDEN_DATA_KEYS = [
  'schoolId',
  'organizationId',
  'membershipId',
  'roleId',
  'recipientUserId',
  'actorUserId',
  'senderUserId',
  'guardianId',
  'studentGuardianId',
  'enrollmentId',
  'teacherAllocationId',
  'bucket',
  'objectKey',
  'storageKey',
  'signedUrl',
  'deviceTokenId',
  'token',
  'tokenHash',
  'tokenCiphertext',
  'privateKey',
  'credential',
  'credentials',
  'authorization',
  'bearer',
  'providerMetadata',
  'queueMetadata',
  'rawMetadata',
  'stack',
  'errorStack',
] as const;

const FORBIDDEN_DATA_KEY_LOOKUP = new Set(
  FIREBASE_PUSH_FORBIDDEN_DATA_KEYS.map((key) => key.toLowerCase()),
);

interface NormalizedPayload {
  notification: {
    title: string;
    body?: string;
  };
  data?: Record<string, string>;
  android?: FirebasePushBaseInput['android'];
  apns?: FirebasePushBaseInput['apns'];
  webpush?: FirebasePushBaseInput['webpush'];
}

type NormalizedSingleSend =
  | {
      ok: true;
      token: string;
      message: Message;
    }
  | {
      ok: false;
      skippedReason: FirebasePushSkippedReason;
      errorMessage: string;
    };

type NormalizedBatchSend =
  | {
      ok: true;
      tokens: string[];
      message: MulticastMessage;
    }
  | {
      ok: false;
      skippedReason: FirebasePushSkippedReason;
      errorMessage: string;
    };

@Injectable()
export class FirebasePushProvider {
  constructor(private readonly firebaseAdminService: FirebaseAdminService) {}

  async sendToToken(
    input: FirebasePushSendInput,
  ): Promise<FirebasePushSingleResult> {
    const normalized = normalizeSingleSendInput(input);
    if (!normalized.ok) {
      return buildSkippedSingleResult(
        normalized.skippedReason,
        normalized.errorMessage,
      );
    }

    if (!this.firebaseAdminService.isEnabled()) {
      return buildSkippedSingleResult('disabled');
    }

    if (this.firebaseAdminService.isDryRun()) {
      return buildSkippedSingleResult('dry_run');
    }

    try {
      const providerMessageId =
        await this.firebaseAdminService.getMessaging().send(normalized.message);

      return {
        status: 'sent',
        provider: FIREBASE_PUSH_PROVIDER,
        providerMessageId,
      };
    } catch (error) {
      return {
        status: 'failed',
        provider: FIREBASE_PUSH_PROVIDER,
        ...normalizeFirebasePushError(error),
      };
    }
  }

  async sendBatch(
    input: FirebasePushBatchSendInput,
  ): Promise<FirebasePushBatchResult> {
    const normalized = normalizeBatchSendInput(input);
    if (!normalized.ok) {
      return buildSkippedBatchResult(
        normalized.skippedReason,
        normalized.errorMessage,
      );
    }

    if (!this.firebaseAdminService.isEnabled()) {
      return buildSkippedBatchResult(
        'disabled',
        undefined,
        normalized.tokens.length,
      );
    }

    if (this.firebaseAdminService.isDryRun()) {
      return buildSkippedBatchResult(
        'dry_run',
        undefined,
        normalized.tokens.length,
      );
    }

    try {
      const response =
        await this.firebaseAdminService
          .getMessaging()
          .sendEachForMulticast(normalized.message);

      const results: FirebasePushBatchItemResult[] = response.responses.map(
        (sendResponse, tokenIndex) => {
          if (sendResponse.success) {
            return {
              tokenIndex,
              status: 'sent',
              providerMessageId: sendResponse.messageId,
            };
          }

          return {
            tokenIndex,
            status: 'failed',
            ...normalizeFirebasePushError(sendResponse.error),
          };
        },
      );

      return {
        status: resolveBatchStatus(response.successCount, response.failureCount),
        provider: FIREBASE_PUSH_PROVIDER,
        successCount: response.successCount,
        failureCount: response.failureCount,
        results,
      };
    } catch (error) {
      const normalizedError = normalizeFirebasePushError(error);
      return {
        status: 'failed',
        provider: FIREBASE_PUSH_PROVIDER,
        successCount: 0,
        failureCount: normalized.tokens.length,
        ...normalizedError,
        results: normalized.tokens.map((_, tokenIndex) => ({
          tokenIndex,
          status: 'failed',
          ...normalizedError,
        })),
      };
    }
  }
}

export function findForbiddenFirebasePushDataKey(
  data: Record<string, unknown> | undefined,
): string | null {
  if (!data) return null;

  for (const key of Object.keys(data)) {
    if (FORBIDDEN_DATA_KEY_LOOKUP.has(key.toLowerCase())) return key;
  }

  return null;
}

function normalizeSingleSendInput(input: FirebasePushSendInput): NormalizedSingleSend {
  const token = normalizeToken(input?.token);
  if (!token) {
    return {
      ok: false,
      skippedReason: 'no_token',
      errorMessage: 'FCM token is required',
    };
  }

  const payload = normalizePayload(input);
  if (!payload.ok) {
    return {
      ok: false,
      skippedReason: 'invalid_payload',
      errorMessage: payload.errorMessage,
    };
  }

  return {
    ok: true,
    token,
    message: {
      token,
      ...payload.value,
    },
  };
}

function normalizeBatchSendInput(input: FirebasePushBatchSendInput): NormalizedBatchSend {
  const tokens = Array.isArray(input?.tokens)
    ? input.tokens.map((token) => normalizeToken(token))
    : [];

  if (tokens.length === 0) {
    return {
      ok: false,
      skippedReason: 'no_token',
      errorMessage: 'At least one FCM token is required',
    };
  }

  if (tokens.some((token) => !token)) {
    return {
      ok: false,
      skippedReason: 'no_token',
      errorMessage: 'FCM token is required',
    };
  }

  const maxBatchSize = normalizeMaxBatchSize(input.maxBatchSize);
  if (tokens.length > maxBatchSize) {
    return {
      ok: false,
      skippedReason: 'invalid_payload',
      errorMessage: `FCM batch size exceeds the maximum of ${maxBatchSize}`,
    };
  }

  const payload = normalizePayload(input);
  if (!payload.ok) {
    return {
      ok: false,
      skippedReason: 'invalid_payload',
      errorMessage: payload.errorMessage,
    };
  }

  return {
    ok: true,
    tokens: tokens as string[],
    message: {
      tokens: tokens as string[],
      ...payload.value,
    },
  };
}

function normalizePayload(
  input: FirebasePushBaseInput,
):
  | { ok: true; value: NormalizedPayload }
  | { ok: false; errorMessage: string } {
  const notification = normalizeNotification(input?.notification);
  if (!notification) {
    return {
      ok: false,
      errorMessage: 'FCM notification title is required',
    };
  }

  const forbiddenKey = findForbiddenFirebasePushDataKey(input.data);
  if (forbiddenKey) {
    return {
      ok: false,
      errorMessage: `FCM data payload contains a forbidden key: ${forbiddenKey}`,
    };
  }

  const data = normalizeData(input.data);
  if (!data.ok) return data;

  return {
    ok: true,
    value: {
      notification,
      ...(data.value ? { data: data.value } : {}),
      ...(input.android ? { android: input.android } : {}),
      ...(input.apns ? { apns: input.apns } : {}),
      ...(input.webpush ? { webpush: input.webpush } : {}),
    },
  };
}

function normalizeNotification(
  notification: FirebasePushNotificationInput | undefined,
): NormalizedPayload['notification'] | null {
  const title =
    typeof notification?.title === 'string' ? notification.title.trim() : '';
  if (!title) return null;

  const rawBody = notification?.body;
  const body =
    typeof rawBody === 'string' && rawBody.trim().length > 0
      ? rawBody.trim()
      : undefined;

  return {
    title,
    ...(body ? { body } : {}),
  };
}

function normalizeData(
  data: Record<string, unknown> | undefined,
): { ok: true; value?: Record<string, string> } | { ok: false; errorMessage: string } {
  if (!data) return { ok: true };

  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    if (typeof value !== 'string') {
      return {
        ok: false,
        errorMessage: `FCM data payload value must be a string: ${key}`,
      };
    }

    normalized[key] = value;
  }

  return { ok: true, value: normalized };
}

function normalizeToken(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const token = value.trim();
  return token.length > 0 ? token : null;
}

function normalizeMaxBatchSize(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return FIREBASE_PUSH_DEFAULT_MAX_BATCH_SIZE;
  }

  const normalized = Math.floor(value);
  if (normalized < 1) return FIREBASE_PUSH_DEFAULT_MAX_BATCH_SIZE;
  return Math.min(normalized, FIREBASE_PUSH_MAX_BATCH_SIZE);
}

function buildSkippedSingleResult(
  skippedReason: FirebasePushSkippedReason,
  errorMessage?: string,
): FirebasePushSingleResult {
  return {
    status: 'skipped',
    provider: FIREBASE_PUSH_PROVIDER,
    skippedReason,
    ...(errorMessage
      ? { errorCode: 'fcm/invalid-argument', errorMessage }
      : {}),
  };
}

function buildSkippedBatchResult(
  skippedReason: FirebasePushSkippedReason,
  errorMessage?: string,
  tokenCount = 0,
): FirebasePushBatchResult {
  return {
    status: 'skipped',
    provider: FIREBASE_PUSH_PROVIDER,
    successCount: 0,
    failureCount: 0,
    skippedReason,
    ...(errorMessage
      ? { errorCode: 'fcm/invalid-argument', errorMessage }
      : {}),
    results: Array.from({ length: tokenCount }, (_, tokenIndex) => ({
      tokenIndex,
      status: 'skipped',
      skippedReason,
    })),
  };
}

function resolveBatchStatus(
  successCount: number,
  failureCount: number,
): FirebasePushBatchResult['status'] {
  if (successCount > 0 && failureCount === 0) return 'sent';
  if (successCount > 0 && failureCount > 0) return 'partial';
  return 'failed';
}