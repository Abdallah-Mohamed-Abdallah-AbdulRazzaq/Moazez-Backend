import { Injectable } from '@nestjs/common';
import {
  Prisma,
  ReinforcementReviewOutcome,
  ReinforcementSource,
  ReinforcementSubmissionStatus,
  ReinforcementTaskStatus,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

const FILE_SAFE_SELECT = {
  id: true,
  originalName: true,
  mimeType: true,
  sizeBytes: true,
  visibility: true,
  createdAt: true,
} satisfies Prisma.FileSelect;

const REVIEW_SELECT = {
  id: true,
  submissionId: true,
  assignmentId: true,
  taskId: true,
  stageId: true,
  studentId: true,
  reviewedById: true,
  outcome: true,
  note: true,
  noteAr: true,
  reviewedAt: true,
  metadata: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ReinforcementReviewSelect;

const REVIEW_ITEM_ARGS =
  Prisma.validator<Prisma.ReinforcementSubmissionDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      assignmentId: true,
      taskId: true,
      stageId: true,
      studentId: true,
      enrollmentId: true,
      status: true,
      proofFileId: true,
      proofText: true,
      submittedById: true,
      submittedAt: true,
      currentReviewId: true,
      reviewedAt: true,
      metadata: true,
      createdAt: true,
      updatedAt: true,
      proofFile: {
        select: FILE_SAFE_SELECT,
      },
      task: {
        select: {
          id: true,
          academicYearId: true,
          termId: true,
          subjectId: true,
          titleEn: true,
          titleAr: true,
          source: true,
          status: true,
          rewardType: true,
          rewardValue: true,
          rewardLabelEn: true,
          rewardLabelAr: true,
          dueDate: true,
          deletedAt: true,
        },
      },
      stage: {
        select: {
          id: true,
          taskId: true,
          sortOrder: true,
          titleEn: true,
          titleAr: true,
          descriptionEn: true,
          descriptionAr: true,
          proofType: true,
          requiresApproval: true,
          deletedAt: true,
        },
      },
      assignment: {
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
          createdAt: true,
          updatedAt: true,
          task: {
            select: {
              id: true,
              status: true,
              deletedAt: true,
            },
          },
        },
      },
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          status: true,
        },
      },
      enrollment: {
        select: {
          id: true,
          academicYearId: true,
          termId: true,
          classroomId: true,
          status: true,
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
      currentReview: {
        select: REVIEW_SELECT,
      },
      reviews: {
        orderBy: [{ reviewedAt: 'desc' }, { id: 'asc' }],
        select: REVIEW_SELECT,
      },
    },
  });

const ASSIGNMENT_FOR_SUBMIT_ARGS =
  Prisma.validator<Prisma.ReinforcementAssignmentDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      taskId: true,
      academicYearId: true,
      termId: true,
      studentId: true,
      enrollmentId: true,
      status: true,
      progress: true,
      startedAt: true,
      completedAt: true,
      cancelledAt: true,
      task: {
        select: {
          id: true,
          status: true,
          deletedAt: true,
        },
      },
      student: {
        select: {
          id: true,
          status: true,
          deletedAt: true,
        },
      },
      enrollment: {
        select: {
          id: true,
          status: true,
          studentId: true,
          schoolId: true,
        },
      },
    },
  });

const STAGE_FOR_ASSIGNMENT_ARGS =
  Prisma.validator<Prisma.ReinforcementTaskStageDefaultArgs>()({
    select: {
      id: true,
      taskId: true,
      sortOrder: true,
      titleEn: true,
      titleAr: true,
      proofType: true,
      requiresApproval: true,
      deletedAt: true,
    },
  });

const SUBMISSION_STATE_ARGS =
  Prisma.validator<Prisma.ReinforcementSubmissionDefaultArgs>()({
    select: {
      id: true,
      assignmentId: true,
      taskId: true,
      stageId: true,
      status: true,
    },
  });

export type ReinforcementReviewItemRecord = Prisma.ReinforcementSubmissionGetPayload<
  typeof REVIEW_ITEM_ARGS
>;
export type ReinforcementAssignmentForSubmitRecord =
  Prisma.ReinforcementAssignmentGetPayload<typeof ASSIGNMENT_FOR_SUBMIT_ARGS>;
