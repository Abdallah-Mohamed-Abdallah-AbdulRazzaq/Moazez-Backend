import {
  CommunicationNotificationPriority,
  CommunicationNotificationSourceModule,
  CommunicationNotificationStatus,
  CommunicationNotificationType,
} from '@prisma/client';
import { REALTIME_SERVER_EVENTS } from '../../../infrastructure/realtime/realtime-event-names';
import { RealtimePublisherService } from '../../../infrastructure/realtime/realtime-publisher.service';
import { CommunicationRealtimeEventsService } from '../application/communication-realtime-events.service';
import { CommunicationGeneratedNotificationRecord } from '../infrastructure/communication-notification-generation.repository';

describe('CommunicationRealtimeEventsService', () => {
  it('publishes notification.created to the recipient user room only with safe payload', () => {
    const publisher = publisherMock();

    new CommunicationRealtimeEventsService(publisher).publishNotificationCreated(
      'school-1',
      generatedNotificationRecord(),
    );

    expect(publisher.publishToUser).toHaveBeenCalledWith(
      'school-1',
      'recipient-1',
      REALTIME_SERVER_EVENTS.COMMUNICATION_NOTIFICATION_CREATED,
      {
        notification: expect.objectContaining({
          notificationId: 'notification-1',
          type: 'announcement_published',
          sourceModule: 'announcements',
          sourceId: 'announcement-1',
          title: 'Announcement',
          body: 'Published announcement',
          priority: 'normal',
          status: 'unread',
          readAt: null,
          archivedAt: null,
          createdAt: '2026-05-03T08:00:00.000Z',
          deepLink: {
            type: 'announcement',
            announcementId: 'announcement-1',
          },
        }),
        eventAt: expect.any(String),
      },
    );
    expect(publisher.publishToSchool).not.toHaveBeenCalled();
    expect(publisher.publishToConversation).not.toHaveBeenCalled();

    const payload = publisher.publishToUser.mock.calls[0][3];
    const json = JSON.stringify(payload);
    expect(json).not.toContain('recipientUserId');
    expect(json).not.toContain('schoolId');
    expect(json).not.toContain('actorUserId');
    expect(json).not.toContain('metadata');
  });

  it('does not publish notification.created when required ids are missing', () => {
    const publisher = publisherMock();

    new CommunicationRealtimeEventsService(publisher).publishNotificationCreated(
      'school-1',
      generatedNotificationRecord({ recipientUserId: '' }),
    );

    expect(publisher.publishToUser).not.toHaveBeenCalled();
  });

  it('publishes message notification.created with a safe conversation message deep link', () => {
    const publisher = publisherMock();

    new CommunicationRealtimeEventsService(publisher).publishNotificationCreated(
      'school-1',
      generatedNotificationRecord({
        sourceModule: CommunicationNotificationSourceModule.COMMUNICATION,
        sourceType: 'communication_message',
        sourceId: 'message-1',
        type: CommunicationNotificationType.MESSAGE_RECEIVED,
        title: 'New message',
        body: 'Message preview',
        metadata: {
          conversationId: 'conversation-1',
          messageId: 'message-1',
        },
      }),
    );

    expect(publisher.publishToUser).toHaveBeenCalledWith(
      'school-1',
      'recipient-1',
      REALTIME_SERVER_EVENTS.COMMUNICATION_NOTIFICATION_CREATED,
      {
        notification: expect.objectContaining({
          notificationId: 'notification-1',
          type: 'message_received',
          sourceModule: 'communication',
          sourceId: 'message-1',
          title: 'New message',
          body: 'Message preview',
          deepLink: {
            type: 'conversation_message',
            conversationId: 'conversation-1',
            messageId: 'message-1',
          },
        }),
        eventAt: expect.any(String),
      },
    );
    expect(publisher.publishToSchool).not.toHaveBeenCalled();
    expect(publisher.publishToConversation).not.toHaveBeenCalled();

    const payload = publisher.publishToUser.mock.calls[0][3];
    expect(JSON.stringify(payload)).not.toContain('metadata');
  });
});

function publisherMock(): RealtimePublisherService & Record<string, jest.Mock> {
  return {
    publishToUser: jest.fn(),
    publishToSchool: jest.fn(),
    publishToConversation: jest.fn(),
  } as unknown as RealtimePublisherService & Record<string, jest.Mock>;
}

function generatedNotificationRecord(
  overrides?: Partial<CommunicationGeneratedNotificationRecord>,
): CommunicationGeneratedNotificationRecord {
  return {
    id: 'notification-1',
    schoolId: 'school-1',
    recipientUserId: 'recipient-1',
    actorUserId: 'actor-1',
    sourceModule: CommunicationNotificationSourceModule.ANNOUNCEMENTS,
    sourceType: 'announcement',
    sourceId: 'announcement-1',
    type: CommunicationNotificationType.ANNOUNCEMENT_PUBLISHED,
    title: 'Announcement',
    body: 'Published announcement',
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
