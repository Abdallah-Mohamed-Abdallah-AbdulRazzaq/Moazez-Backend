import {
  CommunicationNotificationSourceModule,
  CommunicationNotificationType,
  UserType,
} from '@prisma/client';
import { CommunicationNotificationPushPayloadBuilder } from '../application/communication-notification-push-payload.builder';

describe('CommunicationNotificationPushPayloadBuilder', () => {
  const builder = new CommunicationNotificationPushPayloadBuilder();

  it('builds a safe message notification FCM payload', () => {
    const payload = builder.build({
      id: 'notification-1',
      type: CommunicationNotificationType.MESSAGE_RECEIVED,
      sourceModule: CommunicationNotificationSourceModule.COMMUNICATION,
      sourceType: 'communication_message',
      sourceId: 'message-1',
      title: 'New message',
      body: 'Hello',
      metadata: {
        conversationId: 'conversation-1',
        messageId: 'message-1',
        schoolId: 'must-not-pass-through',
      },
    });

    expect(payload).toEqual({
      notification: {
        title: 'New message',
        body: 'Hello',
      },
      data: {
        notificationId: 'notification-1',
        type: 'message_received',
        sourceModule: 'communication',
        deepLinkType: 'conversation_message',
        conversationId: 'conversation-1',
        messageId: 'message-1',
      },
    });
    expect(payload.data).not.toHaveProperty('schoolId');
  });

  it('builds a safe announcement notification FCM payload', () => {
    const payload = builder.build({
      id: 'notification-1',
      type: CommunicationNotificationType.ANNOUNCEMENT_PUBLISHED,
      sourceModule: CommunicationNotificationSourceModule.ANNOUNCEMENTS,
      sourceType: 'communication_announcement',
      sourceId: 'announcement-1',
      title: 'Announcement',
      body: 'Body',
      metadata: {
        recipientUserId: 'must-not-pass-through',
      },
    });

    expect(payload).toEqual({
      notification: {
        title: 'Announcement',
        body: 'Body',
      },
      data: {
        notificationId: 'notification-1',
        type: 'announcement_published',
        sourceModule: 'announcements',
        deepLinkType: 'announcement',
        announcementId: 'announcement-1',
      },
    });
    expect(JSON.stringify(payload)).not.toContain('recipientUserId');
  });

  it('builds a safe dismissal staff notification FCM payload', () => {
    const payload = builder.build({
      id: 'notification-1',
      type: CommunicationNotificationType.DISMISSAL_REQUEST_CREATED,
      sourceModule: CommunicationNotificationSourceModule.DISMISSAL,
      sourceType: 'dismissal_request',
      sourceId: 'request-1',
      title: 'New pickup request',
      body: 'A pickup request was created.',
      metadata: {
        request: {
          id: 'request-1',
          status: 'requested',
          schoolId: 'must-not-pass-through',
        },
        pickupCode: 'must-not-pass-through',
      },
      recipientUser: {
        userType: UserType.DISMISSAL_STAFF,
      },
    });

    expect(payload).toEqual({
      notification: {
        title: 'New pickup request',
        body: 'A pickup request was created.',
      },
      data: {
        notificationId: 'notification-1',
        module: 'dismissal',
        surface: 'dismissal_staff',
        type: 'request_created',
        requestId: 'request-1',
        status: 'requested',
        screen: 'dismissal.notifications',
      },
    });
    expect(JSON.stringify(payload)).not.toContain('schoolId');
    expect(JSON.stringify(payload)).not.toContain('pickupCode');
  });
});
