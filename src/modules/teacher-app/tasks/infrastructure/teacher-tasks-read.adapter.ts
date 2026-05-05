import { Injectable } from '@nestjs/common';
import {
  Prisma,
  ReinforcementSource,
  ReinforcementTaskStatus,
  StudentEnrollmentStatus,
  StudentStatus,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type { TeacherAppAllocationRecord } from '../../shared/teacher-app.types';

const DEFAULT_TASK_LIMIT = 20;
const MAX_TASK_LIMIT = 100;

const SAFE_PROOF_FILE_SELECT = {
  id: true,
  originalName: true,
  mimeType: true,
  sizeBytes: true,
  visibility: true,
  createdAt: true,
} satisfies Prisma.FileSelect;

const TASK_TARGET_SELECT = {
  id: true,
  scopeType: true,
  scopeKey: true,
  stageId: true,
  gradeId: true,
  sectionId: true,
  classroomId: true,
  studentId: true,
} satisfies Prisma.ReinforcementTaskTargetSelect;

const TASK_STAGE_SELECT = {
  id: true,
  sortOrder: true,
  titleEn: true,
  titleAr: true,
  descriptionEn: true,
  descriptionAr: true,
  proofType: true,
  requiresApproval: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ReinforcementTaskStageSelect;

const TASK_ASSIGNMENT_SELECT = {
  id: true,
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
} satisfies Prisma.ReinforcementAssignmentSelect;

const TASK_SUBMISSION_SELECT = {
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
  student: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      status: true,
    },
  },
  proofFile: {
    select: SAFE_PROOF_FILE_SELECT,
  },
  currentReview: {
    select: {
      id: true,
      outcome: true,
      note: true,
      noteAr: true,
      reviewedAt: true,
    },
  },
} satisfies Prisma.ReinforcementSubmissionSelect;

const TEACHER_TASK_SELECT = {
  id: true,
  academicYearId: true,
  termId: true,
  subjectId: true,
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
  createdAt: true,
  updatedAt: true,
  subject: {
    select: {
      id: true,
      nameAr: true,
      nameEn: true,
      code: true,
    },
  },
  targets: {
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: TASK_TARGET_SELECT,
  },
  stages: {
    where: { deletedAt: null },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    select: TASK_STAGE_SELECT,
  },
  assignments: {
    select: TASK_ASSIGNMENT_SELECT,
  },
  submissions: {
    select: TASK_SUBMISSION_SELECT,
  },
} satisfies Prisma.ReinforcementTaskSelect;

const OWNED_STUDENT_ENROLLMENT_SELECT = {
  id: true,
  studentId: true,
  academicYearId: true,
  termId: true,
  classroomId: true,
  student: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      status: true,
    },
  },
} satisfies Prisma.EnrollmentSelect;

export type TeacherTaskRecord = Prisma.ReinforcementTaskGetPayload<{
  select: typeof TEACHER_TASK_SELECT;
}>;

export type TeacherTaskAssignmentRecord =
  TeacherTaskRecord['assignments'][number];
export type TeacherTaskSubmissionRecord =
  TeacherTaskRecord['submissions'][number];
export type TeacherTaskStageRecord = TeacherTaskRecord['stages'][number];

type OwnedStudentEnrollmentRow = Prisma.EnrollmentGetPayload<{
  select: typeof OWNED_STUDENT_ENROLLMENT_SELECT;
}>;

export interface TeacherTaskOwnedStudentRecord {
  studentId: string;
  firstName: string;
  lastName: string;
  classIds: string[];
}

