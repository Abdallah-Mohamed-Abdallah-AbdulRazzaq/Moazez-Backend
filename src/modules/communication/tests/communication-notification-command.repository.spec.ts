import {
  CommunicationNotificationDeliveryChannel,
  CommunicationNotificationDeliveryStatus,
  CommunicationNotificationPriority,
  CommunicationNotificationSourceModule,
  CommunicationNotificationStatus,
  CommunicationNotificationType,
} from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import {
  CommunicationNotificationCommandRecord,
  CommunicationNotificationCommandRepository,
} from '../infrastructure/communication-notification-command.repository';

describe('CommunicationNotificationCommandRepository', () => {
  it('creates one notification and in-app delivery for a new idempotency key', async () => {
    const tx = transactionMock({
      existingNotification: null,
      existingDeliveries: [],
    });
    const repository = repositoryWithTx(tx);

    const result = await repository.createOrReuseCurrentSchoolNotification(
      commandInput(),
    );

    expect(result).toEqual({
      notification: notificationRecord(),
      createdNotification: true,
      reusedExistingNotification: false,
      createdDeliveryCount: 1,
      existingDeliveryCount: 0,
    });
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.communicationNotification.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          schoolId: 'school-1',
          idempotencyKey: 'attendance:submit:entry-1:absent',
        },
      }),
    );
    expect(tx.communicationNotification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          schoolId: 'school-1',
          recipientUserId: 'guardian-user-1',
          sourceModule: CommunicationNotificationSourceModule.ATTENDANCE,
          sourceType: 'attendance_incident',
          sourceId: null,
          idempotencyKey: 'attendance:submit:entry-1:absent',
          type: CommunicationNotificationType.ATTENDANCE_ABSENCE,
          status: CommunicationNotificationStatus.UNREAD,
        }),
        select: expect.not.objectContaining({
          idempotencyKey: true,
        }),
      }),
    );
    expect(tx.communicationNotificationDelivery.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        schoolId: 'school-1',
        notificationId: 'notification-1',
        channel: CommunicationNotificationDeliveryChannel.IN_APP,
        status: CommunicationNotificationDeliveryStatus.DELIVERED,
        provider: 'in_app',
      }),
    });
  });

  it('reuses the same school and idempotency key without duplicating delivery rows', async () => {
    const tx = transactionMock({
      existingNotification: notificationRecord(),
      existingDeliveries: [{ id: 'delivery-1' }],
    });
    const repository = repositoryWithTx(tx);

    const result = await repository.createOrReuseCurrentSchoolNotification(
      commandInput(),
    );

    expect(result).toEqual({
      notification: notificationRecord(),
      createdNotification: false,
      reusedExistingNotification: true,
      createdDeliveryCount: 0,
      existingDeliveryCount: 1,
    });
    expect(tx.communicationNotification.create).not.toHaveBeenCalled();
    expect(tx.communicationNotificationDelivery.create).not.toHaveBeenCalled();
  });

  it('scopes the idempotency lookup by school so keys can be reused across schools', async () => {
    const tx = transactionMock({
      existingNotification: null,
      existingDeliveries: [],
    });
    const repository = repositoryWithTx(tx);

    await repository.createOrReuseCurrentSchoolNotification(
      commandInput({
        schoolId: 'school-2',
        idempotencyKey: 'attendance:submit:entry-1:absent',
      }),
    );

    expect(tx.communicationNotification.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          schoolId: 'school-2',
          idempotencyKey: 'attendance:submit:entry-1:absent',
        },
      }),
    );
    expect(tx.communicationNotification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          schoolId: 'school-2',
          idempotencyKey: 'attendance:submit:entry-1:absent',
        }),
      }),
    );
  });

  it('keeps null idempotency keys explicitly non-idempotent', async () => {
    const tx = transactionMock({
      existingNotification: null,
      existingDeliveries: [],
    });
    const repository = repositoryWithTx(tx);

    await repository.createOrReuseCurrentSchoolNotification(
      commandInput({ idempotencyKey: null }),
    );

    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(tx.communicationNotification.findFirst).not.toHaveBeenCalled();
    expect(tx.communicationNotification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          idempotencyKey: null,
        }),
      }),
    );
  });
});

function repositoryWithTx(
  tx: ReturnType<typeof transactionMock>,
): CommunicationNotificationCommandRepository {
  const scoped = {
    $transaction: jest.fn((callback) => callback(tx)),
  };

  return new CommunicationNotificationCommandRepository({
    scoped,
  } as unknown as PrismaService);
}

function transactionMock(input: {
  existingNotification: CommunicationNotificationCommandRecord | null;
  existingDeliveries: Array<{ id: string }>;
}) {
  return {
    $executeRaw: jest.fn().mockResolvedValue(0),
    communicationNotification: {
      findFirst: jest.fn().mockResolvedValue(input.existingNotification),
      create: jest.fn().mockResolvedValue(notificationRecord()),
    },
    communicationNotificationDelivery: {
      findMany: jest.fn().mockResolvedValue(input.existingDeliveries),
      create: jest.fn().mockResolvedValue({ id: 'delivery-1' }),
    },
  };
}

function commandInput(
  overrides?: Partial<
    Parameters<
      CommunicationNotificationCommandRepository['createOrReuseCurrentSchoolNotification']
    >[0]
  >,
): Parameters<
  CommunicationNotificationCommandRepository['createOrReuseCurrentSchoolNotification']
>[0] {
  return {
    schoolId: 'school-1',
    recipientUserId: 'guardian-user-1',
    actorUserId: null,
    sourceModule: CommunicationNotificationSourceModule.ATTENDANCE,
    sourceType: 'attendance_incident',
    sourceId: null,
    idempotencyKey: 'attendance:submit:entry-1:absent',
    type: CommunicationNotificationType.ATTENDANCE_ABSENCE,
    title: 'Attendance update',
    body: 'A student was marked absent.',
    priority: CommunicationNotificationPriority.NORMAL,
    expiresAt: null,
    metadata: null,
    deliveryChannels: [CommunicationNotificationDeliveryChannel.IN_APP],
    now: new Date('2026-06-27T09:00:00.000Z'),
    ...(overrides ?? {}),
  };
}

function notificationRecord(
  overrides?: Partial<CommunicationNotificationCommandRecord>,
): CommunicationNotificationCommandRecord {
  return {
    id: 'notification-1',
    schoolId: 'school-1',
    recipientUserId: 'guardian-user-1',
    actorUserId: null,
    sourceModule: CommunicationNotificationSourceModule.ATTENDANCE,
    sourceType: 'attendance_incident',
    sourceId: null,
    type: CommunicationNotificationType.ATTENDANCE_ABSENCE,
    title: 'Attendance update',
    body: 'A student was marked absent.',
    priority: CommunicationNotificationPriority.NORMAL,
    status: CommunicationNotificationStatus.UNREAD,
    readAt: null,
    archivedAt: null,
    expiresAt: null,
    metadata: null,
    createdAt: new Date('2026-06-27T09:00:00.000Z'),
    updatedAt: new Date('2026-06-27T09:00:00.000Z'),
    ...(overrides ?? {}),
  };
}
