import { Injectable } from '@nestjs/common';
import {
  AppDeviceTokenSurface,
  CommunicationNotificationDeliveryStatus,
  CommunicationNotificationSourceModule,
  UserType,
} from '@prisma/client';
import { AppDeviceTokenCrypto } from '../../app-device-tokens/domain/app-device-token-crypto';
import {
  AppDeviceTokenRepository,
  AppDeviceTokenSenderRecord,
} from '../../app-device-tokens/infrastructure/app-device-token.repository';
import { FirebasePushProvider } from '../../../infrastructure/push/firebase/firebase-push.provider';
import {
  FirebasePushBatchItemResult,
  FirebasePushErrorCode,
  FirebasePushSkippedReason,
} from '../../../infrastructure/push/firebase/firebase-push.types';
import {
  COMMUNICATION_NOTIFICATION_RECOVERY_WINDOW_MS,
  COMMUNICATION_PUSH_RECOVERY_WINDOW_EXPIRED_CODE,
  isRetryableCommunicationPushErrorCode,
} from '../domain/communication-notification-generation-domain';
import {
  CommunicationNotificationPushRepository,
  CommunicationPushAttemptRecord,
  CommunicationPushDeliveryForProcessing,
} from '../infrastructure/communication-notification-push.repository';
import { CommunicationNotificationPushPayloadBuilder } from './communication-notification-push-payload.builder';

const NO_ACTIVE_TOKENS_CODE = 'push/no-active-device-tokens';
const ALREADY_SENT_CODE = 'push/already-sent';
const DELIVERY_NOT_FOUND_CODE = 'push/delivery-not-found';
const TOKEN_DECRYPT_FAILED_CODE = 'push/token-decrypt-failed';
const RETRYABLE_ATTEMPTS_REMAIN_CODE = 'push/retryable-attempts-remain';

export interface CommunicationPushDeliveryProcessingResult {
  deliveryId: string;
  status: 'pending' | 'sent' | 'failed' | 'skipped';
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  skippedReason?: string;
}

interface DecryptedTokenItem {
  deviceToken: AppDeviceTokenSenderRecord;
  token: string;
}

@Injectable()
export class CommunicationNotificationPushDeliveryService {
  constructor(
    private readonly pushRepository: CommunicationNotificationPushRepository,
    private readonly appDeviceTokenRepository: AppDeviceTokenRepository,
    private readonly appDeviceTokenCrypto: AppDeviceTokenCrypto,
    private readonly firebasePushProvider: FirebasePushProvider,
    private readonly payloadBuilder: CommunicationNotificationPushPayloadBuilder,
  ) {}

