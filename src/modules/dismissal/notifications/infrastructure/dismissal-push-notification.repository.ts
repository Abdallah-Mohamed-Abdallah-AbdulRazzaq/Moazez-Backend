import { Injectable } from '@nestjs/common';
import {
  CommunicationNotificationDeliveryChannel,
  CommunicationNotificationDeliveryStatus,
  CommunicationNotificationSourceModule,
  CommunicationNotificationType,
  UserStatus,
  UserType,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { COMMUNICATION_PUSH_NOTIFICATION_PROVIDER } from '../../../communication/domain/communication-notification-generation-domain';

const DISMISSAL_PUSH_NOTIFICATION_SOURCE_TYPE = 'dismissal_request';

const DISMISSAL_PUSH_RECIPIENT_USER_TYPES = [
  UserType.PARENT,
  UserType.DISMISSAL_STAFF,
] as const;

export interface DismissalPushDeliveryRecord {
  id: string;
  notificationId: string;
  type: CommunicationNotificationType;
  organizationId: string;
}

@Injectable()
export class DismissalPushNotificationRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  async ensurePushDeliveriesForRequestEvent(params: {
    schoolId: string;
    requestId: string;
    eventTypes: CommunicationNotificationType[];
    now: Date;
  }): Promise<DismissalPushDeliveryRecord[]> {
    const eventTypes = uniqueEventTypes(params.eventTypes);
    if (eventTypes.length === 0) return [];

    return this.scopedPrisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`dismissal-push:${params.schoolId}:${params.requestId}:${eventTypes.join(',')}`}, 0))`;

      const school = await tx.school.findFirst({
        where: { id: params.schoolId },
        select: { organizationId: true },
      });
      if (!school) return [];

      const notifications = await tx.communicationNotification.findMany({
        where: {
          schoolId: params.schoolId,
          sourceModule: CommunicationNotificationSourceModule.DISMISSAL,
          sourceType: DISMISSAL_PUSH_NOTIFICATION_SOURCE_TYPE,
          sourceId: params.requestId,
          type: { in: eventTypes },
          recipientUser: {
            is: {
              userType: { in: [...DISMISSAL_PUSH_RECIPIENT_USER_TYPES] },
              status: UserStatus.ACTIVE,
              deletedAt: null,
            },
          },
        },
        select: {
          id: true,
          type: true,
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });

      if (notifications.length === 0) return [];

      const existingDeliveries =
        await tx.communicationNotificationDelivery.findMany({
          where: {
            schoolId: params.schoolId,
            notificationId: {
              in: notifications.map((notification) => notification.id),
            },
            channel: CommunicationNotificationDeliveryChannel.PUSH,
          },
          select: { notificationId: true },
        });
      const notificationIdsWithPush = new Set(
        existingDeliveries.map((delivery) => delivery.notificationId),
      );
      const missingNotifications = notifications.filter(
        (notification) => !notificationIdsWithPush.has(notification.id),
      );

      if (missingNotifications.length === 0) return [];

      await tx.communicationNotificationDelivery.createMany({
        data: missingNotifications.map((notification) => ({
          schoolId: params.schoolId,
          notificationId: notification.id,
          channel: CommunicationNotificationDeliveryChannel.PUSH,
          status: CommunicationNotificationDeliveryStatus.PENDING,
          provider: COMMUNICATION_PUSH_NOTIFICATION_PROVIDER,
        })),
      });

      const createdDeliveries =
        await tx.communicationNotificationDelivery.findMany({
          where: {
            schoolId: params.schoolId,
            notificationId: {
              in: missingNotifications.map((notification) => notification.id),
            },
            channel: CommunicationNotificationDeliveryChannel.PUSH,
            status: CommunicationNotificationDeliveryStatus.PENDING,
          },
          select: {
            id: true,
            notificationId: true,
            notification: {
              select: {
                type: true,
              },
            },
          },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        });

      return createdDeliveries.map((delivery) => ({
        id: delivery.id,
        notificationId: delivery.notificationId,
        type: delivery.notification.type,
        organizationId: school.organizationId,
      }));
    });
  }
}

function uniqueEventTypes(
  values: CommunicationNotificationType[],
): CommunicationNotificationType[] {
  return [...new Set(values)];
}
