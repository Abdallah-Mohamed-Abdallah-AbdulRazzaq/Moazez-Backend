import { Injectable } from '@nestjs/common';
import {
  AdmissionApplicationStatus,
  InterviewStatus,
  PlacementTestStatus,
  Prisma,
} from '@prisma/client';
import { getRequestContext } from '../../../../common/context/request-context';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

const ADMISSION_DECISION_RECORD_ARGS =
  Prisma.validator<Prisma.AdmissionDecisionDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      applicationId: true,
      decision: true,
      reason: true,
      decidedByUserId: true,
      decidedAt: true,
      createdAt: true,
      updatedAt: true,
      application: {
        select: {
          id: true,
          studentName: true,
          status: true,
        },
      },
      decidedByUser: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
    },
  });

export type AdmissionDecisionRecord = Prisma.AdmissionDecisionGetPayload<
  typeof ADMISSION_DECISION_RECORD_ARGS
>;

@Injectable()
export class AdmissionDecisionsRepository {
  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  constructor(private readonly prisma: PrismaService) {}

  async listAdmissionDecisions(params: {
    search?: string;
    decision?: AdmissionDecisionRecord['decision'];
    dateFrom?: Date;
    dateTo?: Date;
    page: number;
    limit: number;
  }): Promise<{ items: AdmissionDecisionRecord[]; total: number }> {
    const where = this.buildWhere(params);
    const skip = (params.page - 1) * params.limit;

    const [items, total] = await Promise.all([
      this.scopedPrisma.admissionDecision.findMany({
        where,
        orderBy: [
          { decidedAt: 'desc' },
          { createdAt: 'desc' },
        ],
        skip,
        take: params.limit,
        ...ADMISSION_DECISION_RECORD_ARGS,
      }),
      this.scopedPrisma.admissionDecision.count({ where }),
    ]);

    return { items, total };
  }

  findAdmissionDecisionById(
    admissionDecisionId: string,
  ): Promise<AdmissionDecisionRecord | null> {
    return this.scopedPrisma.admissionDecision.findFirst({
      where: { id: admissionDecisionId },
      ...ADMISSION_DECISION_RECORD_ARGS,
    });
  }

  findAdmissionDecisionByApplicationId(
    applicationId: string,
  ): Promise<AdmissionDecisionRecord | null> {
    return this.scopedPrisma.admissionDecision.findFirst({
      where: { applicationId },
      ...ADMISSION_DECISION_RECORD_ARGS,
    });
  }

  countPlacementTestsForApplication(params: {
    applicationId: string;
    status?: PlacementTestStatus;
  }): Promise<number> {
    return this.scopedPrisma.placementTest.count({
      where: {
        applicationId: params.applicationId,
        ...(params.status ? { status: params.status } : {}),
      },
    });
  }

  countInterviewsForApplication(params: {
    applicationId: string;
    status?: InterviewStatus;
  }): Promise<number> {
    return this.scopedPrisma.interview.count({
      where: {
        applicationId: params.applicationId,
        ...(params.status ? { status: params.status } : {}),
      },
    });
  }

  createDecisionAndUpdateApplicationStatus(data: {
    schoolId: string;
    applicationId: string;
    decision: AdmissionDecisionRecord['decision'];
    reason: string | null;
    decidedByUserId: string;
    decidedAt: Date;
    applicationStatus: AdmissionApplicationStatus;
  }): Promise<AdmissionDecisionRecord> {
    return this.prisma.$transaction(async (tx) => {
      const admissionDecision = await tx.admissionDecision.create({
        data: {
          schoolId: data.schoolId,
          applicationId: data.applicationId,
          decision: data.decision,
          reason: data.reason,
          decidedByUserId: data.decidedByUserId,
          decidedAt: data.decidedAt,
        },
      });

      await tx.application.update({
        where: {
          id_schoolId: {
            id: data.applicationId,
            schoolId: data.schoolId,
          },
        },
        data: {
          status: data.applicationStatus,
        },
      });

      return tx.admissionDecision.findUniqueOrThrow({
        where: { id: admissionDecision.id },
        ...ADMISSION_DECISION_RECORD_ARGS,
      });
    });
  }

  private buildWhere(params: {
    search?: string;
    decision?: AdmissionDecisionRecord['decision'];
    dateFrom?: Date;
    dateTo?: Date;
  }): Prisma.AdmissionDecisionWhereInput {
    const search = params.search?.trim();

    return {
      ...(params.decision ? { decision: params.decision } : {}),
      ...(params.dateFrom || params.dateTo
        ? {
            decidedAt: {
              ...(params.dateFrom ? { gte: params.dateFrom } : {}),
              ...(params.dateTo ? { lte: params.dateTo } : {}),
            },
          }
        : {}),
      ...(search
        ? {
            application: {
              studentName: {
                contains: search,
                mode: Prisma.QueryMode.insensitive,
              },
            },
          }
        : {}),
    };
  }
}