  async processDelivery(input: {
    schoolId: string;
    deliveryId: string;
    now?: Date;
  }): Promise<CommunicationPushDeliveryProcessingResult> {
    const now = input.now ?? new Date();
    const delivery =
      await this.pushRepository.findCurrentSchoolPushDeliveryForProcessing(
        input.deliveryId,
      );

    if (!delivery || delivery.schoolId !== input.schoolId) {
      return skippedResult(input.deliveryId, DELIVERY_NOT_FOUND_CODE);
    }
    if (delivery.status === CommunicationNotificationDeliveryStatus.SENT) {
      return skippedResult(delivery.id, ALREADY_SENT_CODE);
    }
    if (
      delivery.createdAt.getTime() <=
      now.getTime() - COMMUNICATION_NOTIFICATION_RECOVERY_WINDOW_MS
    ) {
      return this.expireRecoveryWindow({
        schoolId: delivery.schoolId,
        deliveryId: delivery.id,
        now,
      });
    }

    const activeDeviceTokens =
      await this.appDeviceTokenRepository.listActiveCurrentSchoolUserTokens({
        schoolId: delivery.schoolId,
        userId: delivery.notification.recipientUserId,
        appSurface: resolveDeliveryTokenSurface(delivery.notification),
      });

    await this.pushRepository.ensurePendingAttempts({
      schoolId: delivery.schoolId,
      deliveryId: delivery.id,
      deviceTokenIds: activeDeviceTokens.map((token) => token.id),
    });

    const attempts = await this.pushRepository.listAttemptsForDelivery(
      delivery.id,
    );
    if (activeDeviceTokens.length === 0 && attempts.length === 0) {
      await this.pushRepository.updateDeliveryStatus({
        schoolId: delivery.schoolId,
        deliveryId: delivery.id,
        status: CommunicationNotificationDeliveryStatus.SKIPPED,
        attemptedAt: now,
        errorCode: NO_ACTIVE_TOKENS_CODE,
        errorMessage: 'No active device tokens',
        metadata: { sentCount: 0, failedCount: 0, skippedCount: 0 },
      });
      return skippedResult(delivery.id, NO_ACTIVE_TOKENS_CODE);
    }

    const attemptsByTokenId = new Map(
      attempts.map((attempt) => [attempt.deviceTokenId, attempt]),
    );
    const eligibleTokens = activeDeviceTokens.filter((token) => {
      const attempt = attemptsByTokenId.get(token.id);
      return (
        !attempt ||
        attempt.status === CommunicationNotificationDeliveryStatus.PENDING ||
        (attempt.status === CommunicationNotificationDeliveryStatus.FAILED &&
          isRetryableCommunicationPushErrorCode(attempt.errorCode))
      );
    });

    const decryptedItems: DecryptedTokenItem[] = [];
    for (const deviceToken of eligibleTokens) {
      try {
        decryptedItems.push({
          deviceToken,
          token: this.appDeviceTokenCrypto.decrypt(deviceToken.tokenCiphertext),
        });
      } catch {
        await this.pushRepository.recordAttemptResult({
          schoolId: delivery.schoolId,
          deliveryId: delivery.id,
          deviceTokenId: deviceToken.id,
          status: CommunicationNotificationDeliveryStatus.FAILED,
          errorCode: TOKEN_DECRYPT_FAILED_CODE,
          errorMessage: 'App device token could not be decrypted',
          attemptedAt: now,
          failedAt: now,
        });
        await this.appDeviceTokenRepository.recordCurrentSchoolTokenFailure({
          schoolId: delivery.schoolId,
          deviceTokenId: deviceToken.id,
          errorCode: TOKEN_DECRYPT_FAILED_CODE,
          now,
          deactivate: false,
        });
      }
    }

    if (decryptedItems.length > 0) {
      const payload = this.payloadBuilder.build(delivery.notification);
      const result = await this.firebasePushProvider.sendBatch({
        tokens: decryptedItems.map((item) => item.token),
        notification: payload.notification,
        data: payload.data,
      });
      const itemResults = normalizeProviderItemResults({
        resultResults: result.results,
        itemCount: decryptedItems.length,
        skippedReason: result.skippedReason,
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
      });

      for (const itemResult of itemResults) {
        const item = decryptedItems[itemResult.tokenIndex];
        if (!item) continue;

        if (itemResult.status === 'sent') {
          await this.pushRepository.recordAttemptResult({
            schoolId: delivery.schoolId,
            deliveryId: delivery.id,
            deviceTokenId: item.deviceToken.id,
            status: CommunicationNotificationDeliveryStatus.SENT,
            providerMessageId: itemResult.providerMessageId ?? null,
            attemptedAt: now,
            sentAt: now,
          });
          continue;
        }

        if (itemResult.status === 'skipped') {
          const skippedErrorCode = mapSkippedReasonToErrorCode(
            itemResult.skippedReason,
            itemResult.errorCode,
          );
          await this.pushRepository.recordAttemptResult({
            schoolId: delivery.schoolId,
            deliveryId: delivery.id,
            deviceTokenId: item.deviceToken.id,
            status: CommunicationNotificationDeliveryStatus.SKIPPED,
            errorCode: skippedErrorCode,
            errorMessage: itemResult.errorMessage ?? null,
            attemptedAt: now,
            skippedAt: now,
          });
          continue;
        }

        const errorCode = itemResult.errorCode ?? 'fcm/unknown';
        await this.pushRepository.recordAttemptResult({
          schoolId: delivery.schoolId,
          deliveryId: delivery.id,
          deviceTokenId: item.deviceToken.id,
          status: CommunicationNotificationDeliveryStatus.FAILED,
          errorCode,
          errorMessage: itemResult.errorMessage ?? null,
          attemptedAt: now,
          failedAt: now,
        });
        await this.appDeviceTokenRepository.recordCurrentSchoolTokenFailure({
          schoolId: delivery.schoolId,
          deviceTokenId: item.deviceToken.id,
          errorCode,
          now,
          deactivate: isInvalidOrUnregisteredTokenError(errorCode),
        });
      }
    }

    const aggregate = resolveAttemptAggregate(
      await this.pushRepository.listAttemptsForDelivery(delivery.id),
    );
    await this.persistAggregate(delivery, aggregate, now);

    if (aggregate.retryableCount > 0) {
      throw new Error('communication_push_retryable_failure');
    }

    return presentAggregate(delivery.id, aggregate);
  }

