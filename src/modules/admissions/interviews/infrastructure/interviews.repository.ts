import { Injectable } from '@nestjs/common';
import { MembershipStatus, Prisma, UserType } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

const INTERVIEW_RECORD_ARGS = Prisma.validator<Prisma.InterviewDefaultArgs>()({
  select: {
    id: true,
    schoolId: true,
    applicationId: true,
    scheduledAt: true,
    interviewerUserId: true,
    status: true,
    notes: true,
    createdAt: true,
    updatedAt: true,
    application: {
      select: {
        id: true,
        studentName: true,
        status: true,
      },
    },
    interviewerUser: {
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
      },
    },
  },
});

export type InterviewRecord = Prisma.InterviewGetPayload<
  typeof INTERVIEW_RECORD_ARGS
>;

export type ScopedInterviewerRecord = {
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    userType: UserType;
  };
};

@Injectable()
export class InterviewsRepository {
  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  constructor(private readonly prisma: PrismaService) {}

  async listInterviews(params: {
    search?: string;
    status?: InterviewRecord['status'];
    dateFrom?: Date;
    dateTo?: Date;
    page: number;
    limit: number;
  }): Promise<{ items: InterviewRecord[]; total: number }> {
    const where = this.buildWhere(params);
    const skip = (params.page - 1) * params.limit;

    const [items, total] = await Promise.all([
      this.scopedPrisma.interview.findMany({
        where,
        orderBy: [
          { scheduledAt: 'desc' },
          { createdAt: 'desc' },
        ],
        skip,
        take: params.limit,
        ...INTERVIEW_RECORD_ARGS,
      }),
      this.scopedPrisma.interview.count({ where }),
    ]);

    return { items, total };
  }

  findInterviewById(interviewId: string): Promise<InterviewRecord | null> {
    return this.scopedPrisma.interview.findFirst({
      where: { id: interviewId },
      ...INTERVIEW_RECORD_ARGS,
    });
  }

  findScopedInterviewerByUserId(
    userId: string,
  ): Promise<ScopedInterviewerRecord | null> {
    return this.scopedPrisma.membership.findFirst({
      where: {
        userId,
        status: MembershipStatus.ACTIVE,
        deletedAt: null,
        user: {
          deletedAt: null,
        },
      },
      select: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            userType: true,
          },
        },
      },
    });
  }

  createInterview(
    data: Prisma.InterviewUncheckedCreateInput,
  ): Promise<InterviewRecord> {
    return this.prisma.interview.create({
      data,
      ...INTERVIEW_RECORD_ARGS,
    });
  }

  async updateInterview(
    interviewId: string,
    data: Prisma.InterviewUncheckedUpdateInput,
  ): Promise<InterviewRecord | null> {
    const result = await this.scopedPrisma.interview.updateMany({
      where: { id: interviewId },
      data,
    });

    if (result.count === 0) {
      return null;
    }

    return this.findInterviewById(interviewId);
  }

  private buildWhere(params: {
    search?: string;
    status?: InterviewRecord['status'];
    dateFrom?: Date;
    dateTo?: Date;
  }): Prisma.InterviewWhereInput {
    const search = params.search?.trim();

    return {
      ...(params.status ? { status: params.status } : {}),
      ...(params.dateFrom || params.dateTo
        ? {
            scheduledAt: {
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