export type ReinforcementStageForAssignmentRecord =
  Prisma.ReinforcementTaskStageGetPayload<typeof STAGE_FOR_ASSIGNMENT_ARGS>;
export type ReinforcementSubmissionStateRecord =
  Prisma.ReinforcementSubmissionGetPayload<typeof SUBMISSION_STATE_ARGS>;
export type ReinforcementProofFileRecord = Prisma.FileGetPayload<{
  select: typeof FILE_SAFE_SELECT;
}>;

export interface ListReviewQueueFilters {
  academicYearId?: string;
  termId?: string;
  status?: ReinforcementSubmissionStatus;
  source?: ReinforcementSource;
  taskId?: string;
  studentId?: string;
  classroomId?: string;
  sectionId?: string;
  gradeId?: string;
  stageId?: string;
  submittedFrom?: Date;
  submittedTo?: Date;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface SubmitStageInput {
  schoolId: string;
  assignment: ReinforcementAssignmentForSubmitRecord;
  stage: ReinforcementStageForAssignmentRecord;
  existingSubmissionId?: string | null;
  assignmentStatus: ReinforcementTaskStatus;
  proofText: string | null;
  proofFileId: string | null;
  submittedById: string | null;
  submittedAt: Date;
  metadata?: unknown;
}

export interface ReviewSubmissionInput {
  schoolId: string;
  submission: ReinforcementReviewItemRecord;
  reviewedById: string;
  reviewedAt: Date;
  note: string | null;
  noteAr: string | null;
  assignmentStatus: ReinforcementTaskStatus;
  assignmentProgress: number;
  assignmentCompletedAt: Date | null;
  outcome: ReinforcementReviewOutcome;
  metadata?: unknown;
}

@Injectable()
export class ReinforcementReviewsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  findAssignmentForSubmit(
    assignmentId: string,
  ): Promise<ReinforcementAssignmentForSubmitRecord | null> {
    return this.scopedPrisma.reinforcementAssignment.findFirst({
      where: {
        id: assignmentId,
        task: { deletedAt: null },
      },
      ...ASSIGNMENT_FOR_SUBMIT_ARGS,
    });
  }

  findStageForAssignment(params: {
    assignment: Pick<ReinforcementAssignmentForSubmitRecord, 'taskId'>;
    stageId: string;
  }): Promise<ReinforcementStageForAssignmentRecord | null> {
    return this.scopedPrisma.reinforcementTaskStage.findFirst({
      where: {
        id: params.stageId,
        taskId: params.assignment.taskId,
      },
      ...STAGE_FOR_ASSIGNMENT_ARGS,
    });
  }

  findProofFile(fileId: string): Promise<ReinforcementProofFileRecord | null> {
    return this.scopedPrisma.file.findFirst({
      where: { id: fileId },
      select: FILE_SAFE_SELECT,
    });
  }

  findSubmissionByAssignmentStage(params: {
    assignmentId: string;
    stageId: string;
  }): Promise<ReinforcementSubmissionStateRecord | null> {
    return this.scopedPrisma.reinforcementSubmission.findFirst({
      where: {
        assignmentId: params.assignmentId,
        stageId: params.stageId,
      },
      ...SUBMISSION_STATE_ARGS,
    });
  }

  async createOrResubmitSubmission(
    input: SubmitStageInput,
  ): Promise<ReinforcementReviewItemRecord> {
    return this.prisma.$transaction(async (tx) => {
      const submissionId = input.existingSubmissionId
        ? await this.resubmitExisting(tx, input)
        : await this.createSubmission(tx, input);

      await tx.reinforcementAssignment.updateMany({
        where: {
          id: input.assignment.id,
          schoolId: input.schoolId,
          status: { not: ReinforcementTaskStatus.CANCELLED },
        },
        data: {
          status: input.assignmentStatus,
          startedAt: input.assignment.startedAt ?? input.submittedAt,
        },
      });

      return this.findReviewItemInTransaction(tx, input.schoolId, submissionId);
    });
  }