  async expireRecoveryWindow(input: {
    schoolId: string;
    deliveryId: string;
    now?: Date;
  }): Promise<CommunicationPushDeliveryProcessingResult> {
    return this.terminalizeRecovery({
      ...input,
      errorCode: COMMUNICATION_PUSH_RECOVERY_WINDOW_EXPIRED_CODE,
      errorMessage: 'Push recovery window expired',
    });
  }

  async terminalizeRecovery(input: {
    schoolId: string;
    deliveryId: string;
    errorCode: string;
    errorMessage: string;
    now?: Date;
  }): Promise<CommunicationPushDeliveryProcessingResult> {
    const now = input.now ?? new Date();
    const attempts = await this.pushRepository.listAttemptsForDelivery(
      input.deliveryId,
    );
    for (const attempt of attempts) {
      if (
        attempt.status !== CommunicationNotificationDeliveryStatus.PENDING &&
        !(
          attempt.status === CommunicationNotificationDeliveryStatus.FAILED &&
          isRetryableCommunicationPushErrorCode(attempt.errorCode)
        )
      ) {
        continue;
      }
      await this.pushRepository.recordAttemptResult({
        schoolId: input.schoolId,
        deliveryId: input.deliveryId,
        deviceTokenId: attempt.deviceTokenId,
        status: CommunicationNotificationDeliveryStatus.FAILED,
        errorCode: input.errorCode,
        errorMessage: input.errorMessage,
        attemptedAt: now,
        failedAt: now,
      });
    }

    const aggregate = resolveAttemptAggregate(
      await this.pushRepository.listAttemptsForDelivery(input.deliveryId),
    );
    const status =
      aggregate.sentCount > 0
        ? CommunicationNotificationDeliveryStatus.SENT
        : aggregate.skippedCount > 0 && aggregate.failedCount === 0
          ? CommunicationNotificationDeliveryStatus.SKIPPED
          : CommunicationNotificationDeliveryStatus.FAILED;
    await this.pushRepository.updateDeliveryStatus({
      schoolId: input.schoolId,
      deliveryId: input.deliveryId,
      status,
      attemptedAt: now,
      sentAt:
        status === CommunicationNotificationDeliveryStatus.SENT ? now : null,
      failedAt:
        status === CommunicationNotificationDeliveryStatus.FAILED ? now : null,
      errorCode:
        status === CommunicationNotificationDeliveryStatus.FAILED
          ? input.errorCode
          : null,
      errorMessage: null,
      metadata: aggregateMetadata(aggregate),
    });

    return presentAggregate(input.deliveryId, { ...aggregate, status });
  }

  private async persistAggregate(
    delivery: CommunicationPushDeliveryForProcessing,
    aggregate: AttemptAggregate,
    now: Date,
  ): Promise<void> {
    await this.pushRepository.updateDeliveryStatus({
      schoolId: delivery.schoolId,
      deliveryId: delivery.id,
      status: aggregate.status,
      attemptedAt: now,
      sentAt:
        aggregate.status === CommunicationNotificationDeliveryStatus.SENT
          ? now
          : null,
      failedAt:
        aggregate.status === CommunicationNotificationDeliveryStatus.FAILED
          ? now
          : null,
      errorCode:
        aggregate.status === CommunicationNotificationDeliveryStatus.PENDING
          ? RETRYABLE_ATTEMPTS_REMAIN_CODE
          : aggregate.status === CommunicationNotificationDeliveryStatus.SKIPPED
            ? 'push/all-skipped'
            : aggregate.status ===
                CommunicationNotificationDeliveryStatus.FAILED
              ? 'push/permanent-attempts-failed'
              : null,
      errorMessage: null,
      metadata: aggregateMetadata(aggregate),
    });
  }
}

interface AttemptAggregate {
  status: CommunicationNotificationDeliveryStatus;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  retryableCount: number;
}

