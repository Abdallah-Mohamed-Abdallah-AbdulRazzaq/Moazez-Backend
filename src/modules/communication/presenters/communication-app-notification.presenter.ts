import {
  CommunicationNotificationDetailRecord,
  CommunicationNotificationListRecord,
  CommunicationNotificationListResult,
  CommunicationNotificationReadAllResult,
} from '../infrastructure/communication-notification.repository';
import { COMMUNICATION_MESSAGE_NOTIFICATION_SOURCE_TYPE } from '../domain/communication-notification-generation-domain';

type AppNotificationRecord =
  | CommunicationNotificationListRecord
  | CommunicationNotificationDetailRecord;

export type CommunicationAppNotificationAliasStyle = 'dual' | 'camel';

export type CommunicationAppNotificationDeepLink =
  | {
      type: 'announcement';
      announcementId: string;
    }
  | {
      type: 'conversation_message';
      conversationId: string;
      messageId: string;
    };

export interface CommunicationAppNotificationPresenterOptions {
  aliasStyle: CommunicationAppNotificationAliasStyle;
}

export interface CommunicationAppNotificationGroup {
  key: string;
  label: string;
  count: number;
  unreadCount: number;
}

export function presentCommunicationAppNotificationList(params: {
  result: CommunicationNotificationListResult;
  unreadCount: number;
  groups?: CommunicationAppNotificationGroup[];
  options: CommunicationAppNotificationPresenterOptions;
}) {
  const summary = presentCommunicationAppNotificationSummary({
    unreadCount: params.unreadCount,
    options: params.options,
  });

  const response = {
    notifications: params.result.items.map((notification) =>
      presentCommunicationAppNotification(notification, params.options),
    ),
    pagination: {
      page: params.result.page,
      limit: params.result.limit,
      total: params.result.total,
    },
    summary,
  };

  if (!params.groups) return response;

  return {
    ...response,
    groups: params.groups.map((group) =>
      presentCommunicationAppNotificationGroup(group, params.options),
    ),
  };
}

export function presentCommunicationAppNotificationDetail(params: {
  notification: AppNotificationRecord;
  options: CommunicationAppNotificationPresenterOptions;
}) {
  return {
    notification: presentCommunicationAppNotification(
      params.notification,
      params.options,
    ),
  };
}

export function presentCommunicationAppNotificationSummary(params: {
  unreadCount: number;
  options: CommunicationAppNotificationPresenterOptions;
}) {
  const summary = {
    unreadCount: params.unreadCount,
  };

  if (params.options.aliasStyle !== 'dual') return summary;

  return {
    ...summary,
    unread_count: params.unreadCount,
  };
}

export function presentCommunicationAppNotificationReadAllResult(
  result: CommunicationNotificationReadAllResult,
  options: CommunicationAppNotificationPresenterOptions,
) {
  const readAt = result.readAt.toISOString();
  const response = {
    markedCount: result.markedCount,
    readAt,
  };

  if (options.aliasStyle !== 'dual') return response;

  return {
    ...response,
    marked_count: result.markedCount,
    read_at: readAt,
  };
}

function presentCommunicationAppNotificationGroup(
  group: CommunicationAppNotificationGroup,
  options: CommunicationAppNotificationPresenterOptions,
) {
  const base = {
    key: group.key,
    label: group.label,
    count: group.count,
    unreadCount: group.unreadCount,
  };

  if (options.aliasStyle !== 'dual') return base;

  return {
    ...base,
    unread_count: group.unreadCount,
  };
}

export function presentCommunicationRealtimeNotification(
  notification: AppNotificationRecord,
) {
  return presentCommunicationAppNotification(notification, {
    aliasStyle: 'camel',
  });
}

export function presentCommunicationAppNotification(
  notification: AppNotificationRecord,
  options: CommunicationAppNotificationPresenterOptions,
) {
  const readAt = presentNullableDate(notification.readAt);
  const archivedAt = presentNullableDate(notification.archivedAt);
  const createdAt = notification.createdAt.toISOString();
  const sourceModule = presentEnum(notification.sourceModule);
  const sourceId = notification.sourceId ?? null;
  const base = {
    notificationId: notification.id,
    type: presentEnum(notification.type),
    sourceModule,
    sourceId,
    title: notification.title,
    body: notification.body ?? null,
    priority: presentEnum(notification.priority),
    status: presentEnum(notification.status),
    readAt,
    archivedAt,
    createdAt,
    deepLink: buildDeepLink(notification),
  };

  if (options.aliasStyle !== 'dual') return base;

  return {
    ...base,
    notification_id: notification.id,
    source_module: sourceModule,
    source_id: sourceId,
    read_at: readAt,
    archived_at: archivedAt,
    created_at: createdAt,
    deep_link: base.deepLink,
  };
}

function buildDeepLink(
  notification: AppNotificationRecord,
): CommunicationAppNotificationDeepLink | null {
  if (notification.type === 'ANNOUNCEMENT_PUBLISHED' && notification.sourceId) {
    return {
      type: 'announcement',
      announcementId: notification.sourceId,
    };
  }

  if (
    (notification.type === 'MESSAGE_RECEIVED' ||
      notification.type === 'MESSAGE_MENTION') &&
    notification.sourceType === COMMUNICATION_MESSAGE_NOTIFICATION_SOURCE_TYPE
  ) {
    const metadata = asRecord(notification.metadata);
    const conversationId = readString(metadata?.conversationId);
    const messageId =
      notification.sourceId ?? readString(metadata?.messageId) ?? null;

    if (conversationId && messageId) {
      return {
        type: 'conversation_message',
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

function presentNullableDate(value: Date | null): string | null {
  return value ? value.toISOString() : null;
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
