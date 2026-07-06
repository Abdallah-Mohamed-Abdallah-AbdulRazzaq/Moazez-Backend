import { Injectable } from '@nestjs/common';
import {
  AuditOutcome,
  CommunicationNotificationType,
  DismissalRequestEventType,
  DismissalRequestStatus,
  Prisma,
  UserType,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import {
  createDismissalParentNotificationForRequestEvent,
  createDismissalStaffNotificationsForRequestEvent,
} from '../../notifications/application/create-dismissal-notification.service';

export const DEFAULT_DISMISSAL_EXPIRY_THRESHOLD_MINUTES = 180;
export const MAX_DISMISSAL_EXPIRY_BATCH_SIZE = 500;

const ACTIVE_STATUS_SQL = Prisma.sql`
  'REQUESTED'::dismissal_request_status,
  'QUEUED'::dismissal_request_status,
  'CALLED'::dismissal_request_status,
  'MOVING'::dismissal_request_status,
  'AT_GATE'::dismissal_request_status,
  'READY'::dismissal_request_status
`;

export interface DismissalRequestExpiryCandidate {
  id: string;
  schoolId: string;
  organizationId: string;
  requestedAt: Date;
  expiryThresholdMinutes: number;
}

export interface ExpiredDismissalRequestRecord {
  requestId: string;
  schoolId: string;
  previousStatus: DismissalRequestStatus;
  expiryThresholdMinutes: number;
  waitMinutes: number;
}

@Injectable()
export class DismissalRequestsExpiryRepository {
  constructor(private readonly prisma: PrismaService) {}

  listExpiredCandidates(params: {
    now: Date;
    batchSize: number;
  }): Promise<DismissalRequestExpiryCandidate[]> {
    return this.prisma.$queryRaw<DismissalRequestExpiryCandidate[]>`
      SELECT
        r.id,
        r.school_id AS "schoolId",
        s.organization_id AS "organizationId",
        r.requested_at AS "requestedAt",
        COALESCE(
          ds.expiry_threshold_minutes,
          ${DEFAULT_DISMISSAL_EXPIRY_THRESHOLD_MINUTES}
        )::integer AS "expiryThresholdMinutes"
      FROM dismissal_requests r
      INNER JOIN schools s ON s.id = r.school_id
      LEFT JOIN dismissal_settings ds ON ds.school_id = r.school_id
      WHERE r.deleted_at IS NULL
        AND r.status IN (${ACTIVE_STATUS_SQL})
        AND r.requested_at <= (
          ${params.now}::timestamp
          - (
            COALESCE(
              ds.expiry_threshold_minutes,
              ${DEFAULT_DISMISSAL_EXPIRY_THRESHOLD_MINUTES}
            ) * INTERVAL '1 minute'
          )
        )
      ORDER BY r.requested_at ASC, r.id ASC
      LIMIT ${params.batchSize}
    `;
  }

  async expireCandidate(
    candidate: DismissalRequestExpiryCandidate,
    now: Date,
  ): Promise<ExpiredDismissalRequestRecord | null> {
    const waitMinutes = Math.max(
      0,
      Math.floor((now.getTime() - candidate.requestedAt.getTime()) / 60000),
    );
    const cutoff = new Date(
      now.getTime() - candidate.expiryThresholdMinutes * 60000,
    );

    return this.prisma.$transaction(async (tx) => {
      const selectedRows = await tx.$queryRaw<
        Array<{ status: DismissalRequestStatus }>
      >`
        SELECT status::text AS "status"
        FROM dismissal_requests
        WHERE id = ${candidate.id}::uuid
          AND school_id = ${candidate.schoolId}::uuid
          AND deleted_at IS NULL
          AND status IN (${ACTIVE_STATUS_SQL})
          AND requested_at <= ${cutoff}
        FOR UPDATE
      `;

      const statusFrom = selectedRows[0]?.status;
      if (!statusFrom) return null;

      const updated = await tx.dismissalRequest.updateMany({
        where: {
          id: candidate.id,
          schoolId: candidate.schoolId,
          deletedAt: null,
          status: statusFrom,
          requestedAt: { lte: cutoff },
        },
        data: {
          status: DismissalRequestStatus.EXPIRED,
          updatedAt: now,
        },
      });
      if (updated.count === 0) return null;

      await tx.dismissalRequestEvent.create({
        data: {
          schoolId: candidate.schoolId,
          requestId: candidate.id,
          type: DismissalRequestEventType.REQUEST_STATUS_CHANGED,
          actorUserId: null,
          statusFrom,
          statusTo: DismissalRequestStatus.EXPIRED,
          note: 'Expired automatically by dismissal request expiry worker.',
          metadata: {
            expiredBy: 'system',
            expiryThresholdMinutes: candidate.expiryThresholdMinutes,
            waitMinutes,
            worker: 'dismissal-request-expiry',
          },
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: null,
          userType: UserType.SERVICE_ACCOUNT,
          organizationId: candidate.organizationId,
          schoolId: candidate.schoolId,
          module: 'dismissal',
          action: 'dismissal.request.expired',
          resourceType: 'dismissal_request',
          resourceId: candidate.id,
          outcome: AuditOutcome.SUCCESS,
          before: {
            status: statusFrom,
          } as Prisma.InputJsonObject,
          after: {
            status: DismissalRequestStatus.EXPIRED,
            expiryThresholdMinutes: candidate.expiryThresholdMinutes,
            waitMinutes,
          } as Prisma.InputJsonObject,
        },
      });

      await createDismissalParentNotificationForRequestEvent(tx, {
        schoolId: candidate.schoolId,
        requestId: candidate.id,
        eventType: CommunicationNotificationType.DISMISSAL_REQUEST_EXPIRED,
        now,
      });

      await createDismissalStaffNotificationsForRequestEvent(tx, {
        schoolId: candidate.schoolId,
        requestId: candidate.id,
        eventType: CommunicationNotificationType.DISMISSAL_REQUEST_EXPIRED,
        now,
      });

      return {
        requestId: candidate.id,
        schoolId: candidate.schoolId,
        previousStatus: statusFrom,
        expiryThresholdMinutes: candidate.expiryThresholdMinutes,
        waitMinutes,
      };
    });
  }
}
