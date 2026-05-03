import {
  CommunicationNotificationDeliveryChannel,
  CommunicationNotificationDeliveryStatus,
  CommunicationNotificationPriority,
  CommunicationNotificationSourceModule,
  CommunicationNotificationStatus,
  CommunicationNotificationType,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  RequestContext,
  runWithRequestContext,
} from '../../../common/context/request-context';
import {
  ArchiveCommunicationNotificationUseCase,
  GetCommunicationNotificationDeliveryUseCase,
  GetCommunicationNotificationUseCase,
  ListCommunicationNotificationDeliveriesUseCase,
  ListCommunicationNotificationsUseCase,
  MarkAllCommunicationNotificationsReadUseCase,
  MarkCommunicationNotificationReadUseCase,
} from '../application/communication-notification.use-cases';
import { CommunicationNotificationForbiddenException } from '../domain/communication-notification-domain';
import {
  CommunicationNotificationDeliveryRecord,
  CommunicationNotificationDetailRecord,
  CommunicationNotificationListRecord,
  CommunicationNotificationRepository,
} from '../infrastructure/communication-notification.repository';

const SCHOOL_ID = 'school-1';
const ORGANIZATION_ID = 'org-1';
const ACTOR_ID = 'actor-1';
const OTHER_USER_ID = 'other-user-1';
const NOTIFICATION_ID = 'notification-1';
const DELIVERY_ID = 'delivery-1';

