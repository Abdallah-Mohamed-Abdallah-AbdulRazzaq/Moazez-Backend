import { Injectable } from '@nestjs/common';
import {
  Prisma,
  ReinforcementSubmissionStatus,
  ReinforcementTaskStatus,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type { ParentAppAccessibleChild } from '../../shared/parent-app.types';
import type {
  ParentTaskStatus,
  ParentTasksQueryDto,
} from '../dto/parent-tasks.dto';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

const SAFE_PROOF_FILE_SELECT = {
  id: true,
  originalName: true,
  mimeType: true,
  sizeBytes: true,
  visibility: true,
  createdAt: true,
} satisfies Prisma.FileSelect;

const PARENT_TASK_SUBMISSION_SELECT = {
  id: true,
  assignmentId: true,
  taskId: true,
  stageId: true,
  studentId: true,
  enrollmentId: true,
  status: true,
  proofText: true,
  submittedAt: true,
  reviewedAt: true,
  proofFile: {
    select: SAFE_PROOF_FILE_SELECT,
  },
} satisfies Prisma.ReinforcementSubmissionSelect;

const PARENT_TASK_ASSIGNMENT_ARGS =
  Prisma.validator<Prisma.ReinforcementAssignmentDefaultArgs>()({
    select: {
      id: true,
      taskId: true,
      academicYearId: true,
      termId: true,
      studentId: true,
      enrollmentId: true,
      status: true,
      progress: true,
      assignedAt: true,
      startedAt: true,
      completedAt: true,
      cancelledAt: true,
      task: {
        select: {
          id: true,
          titleEn: true,
          titleAr: true,
          descriptionEn: true,
          descriptionAr: true,
          source: true,
          status: true,
          rewardType: true,
          rewardValue: true,
          rewardLabelEn: true,
          rewardLabelAr: true,
          dueDate: true,
          assignedByName: true,
          subject: {
            select: {
              id: true,
              nameEn: true,
              nameAr: true,
              code: true,
            },
          },
          stages: {
            where: { deletedAt: null },
            orderBy: [
              { sortOrder: 'asc' },
              { createdAt: 'asc' },
              { id: 'asc' },
            ],
            select: {
              id: true,
              sortOrder: true,
              titleEn: true,
              titleAr: true,
              descriptionEn: true,
              descriptionAr: true,
              proofType: true,
              requiresApproval: true,
            },
          },
        },
      },
      submissions: {
        orderBy: [
          { submittedAt: 'desc' },
          { createdAt: 'desc' },
          { id: 'asc' },
        ],
        select: PARENT_TASK_SUBMISSION_SELECT,
      },
    },
  });

const PARENT_TASK_SUBMISSION_ARGS =
  Prisma.validator<Prisma.ReinforcementSubmissionDefaultArgs>()({
    select: PARENT_TASK_SUBMISSION_SELECT,
  });

export type ParentTaskAssignmentReadModel =
  Prisma.ReinforcementAssignmentGetPayload<typeof PARENT_TASK_ASSIGNMENT_ARGS>;

export type ParentTaskSubmissionReadModel =
  Prisma.ReinforcementSubmissionGetPayload<typeof PARENT_TASK_SUBMISSION_ARGS>;

export interface ParentTasksListReadModel {
  child: ParentAppAccessibleChild;
  items: ParentTaskAssignmentReadModel[];
  total: number;
  page: number;
  limit: number;
}

export interface ParentTasksSummaryReadModel {
  child: ParentAppAccessibleChild;
  total: number;
  pending: number;
  inProgress: number;
  underReview: number;
  completed: number;
  overdue: number;
}

@Injectable()
export class ParentTasksReadAdapter {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  async listTasks(params: {
    child: ParentAppAccessibleChild;
    query?: ParentTasksQueryDto;
  }): Promise<ParentTasksListReadModel> {
    const page = resolvePage(params.query?.page);
    const limit = resolveLimit(params.query?.limit);
    const where = buildAssignmentWhere(params);

    const [items, total] = await Promise.all([
      this.scopedPrisma.reinforcementAssignment.findMany({
        where,
        orderBy: [{ assignedAt: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
        take: limit,
        skip: (page - 1) * limit,
        ...PARENT_TASK_ASSIGNMENT_ARGS,
      }),
      this.scopedPrisma.reinforcementAssignment.count({ where }),
    ]);

    return { child: params.child, items, total, page, limit };
  }

  async getSummary(
    child: ParentAppAccessibleChild,
  ): Promise<ParentTasksSummaryReadModel> {
    const [groups, overdue] = await Promise.all([
      this.scopedPrisma.reinforcementAssignment.groupBy({
        by: ['status'],
        where: buildAssignmentWhere({ child }),
        _count: { _all: true },
      }),
      this.scopedPrisma.reinforcementAssignment.count({
        where: {
          ...buildAssignmentWhere({ child }),
          status: {
            in: [
              ReinforcementTaskStatus.NOT_COMPLETED,
              ReinforcementTaskStatus.IN_PROGRESS,
              ReinforcementTaskStatus.UNDER_REVIEW,
            ],
          },
          task: {
            is: {
              deletedAt: null,
              status: { not: ReinforcementTaskStatus.CANCELLED },
              dueDate: { lt: new Date() },
            },
          },
        },
      }),
    ]);
    const counts = new Map(
      groups.map((group) => [group.status, group._count._all]),
    );
    const pending = counts.get(ReinforcementTaskStatus.NOT_COMPLETED) ?? 0;
    const inProgress = counts.get(ReinforcementTaskStatus.IN_PROGRESS) ?? 0;
    const underReview = counts.get(ReinforcementTaskStatus.UNDER_REVIEW) ?? 0;
    const completed = counts.get(ReinforcementTaskStatus.COMPLETED) ?? 0;

    return {
      child,
      total: pending + inProgress + underReview + completed,
      pending,
      inProgress,
      underReview,
      completed,
      overdue,
    };
  }

  findTask(params: {
    child: ParentAppAccessibleChild;
    taskId: string;
  }): Promise<ParentTaskAssignmentReadModel | null> {
    return this.scopedPrisma.reinforcementAssignment.findFirst({
      where: {
        ...buildAssignmentWhere({ child: params.child }),
        taskId: params.taskId,
      },
      ...PARENT_TASK_ASSIGNMENT_ARGS,
    });
  }

  async listTaskSubmissions(params: {
    child: ParentAppAccessibleChild;
    taskId: string;
  }): Promise<ParentTaskSubmissionReadModel[] | null> {
    const assignment = await this.findTask(params);
    return assignment ? assignment.submissions : null;
  }

  async findTaskSubmission(params: {
    child: ParentAppAccessibleChild;
    taskId: string;
    submissionId: string;
  }): Promise<ParentTaskSubmissionReadModel | null> {
    const assignment = await this.findTask(params);
    if (!assignment) return null;

    return this.scopedPrisma.reinforcementSubmission.findFirst({
      where: {
        id: params.submissionId,
        taskId: params.taskId,
        assignmentId: assignment.id,
        studentId: params.child.studentId,
        enrollmentId: params.child.enrollmentId,
      },
      ...PARENT_TASK_SUBMISSION_ARGS,
    });
  }
}

function buildAssignmentWhere(params: {
  child: ParentAppAccessibleChild;
  query?: Pick<ParentTasksQueryDto, 'status' | 'search'>;
}): Prisma.ReinforcementAssignmentWhereInput {
  const search = params.query?.search?.trim();

  return {
    studentId: params.child.studentId,
    enrollmentId: params.child.enrollmentId,
    academicYearId: params.child.academicYearId,
    ...(params.child.termId ? { termId: params.child.termId } : {}),
    status: params.query?.status
      ? toCoreTaskStatus(params.query.status)
      : { not: ReinforcementTaskStatus.CANCELLED },
    task: {
      is: {
        deletedAt: null,
        status: { not: ReinforcementTaskStatus.CANCELLED },
        ...(search
          ? {
              OR: [
                { titleEn: { contains: search, mode: 'insensitive' } },
                { titleAr: { contains: search, mode: 'insensitive' } },
                { descriptionEn: { contains: search, mode: 'insensitive' } },
                { descriptionAr: { contains: search, mode: 'insensitive' } },
                { assignedByName: { contains: search, mode: 'insensitive' } },
                {
                  subject: {
                    nameEn: { contains: search, mode: 'insensitive' },
                  },
                },
                {
                  subject: {
                    nameAr: { contains: search, mode: 'insensitive' },
                  },
                },
              ],
            }
          : {}),
      },
    },
  };
}

function toCoreTaskStatus(status: ParentTaskStatus): ReinforcementTaskStatus {
  switch (status) {
    case 'pending':
      return ReinforcementTaskStatus.NOT_COMPLETED;
    case 'in_progress':
      return ReinforcementTaskStatus.IN_PROGRESS;
    case 'under_review':
      return ReinforcementTaskStatus.UNDER_REVIEW;
    case 'completed':
      return ReinforcementTaskStatus.COMPLETED;
  }
}

function resolveLimit(limit: number | undefined): number {
  if (!limit || Number.isNaN(limit)) return DEFAULT_LIMIT;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_LIMIT);
}

function resolvePage(page?: number): number {
  if (!page || Number.isNaN(page)) return 1;
  return Math.max(Math.trunc(page), 1);
}
