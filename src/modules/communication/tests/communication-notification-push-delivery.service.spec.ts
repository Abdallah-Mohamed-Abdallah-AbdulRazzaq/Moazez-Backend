import {
  CommunicationNotificationDeliveryChannel,
  CommunicationNotificationDeliveryStatus,
  CommunicationNotificationSourceModule,
  CommunicationNotificationType,
  UserType,
} from '@prisma/client';
import { AppDeviceTokenCrypto } from '../../app-device-tokens/domain/app-device-token-crypto';
import { AppDeviceTokenRepository } from '../../app-device-tokens/infrastructure/app-device-token.repository';
import { FirebasePushProvider } from '../../../infrastructure/push/firebase/firebase-push.provider';
import { CommunicationNotificationPushDeliveryService } from '../application/communication-notification-push-delivery.service';
import { CommunicationNotificationPushPayloadBuilder } from '../application/communication-notification-push-payload.builder';
import {
  CommunicationNotificationPushRepository,
  CommunicationPushDeliveryForProcessing,
} from '../infrastructure/communication-notification-push.repository';

describe('CommunicationNotificationPushDeliveryService', () => {
  it('marks delivery skipped when no active device tokens exist', async () => {
    const pushRepository = pushRepositoryMock();
    const appDeviceTokenRepository = appDeviceTokenRepositoryMock({
      listActiveCurrentSchoolUserTokens: jest.fn().mockResolvedValue([]),
    });
    const service = createService({
      pushRepository,
      appDeviceTokenRepository,
    });

    const result = await service.processDelivery({
      schoolId: 'school-1',
      deliveryId: 'delivery-1',
    });

    expect(result).toMatchObject({
      status: 'skipped',
      skippedReason: 'push/no-active-device-tokens',
    });
    expect(pushRepository.updateDeliveryStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        status: CommunicationNotificationDeliveryStatus.SKIPPED,
        errorCode: 'push/no-active-device-tokens',
      }),
    );
  });

  it('records dry-run provider results as skipped attempts and delivery', async () => {
    const pushRepository = pushRepositoryMock();
    const service = createService({
      pushRepository,
      appDeviceTokenRepository: appDeviceTokenRepositoryMock({
        listActiveCurrentSchoolUserTokens: jest
          .fn()
          .mockResolvedValue([deviceTokenRecord()]),
      }),
      firebasePushProvider: firebasePushProviderMock({
        sendBatch: jest.fn().mockResolvedValue({
          status: 'skipped',
          provider: 'firebase_fcm',
          successCount: 0,
          failureCount: 0,
          skippedReason: 'dry_run',
          results: [
            {
              tokenIndex: 0,
              status: 'skipped',
              skippedReason: 'dry_run',
            },
          ],
        }),
      }),
    });

    const result = await service.processDelivery({
      schoolId: 'school-1',
      deliveryId: 'delivery-1',
    });

    expect(result).toMatchObject({
      status: 'skipped',
      sentCount: 0,
      failedCount: 0,
      skippedCount: 1,
    });
    expect(pushRepository.recordAttemptResult).toHaveBeenCalledWith(
      expect.objectContaining({
        status: CommunicationNotificationDeliveryStatus.SKIPPED,
        errorCode: 'push/dry-run',
      }),
    );
    expect(pushRepository.updateDeliveryStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        status: CommunicationNotificationDeliveryStatus.SKIPPED,
        errorCode: 'push/all-skipped',
      }),
    );
  });

  it('records sent and failed per-device attempts without token material', async () => {
    const pushRepository = pushRepositoryMock();
    const appDeviceTokenRepository = appDeviceTokenRepositoryMock();
    const service = createService({
      pushRepository,
      appDeviceTokenRepository,
      firebasePushProvider: firebasePushProviderMock({
        sendBatch: jest.fn().mockResolvedValue({
          status: 'partial',
          provider: 'firebase_fcm',
          successCount: 1,
          failureCount: 1,
          results: [
            {
              tokenIndex: 0,
              status: 'sent',
              providerMessageId: 'firebase-message-1',
            },
            {
              tokenIndex: 1,
              status: 'failed',
              errorCode: 'fcm/unavailable',
              errorMessage: 'Firebase push send failed',
            },
          ],
        }),
      }),
    });

    await expect(
      service.processDelivery({
        schoolId: 'school-1',
        deliveryId: 'delivery-1',
      }),
    ).rejects.toThrow('communication_push_retryable_failure');
    expect(pushRepository.updateDeliveryStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        status: CommunicationNotificationDeliveryStatus.PENDING,
        metadata: {
          sentCount: 1,
          failedCount: 1,
          skippedCount: 0,
          retryableCount: 1,
        },
      }),
    );
    expect(
      appDeviceTokenRepository.recordCurrentSchoolTokenFailure,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        deviceTokenId: 'device-token-2',
        errorCode: 'fcm/unavailable',
        deactivate: false,
      }),
    );
    expect(
      JSON.stringify(pushRepository.recordAttemptResult.mock.calls),
    ).not.toContain('plain-token');
    expect(
      JSON.stringify(pushRepository.recordAttemptResult.mock.calls),
    ).not.toContain('ciphertext');
  });

  it('deactivates invalid or unregistered FCM tokens only', async () => {
    const appDeviceTokenRepository = appDeviceTokenRepositoryMock();
    const service = createService({
      appDeviceTokenRepository,
      firebasePushProvider: firebasePushProviderMock({
        sendBatch: jest.fn().mockResolvedValue({
          status: 'failed',
          provider: 'firebase_fcm',
          successCount: 0,
          failureCount: 2,
          results: [
            {
              tokenIndex: 0,
              status: 'failed',
              errorCode: 'fcm/registration-token-not-registered',
              errorMessage: 'Firebase push send failed',
            },
            {
              tokenIndex: 1,
              status: 'failed',
              errorCode: 'fcm/internal',
              errorMessage: 'Firebase push send failed',
            },
          ],
        }),
      }),
    });

    await expect(
      service.processDelivery({
        schoolId: 'school-1',
        deliveryId: 'delivery-1',
      }),
    ).rejects.toThrow('communication_push_retryable_failure');

    expect(
      appDeviceTokenRepository.recordCurrentSchoolTokenFailure,
    ).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        deviceTokenId: 'device-token-1',
        errorCode: 'fcm/registration-token-not-registered',
        deactivate: true,
      }),
    );
    expect(
      appDeviceTokenRepository.recordCurrentSchoolTokenFailure,
    ).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        deviceTokenId: 'device-token-2',
        errorCode: 'fcm/internal',
        deactivate: false,
      }),
    );
  });

  it('retries only the failed token and never resends a known successful token', async () => {
    const pushRepository = pushRepositoryMock();
    const sendBatch = jest
      .fn()
      .mockResolvedValueOnce({
        status: 'partial',
        provider: 'firebase_fcm',
        successCount: 1,
        failureCount: 1,
        results: [
          {
            tokenIndex: 0,
            status: 'sent',
            providerMessageId: 'message-1',
          },
          {
            tokenIndex: 1,
            status: 'failed',
            errorCode: 'fcm/unavailable',
            errorMessage: 'Provider unavailable',
          },
        ],
      })
      .mockResolvedValueOnce({
        status: 'sent',
        provider: 'firebase_fcm',
        successCount: 1,
        failureCount: 0,
        results: [
          {
            tokenIndex: 0,
            status: 'sent',
            providerMessageId: 'message-2',
          },
        ],
      });
    const service = createService({
      pushRepository,
      firebasePushProvider: firebasePushProviderMock({ sendBatch }),
    });

    await expect(
      service.processDelivery({
        schoolId: 'school-1',
        deliveryId: 'delivery-1',
      }),
    ).rejects.toThrow('communication_push_retryable_failure');
    await expect(
      service.processDelivery({
        schoolId: 'school-1',
        deliveryId: 'delivery-1',
      }),
    ).resolves.toMatchObject({ status: 'sent', sentCount: 2 });

    expect(sendBatch).toHaveBeenCalledTimes(2);
    expect(sendBatch.mock.calls[0][0].tokens).toHaveLength(2);
    expect(sendBatch.mock.calls[1][0].tokens).toEqual([
      'plain-token:ciphertext-2',
    ]);
  });

  it('terminalizes remaining retryable attempts at the exact 24-hour boundary', async () => {
    const pendingAttempt = {
      id: 'attempt-1',
      deviceTokenId: 'device-token-1',
      status: CommunicationNotificationDeliveryStatus.PENDING,
      errorCode: null,
    };
    const terminalAttempt = {
      ...pendingAttempt,
      status: CommunicationNotificationDeliveryStatus.FAILED,
      errorCode: 'push/recovery-window-expired',
    };
    const pushRepository = pushRepositoryMock({
      findCurrentSchoolPushDeliveryForProcessing: jest.fn().mockResolvedValue(
        pushDeliveryRecord({
          createdAt: new Date('2026-08-05T08:00:00.000Z'),
        }),
      ),
      listAttemptsForDelivery: jest
        .fn()
        .mockResolvedValueOnce([pendingAttempt])
        .mockResolvedValueOnce([terminalAttempt]),
    });
    const provider = firebasePushProviderMock();
    const service = createService({
      pushRepository,
      firebasePushProvider: provider,
    });

    await expect(
      service.processDelivery({
        schoolId: 'school-1',
        deliveryId: 'delivery-1',
        now: new Date('2026-08-06T08:00:00.000Z'),
      }),
    ).resolves.toMatchObject({ status: 'failed' });
    expect(pushRepository.recordAttemptResult).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: 'push/recovery-window-expired',
      }),
    );
    expect(provider.sendBatch).not.toHaveBeenCalled();
  });

  it('terminalizes only unresolved attempts and preserves a known-success token', async () => {
    const sentAttempt = {
      id: 'attempt-sent',
      deviceTokenId: 'device-token-sent',
      status: CommunicationNotificationDeliveryStatus.SENT,
      errorCode: null,
    };
    const pendingAttempt = {
      id: 'attempt-pending',
      deviceTokenId: 'device-token-pending',
      status: CommunicationNotificationDeliveryStatus.PENDING,
      errorCode: null,
    };
    const terminalAttempt = {
      ...pendingAttempt,
      status: CommunicationNotificationDeliveryStatus.FAILED,
      errorCode: 'push/recipient-ineligible',
    };
    const pushRepository = pushRepositoryMock({
      listAttemptsForDelivery: jest
        .fn()
        .mockResolvedValueOnce([sentAttempt, pendingAttempt])
        .mockResolvedValueOnce([sentAttempt, terminalAttempt]),
    });
    const provider = firebasePushProviderMock();
    const service = createService({
      pushRepository,
      firebasePushProvider: provider,
    });

    await expect(
      service.terminalizeRecovery({
        schoolId: 'school-1',
        deliveryId: 'delivery-1',
        errorCode: 'push/recipient-ineligible',
        errorMessage: 'Push recipient is ineligible',
      }),
    ).resolves.toMatchObject({ status: 'sent', sentCount: 1, failedCount: 1 });
    expect(pushRepository.recordAttemptResult).toHaveBeenCalledTimes(1);
    expect(pushRepository.recordAttemptResult).toHaveBeenCalledWith(
      expect.objectContaining({
        deviceTokenId: 'device-token-pending',
        errorCode: 'push/recipient-ineligible',
      }),
    );
    expect(provider.sendBatch).not.toHaveBeenCalled();
  });
});

