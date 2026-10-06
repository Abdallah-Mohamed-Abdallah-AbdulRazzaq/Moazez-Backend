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
import { isRetryableCommunicationPushErrorCode } from '../domain/communication-notification-generation-domain';

const PUSH_DELIVERY_FOR_PROCESSING_ARGS =
  Prisma.validator<Prisma.CommunicationNotificationDeliveryDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      notificationId: true,
      channel: true,
      status: true,
      errorCode: true,
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

export function isProcessableCommunicationPushState(state: {
  status: CommunicationNotificationDeliveryStatus;
  errorCode: string | null;
}): boolean {
  return (
    state.status === CommunicationNotificationDeliveryStatus.PENDING ||
    (state.status === CommunicationNotificationDeliveryStatus.FAILED &&
      isRetryableCommunicationPushErrorCode(state.errorCode))
  );
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

  async findCurrentDeliveryEligibility(input: {
    schoolId: string;
    deliveryId: string;
    recipientUserType: UserType;
  }) {
    // One statement observes tenant, recipient and exact review membership in
    // the same database snapshot. It holds no locks during provider dispatch.
    const rows = await this.scopedPrisma.$queryRaw<
      Array<{
        status: CommunicationNotificationDeliveryStatus;
        errorCode: string | null;
        ineligibilityCode: string | null;
      }>
    >(Prisma.sql`
      SELECT d.status, d.error_code AS "errorCode",
        CASE
          WHEN s.status <> 'ACTIVE' OR s.deleted_at IS NOT NULL OR o.status <> 'ACTIVE' OR o.deleted_at IS NOT NULL THEN 'push/tenant-ineligible'
          WHEN u.status <> 'ACTIVE' OR u.deleted_at IS NOT NULL THEN 'push/recipient-ineligible'
          WHEN u.user_type::text <> ${input.recipientUserType} THEN
            CASE WHEN n.source_module = 'ACADEMICS' THEN 'push/academic-content-recipient-type-ineligible' ELSE 'push/recipient-ineligible' END
          WHEN n.source_module = 'ACADEMICS' AND n.source_type = 'academic_content_approval'
            AND n.type IN ('ACADEMIC_CONTENT_APPROVED', 'ACADEMIC_CONTENT_CHANGES_REQUESTED') AND u.user_type = 'TEACHER'
            AND NOT EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = n.recipient_user_id
              AND m.school_id = d.school_id AND m.organization_id = s.organization_id AND m.user_type = 'TEACHER'
              AND m.status = 'ACTIVE' AND m.deleted_at IS NULL AND m.ended_at IS NULL)
            THEN 'push/recipient-ineligible'
          ELSE NULL
        END AS "ineligibilityCode"
      FROM communication_notification_deliveries d
      JOIN communication_notifications n ON n.id = d.notification_id AND n.school_id = d.school_id
      JOIN schools s ON s.id = d.school_id JOIN organizations o ON o.id = s.organization_id
      JOIN users u ON u.id = n.recipient_user_id
      WHERE d.id = ${input.deliveryId}::uuid AND d.school_id = ${input.schoolId}::uuid AND d.channel = 'PUSH'`);
    return rows[0] ?? null;
  }

  async ensurePendingAttempts(input: {
    schoolId: string;
    deliveryId: string;
    deviceTokenIds: string[];
  }): Promise<void> {
    if (input.deviceTokenIds.length === 0) return;

    // One short SQL statement locks the parent through insertion, including a
    // concurrent terminalizer. No lock survives this database call.
    await this.scopedPrisma.$executeRaw(Prisma.sql`
      WITH parent AS (
        SELECT id, school_id FROM communication_notification_deliveries
        WHERE id = ${input.deliveryId}::uuid AND school_id = ${input.schoolId}::uuid AND channel = 'PUSH'
          AND (status = 'PENDING' OR (status = 'FAILED' AND error_code IN ('fcm/quota-exceeded', 'fcm/unavailable', 'fcm/internal', 'fcm/unknown')))
        FOR UPDATE
      )
      INSERT INTO communication_notification_push_attempts (school_id, delivery_id, device_token_id, status, provider, updated_at)
      SELECT p.school_id, p.id, t.id, 'PENDING', ${COMMUNICATION_PUSH_NOTIFICATION_PROVIDER}, now()
      FROM parent p JOIN app_device_tokens t ON t.school_id = p.school_id
      WHERE t.id IN (${Prisma.join(input.deviceTokenIds.map((id) => Prisma.sql`${id}::uuid`))})
      ON CONFLICT (delivery_id, device_token_id) DO NOTHING`);
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
        OR: [
          { status: CommunicationNotificationDeliveryStatus.PENDING },
          {
            status: CommunicationNotificationDeliveryStatus.FAILED,
            errorCode: {
              in: [
                'fcm/quota-exceeded',
                'fcm/unavailable',
                'fcm/internal',
                'fcm/unknown',
              ].filter(isRetryableCommunicationPushErrorCode),
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
    const delivery =
      await this.scopedPrisma.communicationNotificationDelivery.findFirst({
        where: {
          id: input.deliveryId,
          schoolId: input.schoolId,
          channel: CommunicationNotificationDeliveryChannel.PUSH,
        },
        select: { status: true, errorCode: true },
      });
    if (!delivery)
      throw new Error('communication_push_delivery_scope_mismatch');
    if (!isProcessableCommunicationPushState(delivery)) return;
    await this.ensurePendingAttempts({
      ...input,
      deviceTokenIds: [input.deviceTokenId],
    });
    const attempt =
      await this.scopedPrisma.communicationNotificationPushAttempt.findFirst({
        where: {
          schoolId: input.schoolId,
          deliveryId: input.deliveryId,
          deviceTokenId: input.deviceTokenId,
        },
        select: { status: true, errorCode: true },
      });
    if (!attempt || !isProcessableCommunicationPushState(attempt)) return;
    await this.scopedPrisma.communicationNotificationPushAttempt.updateMany({
      where: {
        deliveryId: input.deliveryId,
        deviceTokenId: input.deviceTokenId,
        schoolId: input.schoolId,
        status: attempt.status,
        errorCode: attempt.errorCode,
        delivery: { status: delivery.status, errorCode: delivery.errorCode },
      },
      data: {
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
  ): Promise<boolean> {
    const current =
      await this.scopedPrisma.communicationNotificationDelivery.findFirst({
        where: {
          id: input.deliveryId,
          schoolId: input.schoolId,
          channel: CommunicationNotificationDeliveryChannel.PUSH,
        },
        select: { status: true, errorCode: true },
      });
    if (!current || !isProcessableCommunicationPushState(current)) return false;
    const result =
      await this.scopedPrisma.communicationNotificationDelivery.updateMany({
        where: {
          id: input.deliveryId,
          schoolId: input.schoolId,
          channel: CommunicationNotificationDeliveryChannel.PUSH,
          status: current.status,
          errorCode: current.errorCode,
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
    return result.count === 1;
  }
}