function resolveAttemptAggregate(
  attempts: CommunicationPushAttemptRecord[],
): AttemptAggregate {
  const sentCount = attempts.filter(
    (attempt) =>
      attempt.status === CommunicationNotificationDeliveryStatus.SENT,
  ).length;
  const failedAttempts = attempts.filter(
    (attempt) =>
      attempt.status === CommunicationNotificationDeliveryStatus.FAILED,
  );
  const failedCount = failedAttempts.length;
  const skippedCount = attempts.filter(
    (attempt) =>
      attempt.status === CommunicationNotificationDeliveryStatus.SKIPPED,
  ).length;
  const retryableCount = attempts.filter(
    (attempt) =>
      attempt.status === CommunicationNotificationDeliveryStatus.PENDING ||
      (attempt.status === CommunicationNotificationDeliveryStatus.FAILED &&
        isRetryableCommunicationPushErrorCode(attempt.errorCode)),
  ).length;
  const permanentFailureCount =
    failedCount -
    failedAttempts.filter((attempt) =>
      isRetryableCommunicationPushErrorCode(attempt.errorCode),
    ).length;

  let status: CommunicationNotificationDeliveryStatus;
  if (retryableCount > 0) {
    status = CommunicationNotificationDeliveryStatus.PENDING;
  } else if (sentCount > 0) {
    status = CommunicationNotificationDeliveryStatus.SENT;
  } else if (permanentFailureCount === 0 && skippedCount === attempts.length) {
    status = CommunicationNotificationDeliveryStatus.SKIPPED;
  } else {
    status = CommunicationNotificationDeliveryStatus.FAILED;
  }

  return { status, sentCount, failedCount, skippedCount, retryableCount };
}

function aggregateMetadata(aggregate: AttemptAggregate) {
  return {
    sentCount: aggregate.sentCount,
    failedCount: aggregate.failedCount,
    skippedCount: aggregate.skippedCount,
    retryableCount: aggregate.retryableCount,
  };
}

function presentAggregate(
  deliveryId: string,
  aggregate: AttemptAggregate,
): CommunicationPushDeliveryProcessingResult {
  return {
    deliveryId,
    status:
      aggregate.status === CommunicationNotificationDeliveryStatus.PENDING
        ? 'pending'
        : aggregate.status === CommunicationNotificationDeliveryStatus.SENT
          ? 'sent'
          : aggregate.status === CommunicationNotificationDeliveryStatus.FAILED
            ? 'failed'
            : 'skipped',
    sentCount: aggregate.sentCount,
    failedCount: aggregate.failedCount,
    skippedCount: aggregate.skippedCount,
  };
}

function skippedResult(
  deliveryId: string,
  skippedReason: string,
): CommunicationPushDeliveryProcessingResult {
  return {
    deliveryId,
    status: 'skipped',
    sentCount: 0,
    failedCount: 0,
    skippedCount: 0,
    skippedReason,
  };
}

function normalizeProviderItemResults(input: {
  resultResults: FirebasePushBatchItemResult[];
  itemCount: number;
  skippedReason?: FirebasePushSkippedReason;
  errorCode?: FirebasePushErrorCode;
  errorMessage?: string;
}): FirebasePushBatchItemResult[] {
  if (input.resultResults.length > 0) return input.resultResults;

  return Array.from({ length: input.itemCount }, (_, tokenIndex) => ({
    tokenIndex,
    status: input.skippedReason ? 'skipped' : 'failed',
    skippedReason: input.skippedReason,
    errorCode: input.errorCode ?? 'fcm/unknown',
    errorMessage: input.errorMessage,
  }));
}

function mapSkippedReasonToErrorCode(
  skippedReason: FirebasePushSkippedReason | undefined,
  errorCode: FirebasePushErrorCode | undefined,
): string | null {
  if (errorCode) return errorCode;
  if (!skippedReason) return null;
  return `push/${skippedReason.replace(/_/g, '-')}`;
}

function isInvalidOrUnregisteredTokenError(errorCode: string): boolean {
  return (
    errorCode === 'fcm/registration-token-not-registered' ||
    errorCode === 'fcm/invalid-registration-token'
  );
}

function resolveDeliveryTokenSurface(
  notification: CommunicationPushDeliveryForProcessing['notification'],
): AppDeviceTokenSurface | undefined {
  if (
    notification.sourceModule !==
    CommunicationNotificationSourceModule.DISMISSAL
  ) {
    return undefined;
  }
  if (notification.recipientUser.userType === UserType.PARENT) {
    return AppDeviceTokenSurface.PARENT;
  }
  if (notification.recipientUser.userType === UserType.DISMISSAL_STAFF) {
    return AppDeviceTokenSurface.DISMISSAL_STAFF;
  }
  return undefined;
}
