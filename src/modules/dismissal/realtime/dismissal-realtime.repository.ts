import { Injectable } from '@nestjs/common';
import {
  CommunicationNotificationDeliveryChannel,
  CommunicationNotificationSourceModule,
  CommunicationNotificationType,
  MembershipStatus,
  Prisma,
  UserStatus,
  UserType,
} from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';

const DISMISSAL_REALTIME_SOURCE_TYPE = 'dismissal_request';

const DISMISSAL_REALTIME_REQUEST_ARGS =
  Prisma.validator<Prisma.DismissalRequestDefaultArgs>()({
    select: {
      id: true,
      status: true,
      requestedById: true,
      gateId: true,
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
      enrollment: {
        select: {
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
      },
      gate: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
    },
  });

const DISMISSAL_REALTIME_NOTIFICATION_ARGS =
  Prisma.validator<Prisma.CommunicationNotificationDefaultArgs>()({
    select: {
      id: true,
      recipientUserId: true,
      type: true,
      title: true,
      body: true,
      readAt: true,
      createdAt: true,
    },
  });

type StaffAssignmentRecipientRecord = {
  staffUserId: string;
  gateId: string | null;
  stageId: string | null;
  gradeId: string | null;
  sectionId: string | null;
  classroomId: string | null;
};

export type DismissalRealtimeRequestRecord =
  Prisma.DismissalRequestGetPayload<typeof DISMISSAL_REALTIME_REQUEST_ARGS>;

export type DismissalRealtimeNotificationRecord =
  Prisma.CommunicationNotificationGetPayload<
    typeof DISMISSAL_REALTIME_NOTIFICATION_ARGS
  >;

@Injectable()
export class DismissalRealtimeRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  findRequest(params: {
    schoolId: string;
    requestId: string;
  }): Promise<DismissalRealtimeRequestRecord | null> {
    return this.scopedPrisma.dismissalRequest.findFirst({
      where: {
        id: params.requestId,
        schoolId: params.schoolId,
        deletedAt: null,
      },
      ...DISMISSAL_REALTIME_REQUEST_ARGS,
    });
  }

  findParentCancelPolicy(params: {
    schoolId: string;
  }): Promise<{ allowParentCancelBeforeCalled: boolean } | null> {
    return this.scopedPrisma.dismissalSettings.findFirst({
      where: {
        schoolId: params.schoolId,
      },
      select: {
        allowParentCancelBeforeCalled: true,
      },
    });
  }

  async listMatchingStaffRecipientIds(params: {
    schoolId: string;
    request: DismissalRealtimeRequestRecord;
    now: Date;
  }): Promise<string[]> {
    const assignments =
      await this.scopedPrisma.dismissalStaffAssignment.findMany({
        where: {
          schoolId: params.schoolId,
          isActive: true,
          deletedAt: null,
          OR: [{ startsAt: null }, { startsAt: { lte: params.now } }],
          AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: params.now } }] }],
          staffUser: {
            is: {
              userType: UserType.DISMISSAL_STAFF,
              status: UserStatus.ACTIVE,
              deletedAt: null,
              memberships: {
                some: {
                  schoolId: params.schoolId,
                  userType: UserType.DISMISSAL_STAFF,
                  status: MembershipStatus.ACTIVE,
                  deletedAt: null,
                },
              },
            },
          },
        },
        select: {
          staffUserId: true,
          gateId: true,
          stageId: true,
          gradeId: true,
          sectionId: true,
          classroomId: true,
        },
      });

    return uniqueStrings(
      assignments
        .filter((assignment) =>
          assignmentMatchesRequest(assignment, params.request),
        )
        .map((assignment) => assignment.staffUserId),
    );
  }

  listStaffNotificationsForRequestEvent(params: {
    schoolId: string;
    requestId: string;
    eventTypes: CommunicationNotificationType[];
  }): Promise<DismissalRealtimeNotificationRecord[]> {
    if (params.eventTypes.length === 0) return Promise.resolve([]);

    return this.scopedPrisma.communicationNotification.findMany({
      where: {
        schoolId: params.schoolId,
        sourceModule: CommunicationNotificationSourceModule.DISMISSAL,
        sourceType: DISMISSAL_REALTIME_SOURCE_TYPE,
        sourceId: params.requestId,
        type: { in: params.eventTypes },
        recipientUser: {
          is: {
            userType: UserType.DISMISSAL_STAFF,
            status: UserStatus.ACTIVE,
            deletedAt: null,
          },
        },
        deliveries: {
          some: {
            channel: CommunicationNotificationDeliveryChannel.IN_APP,
          },
        },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      ...DISMISSAL_REALTIME_NOTIFICATION_ARGS,
    });
  }
}

function assignmentMatchesRequest(
  assignment: StaffAssignmentRecipientRecord,
  request: DismissalRealtimeRequestRecord,
): boolean {
  const academicScope = getRequestAcademicScope(request);
  return (
    matchesNullableDimension(assignment.gateId, request.gateId) &&
    matchesNullableDimension(assignment.classroomId, academicScope.classroomId) &&
    matchesNullableDimension(assignment.sectionId, academicScope.sectionId) &&
    matchesNullableDimension(assignment.gradeId, academicScope.gradeId) &&
    matchesNullableDimension(assignment.stageId, academicScope.stageId)
  );
}

function matchesNullableDimension(
  assignmentValue: string | null,
  requestValue: string | null,
): boolean {
  return !assignmentValue || assignmentValue === requestValue;
}

function getRequestAcademicScope(request: DismissalRealtimeRequestRecord): {
  classroomId: string | null;
  sectionId: string | null;
  gradeId: string | null;
  stageId: string | null;
} {
  const classroom = request.enrollment.classroom;
  const section = classroom?.section ?? null;
  const grade = section?.grade ?? null;

  return {
    classroomId: request.enrollment.classroomId ?? classroom?.id ?? null,
    sectionId: classroom?.sectionId ?? section?.id ?? null,
    gradeId: section?.gradeId ?? grade?.id ?? null,
    stageId: grade?.stageId ?? grade?.stage?.id ?? null,
  };
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}
