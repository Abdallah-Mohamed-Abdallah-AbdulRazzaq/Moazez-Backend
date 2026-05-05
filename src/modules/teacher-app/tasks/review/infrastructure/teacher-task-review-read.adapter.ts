import { Injectable } from '@nestjs/common';
import {
  Prisma,
  ReinforcementSource,
  ReinforcementSubmissionStatus,
  StudentEnrollmentStatus,
  StudentStatus,
} from '@prisma/client';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import type { TeacherAppAllocationRecord } from '../../../shared/teacher-app.types';

const DEFAULT_REVIEW_QUEUE_LIMIT = 20;
const MAX_REVIEW_QUEUE_LIMIT = 100;

const REVIEW_PROOF_FILE_SELECT = {
  id: true,
  originalName: true,
  mimeType: true,
  sizeBytes: true,
  visibility: true,
  createdAt: true,
} satisfies Prisma.FileSelect;

const REVIEW_REVIEW_SELECT = {
  id: true,
  outcome: true,
  note: true,
  noteAr: true,
  reviewedAt: true,
} satisfies Prisma.ReinforcementReviewSelect;

const TEACHER_TASK_REVIEW_SUBMISSION_ARGS =
  Prisma.validator<Prisma.ReinforcementSubmissionDefaultArgs>()({
    select: {
      id: true,
      assignmentId: true,
      taskId: true,
      stageId: true,
      studentId: true,
      enrollmentId: true,
      status: true,
      proofFileId: true,
      proofText: true,
      submittedAt: true,
      reviewedAt: true,
      createdAt: true,
      updatedAt: true,
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
          subject: {
            select: {
              id: true,
              nameAr: true,
              nameEn: true,
              code: true,
            },
          },
        },
      },
      stage: {
        select: {
          id: true,
          taskId: true,
          sortOrder: true,
          titleEn: true,
          titleAr: true,
          proofType: true,
          requiresApproval: true,
        },
      },
      assignment: {
        select: {
          id: true,
          status: true,
          progress: true,
          assignedAt: true,
          completedAt: true,
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
      proofFile: {
        select: REVIEW_PROOF_FILE_SELECT,
      },
      currentReview: {
        select: REVIEW_REVIEW_SELECT,
      },
      reviews: {
        orderBy: [{ reviewedAt: 'desc' }, { id: 'asc' }],
        select: REVIEW_REVIEW_SELECT,
      },
    },
  });

export type TeacherTaskReviewSubmissionRecord =
  Prisma.ReinforcementSubmissionGetPayload<
    typeof TEACHER_TASK_REVIEW_SUBMISSION_ARGS
  >;

