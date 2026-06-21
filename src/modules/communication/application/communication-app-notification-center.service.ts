import { Injectable } from '@nestjs/common';
import {
  CommunicationNotificationPriority,
  CommunicationNotificationSourceModule,
  CommunicationNotificationStatus,
  CommunicationNotificationType,
} from '@prisma/client';
import { NotFoundDomainException } from '../../../common/exceptions/domain-exception';
import {
  assertCanArchiveNotification,
  assertCanMarkNotificationRead,
  CommunicationNotificationInvalidException,
  normalizeCommunicationNotificationPriority,
  normalizeCommunicationNotificationSourceModule,
  normalizeCommunicationNotificationStatus,
  normalizeCommunicationNotificationType,
  PlainCommunicationNotification,
} from '../domain/communication-notification-domain';
import {
  CommunicationNotificationDetailRecord,
  CommunicationNotificationListFilters,
  CommunicationNotificationListRecord,
  CommunicationNotificationRepository,
} from '../infrastructure/communication-notification.repository';
import {
  CommunicationAppNotificationAliasStyle,
  CommunicationAppNotificationGroup,
  presentCommunicationAppNotificationDetail,
  presentCommunicationAppNotificationList,
  presentCommunicationAppNotificationReadAllResult,
  presentCommunicationAppNotificationSummary,
} from '../presenters/communication-app-notification.presenter';

export interface CommunicationAppNotificationListQuery {
  status?: string;
  priority?: string;
  type?: string;
  sourceModule?: string;
  createdFrom?: string;
  createdTo?: string;
  unreadOnly?: string | boolean;
  category?: string;
  groupBy?: string;
  limit?: number;
  page?: number;
}

type CommunicationAppNotificationGroupBy = 'category' | 'sourceModule' | 'day';

@Injectable()
export class CommunicationAppNotificationCenterService {
  constructor(
    private readonly notificationRepository: CommunicationNotificationRepository,
  ) {}

  async listForActor(params: {
    recipientUserId: string;
    query?: CommunicationAppNotificationListQuery;
    aliasStyle: CommunicationAppNotificationAliasStyle;
  }) {
    const { filters, groupBy } = this.buildActorListOptions(
      params.recipientUserId,
      params.query,
    );
    const [result, unreadCount] = await Promise.all([
      this.notificationRepository.listCurrentSchoolNotifications({
        filters,
      }),
      this.countUnreadForActor(params.recipientUserId),
    ]);

    return presentCommunicationAppNotificationList({
      result,
      unreadCount,
      groups: groupBy
        ? buildNotificationGroups(result.items, groupBy)
        : undefined,
      options: { aliasStyle: params.aliasStyle },
    });
  }

  async summaryForActor(params: {
    recipientUserId: string;
    aliasStyle: CommunicationAppNotificationAliasStyle;
  }) {
    return presentCommunicationAppNotificationSummary({
      unreadCount: await this.countUnreadForActor(params.recipientUserId),
      options: { aliasStyle: params.aliasStyle },
    });
  }

  async getForActor(params: {
    recipientUserId: string;
    notificationId: string;
    aliasStyle: CommunicationAppNotificationAliasStyle;
  }) {
    const notification = await this.requireOwnedNotification({
      recipientUserId: params.recipientUserId,
      notificationId: params.notificationId,
    });

    return presentCommunicationAppNotificationDetail({
      notification,
      options: { aliasStyle: params.aliasStyle },
    });
  }

  async markReadForActor(params: {
    recipientUserId: string;
    notificationId: string;
    aliasStyle: CommunicationAppNotificationAliasStyle;
  }) {
    const notification = await this.requireOwnedNotification({
      recipientUserId: params.recipientUserId,
      notificationId: params.notificationId,
    });

    assertCanMarkNotificationRead({
      actorId: params.recipientUserId,
      notification: toPlainNotification(notification),
    });

    const read =
      await this.notificationRepository.markCurrentSchoolNotificationRead({
        notificationId: notification.id,
        recipientUserId: params.recipientUserId,
        readAt: new Date(),
      });

    return presentCommunicationAppNotificationDetail({
      notification: read,
      options: { aliasStyle: params.aliasStyle },
    });
  }

