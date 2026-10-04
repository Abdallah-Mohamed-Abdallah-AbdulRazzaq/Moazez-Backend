import { randomUUID } from 'node:crypto';
import {
  AppDeviceTokenPlatform,
  AppDeviceTokenSurface,
  CommunicationNotificationDeliveryChannel,
  CommunicationNotificationDeliveryStatus as DeliveryStatus,
  CommunicationNotificationSourceModule,
  CommunicationNotificationType,
  UserType,
} from '@prisma/client';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { COMMUNICATION_PUSH_NOTIFICATION_PROVIDER } from '../../src/modules/communication/domain/communication-notification-generation-domain';
import { CommunicationNotificationPushRepository } from '../../src/modules/communication/infrastructure/communication-notification-push.repository';

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
      errorCode: 'push/retryable',
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
