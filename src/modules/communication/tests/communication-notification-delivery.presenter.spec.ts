import {
  CommunicationNotificationDeliveryChannel,
  CommunicationNotificationDeliveryStatus,
} from '@prisma/client';
import { CommunicationNotificationDeliveryRecord } from '../infrastructure/communication-notification.repository';
import {
  presentCommunicationNotificationDelivery,
  presentCommunicationNotificationDeliveryList,
} from '../presenters/communication-notification-delivery.presenter';

describe('communication notification delivery presenter', () => {
  it('maps enum values to lowercase and never exposes schoolId', () => {
    const presented = presentCommunicationNotificationDelivery(
      deliveryRecord({
        channel: CommunicationNotificationDeliveryChannel.PUSH,
        status: CommunicationNotificationDeliveryStatus.DELIVERED,
      }),
    );
    const json = JSON.stringify(presented);

    expect(presented.channel).toBe('push');
    expect(presented.status).toBe('delivered');
    expect(json).not.toContain('schoolId');
    expect(json).not.toContain('school-1');
  });

  it('sanitizes sensitive provider error messages and omits payload metadata', () => {
    const presented = presentCommunicationNotificationDelivery(
      deliveryRecord({
        errorMessage: 'Bearer token secret leaked by provider',
      }),
    );
    const json = JSON.stringify(presented);

    expect(presented.errorMessage).toBe('[redacted]');
    expect(json).not.toContain('Bearer token secret leaked by provider');
    expect(json).not.toContain('metadata');
    expect(json).not.toContain('providerPayload');
  });

  it('presents list pagination with safe delivery fields', () => {
    const list = presentCommunicationNotificationDeliveryList({
      items: [deliveryRecord()],
      total: 1,
      limit: 50,
      page: 1,
    });

    expect(list).toMatchObject({
      total: 1,
      limit: 50,
      page: 1,
      items: [
        {
          id: 'delivery-1',
          notificationId: 'notification-1',
          channel: 'in_app',
          status: 'sent',
        },
      ],
    });
  });
});

function deliveryRecord(
  overrides?: Partial<CommunicationNotificationDeliveryRecord>,
): CommunicationNotificationDeliveryRecord {
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
    attemptedAt: new Date('2026-05-03T08:01:00.000Z'),
    sentAt: new Date('2026-05-03T08:02:00.000Z'),
    deliveredAt: null,
    failedAt: null,
    createdAt: new Date('2026-05-03T08:00:00.000Z'),
    updatedAt: new Date('2026-05-03T08:30:00.000Z'),
    ...(overrides ?? {}),
  };
}
