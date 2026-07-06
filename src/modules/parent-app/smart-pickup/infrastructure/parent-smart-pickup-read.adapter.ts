import { Injectable } from '@nestjs/common';
import {
  DismissalGateOperationalStatus,
  DismissalRequestStatus,
  Prisma,
  StudentEnrollmentStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

const SMART_PICKUP_GUARDIAN_ARGS =
  Prisma.validator<Prisma.GuardianDefaultArgs>()({
    select: {
      id: true,
      canPickup: true,
    },
  });

const SMART_PICKUP_STUDENT_LINK_ARGS =
  Prisma.validator<Prisma.StudentGuardianDefaultArgs>()({
    select: {
      studentId: true,
      guardianId: true,
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

const SMART_PICKUP_ENROLLMENT_ARGS =
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

const SMART_PICKUP_SETTINGS_ARGS =
  Prisma.validator<Prisma.DismissalSettingsDefaultArgs>()({
    select: {
      enabled: true,
      timezone: true,
      schoolLatitude: true,
      schoolLongitude: true,
      allowedRadiusMeters: true,
      requestWindowStartLocal: true,
      requestWindowEndLocal: true,
      requirePickupCode: true,
      allowDelegatePickup: true,
      allowParentCancelBeforeCalled: true,
    },
  });

const SMART_PICKUP_SCHOOL_PROFILE_ARGS =
  Prisma.validator<Prisma.SchoolProfileDefaultArgs>()({
    select: {
      schoolName: true,
      shortName: true,
      timezone: true,
      latitude: true,
      longitude: true,
      mapPlaceLabel: true,
      formattedAddress: true,
    },
  });

const SMART_PICKUP_ACTIVE_REQUEST_ARGS =
  Prisma.validator<Prisma.DismissalRequestDefaultArgs>()({
    select: {
      id: true,
      studentId: true,
      status: true,
      requestedAt: true,
      pickupCodeIssuedAt: true,
      gate: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
    },
  });

const SMART_PICKUP_GATE_ARGS =
  Prisma.validator<Prisma.DismissalGateDefaultArgs>()({
    select: {
      id: true,
      code: true,
      name: true,
      campus: true,
      status: true,
      isActive: true,
      sortOrder: true,
    },
  });

export type ParentSmartPickupGuardianRecord = Prisma.GuardianGetPayload<
  typeof SMART_PICKUP_GUARDIAN_ARGS
>;

export type ParentSmartPickupStudentLinkRecord =
  Prisma.StudentGuardianGetPayload<typeof SMART_PICKUP_STUDENT_LINK_ARGS>;

export type ParentSmartPickupEnrollmentRecord = Prisma.EnrollmentGetPayload<
  typeof SMART_PICKUP_ENROLLMENT_ARGS
>;

export type ParentSmartPickupSettingsRecord =
  Prisma.DismissalSettingsGetPayload<typeof SMART_PICKUP_SETTINGS_ARGS>;

export type ParentSmartPickupSchoolProfileRecord =
  Prisma.SchoolProfileGetPayload<typeof SMART_PICKUP_SCHOOL_PROFILE_ARGS>;

export type ParentSmartPickupGateRecord = Prisma.DismissalGateGetPayload<
  typeof SMART_PICKUP_GATE_ARGS
>;

export type ParentSmartPickupActiveRequestRecord =
  Prisma.DismissalRequestGetPayload<typeof SMART_PICKUP_ACTIVE_REQUEST_ARGS>;

const ACTIVE_DISMISSAL_REQUEST_STATUSES: DismissalRequestStatus[] = [
  DismissalRequestStatus.REQUESTED,
  DismissalRequestStatus.QUEUED,
  DismissalRequestStatus.CALLED,
  DismissalRequestStatus.MOVING,
  DismissalRequestStatus.AT_GATE,
  DismissalRequestStatus.READY,
];

@Injectable()
export class ParentSmartPickupReadAdapter {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  listCurrentSchoolGuardians(
    parentUserId: string,
  ): Promise<ParentSmartPickupGuardianRecord[]> {
    return this.scopedPrisma.guardian.findMany({
      where: {
        userId: parentUserId,
        deletedAt: null,
        user: {
          is: {
            id: parentUserId,
            userType: UserType.PARENT,
            status: UserStatus.ACTIVE,
            deletedAt: null,
          },
        },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      ...SMART_PICKUP_GUARDIAN_ARGS,
    });
  }

  listLinkedChildren(
    guardianIds: string[],
  ): Promise<ParentSmartPickupStudentLinkRecord[]> {
    if (guardianIds.length === 0) return Promise.resolve([]);

    return this.scopedPrisma.studentGuardian.findMany({
      where: {
        guardianId: { in: guardianIds },
        guardian: {
          is: {
            id: { in: guardianIds },
            deletedAt: null,
          },
        },
        student: {
          is: {
            deletedAt: null,
          },
        },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      ...SMART_PICKUP_STUDENT_LINK_ARGS,
    });
  }

  listActiveEnrollments(
    studentIds: string[],
  ): Promise<ParentSmartPickupEnrollmentRecord[]> {
    if (studentIds.length === 0) return Promise.resolve([]);

    return this.scopedPrisma.enrollment.findMany({
      where: {
        studentId: { in: studentIds },
        status: StudentEnrollmentStatus.ACTIVE,
        deletedAt: null,
      },
      orderBy: [{ enrolledAt: 'desc' }, { createdAt: 'desc' }],
      ...SMART_PICKUP_ENROLLMENT_ARGS,
    });
  }

  findSettings(): Promise<ParentSmartPickupSettingsRecord | null> {
    return this.scopedPrisma.dismissalSettings.findFirst({
      ...SMART_PICKUP_SETTINGS_ARGS,
    });
  }

  findSchoolProfile(): Promise<ParentSmartPickupSchoolProfileRecord | null> {
    return this.scopedPrisma.schoolProfile.findFirst({
      ...SMART_PICKUP_SCHOOL_PROFILE_ARGS,
    });
  }

  listAvailableGates(): Promise<ParentSmartPickupGateRecord[]> {
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
      ...SMART_PICKUP_GATE_ARGS,
    });
  }

  listActiveRequestsForStudents(
    studentIds: string[],
  ): Promise<ParentSmartPickupActiveRequestRecord[]> {
    if (studentIds.length === 0) return Promise.resolve([]);

    return this.scopedPrisma.dismissalRequest.findMany({
      where: {
        studentId: { in: studentIds },
        status: { in: ACTIVE_DISMISSAL_REQUEST_STATUSES },
        deletedAt: null,
      },
      orderBy: [{ requestedAt: 'desc' }, { id: 'asc' }],
      ...SMART_PICKUP_ACTIVE_REQUEST_ARGS,
    });
  }
}