function createService(overrides?: {
  pushRepository?: CommunicationNotificationPushRepository &
    Record<string, jest.Mock>;
  appDeviceTokenRepository?: AppDeviceTokenRepository &
    Record<string, jest.Mock>;
  crypto?: AppDeviceTokenCrypto & Record<string, jest.Mock>;
  firebasePushProvider?: FirebasePushProvider & Record<string, jest.Mock>;
}) {
  return new CommunicationNotificationPushDeliveryService(
    overrides?.pushRepository ?? pushRepositoryMock(),
    overrides?.appDeviceTokenRepository ?? appDeviceTokenRepositoryMock(),
    overrides?.crypto ?? cryptoMock(),
    overrides?.firebasePushProvider ?? firebasePushProviderMock(),
    new CommunicationNotificationPushPayloadBuilder(),
  );
}

function pushRepositoryMock(
  overrides?: Record<string, unknown>,
): CommunicationNotificationPushRepository & Record<string, jest.Mock> {
  const attempts = new Map<string, Record<string, unknown>>();
  const repository = {
    findCurrentSchoolPushDeliveryForProcessing: jest
      .fn()
      .mockResolvedValue(pushDeliveryRecord()),
    ensurePendingAttempts: jest.fn(async (input) => {
      for (const deviceTokenId of input.deviceTokenIds) {
        if (!attempts.has(deviceTokenId)) {
          attempts.set(deviceTokenId, {
            id: `attempt-${deviceTokenId}`,
            deviceTokenId,
            status: CommunicationNotificationDeliveryStatus.PENDING,
            errorCode: null,
          });
        }
      }
    }),
    listAttemptsForDelivery: jest.fn(async () => [...attempts.values()]),
    recordAttemptResult: jest.fn(async (input) => {
      attempts.set(input.deviceTokenId, {
        ...(attempts.get(input.deviceTokenId) ?? {}),
        deviceTokenId: input.deviceTokenId,
        status: input.status,
        errorCode: input.errorCode ?? null,
      });
    }),
    updateDeliveryStatus: jest.fn().mockResolvedValue(undefined),
    ...(overrides ?? {}),
  } as unknown as CommunicationNotificationPushRepository &
    Record<string, jest.Mock>;
  return repository;
}