  async markAllReadForActor(params: {
    recipientUserId: string;
    aliasStyle: CommunicationAppNotificationAliasStyle;
  }) {
    const result =
      await this.notificationRepository.markAllCurrentActorNotificationsRead({
        recipientUserId: params.recipientUserId,
        readAt: new Date(),
      });

    return presentCommunicationAppNotificationReadAllResult(result, {
      aliasStyle: params.aliasStyle,
    });
  }

  async archiveForActor(params: {
    recipientUserId: string;
    notificationId: string;
    aliasStyle: CommunicationAppNotificationAliasStyle;
  }) {
    const notification = await this.requireOwnedNotification({
      recipientUserId: params.recipientUserId,
      notificationId: params.notificationId,
    });

    assertCanArchiveNotification({
      actorId: params.recipientUserId,
      notification: toPlainNotification(notification),
    });

    const archived =
      await this.notificationRepository.archiveCurrentSchoolNotification({
        notificationId: notification.id,
        recipientUserId: params.recipientUserId,
        archivedAt: new Date(),
      });

    return presentCommunicationAppNotificationDetail({
      notification: archived,
      options: { aliasStyle: params.aliasStyle },
    });
  }

  private buildActorListOptions(
    recipientUserId: string,
    query?: CommunicationAppNotificationListQuery,
  ): {
    filters: CommunicationNotificationListFilters;
    groupBy?: CommunicationAppNotificationGroupBy;
  } {
    const status = query?.status
      ? (normalizeCommunicationNotificationStatus(
          query.status,
        ) as CommunicationNotificationStatus)
      : undefined;
    const unreadOnly = normalizeUnreadOnly(query?.unreadOnly);
    if (
      unreadOnly &&
      status &&
      status !== CommunicationNotificationStatus.UNREAD
    ) {
      throw new CommunicationNotificationInvalidException(
        'unreadOnly=true cannot be combined with a non-unread status',
        { field: 'unreadOnly', status: query?.status },
      );
    }

    const type = query?.type
      ? (normalizeCommunicationNotificationType(
          query.type,
        ) as CommunicationNotificationType)
      : undefined;
    const categoryType = query?.category
      ? normalizeAppNotificationCategory(query.category)
      : undefined;
    if (type && categoryType && type !== categoryType) {
      throw new CommunicationNotificationInvalidException(
        'Notification category and type filters conflict',
        {
          field: 'category',
          category: query?.category,
          type: query?.type,
        },
      );
    }

    const createdFrom = query?.createdFrom
      ? parseIsoDateTime(query.createdFrom, 'createdFrom')
      : undefined;
    const createdTo = query?.createdTo
      ? parseIsoDateTime(query.createdTo, 'createdTo')
      : undefined;
    if (
      createdFrom &&
      createdTo &&
      createdFrom.getTime() >= createdTo.getTime()
    ) {
      throw new CommunicationNotificationInvalidException(
        'createdFrom must be earlier than createdTo',
        { field: 'createdFrom' },
      );
    }

    const groupBy = query?.groupBy
      ? normalizeAppNotificationGroupBy(query.groupBy)
      : undefined;

    return {
      filters: {
        recipientUserId,
        ...(unreadOnly
          ? { status: CommunicationNotificationStatus.UNREAD }
          : status
            ? { status }
            : {}),
        ...(query?.priority
          ? {
              priority: normalizeCommunicationNotificationPriority(
                query.priority,
              ) as CommunicationNotificationPriority,
            }
          : {}),
        ...(categoryType ? { type: categoryType } : type ? { type } : {}),
        ...(query?.sourceModule
          ? {
              sourceModule: normalizeCommunicationNotificationSourceModule(
                query.sourceModule,
              ) as CommunicationNotificationSourceModule,
            }
          : {}),
        ...(createdFrom ? { createdFrom } : {}),
        ...(createdTo ? { createdToExclusive: createdTo } : {}),
        ...(query?.limit !== undefined ? { limit: query.limit } : {}),
        ...(query?.page !== undefined ? { page: query.page } : {}),
      },
      ...(groupBy ? { groupBy } : {}),
    };
  }

  private countUnreadForActor(recipientUserId: string): Promise<number> {
    return this.notificationRepository.countCurrentSchoolNotifications({
      filters: {
        recipientUserId,
        status: CommunicationNotificationStatus.UNREAD,
      },
    });
  }

