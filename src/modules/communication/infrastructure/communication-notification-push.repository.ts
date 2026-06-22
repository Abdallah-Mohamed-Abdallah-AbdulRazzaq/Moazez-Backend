import { Injectable } from '@nestjs/common';
import {
  CommunicationNotificationDeliveryChannel,
  CommunicationNotificationDeliveryStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { COMMUNICATION_PUSH_NOTIFICATION_PROVIDER } from '../domain/communication-notification-generation-domain';

const PUSH_DELIVERY_FOR_PROCESSING_ARGS =
  Prisma.validator<Prisma.CommunicationNotificationDeliveryDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      notificationId: true,
      channel: true,
      status: true,
      provider: true,
      notification: {
        select: {
          id: true,
          schoolId: true,
          recipientUserId: true,
          sourceModule: true,
          sourceType: true,
          sourceId: true,
          type: true,
          title: true,
          body: true,
          metadata: true,
        },
      },
    },
  });

export type CommunicationPushDeliveryForProcessing =
  Prisma.CommunicationNotificationDeliveryGetPayload<
    typeof PUSH_DELIVERY_FOR_PROCESSING_ARGS
  >;

export interface RecordPushAttemptResultInput {
  schoolId: string;
  deliveryId: string;
  deviceTokenId: string;
  status: CommunicationNotificationDeliveryStatus;
  providerMessageId?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  attemptedAt: Date;
  sentAt?: Date | null;
  failedAt?: Date | null;
  skippedAt?: Date | null;
}

export interface UpdatePushDeliveryStatusInput {
  schoolId: string;
  deliveryId: string;
  status: CommunicationNotificationDeliveryStatus;
  attemptedAt: Date;
  sentAt?: Date | null;
  failedAt?: Date | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class CommunicationNotificationPushRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  findCurrentSchoolPushDeliveryForProcessing(
    deliveryId: string,
  ): Promise<CommunicationPushDeliveryForProcessing | null> {
    return this.scopedPrisma.communicationNotificationDelivery.findFirst({
      where: {
        id: deliveryId,
        channel: CommunicationNotificationDeliveryChannel.PUSH,
      },
      ...PUSH_DELIVERY_FOR_PROCESSING_ARGS,
    });
  }

  async ensurePendingAttempts(input: {
    schoolId: string;
    deliveryId: string;
    deviceTokenIds: string[];
  }): Promise<void> {
    if (input.deviceTokenIds.length === 0) return;

    await this.scopedPrisma.communicationNotificationPushAttempt.createMany({
      data: input.deviceTokenIds.map((deviceTokenId) => ({
        schoolId: input.schoolId,
        deliveryId: input.deliveryId,
        deviceTokenId,
        status: CommunicationNotificationDeliveryStatus.PENDING,
        provider: COMMUNICATION_PUSH_NOTIFICATION_PROVIDER,
      })),
      skipDuplicates: true,
    });
  }

  async recordAttemptResult(
    input: RecordPushAttemptResultInput,
  ): Promise<void> {
    await this.scopedPrisma.communicationNotificationPushAttempt.upsert({
      where: {
        deliveryId_deviceTokenId: {
          deliveryId: input.deliveryId,
          deviceTokenId: input.deviceTokenId,
        },
      },
      create: {
        schoolId: input.schoolId,
        deliveryId: input.deliveryId,
        deviceTokenId: input.deviceTokenId,
        status: input.status,
        provider: COMMUNICATION_PUSH_NOTIFICATION_PROVIDER,
        providerMessageId: input.providerMessageId ?? null,
        errorCode: input.errorCode ?? null,
        errorMessage: input.errorMessage ?? null,
        attemptedAt: input.attemptedAt,
        sentAt: input.sentAt ?? null,
        failedAt: input.failedAt ?? null,
        skippedAt: input.skippedAt ?? null,
      },
      update: {
        status: input.status,
        provider: COMMUNICATION_PUSH_NOTIFICATION_PROVIDER,
        providerMessageId: input.providerMessageId ?? null,
        errorCode: input.errorCode ?? null,
        errorMessage: input.errorMessage ?? null,
        attemptedAt: input.attemptedAt,
        sentAt: input.sentAt ?? null,
        failedAt: input.failedAt ?? null,
        skippedAt: input.skippedAt ?? null,
      },
    });
  }

  async updateDeliveryStatus(
    input: UpdatePushDeliveryStatusInput,
  ): Promise<void> {
    await this.scopedPrisma.communicationNotificationDelivery.updateMany({
      where: {
        id: input.deliveryId,
        schoolId: input.schoolId,
        channel: CommunicationNotificationDeliveryChannel.PUSH,
      },
      data: {
        status: input.status,
        provider: COMMUNICATION_PUSH_NOTIFICATION_PROVIDER,
        errorCode: input.errorCode ?? null,
        errorMessage: input.errorMessage ?? null,
        attemptedAt: input.attemptedAt,
        sentAt: input.sentAt ?? null,
        failedAt: input.failedAt ?? null,
        ...(input.metadata
          ? { metadata: input.metadata as Prisma.InputJsonValue }
          : {}),
      },
    });
  }
}
