import {
  CommunicationNotificationPriority,
  CommunicationNotificationSourceModule,
  CommunicationNotificationStatus,
  CommunicationNotificationType,
} from '@prisma/client';
import { CommunicationAppNotificationCenterService } from '../application/communication-app-notification-center.service';
import {
  CommunicationNotificationDetailRecord,
  CommunicationNotificationListRecord,
  CommunicationNotificationRepository,
} from '../infrastructure/communication-notification.repository';

const ACTOR_ID = 'actor-1';
const OTHER_USER_ID = 'other-user-1';
const NOTIFICATION_ID = 'notification-1';

describe('CommunicationAppNotificationCenterService', () => {
  it('lists only the current actor notifications and ignores recipient override attempts', async () => {
    const repository = repositoryMock();

    const result = await new CommunicationAppNotificationCenterService(
      repository,
    ).listForActor({
      recipientUserId: ACTOR_ID,
      query: {
        status: 'unread',
        priority: 'normal',
        type: 'message_received',
        sourceModule: 'communication',
        recipientUserId: OTHER_USER_ID,
      } as any,
      aliasStyle: 'dual',
    });

    expect(result).toMatchObject({
      notifications: [{ notificationId: NOTIFICATION_ID }],
      pagination: { page: 1, limit: 20, total: 1 },
      summary: { unreadCount: 4, unread_count: 4 },
    });
    expect(repository.listCurrentSchoolNotifications).toHaveBeenCalledWith({
      filters: expect.objectContaining({
        recipientUserId: ACTOR_ID,
        status: CommunicationNotificationStatus.UNREAD,
        priority: CommunicationNotificationPriority.NORMAL,
        type: CommunicationNotificationType.MESSAGE_RECEIVED,
        sourceModule: CommunicationNotificationSourceModule.COMMUNICATION,
      }),
    });
    expect(repository.countCurrentSchoolNotifications).toHaveBeenCalledWith({
      filters: {
        recipientUserId: ACTOR_ID,
        status: CommunicationNotificationStatus.UNREAD,
      },
    });
  });

  it('returns a compact unread summary for the current actor', async () => {
    const repository = repositoryMock();

    const result = await new CommunicationAppNotificationCenterService(
      repository,
    ).summaryForActor({
      recipientUserId: ACTOR_ID,
      aliasStyle: 'camel',
    });

    expect(result).toEqual({ unreadCount: 4 });
  });

  it('gets, marks, archives, and marks all through actor-owned repository calls', async () => {
    const repository = repositoryMock();
    const service = new CommunicationAppNotificationCenterService(repository);

    await expect(
      service.getForActor({
        recipientUserId: ACTOR_ID,
        notificationId: NOTIFICATION_ID,
        aliasStyle: 'dual',
      }),
    ).resolves.toMatchObject({
      notification: { notificationId: NOTIFICATION_ID },
    });

    await service.markReadForActor({
      recipientUserId: ACTOR_ID,
      notificationId: NOTIFICATION_ID,
      aliasStyle: 'dual',
    });
    await service.archiveForActor({
      recipientUserId: ACTOR_ID,
      notificationId: NOTIFICATION_ID,
      aliasStyle: 'dual',
    });
    await service.markAllReadForActor({
      recipientUserId: ACTOR_ID,
      aliasStyle: 'dual',
    });

    expect(repository.markCurrentSchoolNotificationRead).toHaveBeenCalledWith(
      expect.objectContaining({
        notificationId: NOTIFICATION_ID,
        recipientUserId: ACTOR_ID,
      }),
    );
    expect(repository.archiveCurrentSchoolNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        notificationId: NOTIFICATION_ID,
        recipientUserId: ACTOR_ID,
      }),
    );
    expect(repository.markAllCurrentActorNotificationsRead).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientUserId: ACTOR_ID,
      }),
    );
  });

  it('blocks another recipient notification before read or archive mutation', async () => {
    const repository = repositoryMock({
      findCurrentSchoolNotificationById: jest
        .fn()
        .mockResolvedValue(notificationRecord({ recipientUserId: OTHER_USER_ID })),
    });
    const service = new CommunicationAppNotificationCenterService(repository);

    await expect(
      service.markReadForActor({
        recipientUserId: ACTOR_ID,
        notificationId: NOTIFICATION_ID,
        aliasStyle: 'dual',
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
    await expect(
      service.archiveForActor({
        recipientUserId: ACTOR_ID,
        notificationId: NOTIFICATION_ID,
        aliasStyle: 'dual',
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
    expect(repository.markCurrentSchoolNotificationRead).not.toHaveBeenCalled();
    expect(repository.archiveCurrentSchoolNotification).not.toHaveBeenCalled();
  });
});

function repositoryMock(
  overrides?: Record<string, unknown>,
): CommunicationNotificationRepository & Record<string, jest.Mock> {
  return {
    listCurrentSchoolNotifications: jest.fn().mockResolvedValue({
      items: [notificationListRecord()],
      total: 1,
      limit: 20,
      page: 1,
    }),
    countCurrentSchoolNotifications: jest.fn().mockResolvedValue(4),
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
      markedCount: 2,
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
    ...(overrides ?? {}),
  } as unknown as CommunicationNotificationRepository & Record<string, jest.Mock>;
}

function notificationListRecord(
  overrides?: Partial<CommunicationNotificationListRecord>,
): CommunicationNotificationListRecord {
  return {
    id: NOTIFICATION_ID,
    schoolId: 'school-1',
    recipientUserId: ACTOR_ID,
    actorUserId: null,
    sourceModule: CommunicationNotificationSourceModule.COMMUNICATION,
    sourceType: 'message',
    sourceId: 'source-1',
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
    deliveries: [],
    ...(overrides ?? {}),
  };
}
