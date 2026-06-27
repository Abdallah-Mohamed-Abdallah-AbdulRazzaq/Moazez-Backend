import { CommunicationNotificationDeliveryChannel } from '@prisma/client';
import { CommunicationNotificationInvalidException } from './communication-notification-domain';

export const COMMUNICATION_NOTIFICATION_IDEMPOTENCY_KEY_MAX_LENGTH = 200;

export type CommunicationNotificationCommandSkippedReason =
  | 'in_app_preference_disabled';

export function normalizeCommunicationNotificationIdempotencyKey(
  value?: string | null,
): string | null {
  if (value === null || typeof value === 'undefined') return null;

  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new CommunicationNotificationInvalidException(
      'Notification idempotency key cannot be empty',
      { field: 'idempotencyKey' },
    );
  }
  if (
    normalized.length >
    COMMUNICATION_NOTIFICATION_IDEMPOTENCY_KEY_MAX_LENGTH
  ) {
    throw new CommunicationNotificationInvalidException(
      'Notification idempotency key is too long',
      {
        field: 'idempotencyKey',
        maxLength: COMMUNICATION_NOTIFICATION_IDEMPOTENCY_KEY_MAX_LENGTH,
      },
    );
  }

  return normalized;
}

export function normalizeCommunicationNotificationDeliveryChannels(
  channels?: CommunicationNotificationDeliveryChannel[] | null,
): CommunicationNotificationDeliveryChannel[] {
  if (!channels || channels.length === 0) {
    return [CommunicationNotificationDeliveryChannel.IN_APP];
  }

  const normalized = [...new Set(channels)];
  for (const channel of normalized) {
    if (channel !== CommunicationNotificationDeliveryChannel.IN_APP) {
      throw new CommunicationNotificationInvalidException(
        'Reusable notification command currently supports in-app delivery only',
        { field: 'deliveryChannels', channel },
      );
    }
  }

  return normalized;
}
