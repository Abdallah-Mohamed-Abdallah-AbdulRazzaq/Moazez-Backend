import {
  assertCanArchiveNotification,
  assertCanMarkNotificationRead,
  assertCanViewDelivery,
  assertCanViewNotification,
  CommunicationNotificationForbiddenException,
  CommunicationNotificationStateException,
  normalizeCommunicationNotificationDeliveryChannel,
  normalizeCommunicationNotificationDeliveryStatus,
  normalizeCommunicationNotificationPriority,
  normalizeCommunicationNotificationSourceModule,
  normalizeCommunicationNotificationStatus,
  normalizeCommunicationNotificationType,
} from '../domain/communication-notification-domain';

describe('communication notification domain', () => {
  it('normalizes lowercase frontend enum values to Prisma-style values', () => {
    expect(normalizeCommunicationNotificationStatus('unread')).toBe('UNREAD');
    expect(normalizeCommunicationNotificationPriority('urgent')).toBe('URGENT');
    expect(normalizeCommunicationNotificationSourceModule('grades')).toBe(
      'GRADES',
    );
    expect(normalizeCommunicationNotificationType('message_received')).toBe(
      'MESSAGE_RECEIVED',
    );
    expect(normalizeCommunicationNotificationDeliveryChannel('in_app')).toBe(
      'IN_APP',
    );
    expect(normalizeCommunicationNotificationDeliveryStatus('delivered')).toBe(
      'DELIVERED',
    );
  });

  it('allows owners and manage actors to view notifications', () => {
    expect(() =>
      assertCanViewNotification({
        actorId: 'recipient-1',
        hasManagePermission: false,
        notification: notification({ recipientUserId: 'recipient-1' }),
      }),
    ).not.toThrow();

    expect(() =>
      assertCanViewNotification({
        actorId: 'admin-1',
        hasManagePermission: true,
        notification: notification({ recipientUserId: 'recipient-1' }),
      }),
    ).not.toThrow();

    expect(() =>
      assertCanViewNotification({
        actorId: 'other-1',
        hasManagePermission: false,
        notification: notification({ recipientUserId: 'recipient-1' }),
      }),
    ).toThrow(CommunicationNotificationForbiddenException);
  });

  it('keeps read and archive mutations recipient-owned', () => {
    expect(() =>
      assertCanMarkNotificationRead({
        actorId: 'recipient-1',
        notification: notification({ recipientUserId: 'recipient-1' }),
      }),
    ).not.toThrow();

    expect(() =>
      assertCanArchiveNotification({
        actorId: 'recipient-1',
        notification: notification({ recipientUserId: 'recipient-1' }),
      }),
    ).not.toThrow();

    expect(() =>
      assertCanMarkNotificationRead({
        actorId: 'admin-1',
        notification: notification({ recipientUserId: 'recipient-1' }),
      }),
    ).toThrow(CommunicationNotificationForbiddenException);

    expect(() =>
      assertCanArchiveNotification({
        actorId: 'admin-1',
        notification: notification({ recipientUserId: 'recipient-1' }),
      }),
    ).toThrow(CommunicationNotificationForbiddenException);
  });

  it('does not reopen archived notifications through read state', () => {
    expect(() =>
      assertCanMarkNotificationRead({
        actorId: 'recipient-1',
        notification: notification({
          recipientUserId: 'recipient-1',
          status: 'ARCHIVED',
        }),
      }),
    ).toThrow(CommunicationNotificationStateException);
  });

  it('requires manage permission for delivery inspection', () => {
    expect(() =>
      assertCanViewDelivery({ hasManagePermission: true }),
    ).not.toThrow();

    expect(() =>
      assertCanViewDelivery({ hasManagePermission: false }),
    ).toThrow(CommunicationNotificationForbiddenException);
  });
});

interface NotificationFixture {
  id: string;
  recipientUserId: string;
  status: 'UNREAD' | 'READ' | 'ARCHIVED';
  readAt: Date | null;
  archivedAt: Date | null;
  expiresAt: Date | null;
}

function notification(
  overrides?: Partial<NotificationFixture>,
): NotificationFixture {
  return {
    id: 'notification-1',
    recipientUserId: 'recipient-1',
    status: 'UNREAD' as const,
    readAt: null,
    archivedAt: null,
    expiresAt: null,
    ...(overrides ?? {}),
  };
}
