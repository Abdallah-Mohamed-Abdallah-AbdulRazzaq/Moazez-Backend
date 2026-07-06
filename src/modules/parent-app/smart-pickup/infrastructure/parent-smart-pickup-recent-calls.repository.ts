import { Injectable } from '@nestjs/common';
import {
  AuditOutcome,
  CommunicationNotificationType,
  DismissalRequestEventType,
  DismissalRequestStatus,
  Prisma,
  StudentEnrollmentStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { createDismissalStaffNotificationsForRequestEvent } from '../../../dismissal/notifications/application/create-dismissal-notification.service';

const SMART_PICKUP_RECENT_CALL_ENROLLMENT_ARGS =
  Prisma.validator<Prisma.EnrollmentDefaultArgs>()({
    select: {
      id: true,
      status: true,
      deletedAt: true,
      classroom: {
        select: {
          id: true,
          nameAr: true,
          nameEn: true,
          section: {
            select: {
              id: true,
              nameAr: true,
              nameEn: true,
              grade: {
                select: {
                  id: true,
                  nameAr: true,
                  nameEn: true,
                },
              },
            },
          },
        },
      },
    },
  });

const SMART_PICKUP_RECENT_CALL_ARGS =
  Prisma.validator<Prisma.DismissalRequestDefaultArgs>()({
    select: {
      id: true,
      status: true,
      requestedAt: true,
      updatedAt: true,
      pickupCodeIssuedAt: true,
      handedOverAt: true,
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
      enrollment: {
        select: SMART_PICKUP_RECENT_CALL_ENROLLMENT_ARGS.select,
      },
      gate: {
        select: {
          id: true,
          code: true,
          name: true,
          status: true,
        },
      },
      events: {
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: {
          type: true,
          statusFrom: true,
          statusTo: true,
          note: true,
          createdAt: true,
        },
      },
    },
  });

const SMART_PICKUP_RECENT_CALL_SETTINGS_ARGS =
  Prisma.validator<Prisma.DismissalSettingsDefaultArgs>()({
    select: {
      requirePickupCode: true,
      allowParentCancelBeforeCalled: true,
    },
  });

export type ParentSmartPickupRecentCallRecord =
  Prisma.DismissalRequestGetPayload<typeof SMART_PICKUP_RECENT_CALL_ARGS>;

export type ParentSmartPickupRecentCallSettingsRecord =
  Prisma.DismissalSettingsGetPayload<
    typeof SMART_PICKUP_RECENT_CALL_SETTINGS_ARGS
  >;

@Injectable()
export class ParentSmartPickupRecentCallsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  findSettings(): Promise<ParentSmartPickupRecentCallSettingsRecord | null> {
    return this.scopedPrisma.dismissalSettings.findFirst({
      ...SMART_PICKUP_RECENT_CALL_SETTINGS_ARGS,
    });
  }

  listOwnedRequests(params: {
    parentUserId: string;
    childId?: string;
    statuses?: DismissalRequestStatus[];
  }): Promise<ParentSmartPickupRecentCallRecord[]> {
    return this.scopedPrisma.dismissalRequest.findMany({
      where: {
        requestedById: params.parentUserId,
        studentId: params.childId,
        status: params.statuses ? { in: params.statuses } : undefined,
        deletedAt: null,
        guardian: {
          is: {
            userId: params.parentUserId,
            deletedAt: null,
            user: {
              is: {
                id: params.parentUserId,
                userType: UserType.PARENT,
                status: UserStatus.ACTIVE,
                deletedAt: null,
              },
            },
          },
        },
      },
      orderBy: [{ updatedAt: 'desc' }, { requestedAt: 'desc' }, { id: 'asc' }],
      ...SMART_PICKUP_RECENT_CALL_ARGS,
    });
  }

  findOwnedRequestById(params: {
    parentUserId: string;
    requestId: string;
  }): Promise<ParentSmartPickupRecentCallRecord | null> {
    return this.scopedPrisma.dismissalRequest.findFirst({
      where: {
        id: params.requestId,
        requestedById: params.parentUserId,
        deletedAt: null,
        guardian: {
          is: {
            userId: params.parentUserId,
            deletedAt: null,
            user: {
              is: {
                id: params.parentUserId,
                userType: UserType.PARENT,
                status: UserStatus.ACTIVE,
                deletedAt: null,
              },
            },
          },
        },
      },
      ...SMART_PICKUP_RECENT_CALL_ARGS,
    });
  }

  async cancelWithEventAndAudit(params: {
    schoolId: string;
    organizationId: string | null;
    requestId: string;
    actorUserId: string;
    userType: UserType;
    statusFrom: DismissalRequestStatus;
    note: string | null;
  }): Promise<ParentSmartPickupRecentCallRecord> {
    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      await tx.dismissalRequest.update({
        where: {
          id_schoolId: {
            id: params.requestId,
            schoolId: params.schoolId,
          },
        },
        data: {
          status: DismissalRequestStatus.CANCELLED,
        },
        select: { id: true },
      });

      await tx.dismissalRequestEvent.create({
        data: {
          schoolId: params.schoolId,
          requestId: params.requestId,
          type: DismissalRequestEventType.REQUEST_STATUS_CHANGED,
          actorUserId: params.actorUserId,
          statusFrom: params.statusFrom,
          statusTo: DismissalRequestStatus.CANCELLED,
          note: params.note,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: params.actorUserId,
          userType: params.userType,
          organizationId: params.organizationId,
          schoolId: params.schoolId,
          module: 'dismissal',
          action: 'dismissal.request.cancelled_by_parent',
          resourceType: 'dismissal_request',
          resourceId: params.requestId,
          outcome: AuditOutcome.SUCCESS,
          before: {
            status: params.statusFrom,
          },
          after: {
            status: DismissalRequestStatus.CANCELLED,
            note: Boolean(params.note),
          },
        },
      });

      await createDismissalStaffNotificationsForRequestEvent(tx, {
        schoolId: params.schoolId,
        requestId: params.requestId,
        eventType: CommunicationNotificationType.DISMISSAL_REQUEST_CANCELLED,
        now,
      });

      return tx.dismissalRequest.findFirstOrThrow({
        where: {
          id: params.requestId,
          schoolId: params.schoolId,
        },
        ...SMART_PICKUP_RECENT_CALL_ARGS,
      });
    });
  }
}

export function isRecentCallEnrollmentActive(
  request: ParentSmartPickupRecentCallRecord,
): boolean {
  return (
    request.enrollment.status === StudentEnrollmentStatus.ACTIVE &&
    request.enrollment.deletedAt === null
  );
}