export interface TeacherTaskReadFilters {
  status?: ReinforcementTaskStatus;
  source?: ReinforcementSource;
  studentId?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface TeacherTaskListResult {
  items: TeacherTaskRecord[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class TeacherTasksReadAdapter {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  async listOwnedStudents(
    allocations: TeacherAppAllocationRecord[],
  ): Promise<TeacherTaskOwnedStudentRecord[]> {
    const rows = await this.listOwnedStudentEnrollmentRows({ allocations });
    return this.presentOwnedStudentRows(rows, allocations);
  }

  async findOwnedStudent(params: {
    allocations: TeacherAppAllocationRecord[];
    studentId: string;
  }): Promise<TeacherTaskOwnedStudentRecord | null> {
    const rows = await this.listOwnedStudentEnrollmentRows({
      allocations: params.allocations,
      studentId: params.studentId,
    });
    const [student] = this.presentOwnedStudentRows(rows, params.allocations);
    return student ?? null;
  }

  async listTasks(params: {
    teacherUserId: string;
    allocations: TeacherAppAllocationRecord[];
    filters?: TeacherTaskReadFilters;
  }): Promise<TeacherTaskListResult> {
    const limit = resolveLimit(params.filters?.limit);
    const page = resolvePage(params.filters?.page);

    if (isUnsupportedSourceFilter(params.filters?.source)) {
      return { items: [], total: 0, page, limit };
    }

    const where = this.buildVisibleTaskWhere(params);
    const assignmentWhere = this.buildOwnedAssignmentWhere({
      allocations: params.allocations,
      studentId: params.filters?.studentId,
    });
    const submissionWhere = this.buildOwnedSubmissionWhere({
      allocations: params.allocations,
      studentId: params.filters?.studentId,
    });

    const [items, total] = await Promise.all([
      this.scopedPrisma.reinforcementTask.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: limit,
        skip: (page - 1) * limit,
        select: buildTaskSelect({ assignmentWhere, submissionWhere }),
      }),
      this.scopedPrisma.reinforcementTask.count({ where }),
    ]);

    return {
      items: items as unknown as TeacherTaskRecord[],
      total,
      page,
      limit,
    };
  }

  async listAllVisibleTasks(params: {
    teacherUserId: string;
    allocations: TeacherAppAllocationRecord[];
    filters?: Pick<TeacherTaskReadFilters, 'status' | 'source' | 'studentId'>;
  }): Promise<TeacherTaskRecord[]> {
    if (isUnsupportedSourceFilter(params.filters?.source)) {
      return [];
    }

    const where = this.buildVisibleTaskWhere(params);
    const assignmentWhere = this.buildOwnedAssignmentWhere({
      allocations: params.allocations,
      studentId: params.filters?.studentId,
    });
    const submissionWhere = this.buildOwnedSubmissionWhere({
      allocations: params.allocations,
      studentId: params.filters?.studentId,
    });

    const tasks = await this.scopedPrisma.reinforcementTask.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      select: buildTaskSelect({ assignmentWhere, submissionWhere }),
    });

