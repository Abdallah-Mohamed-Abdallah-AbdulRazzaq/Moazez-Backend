import {
  CommunicationNotificationDeliveryChannel,
  CommunicationNotificationDeliveryStatus,
  CommunicationNotificationPriority,
  CommunicationNotificationSourceModule,
  CommunicationNotificationStatus,
  CommunicationNotificationType,
} from '@prisma/client';
import {
  CommunicationNotificationDetailRecord,
  CommunicationNotificationListRecord,
} from '../infrastructure/communication-notification.repository';
import {
  presentCommunicationAppNotificationDetail,
  presentCommunicationAppNotificationList,
  presentCommunicationAppNotificationReadAllResult,
  presentCommunicationRealtimeNotification,
} from '../presenters/communication-app-notification.presenter';

describe('communication app notification presenter', () => {
  it('presents dual-alias app list cards with summary and safe announcement deep links', () => {
    const presented = presentCommunicationAppNotificationList({
      result: {
        items: [
          notificationListRecord({
            sourceModule: CommunicationNotificationSourceModule.ANNOUNCEMENTS,
            type: CommunicationNotificationType.ANNOUNCEMENT_PUBLISHED,
            sourceId: 'announcement-1',
          }),
        ],
        total: 1,
        limit: 20,
        page: 1,
      },
      unreadCount: 5,
      options: { aliasStyle: 'dual' },
    });
    const json = JSON.stringify(presented);

    expect(presented).toMatchObject({
      notifications: [
        {
          notificationId: 'notification-1',
          notification_id: 'notification-1',
          type: 'announcement_published',
          sourceModule: 'announcements',
          source_module: 'announcements',
          sourceId: 'announcement-1',
          source_id: 'announcement-1',
          priority: 'normal',
          status: 'unread',
          deepLink: {
            type: 'announcement',
            announcementId: 'announcement-1',
          },
          deep_link: {
            type: 'announcement',
            announcementId: 'announcement-1',
          },
        },
      ],
      pagination: { page: 1, limit: 20, total: 1 },
      summary: { unreadCount: 5, unread_count: 5 },
    });
    expect(json).not.toContain('schoolId');
    expect(json).not.toContain('recipientUserId');
    expect(json).not.toContain('actorUserId');
    expect(json).not.toContain('deliveries');
    expect(json).not.toContain('metadata');
  });

  it('presents camel-only realtime payloads without app aliases or internal fields', () => {
    const presented = presentCommunicationRealtimeNotification(
      notificationListRecord({
        sourceType: 'communication_message',
        sourceId: 'message-1',
        status: CommunicationNotificationStatus.READ,
        readAt: new Date('2026-05-03T10:00:00.000Z'),
        metadata: {
          conversationId: 'conversation-1',
          messageId: 'message-1',
        },
      }),
    );
    const json = JSON.stringify(presented);

    expect(presented).toMatchObject({
      notificationId: 'notification-1',
      type: 'message_received',
      sourceModule: 'communication',
      sourceId: 'message-1',
      status: 'read',
      readAt: '2026-05-03T10:00:00.000Z',
      archivedAt: null,
      createdAt: '2026-05-03T08:00:00.000Z',
      deepLink: {
        type: 'conversation_message',
        conversationId: 'conversation-1',
        messageId: 'message-1',
      },
    });
    expect(json).not.toContain('notification_id');
    expect(json).not.toContain('recipientUserId');
    expect(json).not.toContain('schoolId');
    expect(json).not.toContain('deliveries');
    expect(json).not.toContain('metadata');
  });

  it('presents safe notification groups with dual aliases only when requested', () => {
    const dual = presentCommunicationAppNotificationList({
      result: {
        items: [],
        total: 10,
        limit: 5,
        page: 1,
      },
      unreadCount: 3,
      groups: [
        {
          key: 'message_received',
          label: 'Messages',
          count: 5,
          unreadCount: 2,
        },
      ],
      options: { aliasStyle: 'dual' },
    });
    const camel = presentCommunicationAppNotificationList({
      result: {
        items: [],
        total: 10,
        limit: 5,
        page: 1,
      },
      unreadCount: 3,
      groups: [
        {
          key: 'announcement',
          label: 'Announcements',
          count: 5,
          unreadCount: 1,
        },
      ],
      options: { aliasStyle: 'camel' },
    });
    const withoutGroups = presentCommunicationAppNotificationList({
      result: {
        items: [],
        total: 10,
        limit: 5,
        page: 1,
      },
      unreadCount: 3,
      options: { aliasStyle: 'dual' },
    });

    expect(dual.groups).toEqual([
      {
        key: 'message_received',
        label: 'Messages',
        count: 5,
        unreadCount: 2,
        unread_count: 2,
      },
    ]);
    expect(camel.groups).toEqual([
      {
        key: 'announcement',
        label: 'Announcements',
        count: 5,
        unreadCount: 1,
      },
    ]);
    expect(camel.groups?.[0]).not.toHaveProperty('unread_count');
    expect(withoutGroups).not.toHaveProperty('groups');
    expect(JSON.stringify(dual.groups)).not.toContain('recipientUserId');
    expect(JSON.stringify(dual.groups)).not.toContain('schoolId');
  });

  it('uses the same safe contract for detail and read-all responses', () => {
    expect(
      presentCommunicationAppNotificationDetail({
        notification: notificationRecord(),
        options: { aliasStyle: 'dual' },
      }),
    ).toMatchObject({
      notification: {
        notificationId: 'notification-1',
        notification_id: 'notification-1',
      },
    });

    expect(
      presentCommunicationAppNotificationReadAllResult(
        {
          markedCount: 3,
          readAt: new Date('2026-05-03T11:00:00.000Z'),
        },
        { aliasStyle: 'dual' },
      ),
    ).toEqual({
      markedCount: 3,
      marked_count: 3,
      readAt: '2026-05-03T11:00:00.000Z',
      read_at: '2026-05-03T11:00:00.000Z',
    });
  });
});

function notificationListRecord(
  overrides?: Partial<CommunicationNotificationListRecord>,
): CommunicationNotificationListRecord {
  return {
    id: 'notification-1',
    schoolId: 'school-1',
    recipientUserId: 'recipient-1',
    actorUserId: 'actor-1',
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
    metadata: null,
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
    deliveries: [
      {
        id: 'delivery-1',
        schoolId: 'school-1',
        notificationId: 'notification-1',
        channel: CommunicationNotificationDeliveryChannel.IN_APP,
        status: CommunicationNotificationDeliveryStatus.DELIVERED,
        provider: 'in-app',
        providerMessageId: null,
        errorCode: null,
        errorMessage: null,
        attemptedAt: new Date('2026-05-03T08:01:00.000Z'),
        sentAt: null,
        deliveredAt: new Date('2026-05-03T08:02:00.000Z'),
        failedAt: null,
        createdAt: new Date('2026-05-03T08:00:00.000Z'),
        updatedAt: new Date('2026-05-03T08:30:00.000Z'),
      },
    ],
    ...(overrides ?? {}),
  };
}
