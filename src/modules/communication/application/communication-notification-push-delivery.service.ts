import { Injectable } from '@nestjs/common';
import { CommunicationNotificationDeliveryStatus } from '@prisma/client';
import { AppDeviceTokenCrypto } from '../../app-device-tokens/domain/app-device-token-crypto';
import {
  AppDeviceTokenRepository,
  AppDeviceTokenSenderRecord,
} from '../../app-device-tokens/infrastructure/app-device-token.repository';
import {
  FirebasePushBatchItemResult,
  FirebasePushErrorCode,
  FirebasePushSkippedReason,
} from '../../../infrastructure/push/firebase/firebase-push.types';
import { FirebasePushProvider } from '../../../infrastructure/push/firebase/firebase-push.provider';
import { CommunicationNotificationPushPayloadBuilder } from './communication-notification-push-payload.builder';
import { CommunicationNotificationPushRepository } from '../infrastructure/communication-notification-push.repository';

const NO_ACTIVE_TOKENS_CODE = 'push/no-active-device-tokens';
const ALREADY_SENT_CODE = 'push/already-sent';
const DELIVERY_NOT_FOUND_CODE = 'push/delivery-not-found';
const TOKEN_DECRYPT_FAILED_CODE = 'push/token-decrypt-failed';

export interface CommunicationPushDeliveryProcessingResult {
  deliveryId: string;
  status: 'sent' | 'failed' | 'skipped';
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
  }): Promise<CommunicationPushDeliveryProcessingResult> {
    const now = new Date();
    const delivery =
      await this.pushRepository.findCurrentSchoolPushDeliveryForProcessing(
        input.deliveryId,
      );

    if (!delivery || delivery.schoolId !== input.schoolId) {
      return {
        deliveryId: input.deliveryId,
        status: 'skipped',
        sentCount: 0,
        failedCount: 0,
        skippedCount: 0,
        skippedReason: DELIVERY_NOT_FOUND_CODE,
      };
    }

    if (delivery.status === CommunicationNotificationDeliveryStatus.SENT) {
      return {
        deliveryId: delivery.id,
        status: 'skipped',
        sentCount: 0,
        failedCount: 0,
        skippedCount: 0,
        skippedReason: ALREADY_SENT_CODE,
      };
    }

    const activeDeviceTokens =
      await this.appDeviceTokenRepository.listActiveCurrentSchoolUserTokens({
        schoolId: delivery.schoolId,
        userId: delivery.notification.recipientUserId,
      });

    if (activeDeviceTokens.length === 0) {
      await this.pushRepository.updateDeliveryStatus({
        schoolId: delivery.schoolId,
        deliveryId: delivery.id,
        status: CommunicationNotificationDeliveryStatus.SKIPPED,
        attemptedAt: now,
        errorCode: NO_ACTIVE_TOKENS_CODE,
        errorMessage: 'No active device tokens',
        metadata: {
          sentCount: 0,
          failedCount: 0,
          skippedCount: 0,
        },
      });

      return {
        deliveryId: delivery.id,
        status: 'skipped',
        sentCount: 0,
        failedCount: 0,
        skippedCount: 0,
        skippedReason: NO_ACTIVE_TOKENS_CODE,
      };
    }

    await this.pushRepository.ensurePendingAttempts({
      schoolId: delivery.schoolId,
      deliveryId: delivery.id,
      deviceTokenIds: activeDeviceTokens.map((token) => token.id),
    });

    const decryptedItems: DecryptedTokenItem[] = [];
    let failedCount = 0;
    let skippedCount = 0;
    let firstSkippedErrorCode: string | null = null;

    for (const deviceToken of activeDeviceTokens) {
      try {
        decryptedItems.push({
          deviceToken,
          token: this.appDeviceTokenCrypto.decrypt(
            deviceToken.tokenCiphertext,
          ),
        });
      } catch {
        failedCount += 1;
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

    let sentCount = 0;
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
          sentCount += 1;
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
          skippedCount += 1;
          const skippedErrorCode = mapSkippedReasonToErrorCode(
            itemResult.skippedReason,
            itemResult.errorCode,
          );
          firstSkippedErrorCode ??= skippedErrorCode;
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

        failedCount += 1;
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

    const deliveryStatus = resolveDeliveryStatus({
      sentCount,
      failedCount,
      skippedCount,
    });
    await this.pushRepository.updateDeliveryStatus({
      schoolId: delivery.schoolId,
      deliveryId: delivery.id,
      status: deliveryStatus,
      attemptedAt: now,
      sentAt:
        deliveryStatus === CommunicationNotificationDeliveryStatus.SENT
          ? now
          : null,
      failedAt:
        deliveryStatus === CommunicationNotificationDeliveryStatus.FAILED
          ? now
          : null,
      errorCode:
        deliveryStatus === CommunicationNotificationDeliveryStatus.SKIPPED
          ? resolveSkippedDeliveryCode(skippedCount, firstSkippedErrorCode)
          : deliveryStatus === CommunicationNotificationDeliveryStatus.FAILED
            ? resolveFailedDeliveryCode(failedCount)
            : null,
      errorMessage: null,
      metadata: {
        sentCount,
        failedCount,
        skippedCount,
      },
    });

    return {
      deliveryId: delivery.id,
      status: presentProcessingStatus(deliveryStatus),
      sentCount,
      failedCount,
      skippedCount,
    };
  }
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

function resolveDeliveryStatus(input: {
  sentCount: number;
  failedCount: number;
  skippedCount: number;
}): CommunicationNotificationDeliveryStatus {
  if (input.sentCount > 0) return CommunicationNotificationDeliveryStatus.SENT;
  if (input.failedCount > 0) {
    return CommunicationNotificationDeliveryStatus.FAILED;
  }
  return CommunicationNotificationDeliveryStatus.SKIPPED;
}

function resolveSkippedDeliveryCode(
  skippedCount: number,
  firstSkippedErrorCode: string | null,
): string | null {
  return skippedCount > 0
    ? (firstSkippedErrorCode ?? 'push/all-skipped')
    : NO_ACTIVE_TOKENS_CODE;
}

function resolveFailedDeliveryCode(failedCount: number): string | null {
  return failedCount > 0 ? 'push/all-failed' : null;
}

function presentProcessingStatus(
  status: CommunicationNotificationDeliveryStatus,
): CommunicationPushDeliveryProcessingResult['status'] {
  if (status === CommunicationNotificationDeliveryStatus.SENT) return 'sent';
  if (status === CommunicationNotificationDeliveryStatus.FAILED) {
    return 'failed';
  }
  return 'skipped';
}

function isInvalidOrUnregisteredTokenError(errorCode: string): boolean {
  return (
    errorCode === 'fcm/registration-token-not-registered' ||
    errorCode === 'fcm/invalid-registration-token'
  );
}