  private async requireOwnedNotification(params: {
    recipientUserId: string;
    notificationId: string;
  }): Promise<CommunicationNotificationDetailRecord> {
    const notification =
      await this.notificationRepository.findCurrentSchoolNotificationById(
        params.notificationId,
      );

    if (
      !notification ||
      notification.recipientUserId !== params.recipientUserId
    ) {
      throw new NotFoundDomainException('Notification not found', {
        notificationId: params.notificationId,
      });
    }

    return notification;
  }
}

function toPlainNotification(
  notification: CommunicationNotificationDetailRecord,
): PlainCommunicationNotification {
  return {
    id: notification.id,
    recipientUserId: notification.recipientUserId,
    status: notification.status,
    readAt: notification.readAt,
    archivedAt: notification.archivedAt,
    expiresAt: notification.expiresAt,
  };
}

function normalizeUnreadOnly(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return false;
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') {
    throw new CommunicationNotificationInvalidException(
      'unreadOnly must be true or false',
      { field: 'unreadOnly', value },
    );
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;

  throw new CommunicationNotificationInvalidException(
    'unreadOnly must be true or false',
    { field: 'unreadOnly', value },
  );
}

function normalizeAppNotificationCategory(
  value: string,
): CommunicationNotificationType {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'message_received') {
    return CommunicationNotificationType.MESSAGE_RECEIVED;
  }
  if (
    normalized === 'announcement' ||
    normalized === 'announcement_published'
  ) {
    return CommunicationNotificationType.ANNOUNCEMENT_PUBLISHED;
  }

  throw new CommunicationNotificationInvalidException(
    'Notification category is invalid',
    { field: 'category', value },
  );
}

function normalizeAppNotificationGroupBy(
  value: string,
): CommunicationAppNotificationGroupBy {
  const normalized = value.trim();
  if (normalized === 'sourceModule') return 'sourceModule';
  if (normalized === 'category' || normalized === 'day') return normalized;

  throw new CommunicationNotificationInvalidException(
    'Notification groupBy is invalid',
    { field: 'groupBy', value },
  );
}

function parseIsoDateTime(value: string, field: string): Date {
  const trimmed = value.trim();
  const parsed = new Date(trimmed);
  if (!trimmed.includes('T') || Number.isNaN(parsed.getTime())) {
    throw new CommunicationNotificationInvalidException(
      'Notification date filter must be an ISO datetime string',
      { field, value },
    );
  }

  return parsed;
}

function buildNotificationGroups(
  notifications: CommunicationNotificationListRecord[],
  groupBy: CommunicationAppNotificationGroupBy,
): CommunicationAppNotificationGroup[] {
  const groups = new Map<string, CommunicationAppNotificationGroup>();

  for (const notification of notifications) {
    const group = resolveNotificationGroup(notification, groupBy);
    const current = groups.get(group.key) ?? {
      key: group.key,
      label: group.label,
      count: 0,
      unreadCount: 0,
    };

    current.count += 1;
    if (notification.status === CommunicationNotificationStatus.UNREAD) {
      current.unreadCount += 1;
    }
    groups.set(group.key, current);
  }

  return [...groups.values()];
}

function resolveNotificationGroup(
  notification: CommunicationNotificationListRecord,
  groupBy: CommunicationAppNotificationGroupBy,
): { key: string; label: string } {
  if (groupBy === 'category') {
    return categoryGroupForType(notification.type);
  }

  if (groupBy === 'sourceModule') {
    const key = toPublicEnum(notification.sourceModule);
    return { key, label: labelForGroupKey(key) };
  }

  const key = notification.createdAt.toISOString().slice(0, 10);
  return { key, label: key };
}

function categoryGroupForType(type: CommunicationNotificationType): {
  key: string;
  label: string;
} {
  switch (type) {
    case CommunicationNotificationType.MESSAGE_RECEIVED:
      return { key: 'message_received', label: 'Messages' };
    case CommunicationNotificationType.ANNOUNCEMENT_PUBLISHED:
      return { key: 'announcement', label: 'Announcements' };
    default:
      return { key: 'other', label: 'Other' };
  }
}

function labelForGroupKey(key: string): string {
  const knownLabels: Record<string, string> = {
    message_received: 'Messages',
    announcement: 'Announcements',
    announcements: 'Announcements',
    communication: 'Communication',
  };
  const known = knownLabels[key];
  if (known) return known;

  return key
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function toPublicEnum(value: string): string {
  return value.toLowerCase();
}
