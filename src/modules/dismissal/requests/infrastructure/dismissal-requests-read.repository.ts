import { Injectable } from '@nestjs/common';
import { DismissalRequestStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { ACTIVE_DISMISSAL_REQUEST_STATUSES } from '../../shared/dismissal.types';

const DISMISSAL_REQUEST_ACADEMIC_ARGS =
  Prisma.validator<Prisma.EnrollmentDefaultArgs>()({
    select: {
      id: true,
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

const DISMISSAL_REQUEST_QUEUE_ARGS =
  Prisma.validator<Prisma.DismissalRequestDefaultArgs>()({
    select: {
      id: true,
      status: true,
      requestedAt: true,
      gateId: true,
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
      enrollment: {
        select: DISMISSAL_REQUEST_ACADEMIC_ARGS.select,
      },
      gate: {
        select: {
          id: true,
          code: true,
          name: true,
          status: true,
        },
      },
      requestedBy: {
        select: {
          firstName: true,
          lastName: true,
        },
      },
    },
  });

const DISMISSAL_REQUEST_DETAIL_ARGS =
  Prisma.validator<Prisma.DismissalRequestDefaultArgs>()({
    select: {
      ...DISMISSAL_REQUEST_QUEUE_ARGS.select,
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

const DISMISSAL_STAFF_QUEUE_ASSIGNMENT_ARGS =
  Prisma.validator<Prisma.DismissalStaffAssignmentDefaultArgs>()({
    select: {
      gateId: true,
      stageId: true,
      gradeId: true,
      sectionId: true,
      classroomId: true,
      startsAt: true,
      endsAt: true,
    },
  });

const DISMISSAL_SETTINGS_THRESHOLDS_ARGS =
  Prisma.validator<Prisma.DismissalSettingsDefaultArgs>()({
    select: {
      delayThresholdMinutes: true,
      urgentThresholdMinutes: true,
    },
  });

export type DismissalRequestQueueRecord = Prisma.DismissalRequestGetPayload<
  typeof DISMISSAL_REQUEST_QUEUE_ARGS
>;

export type DismissalRequestDetailRecord = Prisma.DismissalRequestGetPayload<
  typeof DISMISSAL_REQUEST_DETAIL_ARGS
>;

export type DismissalStaffQueueAssignmentRecord =
  Prisma.DismissalStaffAssignmentGetPayload<
    typeof DISMISSAL_STAFF_QUEUE_ASSIGNMENT_ARGS
  >;

export type DismissalRequestSettingsThresholdRecord =
  Prisma.DismissalSettingsGetPayload<
    typeof DISMISSAL_SETTINGS_THRESHOLDS_ARGS
  >;

export interface DismissalRequestQueueFilters {
  status?: DismissalRequestStatus;
  gateId?: string;
  stageId?: string;
  gradeId?: string;
  sectionId?: string;
  classroomId?: string;
  q?: string;
}

@Injectable()
export class DismissalRequestsReadRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  findSettingsThresholds(): Promise<DismissalRequestSettingsThresholdRecord | null> {
    return this.scopedPrisma.dismissalSettings.findFirst({
      ...DISMISSAL_SETTINGS_THRESHOLDS_ARGS,
    });
  }

  listActiveStaffAssignments(params: {
    staffUserId: string;
    now: Date;
  }): Promise<DismissalStaffQueueAssignmentRecord[]> {
    return this.scopedPrisma.dismissalStaffAssignment.findMany({
      where: {
        staffUserId: params.staffUserId,
        isActive: true,
        OR: [{ startsAt: null }, { startsAt: { lte: params.now } }],
        AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: params.now } }] }],
      },
      orderBy: [{ isLead: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }],
      ...DISMISSAL_STAFF_QUEUE_ASSIGNMENT_ARGS,
    });
  }

  listActiveRequests(
    filters: DismissalRequestQueueFilters,
  ): Promise<DismissalRequestQueueRecord[]> {
    return this.scopedPrisma.dismissalRequest.findMany({
      where: this.buildRequestWhere(filters),
      orderBy: [{ requestedAt: 'asc' }, { id: 'asc' }],
      ...DISMISSAL_REQUEST_QUEUE_ARGS,
    });
  }

  findActiveRequestById(
    requestId: string,
  ): Promise<DismissalRequestDetailRecord | null> {
    return this.scopedPrisma.dismissalRequest.findFirst({
      where: {
        id: requestId,
        status: { in: ACTIVE_DISMISSAL_REQUEST_STATUSES },
      },
      ...DISMISSAL_REQUEST_DETAIL_ARGS,
    });
  }

  private buildRequestWhere(
    filters: DismissalRequestQueueFilters,
  ): Prisma.DismissalRequestWhereInput {
    const q = filters.q?.trim();

    return {
      status: filters.status
        ? filters.status
        : { in: ACTIVE_DISMISSAL_REQUEST_STATUSES },
      ...(filters.gateId ? { gateId: filters.gateId } : {}),
      ...(filters.classroomId
        ? { enrollment: { is: { classroomId: filters.classroomId } } }
        : {}),
      ...(filters.sectionId
        ? {
            enrollment: {
              is: {
                classroom: { is: { sectionId: filters.sectionId } },
              },
            },
          }
        : {}),
      ...(filters.gradeId
        ? {
            enrollment: {
              is: {
                classroom: {
                  is: {
                    section: { is: { gradeId: filters.gradeId } },
                  },
                },
              },
            },
          }
        : {}),
      ...(filters.stageId
        ? {
            enrollment: {
              is: {
                classroom: {
                  is: {
                    section: {
                      is: {
                        grade: { is: { stageId: filters.stageId } },
                      },
                    },
                  },
                },
              },
            },
          }
        : {}),
      ...(q
        ? {
            OR: [
              { student: { firstName: { contains: q, mode: 'insensitive' } } },
              { student: { lastName: { contains: q, mode: 'insensitive' } } },
              { gate: { code: { contains: q, mode: 'insensitive' } } },
              { gate: { name: { contains: q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
  }
}
