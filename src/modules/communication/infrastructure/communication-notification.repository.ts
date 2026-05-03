import { Injectable } from '@nestjs/common';
import {
  CommunicationNotificationDeliveryChannel,
  CommunicationNotificationDeliveryStatus,
  CommunicationNotificationPriority,
  CommunicationNotificationSourceModule,
  CommunicationNotificationStatus,
  CommunicationNotificationType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';

const COMMUNICATION_NOTIFICATION_DELIVERY_ARGS =
  Prisma.validator<Prisma.CommunicationNotificationDeliveryDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      notificationId: true,
      channel: true,
      status: true,
      provider: true,
      providerMessageId: true,
      errorCode: true,
      errorMessage: true,
      attemptedAt: true,
      sentAt: true,
      deliveredAt: true,
      failedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

const COMMUNICATION_NOTIFICATION_LIST_ARGS =
  Prisma.validator<Prisma.CommunicationNotificationDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      recipientUserId: true,
      actorUserId: true,
      sourceModule: true,
      sourceType: true,
      sourceId: true,
      type: true,
      title: true,
      body: true,
      priority: true,
      status: true,
      readAt: true,
      archivedAt: true,
      expiresAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

const COMMUNICATION_NOTIFICATION_DETAIL_ARGS =
  Prisma.validator<Prisma.CommunicationNotificationDefaultArgs>()({
    select: {
      ...COMMUNICATION_NOTIFICATION_LIST_ARGS.select,
      deliveries: {
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        ...COMMUNICATION_NOTIFICATION_DELIVERY_ARGS,
      },
    },
  });

export type CommunicationNotificationDeliveryRecord =
  Prisma.CommunicationNotificationDeliveryGetPayload<
    typeof COMMUNICATION_NOTIFICATION_DELIVERY_ARGS
  >;

export type CommunicationNotificationListRecord =
  Prisma.CommunicationNotificationGetPayload<
    typeof COMMUNICATION_NOTIFICATION_LIST_ARGS
  >;

export type CommunicationNotificationDetailRecord =
  Prisma.CommunicationNotificationGetPayload<
    typeof COMMUNICATION_NOTIFICATION_DETAIL_ARGS
  >;

export interface CommunicationNotificationListFilters {
  recipientUserId: string | null;
  status?: CommunicationNotificationStatus;
  priority?: CommunicationNotificationPriority;
  type?: CommunicationNotificationType;
  sourceModule?: CommunicationNotificationSourceModule;
  sourceType?: string;
  sourceId?: string;
  createdFrom?: Date;
  createdTo?: Date;
  limit?: number;
  page?: number;
}

export interface CommunicationNotificationListResult {
  items: CommunicationNotificationListRecord[];
  total: number;
  limit: number;
  page: number;
}

export interface CommunicationNotificationReadAllResult {
  markedCount: number;
  readAt: Date;
}

export interface CommunicationNotificationDeliveryListFilters {
  notificationId?: string;
  recipientUserId?: string;
  channel?: CommunicationNotificationDeliveryChannel;
  status?: CommunicationNotificationDeliveryStatus;
  provider?: string;
  createdFrom?: Date;
  createdTo?: Date;
  limit?: number;
  page?: number;
}

export interface CommunicationNotificationDeliveryListResult {
  items: CommunicationNotificationDeliveryRecord[];
  total: number;
  limit: number;
  page: number;
}

@Injectable()
export class CommunicationNotificationRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  async listCurrentSchoolNotifications(input: {
    filters: CommunicationNotificationListFilters;
  }): Promise<CommunicationNotificationListResult> {
    const limit = input.filters.limit ?? 50;
    const page = input.filters.page ?? 1;
    const where = this.buildNotificationWhere(input.filters);

    const [items, total] = await Promise.all([
      this.scopedPrisma.communicationNotification.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: limit,
        skip: (page - 1) * limit,
        ...COMMUNICATION_NOTIFICATION_LIST_ARGS,
      }),
      this.scopedPrisma.communicationNotification.count({ where }),
    ]);

    return { items, total, limit, page };
  }

  findCurrentSchoolNotificationById(
    notificationId: string,
  ): Promise<CommunicationNotificationDetailRecord | null> {
    return this.scopedPrisma.communicationNotification.findFirst({
      where: { id: notificationId },
      ...COMMUNICATION_NOTIFICATION_DETAIL_ARGS,
    });
  }

  async markCurrentSchoolNotificationRead(input: {
    notificationId: string;
    recipientUserId: string;
    readAt: Date;
  }): Promise<CommunicationNotificationDetailRecord> {
    return this.scopedPrisma.$transaction(async (tx) => {
      const current = await tx.communicationNotification.findFirst({
        where: {
          id: input.notificationId,
          recipientUserId: input.recipientUserId,
        },
        select: { id: true, status: true, readAt: true },
      });

      if (!current) {
        throw new Error('Communication notification read target was not found');
      }

      if (
        current.status !== CommunicationNotificationStatus.READ ||
        !current.readAt
      ) {
        await tx.communicationNotification.updateMany({
          where: {
            id: input.notificationId,
            recipientUserId: input.recipientUserId,
          },
          data: {
            status: CommunicationNotificationStatus.READ,
            readAt: current.readAt ?? input.readAt,
          },
        });
      }

      return this.findNotificationInTransaction(tx, input.notificationId);
    });
  }

  async markAllCurrentActorNotificationsRead(input: {
    recipientUserId: string;
    readAt: Date;
  }): Promise<CommunicationNotificationReadAllResult> {
    const result = await this.scopedPrisma.communicationNotification.updateMany({
      where: {
        recipientUserId: input.recipientUserId,
        status: CommunicationNotificationStatus.UNREAD,
      },
      data: {
        status: CommunicationNotificationStatus.READ,
        readAt: input.readAt,
      },
    });

    return { markedCount: result.count, readAt: input.readAt };
  }

  async archiveCurrentSchoolNotification(input: {
    notificationId: string;
    recipientUserId: string;
    archivedAt: Date;
  }): Promise<CommunicationNotificationDetailRecord> {
    return this.scopedPrisma.$transaction(async (tx) => {
      const current = await tx.communicationNotification.findFirst({
        where: {
          id: input.notificationId,
          recipientUserId: input.recipientUserId,
        },
        select: { id: true, status: true, archivedAt: true },
      });

      if (!current) {
        throw new Error('Communication notification archive target was not found');
      }

      if (
        current.status !== CommunicationNotificationStatus.ARCHIVED ||
        !current.archivedAt
      ) {
        await tx.communicationNotification.updateMany({
          where: {
            id: input.notificationId,
            recipientUserId: input.recipientUserId,
          },
          data: {
            status: CommunicationNotificationStatus.ARCHIVED,
            archivedAt: current.archivedAt ?? input.archivedAt,
          },
        });
      }

      return this.findNotificationInTransaction(tx, input.notificationId);
    });
  }

  async listCurrentSchoolNotificationDeliveries(input: {
    filters: CommunicationNotificationDeliveryListFilters;
  }): Promise<CommunicationNotificationDeliveryListResult> {
    const limit = input.filters.limit ?? 50;
    const page = input.filters.page ?? 1;
    const where = this.buildDeliveryWhere(input.filters);

    const [items, total] = await Promise.all([
      this.scopedPrisma.communicationNotificationDelivery.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: limit,
        skip: (page - 1) * limit,
        ...COMMUNICATION_NOTIFICATION_DELIVERY_ARGS,
      }),
      this.scopedPrisma.communicationNotificationDelivery.count({ where }),
    ]);

    return { items, total, limit, page };
  }

  findCurrentSchoolNotificationDeliveryById(
    deliveryId: string,
  ): Promise<CommunicationNotificationDeliveryRecord | null> {
    return this.scopedPrisma.communicationNotificationDelivery.findFirst({
      where: { id: deliveryId },
      ...COMMUNICATION_NOTIFICATION_DELIVERY_ARGS,
    });
  }

  private buildNotificationWhere(
    filters: CommunicationNotificationListFilters,
  ): Prisma.CommunicationNotificationWhereInput {
    return {
      ...(filters.recipientUserId
        ? { recipientUserId: filters.recipientUserId }
        : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.priority ? { priority: filters.priority } : {}),
      ...(filters.type ? { type: filters.type } : {}),
      ...(filters.sourceModule
        ? { sourceModule: filters.sourceModule }
        : {}),
      ...(filters.sourceType ? { sourceType: filters.sourceType } : {}),
      ...(filters.sourceId ? { sourceId: filters.sourceId } : {}),
      ...(filters.createdFrom || filters.createdTo
        ? {
            createdAt: {
              ...(filters.createdFrom ? { gte: filters.createdFrom } : {}),
              ...(filters.createdTo ? { lte: filters.createdTo } : {}),
            },
          }
        : {}),
    };
  }

  private buildDeliveryWhere(
    filters: CommunicationNotificationDeliveryListFilters,
  ): Prisma.CommunicationNotificationDeliveryWhereInput {
    return {
      ...(filters.notificationId
        ? { notificationId: filters.notificationId }
        : {}),
      ...(filters.channel ? { channel: filters.channel } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.provider ? { provider: filters.provider } : {}),
      ...(filters.recipientUserId
        ? { notification: { recipientUserId: filters.recipientUserId } }
        : {}),
      ...(filters.createdFrom || filters.createdTo
        ? {
            createdAt: {
              ...(filters.createdFrom ? { gte: filters.createdFrom } : {}),
              ...(filters.createdTo ? { lte: filters.createdTo } : {}),
            },
          }
        : {}),
    };
  }

  private async findNotificationInTransaction(
    tx: Prisma.TransactionClient,
    notificationId: string,
  ): Promise<CommunicationNotificationDetailRecord> {
    const notification = await tx.communicationNotification.findFirst({
      where: { id: notificationId },
      ...COMMUNICATION_NOTIFICATION_DETAIL_ARGS,
    });

    if (!notification) {
      throw new Error('Communication notification mutation result was not found');
    }

    return notification;
  }
}
