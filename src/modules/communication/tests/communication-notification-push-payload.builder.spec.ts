import {
  CommunicationNotificationSourceModule,
  CommunicationNotificationType,
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
});