function appDeviceTokenRepositoryMock(
  overrides?: Record<string, unknown>,
): AppDeviceTokenRepository & Record<string, jest.Mock> {
  return {
    listActiveCurrentSchoolUserTokens: jest
      .fn()
      .mockResolvedValue([
        deviceTokenRecord({
          id: 'device-token-1',
          tokenCiphertext: 'ciphertext-1',
        }),
        deviceTokenRecord({
          id: 'device-token-2',
          tokenCiphertext: 'ciphertext-2',
        }),
      ]),
    recordCurrentSchoolTokenFailure: jest.fn().mockResolvedValue({ count: 1 }),
    ...(overrides ?? {}),
  } as unknown as AppDeviceTokenRepository & Record<string, jest.Mock>;
}

function cryptoMock(): AppDeviceTokenCrypto & Record<string, jest.Mock> {
  return {
    decrypt: jest.fn((ciphertext: string) => `plain-token:${ciphertext}`),
  } as unknown as AppDeviceTokenCrypto & Record<string, jest.Mock>;
}

function firebasePushProviderMock(
  overrides?: Record<string, unknown>,
): FirebasePushProvider & Record<string, jest.Mock> {
  return {
    sendBatch: jest.fn().mockResolvedValue({
      status: 'sent',
      provider: 'firebase_fcm',
      successCount: 2,
      failureCount: 0,
      results: [
        {
          tokenIndex: 0,
          status: 'sent',
          providerMessageId: 'firebase-message-1',
        },
        {
          tokenIndex: 1,
          status: 'sent',
          providerMessageId: 'firebase-message-2',
        },
      ],
    }),
    ...(overrides ?? {}),
  } as unknown as FirebasePushProvider & Record<string, jest.Mock>;
}