    return tasks as unknown as TeacherTaskRecord[];
  }

  findVisibleTaskById(params: {
    teacherUserId: string;
    allocations: TeacherAppAllocationRecord[];
    taskId: string;
  }): Promise<TeacherTaskRecord | null> {
    const where = this.buildVisibleTaskWhere({
      teacherUserId: params.teacherUserId,
      allocations: params.allocations,
      filters: undefined,
    });
    const assignmentWhere = this.buildOwnedAssignmentWhere({
      allocations: params.allocations,
    });
    const submissionWhere = this.buildOwnedSubmissionWhere({
      allocations: params.allocations,
    });

    return this.scopedPrisma.reinforcementTask.findFirst({
      where: {
        AND: [{ id: params.taskId }, where],
      },
      select: buildTaskSelect({ assignmentWhere, submissionWhere }),
    }) as unknown as Promise<TeacherTaskRecord | null>;
  }

  private async listOwnedStudentEnrollmentRows(params: {
    allocations: TeacherAppAllocationRecord[];
    studentId?: string;
  }): Promise<OwnedStudentEnrollmentRow[]> {
    const where = this.buildOwnedEnrollmentWhere(params);
    if (isEmptyIdSetWhere(where)) return [];

    return this.scopedPrisma.enrollment.findMany({
      where,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: OWNED_STUDENT_ENROLLMENT_SELECT,
    });
  }

  private buildVisibleTaskWhere(params: {
    teacherUserId: string;
    allocations: TeacherAppAllocationRecord[];
    filters?: Pick<
      TeacherTaskReadFilters,
      'status' | 'studentId' | 'search' | 'source'
    >;
  }): Prisma.ReinforcementTaskWhereInput {
    const allocationScopes = params.allocations.map((allocation) =>
      this.buildTaskVisibilityForAllocation({
        allocation,
        studentId: params.filters?.studentId,
      }),
    );

    if (allocationScopes.length === 0) {
      return { id: { in: [] } };
    }

    const and: Prisma.ReinforcementTaskWhereInput[] = [
      { OR: allocationScopes },
      this.buildTaskSearchWhere(params.filters?.search),
    ].filter((condition) => Object.keys(condition).length > 0);

    return {
      source: ReinforcementSource.TEACHER,
      ...(params.filters?.status
        ? { status: params.filters.status }
        : { status: { not: ReinforcementTaskStatus.CANCELLED } }),
      OR: [
        { assignedById: params.teacherUserId },
        { createdById: params.teacherUserId },
      ],
      ...(and.length > 0 ? { AND: and } : {}),
    };
  }

  private buildTaskVisibilityForAllocation(params: {
    allocation: TeacherAppAllocationRecord;
    studentId?: string;
  }): Prisma.ReinforcementTaskWhereInput {
    return {
      academicYearId: params.allocation.term?.academicYearId,
      termId: params.allocation.termId,
      OR: [{ subjectId: params.allocation.subjectId }, { subjectId: null }],
      assignments: {
        some: this.buildOwnedAssignmentWhere({
          allocations: [params.allocation],
          studentId: params.studentId,
        }),
      },
    };
  }

  private buildTaskSearchWhere(
    search?: string,
  ): Prisma.ReinforcementTaskWhereInput {
    const normalized = search?.trim();
    if (!normalized) return {};

    const stringFilter = {
      contains: normalized,
      mode: Prisma.QueryMode.insensitive,
    };

    return {
      OR: [
        { titleEn: stringFilter },
        { titleAr: stringFilter },
        { descriptionEn: stringFilter },
        { descriptionAr: stringFilter },
        { subject: { nameEn: stringFilter } },
        { subject: { nameAr: stringFilter } },
      ],
    };
  }

  private buildOwnedAssignmentWhere(params: {
    allocations: TeacherAppAllocationRecord[];
    studentId?: string;
  }): Prisma.ReinforcementAssignmentWhereInput {
    const enrollmentWhere = this.buildOwnedEnrollmentWhere(params);
    if (isEmptyIdSetWhere(enrollmentWhere)) return { id: { in: [] } };

    return {
      ...(params.studentId ? { studentId: params.studentId } : {}),
      enrollment: {
        is: enrollmentWhere,
      },
    };
  }

  private buildOwnedSubmissionWhere(params: {
    allocations: TeacherAppAllocationRecord[];
    studentId?: string;
  }): Prisma.ReinforcementSubmissionWhereInput {
    const enrollmentWhere = this.buildOwnedEnrollmentWhere(params);
    if (isEmptyIdSetWhere(enrollmentWhere)) return { id: { in: [] } };

    return {
      ...(params.studentId ? { studentId: params.studentId } : {}),
      enrollment: {
        is: enrollmentWhere,
      },
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

  private presentOwnedStudentRows(
    rows: OwnedStudentEnrollmentRow[],
    allocations: TeacherAppAllocationRecord[],
  ): TeacherTaskOwnedStudentRecord[] {
    const byStudentId = new Map<string, TeacherTaskOwnedStudentRecord>();

    for (const row of rows) {
      const classIds = matchingClassIds(allocations, row);
      if (classIds.length === 0) continue;

      const current = byStudentId.get(row.studentId) ?? {
        studentId: row.studentId,
        firstName: row.student.firstName,
        lastName: row.student.lastName,
        classIds: [],
      };

      current.classIds = unique([...current.classIds, ...classIds]);
      byStudentId.set(row.studentId, current);
    }

    return [...byStudentId.values()].sort((left, right) =>
      fullName(left).localeCompare(fullName(right)),
    );
  }
}

function buildTaskSelect(params: {
  assignmentWhere: Prisma.ReinforcementAssignmentWhereInput;
  submissionWhere: Prisma.ReinforcementSubmissionWhereInput;
}): Prisma.ReinforcementTaskSelect {
  return {
    ...TEACHER_TASK_SELECT,
    assignments: {
      where: params.assignmentWhere,
      orderBy: [{ assignedAt: 'asc' }, { id: 'asc' }],
      select: TASK_ASSIGNMENT_SELECT,
    },
    submissions: {
      where: params.submissionWhere,
      orderBy: [{ submittedAt: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
      select: TASK_SUBMISSION_SELECT,
    },
  };
}

function matchingClassIds(
  allocations: TeacherAppAllocationRecord[],
  row: Pick<OwnedStudentEnrollmentRow, 'classroomId' | 'termId'>,
): string[] {
  return allocations
    .filter(
      (allocation) =>
        allocation.classroomId === row.classroomId &&
        allocation.termId === row.termId,
    )
    .map((allocation) => allocation.id);
}

function isUnsupportedSourceFilter(source?: ReinforcementSource): boolean {
  return Boolean(source && source !== ReinforcementSource.TEACHER);
}

function isEmptyIdSetWhere(where: Prisma.EnrollmentWhereInput): boolean {
  return Array.isArray(where.id) && where.id.length === 0;
}

function fullName(student: { firstName: string; lastName: string }): string {
  return `${student.firstName} ${student.lastName}`.trim();
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function resolveLimit(limit?: number): number {
  if (!limit || Number.isNaN(limit)) return DEFAULT_TASK_LIMIT;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_TASK_LIMIT);
}

function resolvePage(page?: number): number {
  if (!page || Number.isNaN(page)) return 1;
  return Math.max(Math.trunc(page), 1);
}