  async listReviewQueue(filters: ListReviewQueueFilters): Promise<{
    items: ReinforcementReviewItemRecord[];
    total: number;
  }> {
    const where = this.buildReviewQueueWhere(filters);
    const [items, total] = await Promise.all([
      this.scopedPrisma.reinforcementSubmission.findMany({
        where,
        orderBy: [{ submittedAt: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
        ...(filters.limit ? { take: filters.limit } : {}),
        ...(filters.offset ? { skip: filters.offset } : {}),
        ...REVIEW_ITEM_ARGS,
      }),
      this.scopedPrisma.reinforcementSubmission.count({ where }),
    ]);

    return { items, total };
  }

  findSubmissionForReview(
    submissionId: string,
  ): Promise<ReinforcementReviewItemRecord | null> {
    return this.scopedPrisma.reinforcementSubmission.findFirst({
      where: {
        id: submissionId,
        task: { deletedAt: null },
        stage: { deletedAt: null },
      },
      ...REVIEW_ITEM_ARGS,
    });
  }

  listActiveStagesForTask(taskId: string): Promise<Array<{ id: string }>> {
    return this.scopedPrisma.reinforcementTaskStage.findMany({
      where: {
        taskId,
        deletedAt: null,
      },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      select: { id: true },
    });
  }

  async listApprovedStageIdsForAssignment(
    assignmentId: string,
  ): Promise<string[]> {
    const submissions = await this.scopedPrisma.reinforcementSubmission.findMany({
      where: {
        assignmentId,
        status: ReinforcementSubmissionStatus.APPROVED,
      },
      select: { stageId: true },
    });

    return submissions.map((submission) => submission.stageId);
  }

  approveSubmissionWithReview(
    input: Omit<ReviewSubmissionInput, 'outcome'>,
  ): Promise<ReinforcementReviewItemRecord> {
    return this.reviewSubmissionWithOutcome({
      ...input,
      outcome: ReinforcementReviewOutcome.APPROVED,
    });
  }

  rejectSubmissionWithReview(
    input: Omit<ReviewSubmissionInput, 'outcome'>,
  ): Promise<ReinforcementReviewItemRecord> {
    return this.reviewSubmissionWithOutcome({
      ...input,
      outcome: ReinforcementReviewOutcome.REJECTED,
    });
  }

  private async reviewSubmissionWithOutcome(
    input: ReviewSubmissionInput,
  ): Promise<ReinforcementReviewItemRecord> {
    return this.prisma.$transaction(async (tx) => {
      const review = await tx.reinforcementReview.create({
        data: {
          schoolId: input.schoolId,
          submissionId: input.submission.id,
          assignmentId: input.submission.assignmentId,
          taskId: input.submission.taskId,
          stageId: input.submission.stageId,
          studentId: input.submission.studentId,
          reviewedById: input.reviewedById,
          outcome: input.outcome,
          note: input.note,
          noteAr: input.noteAr,
          reviewedAt: input.reviewedAt,
          metadata: this.toJsonInput(input.metadata),
        },
        select: { id: true },
      });

      await tx.reinforcementSubmission.updateMany({
        where: {
          id: input.submission.id,
          schoolId: input.schoolId,
          status: ReinforcementSubmissionStatus.SUBMITTED,
        },
        data: {
          status:
            input.outcome === ReinforcementReviewOutcome.APPROVED
              ? ReinforcementSubmissionStatus.APPROVED
              : ReinforcementSubmissionStatus.REJECTED,
          reviewedAt: input.reviewedAt,
          currentReviewId: review.id,
        },
      });

      await tx.reinforcementAssignment.updateMany({
        where: {
          id: input.submission.assignmentId,
          schoolId: input.schoolId,
          status: { not: ReinforcementTaskStatus.CANCELLED },
        },
        data: {
          status: input.assignmentStatus,
          progress: input.assignmentProgress,
          ...(input.assignmentCompletedAt
            ? { completedAt: input.assignmentCompletedAt }
            : {}),
        },
      });

      return this.findReviewItemInTransaction(
        tx,
        input.schoolId,
        input.submission.id,
      );
    });
  }

  private async createSubmission(
    tx: Prisma.TransactionClient,
    input: SubmitStageInput,
  ): Promise<string> {
    const submission = await tx.reinforcementSubmission.create({
      data: {
        schoolId: input.schoolId,
        assignmentId: input.assignment.id,
        taskId: input.assignment.taskId,
        stageId: input.stage.id,
        studentId: input.assignment.studentId,
        enrollmentId: input.assignment.enrollmentId,
        status: ReinforcementSubmissionStatus.SUBMITTED,
        proofText: input.proofText,
        proofFileId: input.proofFileId,
        submittedById: input.submittedById,
        submittedAt: input.submittedAt,
        reviewedAt: null,
        currentReviewId: null,
        metadata: this.toJsonInput(input.metadata),
      },
      select: { id: true },
    });

    return submission.id;
  }

  private async resubmitExisting(
    tx: Prisma.TransactionClient,
    input: SubmitStageInput,
  ): Promise<string> {
    await tx.reinforcementSubmission.updateMany({
      where: {
        id: input.existingSubmissionId ?? '',
        schoolId: input.schoolId,
        assignmentId: input.assignment.id,
        stageId: input.stage.id,
        status: {
          in: [
            ReinforcementSubmissionStatus.PENDING,
            ReinforcementSubmissionStatus.REJECTED,
          ],
        },
      },
      data: {
        status: ReinforcementSubmissionStatus.SUBMITTED,
        proofText: input.proofText,
        proofFileId: input.proofFileId,
        submittedById: input.submittedById,
        submittedAt: input.submittedAt,
        reviewedAt: null,
        currentReviewId: null,
        ...(input.metadata === undefined
          ? {}
          : { metadata: this.toJsonInput(input.metadata) }),
      },
    });

    return input.existingSubmissionId ?? '';
  }

  private async findReviewItemInTransaction(
    tx: Prisma.TransactionClient,
    schoolId: string,
    submissionId: string,
  ): Promise<ReinforcementReviewItemRecord> {
    const item = await tx.reinforcementSubmission.findFirst({
      where: {
        id: submissionId,
        schoolId,
        task: { deletedAt: null },
        stage: { deletedAt: null },
      },
      ...REVIEW_ITEM_ARGS,
    });

    if (!item) {
      throw new Error('Reinforcement review item mutation result was not found');
    }

    return item;
  }

  private buildReviewQueueWhere(
    filters: ListReviewQueueFilters,
  ): Prisma.ReinforcementSubmissionWhereInput {
    const taskWhere: Prisma.ReinforcementTaskWhereInput = {
      deletedAt: null,
      ...(filters.academicYearId
        ? { academicYearId: filters.academicYearId }
        : {}),
      ...(filters.termId ? { termId: filters.termId } : {}),
      ...(filters.source ? { source: filters.source } : {}),
    };
    const and: Prisma.ReinforcementSubmissionWhereInput[] = [
      { task: taskWhere },
      { stage: { deletedAt: null } },
    ];

    if (filters.submittedFrom) {
      and.push({ submittedAt: { gte: filters.submittedFrom } });
    }
    if (filters.submittedTo) {
      and.push({ submittedAt: { lte: filters.submittedTo } });
    }

    const search = filters.search?.trim();
    if (search) {
      and.push({
        OR: [
          { id: { equals: search } },
          { task: { titleEn: { contains: search, mode: 'insensitive' } } },
          { task: { titleAr: { contains: search, mode: 'insensitive' } } },
          { student: { firstName: { contains: search, mode: 'insensitive' } } },
          { student: { lastName: { contains: search, mode: 'insensitive' } } },
        ],
      });
    }

    if (
      filters.classroomId ||
      filters.sectionId ||
      filters.gradeId
    ) {
      and.push({
        enrollment: {
          classroom: {
            ...(filters.classroomId ? { id: filters.classroomId } : {}),
            ...(filters.sectionId ? { sectionId: filters.sectionId } : {}),
            ...(filters.gradeId
              ? { section: { gradeId: filters.gradeId } }
              : {}),
          },
        },
      });
    }

    return {
      status: filters.status ?? ReinforcementSubmissionStatus.SUBMITTED,
      ...(filters.taskId ? { taskId: filters.taskId } : {}),
      ...(filters.studentId ? { studentId: filters.studentId } : {}),
      ...(filters.stageId ? { stageId: filters.stageId } : {}),
      ...(and.length > 0 ? { AND: and } : {}),
    };
  }

  private toJsonInput(value: unknown): Prisma.InputJsonValue | undefined {
    return value === undefined ? undefined : (value as Prisma.InputJsonValue);
  }
}
