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
      notifications: [
        {
          notificationId: NOTIFICATION_ID,
          deepLink: {
            type: 'conversation_message',
            conversationId: 'conversation-1',
            messageId: 'message-1',
          },
          deep_link: {
            type: 'conversation_message',
            conversationId: 'conversation-1',
            messageId: 'message-1',
          },
        },
      ],
      pagination: { page: 1, limit: 20, total: 1 },
      summary: { unreadCount: 4, unread_count: 4 },
    });
    expect(JSON.stringify(result)).not.toContain('metadata');
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

  it('applies Phase B filters with exclusive createdTo and current-page grouping', async () => {
    const repository = repositoryMock({
      listCurrentSchoolNotifications: jest.fn().mockResolvedValue({
        items: [
          notificationListRecord({
            id: 'message-notification-1',
            type: CommunicationNotificationType.MESSAGE_RECEIVED,
            sourceModule: CommunicationNotificationSourceModule.COMMUNICATION,
            status: CommunicationNotificationStatus.UNREAD,
            createdAt: new Date('2026-06-21T23:30:00.000Z'),
          }),
          notificationListRecord({
            id: 'announcement-notification-1',
            type: CommunicationNotificationType.ANNOUNCEMENT_PUBLISHED,
            sourceModule: CommunicationNotificationSourceModule.ANNOUNCEMENTS,
            sourceId: 'announcement-1',
            status: CommunicationNotificationStatus.READ,
            readAt: new Date('2026-06-21T23:45:00.000Z'),
            createdAt: new Date('2026-06-21T23:45:00.000Z'),
          }),
        ],
        total: 25,
        limit: 2,
        page: 2,
      }),
    });

    const result = await new CommunicationAppNotificationCenterService(
      repository,
    ).listForActor({
      recipientUserId: ACTOR_ID,
      query: {
        createdFrom: '2026-06-21T00:00:00.000Z',
        createdTo: '2026-06-22T00:00:00.000Z',
        unreadOnly: 'false',
        category: 'announcement',
        type: 'announcement_published',
        sourceModule: 'announcements',
        groupBy: 'category',
        limit: 2,
        page: 2,
      },
      aliasStyle: 'dual',
    });

    expect(repository.listCurrentSchoolNotifications).toHaveBeenCalledWith({
      filters: expect.objectContaining({
        recipientUserId: ACTOR_ID,
        type: CommunicationNotificationType.ANNOUNCEMENT_PUBLISHED,
        sourceModule: CommunicationNotificationSourceModule.ANNOUNCEMENTS,
        createdFrom: new Date('2026-06-21T00:00:00.000Z'),
        createdToExclusive: new Date('2026-06-22T00:00:00.000Z'),
        limit: 2,
        page: 2,
      }),
    });
    expect(
      repository.listCurrentSchoolNotifications.mock.calls[0][0].filters,
    ).not.toHaveProperty('createdTo');
    expect(result.pagination).toEqual({ page: 2, limit: 2, total: 25 });
    expect(result.groups).toEqual([
      {
        key: 'message_received',
        label: 'Messages',
        count: 1,
        unreadCount: 1,
        unread_count: 1,
      },
      {
        key: 'announcement',
        label: 'Announcements',
        count: 1,
        unreadCount: 0,
        unread_count: 0,
      },
    ]);
    expect(JSON.stringify(result.groups)).not.toContain('recipientUserId');
    expect(JSON.stringify(result.groups)).not.toContain('schoolId');
  });

  it('maps category aliases without changing stored notification types', async () => {
    const repository = repositoryMock();
    const service = new CommunicationAppNotificationCenterService(repository);

    await service.listForActor({
      recipientUserId: ACTOR_ID,
      query: { category: 'message_received' },
      aliasStyle: 'camel',
    });
    await service.listForActor({
      recipientUserId: ACTOR_ID,
      query: { category: 'announcement_published' },
      aliasStyle: 'camel',
    });

    expect(repository.listCurrentSchoolNotifications).toHaveBeenNthCalledWith(
      1,
      {
        filters: expect.objectContaining({
          recipientUserId: ACTOR_ID,
          type: CommunicationNotificationType.MESSAGE_RECEIVED,
        }),
      },
    );
    expect(repository.listCurrentSchoolNotifications).toHaveBeenNthCalledWith(
      2,
      {
        filters: expect.objectContaining({
          recipientUserId: ACTOR_ID,
          type: CommunicationNotificationType.ANNOUNCEMENT_PUBLISHED,
        }),
      },
    );
  });

  it('uses unreadOnly=true as an unread status shortcut', async () => {
    const repository = repositoryMock();

    await new CommunicationAppNotificationCenterService(
      repository,
    ).listForActor({
      recipientUserId: ACTOR_ID,
      query: { unreadOnly: 'true', status: 'unread' },
      aliasStyle: 'camel',
    });

    expect(repository.listCurrentSchoolNotifications).toHaveBeenCalledWith({
      filters: expect.objectContaining({
        recipientUserId: ACTOR_ID,
        status: CommunicationNotificationStatus.UNREAD,
      }),
    });
  });

  it('groups by sourceModule and UTC day without internal fields', async () => {
    const repository = repositoryMock({
      listCurrentSchoolNotifications: jest.fn().mockResolvedValue({
        items: [
          notificationListRecord({
            id: 'message-notification-1',
            sourceModule: CommunicationNotificationSourceModule.COMMUNICATION,
            createdAt: new Date('2026-06-21T23:59:59.000Z'),
          }),
          notificationListRecord({
            id: 'announcement-notification-1',
            sourceModule: CommunicationNotificationSourceModule.ANNOUNCEMENTS,
            type: CommunicationNotificationType.ANNOUNCEMENT_PUBLISHED,
            createdAt: new Date('2026-06-22T00:00:00.000Z'),
          }),
        ],
        total: 2,
        limit: 20,
        page: 1,
      }),
    });
    const service = new CommunicationAppNotificationCenterService(repository);

    const sourceGroups = await service.listForActor({
      recipientUserId: ACTOR_ID,
      query: { groupBy: 'sourceModule' },
      aliasStyle: 'camel',
    });
    const dayGroups = await service.listForActor({
      recipientUserId: ACTOR_ID,
      query: { groupBy: 'day' },
      aliasStyle: 'camel',
    });

    expect(sourceGroups.groups).toEqual([
      {
        key: 'communication',
        label: 'Communication',
        count: 1,
        unreadCount: 1,
      },
      {
        key: 'announcements',
        label: 'Announcements',
        count: 1,
        unreadCount: 1,
      },
    ]);
    expect(dayGroups.groups).toEqual([
      { key: '2026-06-21', label: '2026-06-21', count: 1, unreadCount: 1 },
      { key: '2026-06-22', label: '2026-06-22', count: 1, unreadCount: 1 },
    ]);
    expect(JSON.stringify(sourceGroups.groups)).not.toContain('sourceId');
    expect(JSON.stringify(dayGroups.groups)).not.toContain('recipientUserId');
  });

  it('rejects invalid Phase B filter combinations before repository access', async () => {
    const repository = repositoryMock();
    const service = new CommunicationAppNotificationCenterService(repository);

    await expect(
      service.listForActor({
        recipientUserId: ACTOR_ID,
        query: {
          createdFrom: '2026-06-22T00:00:00.000Z',
          createdTo: '2026-06-22T00:00:00.000Z',
        },
        aliasStyle: 'camel',
      }),
    ).rejects.toMatchObject({ code: 'communication.scope.invalid' });
    await expect(
      service.listForActor({
        recipientUserId: ACTOR_ID,
        query: { unreadOnly: 'true', status: 'read' },
        aliasStyle: 'camel',
      }),
    ).rejects.toMatchObject({ code: 'communication.scope.invalid' });
    await expect(
      service.listForActor({
        recipientUserId: ACTOR_ID,
        query: {
          category: 'announcement',
          type: 'message_received',
        },
        aliasStyle: 'camel',
      }),
    ).rejects.toMatchObject({ code: 'communication.scope.invalid' });
    await expect(
      service.listForActor({
        recipientUserId: ACTOR_ID,
        query: { groupBy: 'recipientUserId' },
        aliasStyle: 'camel',
      }),
    ).rejects.toMatchObject({ code: 'communication.scope.invalid' });

    expect(repository.listCurrentSchoolNotifications).not.toHaveBeenCalled();
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
    expect(
      repository.markAllCurrentActorNotificationsRead,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientUserId: ACTOR_ID,
      }),
    );
  });

  it('blocks another recipient notification before read or archive mutation', async () => {
    const repository = repositoryMock({
      findCurrentSchoolNotificationById: jest
        .fn()
        .mockResolvedValue(
          notificationRecord({ recipientUserId: OTHER_USER_ID }),
        ),
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
    markCurrentSchoolNotificationRead: jest.fn().mockResolvedValue(
      notificationRecord({
        status: CommunicationNotificationStatus.READ,
        readAt: new Date('2026-05-03T09:00:00.000Z'),
      }),
    ),
    markAllCurrentActorNotificationsRead: jest.fn().mockResolvedValue({
      markedCount: 2,
      readAt: new Date('2026-05-03T10:00:00.000Z'),
    }),
    archiveCurrentSchoolNotification: jest.fn().mockResolvedValue(
      notificationRecord({
        status: CommunicationNotificationStatus.ARCHIVED,
        archivedAt: new Date('2026-05-03T11:00:00.000Z'),
      }),
    ),
    ...(overrides ?? {}),
  } as unknown as CommunicationNotificationRepository &
    Record<string, jest.Mock>;
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
    sourceType: 'communication_message',
    sourceId: 'message-1',
    type: CommunicationNotificationType.MESSAGE_RECEIVED,
    title: 'Notification title',
    body: 'Notification body',
    priority: CommunicationNotificationPriority.NORMAL,
    status: CommunicationNotificationStatus.UNREAD,
    readAt: null,
    archivedAt: null,
    expiresAt: null,
    metadata: {
      conversationId: 'conversation-1',
      messageId: 'message-1',
    },
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
