import { randomUUID } from 'node:crypto';
import {
  AppDeviceTokenPlatform,
  AppDeviceTokenSurface,
  CommunicationNotificationDeliveryChannel,
  CommunicationNotificationDeliveryStatus as DeliveryStatus,
  CommunicationNotificationSourceModule,
  CommunicationNotificationType,
  MembershipStatus,
  SchoolStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { COMMUNICATION_PUSH_NOTIFICATION_PROVIDER } from '../../src/modules/communication/domain/communication-notification-generation-domain';
import { CommunicationNotificationPushRepository } from '../../src/modules/communication/infrastructure/communication-notification-push.repository';
import { CommunicationNotificationPushDeliveryService } from '../../src/modules/communication/application/communication-notification-push-delivery.service';
import { CommunicationNotificationPushPayloadBuilder } from '../../src/modules/communication/application/communication-notification-push-payload.builder';
import { AppDeviceTokenRepository } from '../../src/modules/app-device-tokens/infrastructure/app-device-token.repository';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
} from '../../src/common/context/request-context';

const url = process.env.DATABASE_URL;
const describeDatabase = url ? describe : describe.skip;

describeDatabase('PostgreSQL tenant-bound push attempt writes', () => {
  jest.setTimeout(120_000);
  const prisma = new PrismaService({
    datasources: {
      db: { url: url ?? 'postgresql://unused:unused@127.0.0.1:1/unused' },
    },
  });
  const repository = new CommunicationNotificationPushRepository(prisma);
  const tenants = ['A', 'B'].map((name) => ({
    name,
    organizationId: randomUUID(),
    schoolId: randomUUID(),
    userId: randomUUID(),
  }));
  const [schoolA, schoolB] = tenants;
  const firstAttemptAt = new Date('2026-10-04T10:00:00.000Z');
  const retryAt = new Date('2026-10-04T10:01:00.000Z');
  let roleId: string;
  const scoped = <T>(work: () => Promise<T>) =>
    runWithRequestContext(createRequestContext(), () => {
      setActiveMembership({
        membershipId: 'queue:test',
        organizationId: schoolA.organizationId,
        schoolId: schoolA.schoolId,
        roleId: 'queue:test',
        permissions: [],
      });
      return work();
    });
  function processor(sendBatch: jest.Mock) {
    return new CommunicationNotificationPushDeliveryService(
      repository,
      new AppDeviceTokenRepository(prisma),
      { decrypt: () => 'synthetic-provider-token' } as never,
      { sendBatch } as never,
      new CommunicationNotificationPushPayloadBuilder(),
    );
  }
  const sent = () => ({
    results: [
      { tokenIndex: 0, status: 'sent', providerMessageId: 'synthetic-message' },
    ],
  });

  async function createPair(tenant: (typeof tenants)[number]) {
    const notification = await prisma.communicationNotification.create({
      data: {
        schoolId: tenant.schoolId,
        recipientUserId: tenant.userId,
        sourceModule: CommunicationNotificationSourceModule.COMMUNICATION,
        sourceType: 'push-tenancy-regression',
        type: CommunicationNotificationType.SYSTEM_ALERT,
        title: 'Synthetic tenant fixture',
        body: 'Synthetic push attempt fixture',
      },
    });
    const delivery = await prisma.communicationNotificationDelivery.create({
      data: {
        schoolId: tenant.schoolId,
        notificationId: notification.id,
        channel: CommunicationNotificationDeliveryChannel.PUSH,
      },
    });
    const token = await prisma.appDeviceToken.create({
      data: {
        schoolId: tenant.schoolId,
        userId: tenant.userId,
        tokenHash: randomUUID(),
        tokenCiphertext: 'synthetic-token-ciphertext',
        platform: AppDeviceTokenPlatform.WEB,
        appSurface: AppDeviceTokenSurface.PARENT,
      },
    });
    return { deliveryId: delivery.id, deviceTokenId: token.id };
  }

  beforeAll(async () => {
    await prisma.$connect();
    for (const tenant of tenants) {
      await prisma.organization.create({
        data: {
          id: tenant.organizationId,
          name: `Push tenancy organization ${tenant.name}`,
          slug: `push-tenancy-${tenant.organizationId}`,
        },
      });
      await prisma.school.create({
        data: {
          id: tenant.schoolId,
          organizationId: tenant.organizationId,
          name: `Push tenancy school ${tenant.name}`,
          slug: `push-tenancy-${tenant.schoolId}`,
        },
      });
      await prisma.user.create({
        data: {
          id: tenant.userId,
          email: `push-tenancy-${tenant.userId}@example.invalid`,
          firstName: 'Push',
          lastName: 'Tenancy',
          userType: UserType.PARENT,
        },
      });
      await createPair(tenant);
    }
    roleId = (
      await prisma.role.create({
        data: {
          schoolId: schoolA.schoolId,
          key: randomUUID(),
          name: 'Synthetic Teacher',
        },
      })
    ).id;
  });

  beforeEach(async () => {
    await prisma.membership.deleteMany({
      where: { schoolId: schoolA.schoolId },
    });
    await prisma.user.update({
      where: { id: schoolA.userId },
      data: {
        status: UserStatus.ACTIVE,
        deletedAt: null,
        userType: UserType.PARENT,
      },
    });
    await prisma.school.update({
      where: { id: schoolA.schoolId },
      data: { status: SchoolStatus.ACTIVE },
    });
    await prisma.appDeviceToken.updateMany({
      where: { schoolId: schoolA.schoolId },
      data: { isActive: false },
    });
  });

  afterAll(async () => {
    const schoolIds = tenants.map((tenant) => tenant.schoolId);
    try {
      await prisma.communicationNotificationPushAttempt.deleteMany({
        where: { schoolId: { in: schoolIds } },
      });
      await prisma.communicationNotificationDelivery.deleteMany({
        where: { schoolId: { in: schoolIds } },
      });
      await prisma.communicationNotification.deleteMany({
        where: { schoolId: { in: schoolIds } },
      });
      await prisma.appDeviceToken.deleteMany({
        where: { schoolId: { in: schoolIds } },
      });
      await prisma.membership.deleteMany({
        where: { schoolId: { in: schoolIds } },
      });
      await prisma.role.deleteMany({ where: { schoolId: { in: schoolIds } } });
      await prisma.school.deleteMany({ where: { id: { in: schoolIds } } });
      await prisma.user.deleteMany({
        where: { id: { in: tenants.map((tenant) => tenant.userId) } },
      });
      await prisma.organization.deleteMany({
        where: { id: { in: tenants.map((tenant) => tenant.organizationId) } },
      });
    } finally {
      await prisma.$disconnect();
    }
  });

  it.each(['user', 'school', 'membership-ended', 'membership-inactive'])(
    'G11 rejects current %s ineligibility before direct processing with zero Firebase calls',
    async (change) => {
      const pair = await createPair(schoolA);
      if (change.startsWith('membership')) {
        await prisma.user.update({
          where: { id: schoolA.userId },
          data: { userType: UserType.TEACHER },
        });
        const membership = await prisma.membership.create({
          data: {
            userId: schoolA.userId,
            schoolId: schoolA.schoolId,
            organizationId: schoolA.organizationId,
            roleId,
            userType: UserType.TEACHER,
          },
        });
        await prisma.appDeviceToken.update({
          where: { id: pair.deviceTokenId },
          data: { appSurface: AppDeviceTokenSurface.TEACHER },
        });
        const delivery =
          await prisma.communicationNotificationDelivery.findUniqueOrThrow({
            where: { id: pair.deliveryId },
          });
        await prisma.communicationNotification.update({
          where: { id: delivery.notificationId },
          data: {
            sourceModule: CommunicationNotificationSourceModule.ACADEMICS,
            sourceType: 'academic_content_approval',
            type: CommunicationNotificationType.ACADEMIC_CONTENT_APPROVED,
          },
        });
        await prisma.membership.update({
          where: { id: membership.id },
          data:
            change === 'membership-ended'
              ? { endedAt: new Date() }
              : { status: MembershipStatus.INACTIVE, endedAt: new Date() },
        });
      } else if (change === 'user')
        await prisma.user.update({
          where: { id: schoolA.userId },
          data: { status: UserStatus.DISABLED },
        });
      else
        await prisma.school.update({
          where: { id: schoolA.schoolId },
          data: { status: SchoolStatus.SUSPENDED },
        });
      const sendBatch = jest.fn().mockResolvedValue(sent());
      await scoped(() =>
        processor(sendBatch).processDelivery({
          schoolId: schoolA.schoolId,
          deliveryId: pair.deliveryId,
        }),
      );
      expect(sendBatch).not.toHaveBeenCalled();
      expect(
        await prisma.communicationNotificationDelivery.findUniqueOrThrow({
          where: { id: pair.deliveryId },
        }),
      ).toMatchObject({
        status: DeliveryStatus.FAILED,
        errorCode:
          change === 'school'
            ? 'push/tenant-ineligible'
            : 'push/recipient-ineligible',
      });
    },
  );

  it('G11 sends an eligible Teacher review only to its Teacher token without an allocation', async () => {
    const pair = await createPair(schoolA);
    await prisma.user.update({
      where: { id: schoolA.userId },
      data: { userType: UserType.TEACHER },
    });
    await prisma.membership.create({
      data: {
        userId: schoolA.userId,
        schoolId: schoolA.schoolId,
        organizationId: schoolA.organizationId,
        roleId,
        userType: UserType.TEACHER,
      },
    });
    await prisma.appDeviceToken.update({
      where: { id: pair.deviceTokenId },
      data: { appSurface: AppDeviceTokenSurface.TEACHER },
    });
    const other = await createPair(schoolA);
    const delivery =
      await prisma.communicationNotificationDelivery.findUniqueOrThrow({
        where: { id: pair.deliveryId },
      });
    await prisma.communicationNotification.update({
      where: { id: delivery.notificationId },
      data: {
        sourceModule: CommunicationNotificationSourceModule.ACADEMICS,
        sourceType: 'academic_content_approval',
        type: CommunicationNotificationType.ACADEMIC_CONTENT_CHANGES_REQUESTED,
      },
    });
    const sendBatch = jest.fn().mockResolvedValue(sent());
    expect(
      await scoped(() =>
        processor(sendBatch).processDelivery({
          schoolId: schoolA.schoolId,
          deliveryId: pair.deliveryId,
        }),
      ),
    ).toMatchObject({ status: 'sent', sentCount: 1 });
    expect(sendBatch).toHaveBeenCalledTimes(1);
    expect(sendBatch).toHaveBeenCalledWith(
      expect.objectContaining({ tokens: ['synthetic-provider-token'] }),
    );
    expect(
      await prisma.communicationNotificationPushAttempt.findMany({
        where: { deliveryId: pair.deliveryId },
      }),
    ).toEqual([
      expect.objectContaining({
        deviceTokenId: pair.deviceTokenId,
        status: DeliveryStatus.SENT,
      }),
    ]);
    expect(
      await prisma.communicationNotificationPushAttempt.count({
        where: {
          deliveryId: pair.deliveryId,
          deviceTokenId: other.deviceTokenId,
        },
      }),
    ).toBe(0);
  });

  it.each([
    { status: DeliveryStatus.SENT, errorCode: null },
    { status: DeliveryStatus.SKIPPED, errorCode: 'push/dry-run' },
    { status: DeliveryStatus.FAILED, errorCode: 'push/recipient-ineligible' },
    {
      status: DeliveryStatus.FAILED,
      errorCode: 'push/recovery-window-expired',
    },
    {
      status: DeliveryStatus.FAILED,
      errorCode: 'fcm/invalid-registration-token',
    },
  ])(
    'G11 never resends or reopens persisted terminal $status / $errorCode',
    async (state) => {
      const pair = await createPair(schoolA);
      await repository.ensurePendingAttempts({
        ...pair,
        schoolId: schoolA.schoolId,
        deviceTokenIds: [pair.deviceTokenId],
      });
      await prisma.communicationNotificationPushAttempt.updateMany({
        where: pair,
        data: state,
      });
      const before =
        await prisma.communicationNotificationPushAttempt.findFirstOrThrow({
          where: pair,
        });
      await repository.recordAttemptResult({
        ...pair,
        schoolId: schoolA.schoolId,
        status: DeliveryStatus.SENT,
        attemptedAt: new Date(),
      });
      expect(
        await prisma.communicationNotificationPushAttempt.findFirstOrThrow({
          where: pair,
        }),
      ).toEqual(before);
      await prisma.communicationNotificationDelivery.update({
        where: { id: pair.deliveryId },
        data: state,
      });
      const beforeDelivery =
        await prisma.communicationNotificationDelivery.findUniqueOrThrow({
          where: { id: pair.deliveryId },
        });
      const sendBatch = jest.fn().mockResolvedValue(sent());
      await scoped(() =>
        processor(sendBatch).processDelivery({
          schoolId: schoolA.schoolId,
          deliveryId: pair.deliveryId,
        }),
      );
      await repository.updateDeliveryStatus({
        schoolId: schoolA.schoolId,
        deliveryId: pair.deliveryId,
        status: DeliveryStatus.PENDING,
        attemptedAt: new Date(),
      });
      await repository.ensurePendingAttempts({
        schoolId: schoolA.schoolId,
        deliveryId: pair.deliveryId,
        deviceTokenIds: [(await createPair(schoolA)).deviceTokenId],
      });
      expect(sendBatch).not.toHaveBeenCalled();
      expect(
        await prisma.communicationNotificationDelivery.findUniqueOrThrow({
          where: { id: pair.deliveryId },
        }),
      ).toEqual(beforeDelivery);
      expect(
        await prisma.communicationNotificationPushAttempt.findMany({
          where: { deliveryId: pair.deliveryId },
        }),
      ).toEqual([before]);
    },
  );

  it('G11 preserves a terminal winner while a real worker waits for its external provider result', async () => {
    const pair = await createPair(schoolA);
    let entered = () => {},
      release = () => {};
    const dispatch = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const resultGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const sendBatch = jest.fn(async () => {
      entered();
      await resultGate;
      return sent();
    });
    const processing = scoped(() =>
      processor(sendBatch).processDelivery({
        schoolId: schoolA.schoolId,
        deliveryId: pair.deliveryId,
      }),
    );
    await dispatch;
    let terminalDelivery, terminalAttempt;
    try {
      await scoped(() =>
        processor(jest.fn()).terminalizeRecovery({
          schoolId: schoolA.schoolId,
          deliveryId: pair.deliveryId,
          errorCode: 'push/recipient-ineligible',
          errorMessage: 'Synthetic current ineligibility',
        }),
      );
      terminalDelivery =
        await prisma.communicationNotificationDelivery.findUniqueOrThrow({
          where: { id: pair.deliveryId },
        });
      terminalAttempt =
        await prisma.communicationNotificationPushAttempt.findFirstOrThrow({
          where: pair,
        });
    } finally {
      release();
    }
    expect(await processing).toMatchObject({ status: 'failed', sentCount: 0 });
    expect(
      await prisma.communicationNotificationDelivery.findUniqueOrThrow({
        where: { id: pair.deliveryId },
      }),
    ).toEqual(terminalDelivery);
    expect(
      await prisma.communicationNotificationPushAttempt.findFirstOrThrow({
        where: pair,
      }),
    ).toEqual(terminalAttempt);
  });

  it('G11 reselects unresolved tokens when another worker records success during token preparation', async () => {
    const pair = await createPair(schoolA);
    const secondPair = await createPair(schoolA);
    const list = repository.listAttemptsForDelivery.bind(
      repository,
    ) as CommunicationNotificationPushRepository['listAttemptsForDelivery'];
    let scans = 0;
    const spy = jest
      .spyOn(repository, 'listAttemptsForDelivery')
      .mockImplementation(async (deliveryId) => {
        if (++scans === 2)
          await repository.recordAttemptResult({
            ...pair,
            schoolId: schoolA.schoolId,
            status: DeliveryStatus.SENT,
            providerMessageId: 'known-success-before-dispatch',
            attemptedAt: new Date(),
            sentAt: new Date(),
          });
        return list(deliveryId);
      });
    const sendBatch = jest.fn().mockResolvedValue(sent());
    try {
      expect(
        await scoped(() =>
          processor(sendBatch).processDelivery({
            schoolId: schoolA.schoolId,
            deliveryId: pair.deliveryId,
          }),
        ),
      ).toMatchObject({ status: 'sent', sentCount: 2 });
      expect(sendBatch).toHaveBeenCalledWith(
        expect.objectContaining({ tokens: ['synthetic-provider-token'] }),
      );
      expect(
        await prisma.communicationNotificationPushAttempt.findFirstOrThrow({
          where: pair,
        }),
      ).toMatchObject({
        status: DeliveryStatus.SENT,
        providerMessageId: 'known-success-before-dispatch',
      });
      expect(
        await prisma.communicationNotificationPushAttempt.findFirstOrThrow({
          where: {
            deliveryId: pair.deliveryId,
            deviceTokenId: secondPair.deviceTokenId,
          },
        }),
      ).toMatchObject({
        status: DeliveryStatus.SENT,
        providerMessageId: 'synthetic-message',
      });
    } finally {
      spy.mockRestore();
    }
  });

  it('rejects a foreign School final write and preserves every existing attempt field', async () => {
    const pair = await createPair(schoolA);
    const before = await prisma.communicationNotificationPushAttempt.create({
      data: {
        ...pair,
        schoolId: schoolA.schoolId,
        status: DeliveryStatus.SKIPPED,
        provider: 'previous-provider',
        providerMessageId: 'previous-message',
        errorCode: 'previous-code',
        errorMessage: 'Previous error',
        attemptedAt: firstAttemptAt,
        sentAt: firstAttemptAt,
        failedAt: firstAttemptAt,
        skippedAt: firstAttemptAt,
        updatedAt: firstAttemptAt,
      },
    });

    // No ambient School context: the final write must enforce its explicit School.
    let operationRejected = false;
    try {
      await repository.recordAttemptResult({
        ...pair,
        schoolId: schoolB.schoolId,
        status: DeliveryStatus.SENT,
        providerMessageId: 'foreign-message',
        errorCode: 'foreign-code',
        errorMessage: 'Foreign mutation',
        attemptedAt: retryAt,
        sentAt: retryAt,
        failedAt: retryAt,
        skippedAt: retryAt,
      });
    } catch {
      operationRejected = true;
    }

    const after = await prisma.communicationNotificationPushAttempt.findUnique({
      where: { id: before.id },
    });
    expect({
      operationRejected,
      attempt: after,
      pairRowCount: await prisma.communicationNotificationPushAttempt.count({
        where: pair,
      }),
      foreignSchoolRowCount:
        await prisma.communicationNotificationPushAttempt.count({
          where: { schoolId: schoolB.schoolId },
        }),
    }).toEqual({
      operationRejected: true,
      attempt: before,
      pairRowCount: 1,
      foreignSchoolRowCount: 0,
    });
  });

  it('creates a same-School attempt and updates the same row on retry', async () => {
    const pair = await createPair(schoolA);
    const identity = { ...pair, schoolId: schoolA.schoolId };
    const firstResult = {
      status: DeliveryStatus.FAILED,
      providerMessageId: 'first-message',
      errorCode: 'fcm/unavailable',
      errorMessage: 'Synthetic retryable failure',
      attemptedAt: firstAttemptAt,
      sentAt: null,
      failedAt: firstAttemptAt,
      skippedAt: null,
    };
    expect(
      await prisma.communicationNotificationPushAttempt.count({ where: pair }),
    ).toBe(0);
    await repository.recordAttemptResult({ ...identity, ...firstResult });
    const created =
      await prisma.communicationNotificationPushAttempt.findUniqueOrThrow({
        where: { deliveryId_deviceTokenId: pair },
      });
    expect(created).toMatchObject({
      ...identity,
      ...firstResult,
      provider: COMMUNICATION_PUSH_NOTIFICATION_PROVIDER,
    });
    expect(
      await prisma.communicationNotificationPushAttempt.count({ where: pair }),
    ).toBe(1);

    await repository.recordAttemptResult({
      ...identity,
      status: DeliveryStatus.SENT,
      providerMessageId: 'retry-message',
      attemptedAt: retryAt,
      sentAt: retryAt,
    });
    const updated =
      await prisma.communicationNotificationPushAttempt.findUniqueOrThrow({
        where: { deliveryId_deviceTokenId: pair },
      });
    expect(updated).toMatchObject({
      ...identity,
      id: created.id,
      createdAt: created.createdAt,
      status: DeliveryStatus.SENT,
      provider: COMMUNICATION_PUSH_NOTIFICATION_PROVIDER,
      providerMessageId: 'retry-message',
      errorCode: null,
      errorMessage: null,
      attemptedAt: retryAt,
      sentAt: retryAt,
      failedAt: null,
      skippedAt: null,
    });
    expect(
      await prisma.communicationNotificationPushAttempt.count({ where: pair }),
    ).toBe(1);
  });
});
