import { Injectable } from '@nestjs/common';
import {
  CommunicationNotificationDeliveryChannel,
  CommunicationNotificationDeliveryStatus,
  CommunicationNotificationPriority,
  CommunicationNotificationSourceModule,
  CommunicationNotificationStatus,
  CommunicationNotificationType,
} from '@prisma/client';
import { getRequestContext } from '../../../common/context/request-context';
import { NotFoundDomainException } from '../../../common/exceptions/domain-exception';
import { requireCommunicationScope } from '../communication-context';
import {
  assertCanArchiveNotification,
  assertCanMarkNotificationRead,
  assertCanViewDelivery,
  assertCanViewNotification,
  CommunicationNotificationStatusValue,
  normalizeCommunicationNotificationDeliveryChannel,
  normalizeCommunicationNotificationDeliveryStatus,
  normalizeCommunicationNotificationPriority,
  normalizeCommunicationNotificationSourceModule,
  normalizeCommunicationNotificationStatus,
  normalizeCommunicationNotificationType,
  PlainCommunicationNotification,
} from '../domain/communication-notification-domain';
import {
  ListCommunicationNotificationDeliveriesQueryDto,
  ListCommunicationNotificationsQueryDto,
} from '../dto/communication-notification.dto';
import {
  CommunicationNotificationDeliveryRecord,
  CommunicationNotificationDetailRecord,
  CommunicationNotificationRepository,
} from '../infrastructure/communication-notification.repository';
import {
  presentCommunicationNotification,
  presentCommunicationNotificationList,
  presentCommunicationNotificationReadAllResult,
} from '../presenters/communication-notification.presenter';
import {
  presentCommunicationNotificationDelivery,
  presentCommunicationNotificationDeliveryList,
} from '../presenters/communication-notification-delivery.presenter';

const NOTIFICATION_MANAGE_PERMISSION = 'communication.notifications.manage';

@Injectable()
export class ListCommunicationNotificationsUseCase {
  constructor(
    private readonly communicationNotificationRepository: CommunicationNotificationRepository,
  ) {}

  async execute(query: ListCommunicationNotificationsQueryDto) {
    const scope = requireCommunicationScope();
    const hasManagePermission = actorHasNotificationManagePermission();
    const recipientUserId = hasManagePermission
      ? (query.recipientUserId ?? null)
      : scope.actorId;

    const result =
      await this.communicationNotificationRepository.listCurrentSchoolNotifications(
        {
          filters: {
            recipientUserId,
            ...(query.status
              ? {
                  status: normalizeCommunicationNotificationStatus(
                    query.status,
                  ) as CommunicationNotificationStatus,
                }
              : {}),
            ...(query.priority
              ? {
                  priority: normalizeCommunicationNotificationPriority(
                    query.priority,
                  ) as CommunicationNotificationPriority,
                }
              : {}),
            ...(query.type
              ? {
                  type: normalizeCommunicationNotificationType(
                    query.type,
                  ) as CommunicationNotificationType,
                }
              : {}),
            ...(query.sourceModule
              ? {
                  sourceModule: normalizeCommunicationNotificationSourceModule(
                    query.sourceModule,
                  ) as CommunicationNotificationSourceModule,
                }
              : {}),
            ...(query.sourceType ? { sourceType: query.sourceType } : {}),
            ...(query.sourceId ? { sourceId: query.sourceId } : {}),
            ...(query.createdFrom
              ? { createdFrom: new Date(query.createdFrom) }
              : {}),
            ...(query.createdTo ? { createdTo: new Date(query.createdTo) } : {}),
            ...(query.limit !== undefined ? { limit: query.limit } : {}),
            ...(query.page !== undefined ? { page: query.page } : {}),
          },
        },
      );

    return presentCommunicationNotificationList(result);
  }
}

@Injectable()
export class GetCommunicationNotificationUseCase {
  constructor(
    private readonly communicationNotificationRepository: CommunicationNotificationRepository,
  ) {}

  async execute(notificationId: string) {
    const scope = requireCommunicationScope();
    const notification = await requireNotification(
      this.communicationNotificationRepository,
      notificationId,
    );

    assertCanViewNotification({
      actorId: scope.actorId,
      hasManagePermission: actorHasNotificationManagePermission(),
      notification: toPlainNotification(notification),
    });

    return presentCommunicationNotification(notification);
  }
}

@Injectable()
export class MarkCommunicationNotificationReadUseCase {
  constructor(
    private readonly communicationNotificationRepository: CommunicationNotificationRepository,
  ) {}

  async execute(notificationId: string) {
    const scope = requireCommunicationScope();
    const notification = await requireNotification(
      this.communicationNotificationRepository,
      notificationId,
    );

    assertCanMarkNotificationRead({
      actorId: scope.actorId,
      notification: toPlainNotification(notification),
    });

    const read =
      await this.communicationNotificationRepository.markCurrentSchoolNotificationRead(
        {
          notificationId: notification.id,
          recipientUserId: scope.actorId,
          readAt: new Date(),
        },
      );

    return presentCommunicationNotification(read);
  }
}