describe('communication notification use cases', () => {
  it('normal viewers list only their own notifications and recipientUserId is ignored', async () => {
    const repository = repositoryMock();

    const result = await withScope(() =>
      new ListCommunicationNotificationsUseCase(repository).execute({
        recipientUserId: OTHER_USER_ID,
        status: 'unread',
      }),
    );

    expect(result.items[0]).toMatchObject({
      id: NOTIFICATION_ID,
      recipientUserId: ACTOR_ID,
      status: 'unread',
    });
    expect(repository.listCurrentSchoolNotifications).toHaveBeenCalledWith({
      filters: expect.objectContaining({
        recipientUserId: ACTOR_ID,
        status: CommunicationNotificationStatus.UNREAD,
      }),
    });
    expect(repository.createNotification).not.toHaveBeenCalled();
    expect(repository.enqueueJob).not.toHaveBeenCalled();
    expect(repository.emitRealtime).not.toHaveBeenCalled();
  });

  it('manage actors can filter by recipientUserId', async () => {
    const repository = repositoryMock();

    await withScope(
      () =>
        new ListCommunicationNotificationsUseCase(repository).execute({
          recipientUserId: OTHER_USER_ID,
          priority: 'urgent',
          type: 'message_received',
          sourceModule: 'communication',
        }),
      ['communication.notifications.manage'],
    );

    expect(repository.listCurrentSchoolNotifications).toHaveBeenCalledWith({
      filters: expect.objectContaining({
        recipientUserId: OTHER_USER_ID,
        priority: CommunicationNotificationPriority.URGENT,
        type: CommunicationNotificationType.MESSAGE_RECEIVED,
        sourceModule: CommunicationNotificationSourceModule.COMMUNICATION,
      }),
    });
  });

  it('viewer can get own notification but not another recipient notification', async () => {
    const repository = repositoryMock();

    const own = await withScope(() =>
      new GetCommunicationNotificationUseCase(repository).execute(
        NOTIFICATION_ID,
      ),
    );

    expect(own).toMatchObject({
      id: NOTIFICATION_ID,
      recipientUserId: ACTOR_ID,
    });

    const otherRepository = repositoryMock({
      findCurrentSchoolNotificationById: jest
        .fn()
        .mockResolvedValue(notificationRecord({ recipientUserId: OTHER_USER_ID })),
    });

    await expect(
      withScope(() =>
        new GetCommunicationNotificationUseCase(otherRepository).execute(
          NOTIFICATION_ID,
        ),
      ),
    ).rejects.toBeInstanceOf(CommunicationNotificationForbiddenException);
  });

  it('manage actor can inspect another recipient notification', async () => {
    const repository = repositoryMock({
      findCurrentSchoolNotificationById: jest
        .fn()
        .mockResolvedValue(notificationRecord({ recipientUserId: OTHER_USER_ID })),
    });

    const result = await withScope(
      () =>
        new GetCommunicationNotificationUseCase(repository).execute(
          NOTIFICATION_ID,
        ),
      ['communication.notifications.manage'],
    );

    expect(result).toMatchObject({
      id: NOTIFICATION_ID,
      recipientUserId: OTHER_USER_ID,
    });
  });

  it('mark read is recipient-owned, idempotent, and has no audit queue or realtime side effects', async () => {
    const repository = repositoryMock({
      findCurrentSchoolNotificationById: jest.fn().mockResolvedValue(
        notificationRecord({
          status: CommunicationNotificationStatus.READ,
          readAt: new Date('2026-05-03T09:00:00.000Z'),
        }),
      ),
      markCurrentSchoolNotificationRead: jest.fn().mockResolvedValue(
        notificationRecord({
          status: CommunicationNotificationStatus.READ,
          readAt: new Date('2026-05-03T09:00:00.000Z'),
        }),
      ),
    });

    const result = await withScope(() =>
      new MarkCommunicationNotificationReadUseCase(repository).execute(
        NOTIFICATION_ID,
      ),
    );

    expect(result).toMatchObject({
      id: NOTIFICATION_ID,
      status: 'read',
      readAt: '2026-05-03T09:00:00.000Z',
    });
    expect(repository.markCurrentSchoolNotificationRead).toHaveBeenCalledWith(
      expect.objectContaining({
        notificationId: NOTIFICATION_ID,
        recipientUserId: ACTOR_ID,
        readAt: expect.any(Date),
      }),
    );
    expect(repository.createAuditLog).not.toHaveBeenCalled();
    expect(repository.createNotification).not.toHaveBeenCalled();
    expect(repository.enqueueJob).not.toHaveBeenCalled();
    expect(repository.emitRealtime).not.toHaveBeenCalled();
  });

  it('manage permission does not let an admin mark another recipient notification read', async () => {
    const repository = repositoryMock({
      findCurrentSchoolNotificationById: jest
        .fn()
        .mockResolvedValue(notificationRecord({ recipientUserId: OTHER_USER_ID })),
    });

    await expect(
      withScope(
        () =>
          new MarkCommunicationNotificationReadUseCase(repository).execute(
            NOTIFICATION_ID,
          ),
        ['communication.notifications.manage'],
      ),
    ).rejects.toBeInstanceOf(CommunicationNotificationForbiddenException);
    expect(repository.markCurrentSchoolNotificationRead).not.toHaveBeenCalled();
  });

  it('mark all read is actor-owned and returns a compact summary', async () => {
    const repository = repositoryMock({
      markAllCurrentActorNotificationsRead: jest.fn().mockResolvedValue({
        markedCount: 2,
        readAt: new Date('2026-05-03T10:00:00.000Z'),
      }),
    });

    const result = await withScope(() =>
      new MarkAllCommunicationNotificationsReadUseCase(repository).execute(),
    );

    expect(result).toEqual({
      markedCount: 2,
      readAt: '2026-05-03T10:00:00.000Z',
    });
    expect(repository.markAllCurrentActorNotificationsRead).toHaveBeenCalledWith(
      {
        recipientUserId: ACTOR_ID,
        readAt: expect.any(Date),
      },
    );
    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });

  it('archive is recipient-owned and idempotent', async () => {
    const repository = repositoryMock({
      findCurrentSchoolNotificationById: jest.fn().mockResolvedValue(
        notificationRecord({
          status: CommunicationNotificationStatus.ARCHIVED,
          archivedAt: new Date('2026-05-03T11:00:00.000Z'),
        }),
      ),
      archiveCurrentSchoolNotification: jest.fn().mockResolvedValue(
        notificationRecord({
          status: CommunicationNotificationStatus.ARCHIVED,
          archivedAt: new Date('2026-05-03T11:00:00.000Z'),
        }),
      ),
    });

    const result = await withScope(() =>
      new ArchiveCommunicationNotificationUseCase(repository).execute(
        NOTIFICATION_ID,
      ),
    );

    expect(result).toMatchObject({
      id: NOTIFICATION_ID,
      status: 'archived',
      archivedAt: '2026-05-03T11:00:00.000Z',
    });
    expect(repository.archiveCurrentSchoolNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        notificationId: NOTIFICATION_ID,
        recipientUserId: ACTOR_ID,
        archivedAt: expect.any(Date),
      }),
    );
    expect(repository.createNotification).not.toHaveBeenCalled();
    expect(repository.enqueueJob).not.toHaveBeenCalled();
    expect(repository.emitRealtime).not.toHaveBeenCalled();
  });

  it('delivery list and detail require manage permission in the use-case path', async () => {
    const repository = repositoryMock();

    await expect(
      withScope(() =>
        new ListCommunicationNotificationDeliveriesUseCase(repository).execute(
          {},
        ),
      ),
    ).rejects.toBeInstanceOf(CommunicationNotificationForbiddenException);
    expect(
      repository.listCurrentSchoolNotificationDeliveries,
    ).not.toHaveBeenCalled();

    const list = await withScope(
      () =>
        new ListCommunicationNotificationDeliveriesUseCase(repository).execute({
          channel: 'in_app',
          status: 'sent',
          recipientUserId: ACTOR_ID,
        }),
      ['communication.notifications.manage'],
    );
    const detail = await withScope(
      () =>
        new GetCommunicationNotificationDeliveryUseCase(repository).execute(
          DELIVERY_ID,
        ),
      ['communication.notifications.manage'],
    );

    expect(list.items[0]).toMatchObject({
      id: DELIVERY_ID,
      channel: 'in_app',
      status: 'sent',
    });
    expect(detail).toMatchObject({ id: DELIVERY_ID });
    expect(repository.listCurrentSchoolNotificationDeliveries).toHaveBeenCalledWith(
      {
        filters: expect.objectContaining({
          channel: CommunicationNotificationDeliveryChannel.IN_APP,
          status: CommunicationNotificationDeliveryStatus.SENT,
          recipientUserId: ACTOR_ID,
        }),
      },
    );
    expect(repository.createNotification).not.toHaveBeenCalled();
    expect(repository.enqueueJob).not.toHaveBeenCalled();
    expect(repository.emitRealtime).not.toHaveBeenCalled();
  });
});

