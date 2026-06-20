import {
  CommunicationNotificationDetailRecord,
  CommunicationNotificationListRecord,
  CommunicationNotificationListResult,
  CommunicationNotificationReadAllResult,
} from '../infrastructure/communication-notification.repository';

type AppNotificationRecord =
  | CommunicationNotificationListRecord
  | CommunicationNotificationDetailRecord;

export type CommunicationAppNotificationAliasStyle = 'dual' | 'camel';

export interface CommunicationAppNotificationDeepLink {
  type: 'announcement';
  announcementId: string;
}

export interface CommunicationAppNotificationPresenterOptions {
  aliasStyle: CommunicationAppNotificationAliasStyle;
}

export function presentCommunicationAppNotificationList(params: {
  result: CommunicationNotificationListResult;
  unreadCount: number;
  options: CommunicationAppNotificationPresenterOptions;
}) {
  const summary = presentCommunicationAppNotificationSummary({
    unreadCount: params.unreadCount,
    options: params.options,
  });

  return {
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
  if (
    notification.type === 'ANNOUNCEMENT_PUBLISHED' &&
    notification.sourceId
  ) {
    return {
      type: 'announcement',
      announcementId: notification.sourceId,
    };
  }

  return null;
}

function presentEnum(value: string): string {
  return value.toLowerCase();
}

function presentNullableDate(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}
