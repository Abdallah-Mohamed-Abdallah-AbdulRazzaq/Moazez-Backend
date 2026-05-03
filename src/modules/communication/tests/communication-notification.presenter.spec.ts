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
  presentCommunicationNotification,
  presentCommunicationNotificationList,
  presentCommunicationNotificationReadAllResult,
} from '../presenters/communication-notification.presenter';

describe('communication notification presenter', () => {
  it('maps enum values to lowercase and never exposes schoolId', () => {
    const presented = presentCommunicationNotification(
      notificationRecord({
        status: CommunicationNotificationStatus.READ,
        priority: CommunicationNotificationPriority.HIGH,
        sourceModule: CommunicationNotificationSourceModule.ANNOUNCEMENTS,
        type: CommunicationNotificationType.ANNOUNCEMENT_PUBLISHED,
      }),
    );
    const json = JSON.stringify(presented);

    expect(presented.status).toBe('read');
    expect(presented.priority).toBe('high');
    expect(presented.sourceModule).toBe('announcements');
    expect(presented.type).toBe('announcement_published');
    expect(presented.message).toBe('Notification body');
    expect(json).not.toContain('schoolId');
    expect(json).not.toContain('school-1');
  });

  it('presents list pagination without internal fields', () => {
    const list = presentCommunicationNotificationList({
      items: [notificationListRecord()],
      total: 1,
      limit: 50,
      page: 1,
    });
    const json = JSON.stringify(list);

    expect(list).toMatchObject({
      total: 1,
      limit: 50,
      page: 1,
      items: [
        {
          id: 'notification-1',
          body: 'Notification body',
          status: 'unread',
        },
      ],
    });
    expect(json).not.toContain('schoolId');
    expect(json).not.toContain('metadata');
    expect(json).not.toContain('templateId');
  });

  it('summarizes delivery status and read-all results compactly', () => {
    const detail = presentCommunicationNotification(
      notificationRecord({
        deliveries: [
          deliveryRecord({
            id: 'delivery-1',
            status: CommunicationNotificationDeliveryStatus.PENDING,
          }),
          deliveryRecord({
            id: 'delivery-2',
            status: CommunicationNotificationDeliveryStatus.DELIVERED,
          }),
        ],
      }),
    );

    expect(detail.deliverySummary).toEqual({
      total: 2,
      pending: 1,
      sent: 0,
      delivered: 1,
      failed: 0,
      skipped: 0,
    });
    expect(
      presentCommunicationNotificationReadAllResult({
        markedCount: 3,
        readAt: new Date('2026-05-03T10:00:00.000Z'),
      }),
    ).toEqual({
      markedCount: 3,
      readAt: '2026-05-03T10:00:00.000Z',
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

function deliveryRecord(
  overrides?: Partial<CommunicationNotificationDetailRecord['deliveries'][number]>,
): CommunicationNotificationDetailRecord['deliveries'][number] {
  return {
    id: 'delivery-1',
    schoolId: 'school-1',
    notificationId: 'notification-1',
    channel: CommunicationNotificationDeliveryChannel.IN_APP,
    status: CommunicationNotificationDeliveryStatus.SENT,
    provider: 'in-app',
    providerMessageId: 'provider-1',
    errorCode: null,
    errorMessage: null,
    attemptedAt: null,
    sentAt: new Date('2026-05-03T08:05:00.000Z'),
    deliveredAt: null,
    failedAt: null,
    createdAt: new Date('2026-05-03T08:00:00.000Z'),
    updatedAt: new Date('2026-05-03T08:30:00.000Z'),
    ...(overrides ?? {}),
  };
}
