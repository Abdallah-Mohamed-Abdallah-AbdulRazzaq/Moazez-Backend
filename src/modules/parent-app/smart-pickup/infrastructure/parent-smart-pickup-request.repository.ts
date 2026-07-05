import { Injectable } from '@nestjs/common';
import {
  CommunicationNotificationType,
  DismissalGateOperationalStatus,
  DismissalRequestEventType,
  DismissalRequestStatus,
  Prisma,
  StudentEnrollmentStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { createDismissalStaffNotificationsForRequestEvent } from '../../../dismissal/notifications/application/create-dismissal-notification.service';

const SMART_PICKUP_REQUEST_CHILD_LINK_ARGS =
  Prisma.validator<Prisma.StudentGuardianDefaultArgs>()({
    select: {
      guardianId: true,
      guardian: {
        select: {
          id: true,
          canPickup: true,
          deletedAt: true,
        },
      },
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          status: true,
          deletedAt: true,
        },
      },
    },
  });

const SMART_PICKUP_REQUEST_ENROLLMENT_ARGS =
  Prisma.validator<Prisma.EnrollmentDefaultArgs>()({
    select: {
      id: true,
      studentId: true,
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

const SMART_PICKUP_REQUEST_SETTINGS_ARGS =
  Prisma.validator<Prisma.DismissalSettingsDefaultArgs>()({
    select: {
      id: true,
      enabled: true,
      timezone: true,
      schoolLatitude: true,
      schoolLongitude: true,
      allowedRadiusMeters: true,
      requestWindowStartLocal: true,
      requestWindowEndLocal: true,
      requirePickupCode: true,
      allowParentCancelBeforeCalled: true,
      defaultGateId: true,
    },
  });

const SMART_PICKUP_REQUEST_SCHOOL_PROFILE_ARGS =
  Prisma.validator<Prisma.SchoolProfileDefaultArgs>()({
    select: {
      timezone: true,
      latitude: true,
      longitude: true,
    },
  });

const SMART_PICKUP_REQUEST_GATE_ARGS =
  Prisma.validator<Prisma.DismissalGateDefaultArgs>()({
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
      isActive: true,
      sortOrder: true,
      deletedAt: true,
    },
  });

const SMART_PICKUP_REQUEST_RESPONSE_ARGS =
  Prisma.validator<Prisma.DismissalRequestDefaultArgs>()({
    select: {
      id: true,
      status: true,
      requestedAt: true,
      pickupCodeIssuedAt: true,
      studentId: true,
      gateId: true,
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
      enrollment: {
        select: SMART_PICKUP_REQUEST_ENROLLMENT_ARGS.select,
      },
      gate: {
        select: {
          id: true,
          code: true,
          name: true,
          status: true,
        },
      },
    },
  });

export type ParentSmartPickupRequestChildLinkRecord =
  Prisma.StudentGuardianGetPayload<
    typeof SMART_PICKUP_REQUEST_CHILD_LINK_ARGS
  >;

export type ParentSmartPickupRequestEnrollmentRecord =
  Prisma.EnrollmentGetPayload<typeof SMART_PICKUP_REQUEST_ENROLLMENT_ARGS>;

export type ParentSmartPickupRequestSettingsRecord =
  Prisma.DismissalSettingsGetPayload<
    typeof SMART_PICKUP_REQUEST_SETTINGS_ARGS
  >;

export type ParentSmartPickupRequestSchoolProfileRecord =
  Prisma.SchoolProfileGetPayload<
    typeof SMART_PICKUP_REQUEST_SCHOOL_PROFILE_ARGS
  >;

export type ParentSmartPickupRequestGateRecord =
  Prisma.DismissalGateGetPayload<typeof SMART_PICKUP_REQUEST_GATE_ARGS>;

export type ParentSmartPickupRequestRecord = Prisma.DismissalRequestGetPayload<
  typeof SMART_PICKUP_REQUEST_RESPONSE_ARGS
>;

export const ACTIVE_DISMISSAL_REQUEST_STATUSES: DismissalRequestStatus[] = [
  DismissalRequestStatus.REQUESTED,
  DismissalRequestStatus.QUEUED,
  DismissalRequestStatus.CALLED,
  DismissalRequestStatus.MOVING,
  DismissalRequestStatus.AT_GATE,
  DismissalRequestStatus.READY,
];

@Injectable()
export class ParentSmartPickupRequestRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  listOwnedChildLinks(params: {
    parentUserId: string;
    childId: string;
  }): Promise<ParentSmartPickupRequestChildLinkRecord[]> {
    return this.scopedPrisma.studentGuardian.findMany({
      where: {
        studentId: params.childId,
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
        student: {
          is: {
            deletedAt: null,
          },
        },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      ...SMART_PICKUP_REQUEST_CHILD_LINK_ARGS,
    });
  }

  findActiveEnrollmentForStudent(
    studentId: string,
  ): Promise<ParentSmartPickupRequestEnrollmentRecord | null> {
    return this.scopedPrisma.enrollment.findFirst({
      where: {
        studentId,
        status: StudentEnrollmentStatus.ACTIVE,
        deletedAt: null,
      },
      orderBy: [{ enrolledAt: 'desc' }, { createdAt: 'desc' }],
      ...SMART_PICKUP_REQUEST_ENROLLMENT_ARGS,
    });
  }

  findSettings(): Promise<ParentSmartPickupRequestSettingsRecord | null> {
    return this.scopedPrisma.dismissalSettings.findFirst({
      ...SMART_PICKUP_REQUEST_SETTINGS_ARGS,
    });
  }

  findSchoolProfile(): Promise<ParentSmartPickupRequestSchoolProfileRecord | null> {
    return this.scopedPrisma.schoolProfile.findFirst({
      ...SMART_PICKUP_REQUEST_SCHOOL_PROFILE_ARGS,
    });
  }

  listAvailableGates(): Promise<ParentSmartPickupRequestGateRecord[]> {
    return this.scopedPrisma.dismissalGate.findMany({
      where: {
        isActive: true,
        status: {
          in: [
            DismissalGateOperationalStatus.OPEN,
            DismissalGateOperationalStatus.BUSY,
          ],
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }, { code: 'asc' }],
      ...SMART_PICKUP_REQUEST_GATE_ARGS,
    });
  }

  findGateById(
    gateId: string,
  ): Promise<ParentSmartPickupRequestGateRecord | null> {
    return this.scopedPrisma.dismissalGate.findFirst({
      where: { id: gateId },
      ...SMART_PICKUP_REQUEST_GATE_ARGS,
    });
  }

  findActiveRequestForStudent(
    studentId: string,
  ): Promise<ParentSmartPickupRequestRecord | null> {
    return this.scopedPrisma.dismissalRequest.findFirst({
      where: {
        studentId,
        status: { in: ACTIVE_DISMISSAL_REQUEST_STATUSES },
      },
      orderBy: [{ requestedAt: 'desc' }, { id: 'asc' }],
      ...SMART_PICKUP_REQUEST_RESPONSE_ARGS,
    });
  }

  findRequestByClientRequestId(params: {
    requestedById: string;
    clientRequestId: string;
  }): Promise<ParentSmartPickupRequestRecord | null> {
    return this.scopedPrisma.dismissalRequest.findFirst({
      where: {
        requestedById: params.requestedById,
        clientRequestId: params.clientRequestId,
      },
      ...SMART_PICKUP_REQUEST_RESPONSE_ARGS,
    });
  }

  async createRequestWithEvent(params: {
    schoolId: string;
    studentId: string;
    enrollmentId: string;
    guardianId: string;
    requestedById: string;
    gateId: string;
    clientRequestId: string | null;
    parentLatitude: number;
    parentLongitude: number;
    distanceMeters: number;
    pickupCodeHash: string | null;
    pickupCodeSalt: string | null;
    pickupCodeIssuedAt: Date | null;
  }): Promise<ParentSmartPickupRequestRecord> {
    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const request = await tx.dismissalRequest.create({
        data: {
          schoolId: params.schoolId,
          studentId: params.studentId,
          enrollmentId: params.enrollmentId,
          guardianId: params.guardianId,
          requestedById: params.requestedById,
          gateId: params.gateId,
          status: DismissalRequestStatus.REQUESTED,
          clientRequestId: params.clientRequestId,
          parentLatitude: params.parentLatitude,
          parentLongitude: params.parentLongitude,
          distanceMeters: params.distanceMeters,
          geofencePassed: true,
          pickupCodeHash: params.pickupCodeHash,
          pickupCodeSalt: params.pickupCodeSalt,
          pickupCodeIssuedAt: params.pickupCodeIssuedAt,
        },
        ...SMART_PICKUP_REQUEST_RESPONSE_ARGS,
      });

      await tx.dismissalRequestEvent.create({
        data: {
          schoolId: params.schoolId,
          requestId: request.id,
          type: DismissalRequestEventType.REQUEST_CREATED,
          actorUserId: params.requestedById,
          statusFrom: null,
          statusTo: DismissalRequestStatus.REQUESTED,
          metadata: {
            source: 'parent_smart_pickup',
            geofencePassed: true,
          } satisfies Prisma.InputJsonObject,
        },
      });

      await createDismissalStaffNotificationsForRequestEvent(tx, {
        schoolId: params.schoolId,
        requestId: request.id,
        eventType: CommunicationNotificationType.DISMISSAL_REQUEST_CREATED,
        now,
      });

      return request;
    });
  }
}

export function isPrismaUniqueConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

export function isAvailablePickupGate(
  gate: ParentSmartPickupRequestGateRecord,
): boolean {
  return (
    gate.deletedAt === null &&
    gate.isActive === true &&
    (gate.status === DismissalGateOperationalStatus.OPEN ||
      gate.status === DismissalGateOperationalStatus.BUSY)
  );
}