function pushDeliveryRecord(
  overrides?: Partial<CommunicationPushDeliveryForProcessing>,
): CommunicationPushDeliveryForProcessing {
  return {
    id: 'delivery-1',
    schoolId: 'school-1',
    notificationId: 'notification-1',
    channel: CommunicationNotificationDeliveryChannel.PUSH,
    status: CommunicationNotificationDeliveryStatus.PENDING,
    provider: 'firebase_fcm',
    createdAt: new Date(),
    notification: {
      id: 'notification-1',
      schoolId: 'school-1',
      recipientUserId: 'recipient-1',
      sourceModule: CommunicationNotificationSourceModule.COMMUNICATION,
      sourceType: 'communication_message',
      sourceId: 'message-1',
      type: CommunicationNotificationType.MESSAGE_RECEIVED,
      title: 'New message',
      body: 'Hello',
      metadata: {
        conversationId: 'conversation-1',
        messageId: 'message-1',
      },
      recipientUser: {
        userType: UserType.PARENT,
      },
    },
    ...(overrides ?? {}),
  };
}

function deviceTokenRecord(overrides?: Record<string, unknown>) {
  return {
    id: 'device-token-1',
    schoolId: 'school-1',
    userId: 'recipient-1',
    tokenCiphertext: 'ciphertext-1',
    platform: 'IOS',
    appSurface: 'PARENT',
    isActive: true,
    lastSeenAt: new Date('2026-06-22T10:00:00.000Z'),
    revokedAt: null,
    lastFailureCode: null,
    lastFailureAt: null,
    failureCount: 0,
    createdAt: new Date('2026-06-22T10:00:00.000Z'),
    updatedAt: new Date('2026-06-22T10:00:00.000Z'),
    ...(overrides ?? {}),
  };
}
