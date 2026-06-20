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
  normalizeCommunicationNotificationPriority,
  normalizeCommunicationNotificationSourceModule,
  normalizeCommunicationNotificationStatus,
  normalizeCommunicationNotificationType,
  PlainCommunicationNotification,
} from '../domain/communication-notification-domain';
import {
  CommunicationNotificationDetailRecord,
  CommunicationNotificationRepository,
} from '../infrastructure/communication-notification.repository';
import {
  CommunicationAppNotificationAliasStyle,
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
  limit?: number;
  page?: number;
}

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
    const filters = this.buildActorFilters(params.recipientUserId, params.query);
    const [result, unreadCount] = await Promise.all([
      this.notificationRepository.listCurrentSchoolNotifications({
        filters,
      }),
      this.countUnreadForActor(params.recipientUserId),
    ]);

    return presentCommunicationAppNotificationList({
      result,
      unreadCount,
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

  private buildActorFilters(
    recipientUserId: string,
    query?: CommunicationAppNotificationListQuery,
  ) {
    return {
      recipientUserId,
      ...(query?.status
        ? {
            status: normalizeCommunicationNotificationStatus(
              query.status,
            ) as CommunicationNotificationStatus,
          }
        : {}),
      ...(query?.priority
        ? {
            priority: normalizeCommunicationNotificationPriority(
              query.priority,
            ) as CommunicationNotificationPriority,
          }
        : {}),
      ...(query?.type
        ? {
            type: normalizeCommunicationNotificationType(
              query.type,
            ) as CommunicationNotificationType,
          }
        : {}),
      ...(query?.sourceModule
        ? {
            sourceModule: normalizeCommunicationNotificationSourceModule(
              query.sourceModule,
            ) as CommunicationNotificationSourceModule,
          }
        : {}),
      ...(query?.limit !== undefined ? { limit: query.limit } : {}),
      ...(query?.page !== undefined ? { page: query.page } : {}),
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

    if (!notification || notification.recipientUserId !== params.recipientUserId) {
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
