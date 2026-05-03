import {
  CommunicationNotificationDeliveryListResult,
  CommunicationNotificationDeliveryRecord,
} from '../infrastructure/communication-notification.repository';

export interface CommunicationNotificationDeliveryResponse {
  id: string;
  notificationId: string;
  channel: string;
  status: string;
  provider: string | null;
  providerMessageId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  attemptedAt: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  failedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function presentCommunicationNotificationDeliveryList(
  result: CommunicationNotificationDeliveryListResult,
) {
  return {
    items: result.items.map((delivery) =>
      presentCommunicationNotificationDelivery(delivery),
    ),
    total: result.total,
    limit: result.limit,
    page: result.page,
  };
}

export function presentCommunicationNotificationDelivery(
  delivery: CommunicationNotificationDeliveryRecord,
): CommunicationNotificationDeliveryResponse {
  return {
    id: delivery.id,
    notificationId: delivery.notificationId,
    channel: presentEnum(delivery.channel),
    status: presentEnum(delivery.status),
    provider: delivery.provider,
    providerMessageId: delivery.providerMessageId,
    errorCode: delivery.errorCode,
    errorMessage: sanitizeCommunicationNotificationDeliveryErrorMessage(
      delivery.errorMessage,
    ),
    attemptedAt: presentNullableDate(delivery.attemptedAt),
    sentAt: presentNullableDate(delivery.sentAt),
    deliveredAt: presentNullableDate(delivery.deliveredAt),
    failedAt: presentNullableDate(delivery.failedAt),
    createdAt: delivery.createdAt.toISOString(),
    updatedAt: delivery.updatedAt.toISOString(),
  };
}

export function sanitizeCommunicationNotificationDeliveryErrorMessage(
  value: string | null,
): string | null {
  if (!value) return null;

  if (
    /(authorization|bearer|token|secret|password|credential|api[_-]?key)/i.test(
      value,
    )
  ) {
    return '[redacted]';
  }

  return value.length > 500 ? `${value.slice(0, 497)}...` : value;
}

function presentEnum(value: string): string {
  return value.toLowerCase();
}

function presentNullableDate(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}
