import { Injectable } from '@nestjs/common';
import {
  AuditOutcome,
  CommunicationNotificationType,
  DismissalRequestEventType,
  DismissalRequestStatus,
  Prisma,
  StudentEnrollmentStatus,
  StudentStatus,
  UserType,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { createDismissalParentNotificationForRequestEvent } from '../../notifications/application/create-dismissal-notification.service';

const DISMISSAL_REQUEST_DELIVERY_ACADEMIC_ARGS =
  Prisma.validator<Prisma.EnrollmentDefaultArgs>()({
    select: {
      id: true,
      status: true,
      classroomId: true,
      classroom: {
        select: {
          id: true,
          nameAr: true,
          nameEn: true,
          sectionId: true,
          section: {
            select: {
              id: true,
              nameAr: true,
              nameEn: true,
              gradeId: true,
              grade: {
                select: {
                  id: true,
                  nameAr: true,
                  nameEn: true,
                  stageId: true,
                  stage: {
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
      },
    },
  });

const DISMISSAL_REQUEST_DELIVERY_ARGS =
  Prisma.validator<Prisma.DismissalRequestDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      studentId: true,
      guardianId: true,
      requestedById: true,
      status: true,
      requestedAt: true,
      updatedAt: true,
      gateId: true,
      pickupCodeHash: true,
      pickupCodeSalt: true,
      pickupCodeIssuedAt: true,
      pickupCodeVerifiedAt: true,
      handedOverAt: true,
      handoverReceiverName: true,
      handoverReceiverRelation: true,
      handoverNote: true,
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          status: true,
          deletedAt: true,
        },
      },
      enrollment: {
        select: DISMISSAL_REQUEST_DELIVERY_ACADEMIC_ARGS.select,
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

const DISMISSAL_DELIVERY_SETTINGS_ARGS =
  Prisma.validator<Prisma.DismissalSettingsDefaultArgs>()({
    select: {
      requirePickupCode: true,
      allowDelegatePickup: true,
    },
  });

const DISMISSAL_PICKUP_RECIPIENT_ARGS =
  Prisma.validator<Prisma.StudentGuardianDefaultArgs>()({
    select: {
      id: true,
      studentId: true,
      guardianId: true,
      guardian: {
        select: {
          id: true,
          userId: true,
          firstName: true,
          lastName: true,
          relation: true,
          phone: true,
          canPickup: true,
          deletedAt: true,
        },
      },
    },
  });

export type DismissalRequestDeliveryRecord = Prisma.DismissalRequestGetPayload<
  typeof DISMISSAL_REQUEST_DELIVERY_ARGS
>;

export type DismissalRequestDeliverySettingsRecord =
  Prisma.DismissalSettingsGetPayload<
    typeof DISMISSAL_DELIVERY_SETTINGS_ARGS
  >;

export type DismissalPickupRecipientRecord =
  Prisma.StudentGuardianGetPayload<typeof DISMISSAL_PICKUP_RECIPIENT_ARGS>;

@Injectable()
export class DismissalRequestsDeliveryRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  findSettings(): Promise<DismissalRequestDeliverySettingsRecord | null> {
    return this.scopedPrisma.dismissalSettings.findFirst({
      ...DISMISSAL_DELIVERY_SETTINGS_ARGS,
    });
  }

  findRequestForDeliveryById(
    requestId: string,
  ): Promise<DismissalRequestDeliveryRecord | null> {
    return this.scopedPrisma.dismissalRequest.findFirst({
      where: {
        id: requestId,
        deletedAt: null,
      },
      ...DISMISSAL_REQUEST_DELIVERY_ARGS,
    });
  }

  listEligiblePickupRecipients(params: {
    studentId: string;
    requestedById: string;
    allowDelegatePickup: boolean;
  }): Promise<DismissalPickupRecipientRecord[]> {
    return this.scopedPrisma.studentGuardian.findMany({
      where: {
        studentId: params.studentId,
        guardian: {
          is: {
            deletedAt: null,
            canPickup: true,
            ...(params.allowDelegatePickup
              ? {}
              : { userId: params.requestedById }),
          },
        },
      },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }],
      ...DISMISSAL_PICKUP_RECIPIENT_ARGS,
    });
  }

  findPickupRecipientLinkByIds(params: {
    studentId: string;
    studentGuardianId: string;
    guardianId: string;
  }): Promise<DismissalPickupRecipientRecord | null> {
    return this.scopedPrisma.studentGuardian.findFirst({
      where: {
        id: params.studentGuardianId,
        studentId: params.studentId,
        guardianId: params.guardianId,
        guardian: {
          is: {
            deletedAt: null,
          },
        },
      },
      ...DISMISSAL_PICKUP_RECIPIENT_ARGS,
    });
  }

  async deliverWithEventAndAudit(params: {
    schoolId: string;
    requestId: string;
    actorUserId: string;
    userType: UserType;
    organizationId: string | null;
    deliveredAt: Date;
    pickupCodeVerified: boolean;
    receiverName: string | null;
    receiverRelation: string | null;
    note: string | null;
  }): Promise<DismissalRequestDeliveryRecord> {
    return this.prisma.$transaction(async (tx) => {
      await tx.dismissalRequest.update({
        where: {
          id_schoolId: {
            id: params.requestId,
            schoolId: params.schoolId,
          },
        },
        data: {
          status: DismissalRequestStatus.HANDED_OVER,
          handedOverAt: params.deliveredAt,
          handedOverById: params.actorUserId,
          pickupCodeVerifiedAt: params.pickupCodeVerified
            ? params.deliveredAt
            : null,
          handoverReceiverName: params.receiverName,
          handoverReceiverRelation: params.receiverRelation,
          handoverNote: params.note,
        },
        select: { id: true },
      });

      await tx.dismissalRequestEvent.create({
        data: {
          schoolId: params.schoolId,
          requestId: params.requestId,
          type: DismissalRequestEventType.REQUEST_STATUS_CHANGED,
          actorUserId: params.actorUserId,
          statusFrom: DismissalRequestStatus.READY,
          statusTo: DismissalRequestStatus.HANDED_OVER,
          note: params.note,
          metadata: {
            pickupRecipientVerified: true,
            pickupRecipientSource: 'guardian_link',
          },
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: params.actorUserId,
          userType: params.userType,
          organizationId: params.organizationId,
          schoolId: params.schoolId,
          module: 'dismissal',
          action: 'dismissal.request.delivered',
          resourceType: 'dismissal_request',
          resourceId: params.requestId,
          outcome: AuditOutcome.SUCCESS,
          before: {
            status: DismissalRequestStatus.READY,
          },
          after: {
            status: DismissalRequestStatus.HANDED_OVER,
            pickupCodeVerified: params.pickupCodeVerified,
            pickupRecipientVerified: true,
            pickupRecipientSource: 'guardian_link',
            receiverName: Boolean(params.receiverName),
            receiverRelation: Boolean(params.receiverRelation),
            note: Boolean(params.note),
          },
        },
      });

      await createDismissalParentNotificationForRequestEvent(tx, {
        schoolId: params.schoolId,
        requestId: params.requestId,
        eventType:
          CommunicationNotificationType.DISMISSAL_REQUEST_HANDED_OVER,
        now: params.deliveredAt,
      });

      return tx.dismissalRequest.findFirstOrThrow({
        where: {
          id: params.requestId,
          schoolId: params.schoolId,
        },
        ...DISMISSAL_REQUEST_DELIVERY_ARGS,
      });
    });
  }
}

export function isRequestStillEligibleForVerifiedDelivery(
  request: DismissalRequestDeliveryRecord,
): boolean {
  return (
    request.student.status === StudentStatus.ACTIVE &&
    request.student.deletedAt === null &&
    request.enrollment.status === StudentEnrollmentStatus.ACTIVE
  );
}
