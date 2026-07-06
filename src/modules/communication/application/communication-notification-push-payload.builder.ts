import { Injectable } from '@nestjs/common';
import {
  CommunicationNotificationSourceModule,
  CommunicationNotificationType,
  Prisma,
  UserType,
} from '@prisma/client';
import {
  COMMUNICATION_MESSAGE_NOTIFICATION_SOURCE_TYPE,
  COMMUNICATION_ANNOUNCEMENT_NOTIFICATION_SOURCE_TYPE,
} from '../domain/communication-notification-generation-domain';

export interface CommunicationNotificationPushPayloadRecord {
  id: string;
  type: CommunicationNotificationType;
  sourceModule: string;
  sourceType: string;
  sourceId: string | null;
  title: string;
  body: string;
  metadata: Prisma.JsonValue | null;
  recipientUser?: {
    userType: UserType;
  };
}

export interface CommunicationNotificationPushPayload {
  notification: {
    title: string;
    body: string | null;
  };
  data: Record<string, string>;
}

@Injectable()
export class CommunicationNotificationPushPayloadBuilder {
  build(
    notification: CommunicationNotificationPushPayloadRecord,
  ): CommunicationNotificationPushPayload {
    const dismissalData = buildDismissalPushData(notification);
    if (dismissalData) {
      return {
        notification: {
          title: notification.title,
          body: notification.body,
        },
        data: dismissalData,
      };
    }

    const data: Record<string, string> = {
      notificationId: notification.id,
      type: presentEnum(notification.type),
      sourceModule: presentEnum(notification.sourceModule),
    };

    const deepLink = buildDeepLink(notification);
    if (deepLink) {
      Object.assign(data, deepLink);
    }

    return {
      notification: {
        title: notification.title,
        body: notification.body,
      },
      data,
    };
  }
}

function buildDismissalPushData(
  notification: CommunicationNotificationPushPayloadRecord,
): Record<string, string> | null {
  if (
    notification.sourceModule !== CommunicationNotificationSourceModule.DISMISSAL
  ) {
    return null;
  }

  const type = presentDismissalNotificationType(notification.type);
  if (!type) return null;

  const metadata = asRecord(notification.metadata);
  const request = asRecord(metadata?.request);
  const requestId =
    readString(notification.sourceId) ?? readString(request?.id) ?? null;
  const status = readString(request?.status);
  const isParentRecipient =
    notification.recipientUser?.userType === UserType.PARENT;

  const data: Record<string, string> = {
    notificationId: notification.id,
    module: isParentRecipient ? 'parent_smart_pickup' : 'dismissal',
    surface: isParentRecipient ? 'parent' : 'dismissal_staff',
    type,
    screen: isParentRecipient
      ? 'parent.smart_pickup.recent_calls'
      : 'dismissal.notifications',
  };

  if (requestId) data.requestId = requestId;
  if (status) data.status = status;

  return data;
}

function buildDeepLink(
  notification: CommunicationNotificationPushPayloadRecord,
): Record<string, string> | null {
  if (
    notification.type === CommunicationNotificationType.ANNOUNCEMENT_PUBLISHED &&
    notification.sourceType === COMMUNICATION_ANNOUNCEMENT_NOTIFICATION_SOURCE_TYPE &&
    notification.sourceId
  ) {
    return {
      deepLinkType: 'announcement',
      announcementId: notification.sourceId,
    };
  }

  if (
    (notification.type === CommunicationNotificationType.MESSAGE_RECEIVED ||
      notification.type === CommunicationNotificationType.MESSAGE_MENTION) &&
    notification.sourceType === COMMUNICATION_MESSAGE_NOTIFICATION_SOURCE_TYPE
  ) {
    const metadata = asRecord(notification.metadata);
    const conversationId = readString(metadata?.conversationId);
    const messageId =
      notification.sourceId ?? readString(metadata?.messageId) ?? null;

    if (conversationId && messageId) {
      return {
        deepLinkType: 'conversation_message',
        conversationId,
        messageId,
      };
    }
  }

  return null;
}

function presentEnum(value: string): string {
  return value.toLowerCase();
}

function presentDismissalNotificationType(
  type: CommunicationNotificationType,
): string | null {
  switch (type) {
    case CommunicationNotificationType.DISMISSAL_REQUEST_CREATED:
      return 'request_created';
    case CommunicationNotificationType.DISMISSAL_REQUEST_CANCELLED:
      return 'request_cancelled';
    case CommunicationNotificationType.DISMISSAL_REQUEST_CALLED:
      return 'request_called';
    case CommunicationNotificationType.DISMISSAL_REQUEST_READY:
      return 'request_ready';
    case CommunicationNotificationType.DISMISSAL_REQUEST_HANDED_OVER:
      return 'request_handed_over';
    case CommunicationNotificationType.DISMISSAL_REQUEST_EXPIRED:
      return 'request_expired';
    default:
      return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
