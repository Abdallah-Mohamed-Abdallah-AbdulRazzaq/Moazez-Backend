import { Injectable } from '@nestjs/common';
import {
  CommunicationNotificationDeliveryChannel,
  CommunicationNotificationDeliveryStatus,
  OrganizationStatus,
  Prisma,
  SchoolStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { COMMUNICATION_PUSH_NOTIFICATION_PROVIDER } from '../domain/communication-notification-generation-domain';
import { COMMUNICATION_PUSH_RECOVERY_WINDOW_EXPIRED_CODE } from '../domain/communication-notification-generation-domain';

const PUSH_DELIVERY_FOR_PROCESSING_ARGS =
  Prisma.validator<Prisma.CommunicationNotificationDeliveryDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      notificationId: true,
      channel: true,
      status: true,
      provider: true,
      createdAt: true,
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
          recipientUser: {
            select: {
              userType: true,
            },
          },
        },
      },
    },
  });

export type CommunicationPushDeliveryForProcessing =
  Prisma.CommunicationNotificationDeliveryGetPayload<
    typeof PUSH_DELIVERY_FOR_PROCESSING_ARGS
  >;

export interface CommunicationPushAttemptRecord {
  deviceTokenId: string;
  status: CommunicationNotificationDeliveryStatus;
  errorCode: string | null;
  providerMessageId: string | null;
}

export interface CommunicationPushRecoveryCandidate {
  id: string;
  notificationId: string;
  schoolId: string;
  organizationId: string;
  actorUserId: string | null;
  actorUserType: UserType | null;
  ineligibilityCode:
    | 'push/tenant-ineligible'
    | 'push/recipient-ineligible'
    | 'push/source-ineligible'
    | null;
  createdAt: Date;
}

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

  listAttemptsForDelivery(
    deliveryId: string,
  ): Promise<CommunicationPushAttemptRecord[]> {
    return this.scopedPrisma.communicationNotificationPushAttempt.findMany({
      where: { deliveryId },
      select: {
        deviceTokenId: true,
        status: true,
        errorCode: true,
        providerMessageId: true,
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  async listPushRecoveryCandidates(input: {
    windowStartedAt: Date;
    expired: boolean;
    afterId?: string;
    take: number;
  }): Promise<CommunicationPushRecoveryCandidate[]> {
    const rows = await this.prisma.communicationNotificationDelivery.findMany({
      where: {
        channel: CommunicationNotificationDeliveryChannel.PUSH,
        status: {
          in: [
            CommunicationNotificationDeliveryStatus.PENDING,
            CommunicationNotificationDeliveryStatus.FAILED,
          ],
        },
        OR: [
          { errorCode: null },
          {
            errorCode: {
              notIn: [
                COMMUNICATION_PUSH_RECOVERY_WINDOW_EXPIRED_CODE,
                'push/permanent-attempts-failed',
                'push/source-ineligible',
                'push/tenant-ineligible',
                'push/recipient-ineligible',
              ],
            },
          },
        ],
        createdAt: input.expired
          ? { lte: input.windowStartedAt }
          : { gt: input.windowStartedAt },
      },
      select: {
        id: true,
        notificationId: true,
        schoolId: true,
        createdAt: true,
        school: {
          select: {
            organizationId: true,
            status: true,
            deletedAt: true,
            organization: { select: { status: true, deletedAt: true } },
          },
        },
        notification: {
          select: {
            actorUser: {
              select: {
                id: true,
                userType: true,
                status: true,
                deletedAt: true,
              },
            },
            recipientUser: {
              select: {
                id: true,
                userType: true,
                status: true,
                deletedAt: true,
              },
            },
          },
        },
      },
      orderBy: { id: 'asc' },
      ...(input.afterId ? { cursor: { id: input.afterId }, skip: 1 } : {}),
      take: input.take,
    });

    return rows.map((row) => {
      const actor =
        row.notification.actorUser?.status === UserStatus.ACTIVE &&
        row.notification.actorUser.deletedAt === null
          ? row.notification.actorUser
          : null;
      const tenantIneligible =
        row.school.status !== SchoolStatus.ACTIVE ||
        row.school.deletedAt !== null ||
        row.school.organization.status !== OrganizationStatus.ACTIVE ||
        row.school.organization.deletedAt !== null;
      const recipientIneligible =
        row.notification.recipientUser.status !== UserStatus.ACTIVE ||
        row.notification.recipientUser.deletedAt !== null;
      return {
        id: row.id,
        notificationId: row.notificationId,
        schoolId: row.schoolId,
        organizationId: row.school.organizationId,
        actorUserId: actor?.id ?? null,
        actorUserType: actor?.userType ?? null,
        ineligibilityCode: tenantIneligible
          ? 'push/tenant-ineligible'
          : recipientIneligible
            ? 'push/recipient-ineligible'
            : null,
        createdAt: row.createdAt,
      };
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
