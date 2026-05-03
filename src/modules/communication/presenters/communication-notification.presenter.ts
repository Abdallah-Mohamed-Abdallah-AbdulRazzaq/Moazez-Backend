import {
  CommunicationNotificationDetailRecord,
  CommunicationNotificationListRecord,
  CommunicationNotificationListResult,
  CommunicationNotificationReadAllResult,
} from '../infrastructure/communication-notification.repository';

export interface CommunicationNotificationResponse {
  id: string;
  recipientUserId: string;
  actorUserId: string | null;
  sourceModule: string;
  sourceType: string;
  sourceId: string | null;
  type: string;
  title: string;
  body: string;
  message: string;
  priority: string;
  status: string;
  readAt: string | null;
  archivedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CommunicationNotificationDetailResponse
  extends CommunicationNotificationResponse {
  deliverySummary: {
    total: number;
    pending: number;
    sent: number;
    delivered: number;
    failed: number;
    skipped: number;
  };
}

export function presentCommunicationNotificationList(
  result: CommunicationNotificationListResult,
) {
  return {
    items: result.items.map((notification) =>
      presentCommunicationNotificationListItem(notification),
    ),
    total: result.total,
    limit: result.limit,
    page: result.page,
  };
}

export function presentCommunicationNotificationListItem(
  notification: CommunicationNotificationListRecord,
): CommunicationNotificationResponse {
  return {
    id: notification.id,
    recipientUserId: notification.recipientUserId,
    actorUserId: notification.actorUserId,
    sourceModule: presentEnum(notification.sourceModule),
    sourceType: notification.sourceType,
    sourceId: notification.sourceId,
    type: presentEnum(notification.type),
    title: notification.title,
    body: notification.body,
    message: notification.body,
    priority: presentEnum(notification.priority),
    status: presentEnum(notification.status),
    readAt: presentNullableDate(notification.readAt),
    archivedAt: presentNullableDate(notification.archivedAt),
    expiresAt: presentNullableDate(notification.expiresAt),
    createdAt: notification.createdAt.toISOString(),
    updatedAt: notification.updatedAt.toISOString(),
  };
}

export function presentCommunicationNotification(
  notification: CommunicationNotificationDetailRecord,
): CommunicationNotificationDetailResponse {
  return {
    ...presentCommunicationNotificationListItem(notification),
    deliverySummary: summarizeDeliveries(notification.deliveries),
  };
}

export function presentCommunicationNotificationReadAllResult(
  result: CommunicationNotificationReadAllResult,
) {
  return {
    markedCount: result.markedCount,
    readAt: result.readAt.toISOString(),
  };
}

function summarizeDeliveries(
  deliveries: CommunicationNotificationDetailRecord['deliveries'],
) {
  return {
    total: deliveries.length,
    pending: countByStatus(deliveries, 'PENDING'),
    sent: countByStatus(deliveries, 'SENT'),
    delivered: countByStatus(deliveries, 'DELIVERED'),
    failed: countByStatus(deliveries, 'FAILED'),
    skipped: countByStatus(deliveries, 'SKIPPED'),
  };
}

function countByStatus(
  deliveries: CommunicationNotificationDetailRecord['deliveries'],
  status: string,
): number {
  return deliveries.filter((delivery) => delivery.status === status).length;
}

function presentEnum(value: string): string {
  return value.toLowerCase();
}

function presentNullableDate(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}