export interface TeacherTaskReviewReadFilters {
  status?: ReinforcementSubmissionStatus;
  studentId?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface TeacherTaskReviewQueueResult {
  items: TeacherTaskReviewSubmissionRecord[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class TeacherTaskReviewReadAdapter {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  async listReviewQueue(params: {
    teacherUserId: string;
    allocations: TeacherAppAllocationRecord[];
    filters?: TeacherTaskReviewReadFilters;
  }): Promise<TeacherTaskReviewQueueResult> {
    const limit = resolveLimit(params.filters?.limit);
    const page = resolvePage(params.filters?.page);
    const where = this.buildVisibleSubmissionWhere({
      teacherUserId: params.teacherUserId,
      allocations: params.allocations,
      filters: {
        ...params.filters,
        status:
          params.filters?.status ?? ReinforcementSubmissionStatus.SUBMITTED,
      },
    });

    const [items, total] = await Promise.all([
      this.scopedPrisma.reinforcementSubmission.findMany({
        where,
        orderBy: [
          { submittedAt: 'desc' },
          { createdAt: 'desc' },
          { id: 'asc' },
        ],
        take: limit,
        skip: (page - 1) * limit,
        ...TEACHER_TASK_REVIEW_SUBMISSION_ARGS,
      }),
      this.scopedPrisma.reinforcementSubmission.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  findVisibleSubmissionById(params: {
    teacherUserId: string;
    allocations: TeacherAppAllocationRecord[];
    submissionId: string;
  }): Promise<TeacherTaskReviewSubmissionRecord | null> {
    const where = this.buildVisibleSubmissionWhere({
      teacherUserId: params.teacherUserId,
      allocations: params.allocations,
    });

    return this.scopedPrisma.reinforcementSubmission.findFirst({
      where: {
        AND: [{ id: params.submissionId }, where],
      },
      ...TEACHER_TASK_REVIEW_SUBMISSION_ARGS,
    });
  }

  async studentBelongsToAllocations(params: {
    allocations: TeacherAppAllocationRecord[];
    studentId: string;
  }): Promise<boolean> {
    const where = this.buildOwnedEnrollmentWhere(params);
    if (isEmptyIdSetWhere(where)) return false;

    const count = await this.scopedPrisma.enrollment.count({ where });
    return count > 0;
  }

  private buildVisibleSubmissionWhere(params: {
    teacherUserId: string;
    allocations: TeacherAppAllocationRecord[];
    filters?: Pick<
      TeacherTaskReviewReadFilters,
      'status' | 'studentId' | 'search'
    >;
  }): Prisma.ReinforcementSubmissionWhereInput {
    const allocationScopes = params.allocations.map((allocation) =>
      this.buildSubmissionVisibilityForAllocation({
        allocation,
        studentId: params.filters?.studentId,
      }),
    );

    if (allocationScopes.length === 0) {
      return { id: { in: [] } };
    }

    const and: Prisma.ReinforcementSubmissionWhereInput[] = [
      { OR: allocationScopes },
      this.buildSubmissionSearchWhere(params.filters?.search),
    ].filter((condition) => Object.keys(condition).length > 0);

    return {
      ...(params.filters?.status ? { status: params.filters.status } : {}),
      ...(params.filters?.studentId
        ? { studentId: params.filters.studentId }
        : {}),
      task: {
        deletedAt: null,
        source: ReinforcementSource.TEACHER,
        OR: [
          { assignedById: params.teacherUserId },
          { createdById: params.teacherUserId },
        ],
      },
      stage: {
        deletedAt: null,
      },
      ...(and.length > 0 ? { AND: and } : {}),
    };
  }

  private buildSubmissionVisibilityForAllocation(params: {
    allocation: TeacherAppAllocationRecord;
    studentId?: string;
  }): Prisma.ReinforcementSubmissionWhereInput {
    const academicYearId = params.allocation.term?.academicYearId;

    return {
      task: {
        academicYearId,
        termId: params.allocation.termId,
        OR: [{ subjectId: params.allocation.subjectId }, { subjectId: null }],
      },
      enrollment: this.buildOwnedEnrollmentWhere({
        allocations: [params.allocation],
        studentId: params.studentId,
      }),
    };
  }

  private buildOwnedEnrollmentWhere(params: {
    allocations: TeacherAppAllocationRecord[];
    studentId?: string;
  }): Prisma.EnrollmentWhereInput {
    const scopes = params.allocations.map((allocation) => ({
      academicYearId: allocation.term?.academicYearId,
      termId: allocation.termId,
      classroomId: allocation.classroomId,
      status: StudentEnrollmentStatus.ACTIVE,
      deletedAt: null,
      student: {
        is: {
          status: StudentStatus.ACTIVE,
          deletedAt: null,
        },
      },
    }));

    if (scopes.length === 0) {
      return { id: { in: [] } };
    }

    return {
      ...(params.studentId ? { studentId: params.studentId } : {}),
      OR: scopes,
    };
  }

  private buildSubmissionSearchWhere(
    search?: string,
  ): Prisma.ReinforcementSubmissionWhereInput {
    const normalized = search?.trim();
    if (!normalized) return {};

    const stringFilter = {
      contains: normalized,
      mode: Prisma.QueryMode.insensitive,
    };

    return {
      OR: [
        { id: { equals: normalized } },
        { proofText: stringFilter },
        { task: { titleEn: stringFilter } },
        { task: { titleAr: stringFilter } },
        { stage: { titleEn: stringFilter } },
        { stage: { titleAr: stringFilter } },
        { student: { firstName: stringFilter } },
        { student: { lastName: stringFilter } },
      ],
    };
  }
}

function isEmptyIdSetWhere(where: Prisma.EnrollmentWhereInput): boolean {
  return (
    typeof where.id === 'object' &&
    where.id !== null &&
    'in' in where.id &&
    Array.isArray(where.id.in) &&
    where.id.in.length === 0
  );
}

function resolveLimit(limit?: number): number {
  if (!limit || Number.isNaN(limit)) return DEFAULT_REVIEW_QUEUE_LIMIT;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_REVIEW_QUEUE_LIMIT);
}

function resolvePage(page?: number): number {
  if (!page || Number.isNaN(page)) return 1;
  return Math.max(Math.trunc(page), 1);
}