@Injectable()
export class MarkAllCommunicationNotificationsReadUseCase {
  constructor(
    private readonly communicationNotificationRepository: CommunicationNotificationRepository,
  ) {}

  async execute() {
    const scope = requireCommunicationScope();
    const readAt = new Date();
    const result =
      await this.communicationNotificationRepository.markAllCurrentActorNotificationsRead(
        {
          recipientUserId: scope.actorId,
          readAt,
        },
      );

    return presentCommunicationNotificationReadAllResult(result);
  }
}

@Injectable()
export class ArchiveCommunicationNotificationUseCase {
  constructor(
    private readonly communicationNotificationRepository: CommunicationNotificationRepository,
  ) {}

  async execute(notificationId: string) {
    const scope = requireCommunicationScope();
    const notification = await requireNotification(
      this.communicationNotificationRepository,
      notificationId,
    );

    assertCanArchiveNotification({
      actorId: scope.actorId,
      notification: toPlainNotification(notification),
    });

    const archived =
      await this.communicationNotificationRepository.archiveCurrentSchoolNotification(
        {
          notificationId: notification.id,
          recipientUserId: scope.actorId,
          archivedAt: new Date(),
        },
      );

    return presentCommunicationNotification(archived);
  }
}

@Injectable()
export class ListCommunicationNotificationDeliveriesUseCase {
  constructor(
    private readonly communicationNotificationRepository: CommunicationNotificationRepository,
  ) {}

  async execute(query: ListCommunicationNotificationDeliveriesQueryDto) {
    requireCommunicationScope();
    assertCanViewDelivery({
      hasManagePermission: actorHasNotificationManagePermission(),
    });

    const status = query.status ?? query.deliveryStatus;
    const result =
      await this.communicationNotificationRepository.listCurrentSchoolNotificationDeliveries(
        {
          filters: {
            ...(query.notificationId
              ? { notificationId: query.notificationId }
              : {}),
            ...(query.recipientUserId
              ? { recipientUserId: query.recipientUserId }
              : {}),
            ...(query.channel
              ? {
                  channel: normalizeCommunicationNotificationDeliveryChannel(
                    query.channel,
                  ) as CommunicationNotificationDeliveryChannel,
                }
              : {}),
            ...(status
              ? {
                  status: normalizeCommunicationNotificationDeliveryStatus(
                    status,
                  ) as CommunicationNotificationDeliveryStatus,
                }
              : {}),
            ...(query.provider ? { provider: query.provider } : {}),
            ...(query.createdFrom
              ? { createdFrom: new Date(query.createdFrom) }
              : {}),
            ...(query.createdTo ? { createdTo: new Date(query.createdTo) } : {}),
            ...(query.limit !== undefined ? { limit: query.limit } : {}),
            ...(query.page !== undefined ? { page: query.page } : {}),
          },
        },
      );

    return presentCommunicationNotificationDeliveryList(result);
  }
}

@Injectable()
export class GetCommunicationNotificationDeliveryUseCase {
  constructor(
    private readonly communicationNotificationRepository: CommunicationNotificationRepository,
  ) {}

  async execute(deliveryId: string) {
    requireCommunicationScope();
    assertCanViewDelivery({
      hasManagePermission: actorHasNotificationManagePermission(),
    });

    const delivery = await requireDelivery(
      this.communicationNotificationRepository,
      deliveryId,
    );

    return presentCommunicationNotificationDelivery(delivery);
  }
}

async function requireNotification(
  repository: CommunicationNotificationRepository,
  notificationId: string,
): Promise<CommunicationNotificationDetailRecord> {
  const notification =
    await repository.findCurrentSchoolNotificationById(notificationId);
  if (!notification) {
    throw new NotFoundDomainException('Notification not found', {
      notificationId,
    });
  }

  return notification;
}

async function requireDelivery(
  repository: CommunicationNotificationRepository,
  deliveryId: string,
): Promise<CommunicationNotificationDeliveryRecord> {
  const delivery =
    await repository.findCurrentSchoolNotificationDeliveryById(deliveryId);
  if (!delivery) {
    throw new NotFoundDomainException('Notification delivery not found', {
      deliveryId,
    });
  }

  return delivery;
}

function toPlainNotification(
  notification: CommunicationNotificationDetailRecord,
): PlainCommunicationNotification {
  return {
    id: notification.id,
    recipientUserId: notification.recipientUserId,
    status: notification.status as CommunicationNotificationStatusValue,
    readAt: notification.readAt,
    archivedAt: notification.archivedAt,
    expiresAt: notification.expiresAt,
  };
}

function actorHasNotificationManagePermission(): boolean {
  const ctx = getRequestContext();
  return (
    ctx?.activeMembership?.permissions.includes(
      NOTIFICATION_MANAGE_PERMISSION,
    ) ?? false
  );
}
