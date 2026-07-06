import { Injectable } from '@nestjs/common';
import {
  AuditOutcome,
  DismissalRequestEventType,
  DismissalRequestStatus,
  Prisma,
  UserType,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

const DISMISSAL_HISTORY_ACADEMIC_ARGS =
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

const DISMISSAL_HISTORY_EVENT_ARGS =
  Prisma.validator<Prisma.DismissalRequestEventDefaultArgs>()({
    select: {
      type: true,
      statusFrom: true,
      statusTo: true,
      note: true,
      metadata: true,
      createdAt: true,
    },
  });

const DISMISSAL_HISTORY_REQUEST_ARGS =
  Prisma.validator<Prisma.DismissalRequestDefaultArgs>()({
    select: {
      id: true,
      status: true,
      requestedAt: true,
      createdAt: true,
      updatedAt: true,
      handedOverAt: true,
      gateId: true,
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
      enrollment: {
        select: DISMISSAL_HISTORY_ACADEMIC_ARGS.select,
      },
      gate: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
      events: {
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: DISMISSAL_HISTORY_EVENT_ARGS.select,
      },
    },
  });

const DISMISSAL_HISTORY_SETTINGS_ARGS =
  Prisma.validator<Prisma.DismissalSettingsDefaultArgs>()({
    select: {
      delayThresholdMinutes: true,
      urgentThresholdMinutes: true,
    },
  });

export type DismissalRequestHistoryRecord = Prisma.DismissalRequestGetPayload<
  typeof DISMISSAL_HISTORY_REQUEST_ARGS
>;

export type DismissalRequestHistorySettingsRecord =
  Prisma.DismissalSettingsGetPayload<typeof DISMISSAL_HISTORY_SETTINGS_ARGS>;

export interface DismissalRequestHistoryFilters {
  statuses?: DismissalRequestStatus[];
  childId?: string;
  gateId?: string;
  stageId?: string;
  gradeId?: string;
  sectionId?: string;
  classroomId?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

@Injectable()
export class DismissalRequestsHistoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  findSettingsThresholds(): Promise<DismissalRequestHistorySettingsRecord | null> {
    return this.scopedPrisma.dismissalSettings.findFirst({
      ...DISMISSAL_HISTORY_SETTINGS_ARGS,
    });
  }

  listHistoryRequests(
    filters: DismissalRequestHistoryFilters,
  ): Promise<DismissalRequestHistoryRecord[]> {
    return this.scopedPrisma.dismissalRequest.findMany({
      where: this.buildHistoryWhere(filters),
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      ...DISMISSAL_HISTORY_REQUEST_ARGS,
    });
  }

  findHistoryRequestById(
    requestId: string,
  ): Promise<DismissalRequestHistoryRecord | null> {
    return this.scopedPrisma.dismissalRequest.findFirst({
      where: {
        id: requestId,
        deletedAt: null,
      },
      ...DISMISSAL_HISTORY_REQUEST_ARGS,
    });
  }

  async escalateWithEventAndAudit(params: {
    schoolId: string;
    organizationId: string | null;
    requestId: string;
    actorUserId: string;
    userType: UserType;
    status: DismissalRequestStatus;
    reason: string;
    note: string | null;
  }): Promise<DismissalRequestHistoryRecord> {
    return this.prisma.$transaction(async (tx) => {
      await tx.dismissalRequestEvent.create({
        data: {
          schoolId: params.schoolId,
          requestId: params.requestId,
          type: DismissalRequestEventType.REQUEST_ESCALATED,
          actorUserId: params.actorUserId,
          statusFrom: params.status,
          statusTo: params.status,
          note: params.note,
          metadata: {
            escalation: true,
            reason: params.reason,
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
          action: 'dismissal.request.escalated',
          resourceType: 'dismissal_request',
          resourceId: params.requestId,
          outcome: AuditOutcome.SUCCESS,
          after: {
            status: params.status,
            reason: params.reason,
            notePresent: Boolean(params.note),
          },
        },
      });

      return tx.dismissalRequest.findFirstOrThrow({
        where: {
          id: params.requestId,
          schoolId: params.schoolId,
        },
        ...DISMISSAL_HISTORY_REQUEST_ARGS,
      });
    });
  }

  private buildHistoryWhere(
    filters: DismissalRequestHistoryFilters,
  ): Prisma.DismissalRequestWhereInput {
    const and: Prisma.DismissalRequestWhereInput[] = [];

    if (filters.classroomId) {
      and.push({ enrollment: { is: { classroomId: filters.classroomId } } });
    }
    if (filters.sectionId) {
      and.push({
        enrollment: {
          is: {
            classroom: { is: { sectionId: filters.sectionId } },
          },
        },
      });
    }
    if (filters.gradeId) {
      and.push({
        enrollment: {
          is: {
            classroom: {
              is: {
                section: { is: { gradeId: filters.gradeId } },
              },
            },
          },
        },
      });
    }
    if (filters.stageId) {
      and.push({
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
      });
    }

    return {
      deletedAt: null,
      ...(filters.statuses?.length
        ? { status: { in: filters.statuses } }
        : {}),
      ...(filters.childId ? { studentId: filters.childId } : {}),
      ...(filters.gateId ? { gateId: filters.gateId } : {}),
      ...(filters.dateFrom || filters.dateTo
        ? {
            requestedAt: {
              ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
              ...(filters.dateTo ? { lte: filters.dateTo } : {}),
            },
          }
        : {}),
      ...(and.length ? { AND: and } : {}),
    };
  }
}
