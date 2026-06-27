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
import { COMMUNICATION_IN_APP_NOTIFICATION_PROVIDER } from '../domain/communication-notification-generation-domain';

const COMMUNICATION_NOTIFICATION_COMMAND_ARGS =
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
      metadata: true,
      createdAt: true,
      updatedAt: true,
    },
  });

export type CommunicationNotificationCommandRecord =
  Prisma.CommunicationNotificationGetPayload<
    typeof COMMUNICATION_NOTIFICATION_COMMAND_ARGS
  >;

export interface CreateOrReuseCommunicationNotificationInput {
  schoolId: string;
  recipientUserId: string;
  actorUserId: string | null;
  sourceModule: CommunicationNotificationSourceModule;
  sourceType: string;
  sourceId: string | null;
  idempotencyKey: string | null;
  type: CommunicationNotificationType;
  title: string;
  body: string;
  priority: CommunicationNotificationPriority;
  expiresAt: Date | null;
  metadata: Record<string, unknown> | null;
  deliveryChannels: CommunicationNotificationDeliveryChannel[];
  now: Date;
}

export interface CreateOrReuseCommunicationNotificationResult {
  notification: CommunicationNotificationCommandRecord;
  createdNotification: boolean;
  reusedExistingNotification: boolean;
  createdDeliveryCount: number;
  existingDeliveryCount: number;
}

@Injectable()
export class CommunicationNotificationCommandRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  createOrReuseCurrentSchoolNotification(
    input: CreateOrReuseCommunicationNotificationInput,
  ): Promise<CreateOrReuseCommunicationNotificationResult> {
    return this.scopedPrisma.$transaction(async (tx) => {
      if (input.idempotencyKey) {
        await this.lockIdempotencyKeyInTransaction(tx, {
          schoolId: input.schoolId,
          idempotencyKey: input.idempotencyKey,
        });
      }

      const existingNotification = input.idempotencyKey
        ? await this.findByIdempotencyKeyInTransaction(tx, {
            schoolId: input.schoolId,
            idempotencyKey: input.idempotencyKey,
          })
        : null;

      const notification =
        existingNotification ??
        (await tx.communicationNotification.create({
          data: {
            schoolId: input.schoolId,
            recipientUserId: input.recipientUserId,
            actorUserId: input.actorUserId,
            sourceModule: input.sourceModule,
            sourceType: input.sourceType,
            sourceId: input.sourceId,
            idempotencyKey: input.idempotencyKey,
            type: input.type,
            title: input.title,
            body: input.body,
            priority: input.priority,
            status: CommunicationNotificationStatus.UNREAD,
            expiresAt: input.expiresAt,
            ...(input.metadata
              ? { metadata: input.metadata as Prisma.InputJsonValue }
              : {}),
          },
          ...COMMUNICATION_NOTIFICATION_COMMAND_ARGS,
        }));

      const deliveryResult = await this.ensureInAppDeliveriesInTransaction(tx, {
        schoolId: input.schoolId,
        notificationId: notification.id,
        deliveryChannels: input.deliveryChannels,
        now: input.now,
      });

      return {
        notification,
        createdNotification: !existingNotification,
        reusedExistingNotification: Boolean(existingNotification),
        ...deliveryResult,
      };
    });
  }

  private findByIdempotencyKeyInTransaction(
    tx: Prisma.TransactionClient,
    input: {
      schoolId: string;
      idempotencyKey: string;
    },
  ): Promise<CommunicationNotificationCommandRecord | null> {
    return tx.communicationNotification.findFirst({
      where: {
        schoolId: input.schoolId,
        idempotencyKey: input.idempotencyKey,
      },
      ...COMMUNICATION_NOTIFICATION_COMMAND_ARGS,
    });
  }

  private async ensureInAppDeliveriesInTransaction(
    tx: Prisma.TransactionClient,
    input: {
      schoolId: string;
      notificationId: string;
      deliveryChannels: CommunicationNotificationDeliveryChannel[];
      now: Date;
    },
  ): Promise<{
    createdDeliveryCount: number;
    existingDeliveryCount: number;
  }> {
    if (
      !input.deliveryChannels.includes(
        CommunicationNotificationDeliveryChannel.IN_APP,
      )
    ) {
      return {
        createdDeliveryCount: 0,
        existingDeliveryCount: 0,
      };
    }

    const existingDeliveries =
      await tx.communicationNotificationDelivery.findMany({
        where: {
          schoolId: input.schoolId,
          notificationId: input.notificationId,
          channel: CommunicationNotificationDeliveryChannel.IN_APP,
        },
        select: { id: true },
      });
    if (existingDeliveries.length > 0) {
      return {
        createdDeliveryCount: 0,
        existingDeliveryCount: existingDeliveries.length,
      };
    }

    await tx.communicationNotificationDelivery.create({
      data: {
        schoolId: input.schoolId,
        notificationId: input.notificationId,
        channel: CommunicationNotificationDeliveryChannel.IN_APP,
        status: CommunicationNotificationDeliveryStatus.DELIVERED,
        provider: COMMUNICATION_IN_APP_NOTIFICATION_PROVIDER,
        attemptedAt: input.now,
        deliveredAt: input.now,
      },
    });

    return {
      createdDeliveryCount: 1,
      existingDeliveryCount: 0,
    };
  }

  private lockIdempotencyKeyInTransaction(
    tx: Prisma.TransactionClient,
    input: {
      schoolId: string;
      idempotencyKey: string;
    },
  ): Promise<unknown> {
    const lockKey = `communication-notification-idempotency:${input.schoolId}:${input.idempotencyKey}`;
    return tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
  }
}