function repositoryMock(
  overrides?: Record<string, unknown>,
): CommunicationNotificationRepository & Record<string, jest.Mock> {
  return {
    listCurrentSchoolNotifications: jest.fn().mockResolvedValue({
      items: [notificationListRecord()],
      total: 1,
      limit: 50,
      page: 1,
    }),
    findCurrentSchoolNotificationById: jest
      .fn()
      .mockResolvedValue(notificationRecord()),
    markCurrentSchoolNotificationRead: jest
      .fn()
      .mockResolvedValue(
        notificationRecord({
          status: CommunicationNotificationStatus.READ,
          readAt: new Date('2026-05-03T09:00:00.000Z'),
        }),
      ),
    markAllCurrentActorNotificationsRead: jest.fn().mockResolvedValue({
      markedCount: 1,
      readAt: new Date('2026-05-03T10:00:00.000Z'),
    }),
    archiveCurrentSchoolNotification: jest
      .fn()
      .mockResolvedValue(
        notificationRecord({
          status: CommunicationNotificationStatus.ARCHIVED,
          archivedAt: new Date('2026-05-03T11:00:00.000Z'),
        }),
      ),
    listCurrentSchoolNotificationDeliveries: jest.fn().mockResolvedValue({
      items: [deliveryRecord()],
      total: 1,
      limit: 50,
      page: 1,
    }),
    findCurrentSchoolNotificationDeliveryById: jest
      .fn()
      .mockResolvedValue(deliveryRecord()),
    createAuditLog: jest.fn(),
    createNotification: jest.fn(),
    enqueueJob: jest.fn(),
    emitRealtime: jest.fn(),
    ...(overrides ?? {}),
  } as unknown as CommunicationNotificationRepository &
    Record<string, jest.Mock>;
}

function notificationListRecord(
  overrides?: Partial<CommunicationNotificationListRecord>,
): CommunicationNotificationListRecord {
  return {
    id: NOTIFICATION_ID,
    schoolId: SCHOOL_ID,
    recipientUserId: ACTOR_ID,
    actorUserId: null,
    sourceModule: CommunicationNotificationSourceModule.COMMUNICATION,
    sourceType: 'message',
    sourceId: null,
    type: CommunicationNotificationType.MESSAGE_RECEIVED,
    title: 'Notification title',
    body: 'Notification body',
    priority: CommunicationNotificationPriority.NORMAL,
    status: CommunicationNotificationStatus.UNREAD,
    readAt: null,
    archivedAt: null,
    expiresAt: null,
    createdAt: new Date('2026-05-03T08:00:00.000Z'),
    updatedAt: new Date('2026-05-03T08:30:00.000Z'),
    ...(overrides ?? {}),
  };
}

function notificationRecord(
  overrides?: Partial<CommunicationNotificationDetailRecord>,
): CommunicationNotificationDetailRecord {
  return {
    ...notificationListRecord(),
    deliveries: [deliveryRecord()],
    ...(overrides ?? {}),
  };
}

function deliveryRecord(
  overrides?: Partial<CommunicationNotificationDeliveryRecord>,
): CommunicationNotificationDeliveryRecord {
  return {
    id: DELIVERY_ID,
    schoolId: SCHOOL_ID,
    notificationId: NOTIFICATION_ID,
    channel: CommunicationNotificationDeliveryChannel.IN_APP,
    status: CommunicationNotificationDeliveryStatus.SENT,
    provider: 'in-app',
    providerMessageId: 'provider-1',
    errorCode: null,
    errorMessage: null,
    attemptedAt: new Date('2026-05-03T08:01:00.000Z'),
    sentAt: new Date('2026-05-03T08:02:00.000Z'),
    deliveredAt: null,
    failedAt: null,
    createdAt: new Date('2026-05-03T08:00:00.000Z'),
    updatedAt: new Date('2026-05-03T08:30:00.000Z'),
    ...(overrides ?? {}),
  };
}

function withScope<T>(fn: () => T, permissions: string[] = []): T {
  const context: RequestContext = {
    ...createRequestContext(),
    actor: {
      id: ACTOR_ID,
      userType: UserType.SCHOOL_USER,
    },
    activeMembership: {
      membershipId: 'membership-1',
      organizationId: ORGANIZATION_ID,
      schoolId: SCHOOL_ID,
      roleId: 'role-1',
      permissions,
    },
  };

  return runWithRequestContext(context, fn);
}
