import { Injectable } from '@nestjs/common';
import {
  Prisma,
  ReinforcementSource,
  ReinforcementTargetScope,
  ReinforcementTaskStatus,
  StudentEnrollmentStatus,
  StudentStatus,
} from '@prisma/client';
import { withSoftDeleted } from '../../../../common/context/request-context';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { NormalizedReinforcementStage } from '../domain/reinforcement-task-domain';

const TARGET_SELECT = {
  id: true,
  scopeType: true,
  scopeKey: true,
  stageId: true,
  gradeId: true,
  sectionId: true,
  classroomId: true,
  studentId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ReinforcementTaskTargetSelect;

const STAGE_SELECT = {
  id: true,
  sortOrder: true,
  titleEn: true,
  titleAr: true,
  descriptionEn: true,
  descriptionAr: true,
  proofType: true,
  requiresApproval: true,
  metadata: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} satisfies Prisma.ReinforcementTaskStageSelect;

const ASSIGNMENT_SELECT = {
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
} satisfies Prisma.ReinforcementAssignmentSelect;

const TASK_DETAIL_ARGS =
  Prisma.validator<Prisma.ReinforcementTaskDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
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
      assignedById: true,
      assignedByName: true,
      createdById: true,
      cancelledById: true,
      cancelledAt: true,
      cancellationReason: true,
      metadata: true,
      createdAt: true,
      updatedAt: true,
      deletedAt: true,
      targets: {
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: TARGET_SELECT,
      },
      stages: {
        where: { deletedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        select: STAGE_SELECT,
      },
      assignments: {
        select: ASSIGNMENT_SELECT,
      },
    },
  });

const ACADEMIC_YEAR_SELECT = {
  id: true,
  nameAr: true,
  nameEn: true,
  startDate: true,
  endDate: true,
  isActive: true,
} satisfies Prisma.AcademicYearSelect;

const TERM_SELECT = {
  id: true,
  academicYearId: true,
  nameAr: true,
  nameEn: true,
  startDate: true,
  endDate: true,
  isActive: true,
} satisfies Prisma.TermSelect;

const SUBJECT_SELECT = {
  id: true,
  nameAr: true,
  nameEn: true,
  code: true,
  color: true,
  isActive: true,
} satisfies Prisma.SubjectSelect;

const STAGE_OPTION_SELECT = {
  id: true,
  nameAr: true,
  nameEn: true,
  sortOrder: true,
} satisfies Prisma.StageSelect;

const GRADE_OPTION_SELECT = {
  id: true,
  stageId: true,
  nameAr: true,
  nameEn: true,
  sortOrder: true,
  capacity: true,
} satisfies Prisma.GradeSelect;

const SECTION_OPTION_SELECT = {
  id: true,
  gradeId: true,
  nameAr: true,
  nameEn: true,
  sortOrder: true,
  capacity: true,
  grade: {
    select: {
      stageId: true,
    },
  },
} satisfies Prisma.SectionSelect;

const CLASSROOM_OPTION_SELECT = {
  id: true,
  sectionId: true,
  nameAr: true,
  nameEn: true,
  sortOrder: true,
  capacity: true,
  section: {
    select: {
      gradeId: true,
      grade: {
        select: {
          stageId: true,
        },
      },
    },
  },
} satisfies Prisma.ClassroomSelect;

const ENROLLMENT_SELECT = {
  id: true,
  studentId: true,
  classroomId: true,
  classroom: {
    select: {
      sectionId: true,
      section: {
        select: {
          gradeId: true,
          grade: {
            select: {
              stageId: true,
            },
          },
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
} satisfies Prisma.EnrollmentSelect;

export type ReinforcementTaskRecord = Prisma.ReinforcementTaskGetPayload<
  typeof TASK_DETAIL_ARGS
>;
export type ReinforcementTaskTargetRecord =
  ReinforcementTaskRecord['targets'][number];
export type ReinforcementTaskStageRecord =
  ReinforcementTaskRecord['stages'][number];
export type ReinforcementAssignmentRecord =
  ReinforcementTaskRecord['assignments'][number];
export type AcademicYearOptionRecord = Prisma.AcademicYearGetPayload<{
  select: typeof ACADEMIC_YEAR_SELECT;
}>;
export type TermOptionRecord = Prisma.TermGetPayload<{
  select: typeof TERM_SELECT;
}>;
export type SubjectOptionRecord = Prisma.SubjectGetPayload<{
  select: typeof SUBJECT_SELECT;
}>;
export type StageOptionRecord = Prisma.StageGetPayload<{
  select: typeof STAGE_OPTION_SELECT;
}>;
export type GradeOptionRecord = Prisma.GradeGetPayload<{
  select: typeof GRADE_OPTION_SELECT;
}>;
export type SectionOptionRecord = Prisma.SectionGetPayload<{
  select: typeof SECTION_OPTION_SELECT;
}>;
export type ClassroomOptionRecord = Prisma.ClassroomGetPayload<{
  select: typeof CLASSROOM_OPTION_SELECT;
}>;
export type EnrollmentTargetRecord = Prisma.EnrollmentGetPayload<{
  select: typeof ENROLLMENT_SELECT;
}>;

export interface ReinforcementFilterOptionsRecord {
  academicYears: AcademicYearOptionRecord[];
  terms: TermOptionRecord[];
  stages: StageOptionRecord[];
  grades: GradeOptionRecord[];
  sections: SectionOptionRecord[];
  classrooms: ClassroomOptionRecord[];
  subjects: SubjectOptionRecord[];
  students: EnrollmentTargetRecord[];
}

export interface NormalizedTargetForWrite {
  scopeType: ReinforcementTargetScope;
  scopeKey: string;
  stageId: string | null;
  gradeId: string | null;
  sectionId: string | null;
  classroomId: string | null;
  studentId: string | null;
}

export interface MaterializedAssignmentForWrite {
  studentId: string;
  enrollmentId: string;
}

export interface CreateTaskWithChildrenInput {
  schoolId: string;
  task: Omit<
    Prisma.ReinforcementTaskUncheckedCreateInput,
    'schoolId' | 'targets' | 'assignments' | 'stages'
  >;
  targets: NormalizedTargetForWrite[];
  stages: NormalizedReinforcementStage[];
  assignments: MaterializedAssignmentForWrite[];
}

export interface ListTasksFilters {
  academicYearId?: string;
  termId?: string;
  status?: ReinforcementTaskStatus;
  source?: ReinforcementSource;
  targetScope?: ReinforcementTargetScope;
  targetId?: string;
  classroomId?: string;
  sectionId?: string;
  gradeId?: string;
  stageId?: string;
  studentId?: string;
  subjectId?: string;
  dueFrom?: Date;
  dueTo?: Date;
  search?: string;
  includeCancelled?: boolean;
  limit?: number;
  offset?: number;
}

@Injectable()
export class ReinforcementTasksRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  listFilterOptions(params?: {
    academicYearId?: string;
    termId?: string;
  }): Promise<ReinforcementFilterOptionsRecord> {
    const enrollmentWhere: Prisma.EnrollmentWhereInput = {
      status: StudentEnrollmentStatus.ACTIVE,
      student: { status: StudentStatus.ACTIVE },
      ...(params?.academicYearId
        ? { academicYearId: params.academicYearId }
        : {}),
      ...(params?.termId ? { termId: params.termId } : {}),
    };

    return Promise.all([
      this.scopedPrisma.academicYear.findMany({
        orderBy: [{ isActive: 'desc' }, { startDate: 'desc' }, { nameEn: 'asc' }],
        select: ACADEMIC_YEAR_SELECT,
      }),
      this.scopedPrisma.term.findMany({
        where: params?.academicYearId
          ? { academicYearId: params.academicYearId }
          : undefined,
        orderBy: [
          { isActive: 'desc' },
          { startDate: 'desc' },
          { nameEn: 'asc' },
        ],
        select: TERM_SELECT,
      }),
      this.scopedPrisma.stage.findMany({
        orderBy: [{ sortOrder: 'asc' }, { nameEn: 'asc' }, { nameAr: 'asc' }],
        select: STAGE_OPTION_SELECT,
      }),
      this.scopedPrisma.grade.findMany({
        orderBy: [{ sortOrder: 'asc' }, { nameEn: 'asc' }, { nameAr: 'asc' }],
        select: GRADE_OPTION_SELECT,
      }),
      this.scopedPrisma.section.findMany({
        orderBy: [{ sortOrder: 'asc' }, { nameEn: 'asc' }, { nameAr: 'asc' }],
        select: SECTION_OPTION_SELECT,
      }),
      this.scopedPrisma.classroom.findMany({
        orderBy: [{ sortOrder: 'asc' }, { nameEn: 'asc' }, { nameAr: 'asc' }],
        select: CLASSROOM_OPTION_SELECT,
      }),
      this.scopedPrisma.subject.findMany({
        where: { isActive: true },
        orderBy: [{ nameEn: 'asc' }, { nameAr: 'asc' }],
        select: SUBJECT_SELECT,
      }),
      this.scopedPrisma.enrollment.findMany({
        where: enrollmentWhere,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: ENROLLMENT_SELECT,
      }),
    ]).then(
      ([
        academicYears,
        terms,
        stages,
        grades,
        sections,
        classrooms,
        subjects,
        students,
      ]) => ({
        academicYears,
        terms,
        stages,
        grades,
        sections,
        classrooms,
        subjects,
        students,
      }),
    );
  }

  findAcademicYear(
    academicYearId: string,
  ): Promise<AcademicYearOptionRecord | null> {
    return this.scopedPrisma.academicYear.findFirst({
      where: { id: academicYearId },
      select: ACADEMIC_YEAR_SELECT,
    });
  }

  findTerm(termId: string): Promise<TermOptionRecord | null> {
    return this.scopedPrisma.term.findFirst({
      where: { id: termId },
      select: TERM_SELECT,
    });
  }

  findSubject(subjectId: string): Promise<SubjectOptionRecord | null> {
    return this.scopedPrisma.subject.findFirst({
      where: { id: subjectId },
      select: SUBJECT_SELECT,
    });
  }

  async findTargetResource(
    target: Pick<NormalizedTargetForWrite, 'scopeType' | 'scopeKey'>,
  ): Promise<NormalizedTargetForWrite | null> {
    switch (target.scopeType) {
      case ReinforcementTargetScope.SCHOOL:
        return {
          scopeType: target.scopeType,
          scopeKey: target.scopeKey,
          stageId: null,
          gradeId: null,
          sectionId: null,
          classroomId: null,
          studentId: null,
        };

      case ReinforcementTargetScope.STAGE: {
        const stage = await this.scopedPrisma.stage.findFirst({
          where: { id: target.scopeKey },
          select: { id: true },
        });
        return stage
          ? {
              scopeType: target.scopeType,
              scopeKey: stage.id,
              stageId: stage.id,
              gradeId: null,
              sectionId: null,
              classroomId: null,
              studentId: null,
            }
          : null;
      }

      case ReinforcementTargetScope.GRADE: {
        const grade = await this.scopedPrisma.grade.findFirst({
          where: { id: target.scopeKey },
          select: { id: true, stageId: true },
        });
        return grade
          ? {
              scopeType: target.scopeType,
              scopeKey: grade.id,
              stageId: grade.stageId,
              gradeId: grade.id,
              sectionId: null,
              classroomId: null,
              studentId: null,
            }
          : null;
      }

      case ReinforcementTargetScope.SECTION: {
        const section = await this.scopedPrisma.section.findFirst({
          where: { id: target.scopeKey },
          select: {
            id: true,
            gradeId: true,
            grade: { select: { stageId: true } },
          },
        });
        return section
          ? {
              scopeType: target.scopeType,
              scopeKey: section.id,
              stageId: section.grade.stageId,
              gradeId: section.gradeId,
              sectionId: section.id,
              classroomId: null,
              studentId: null,
            }
          : null;
      }

      case ReinforcementTargetScope.CLASSROOM: {
        const classroom = await this.scopedPrisma.classroom.findFirst({
          where: { id: target.scopeKey },
          select: {
            id: true,
            sectionId: true,
            section: {
              select: {
                gradeId: true,
                grade: { select: { stageId: true } },
              },
            },
          },
        });
        return classroom
          ? {
              scopeType: target.scopeType,
              scopeKey: classroom.id,
              stageId: classroom.section.grade.stageId,
              gradeId: classroom.section.gradeId,
              sectionId: classroom.sectionId,
              classroomId: classroom.id,
              studentId: null,
            }
          : null;
      }

      case ReinforcementTargetScope.STUDENT: {
        const student = await this.scopedPrisma.student.findFirst({
          where: { id: target.scopeKey, status: StudentStatus.ACTIVE },
          select: { id: true },
        });
        return student
          ? {
              scopeType: target.scopeType,
              scopeKey: student.id,
              stageId: null,
              gradeId: null,
              sectionId: null,
              classroomId: null,
              studentId: student.id,
            }
          : null;
      }
    }
  }

  async listTasks(filters: ListTasksFilters): Promise<{
    items: ReinforcementTaskRecord[];
    total: number;
  }> {
    const where = this.buildListWhere(filters);
    const [items, total] = await Promise.all([
      this.scopedPrisma.reinforcementTask.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        ...(filters.limit ? { take: filters.limit } : {}),
        ...(filters.offset ? { skip: filters.offset } : {}),
        ...TASK_DETAIL_ARGS,
      }),
      this.scopedPrisma.reinforcementTask.count({ where }),
    ]);

    return { items, total };
  }

  findTaskById(taskId: string): Promise<ReinforcementTaskRecord | null> {
    return this.scopedPrisma.reinforcementTask.findFirst({
      where: { id: taskId },
      ...TASK_DETAIL_ARGS,
    });
  }

  async createTaskWithTargetsStagesAssignments(
    input: CreateTaskWithChildrenInput,
  ): Promise<ReinforcementTaskRecord> {
    return this.prisma.$transaction(async (tx) => {
      const task = await tx.reinforcementTask.create({
        data: {
          ...input.task,
          schoolId: input.schoolId,
        },
        select: { id: true },
      });

      await this.createTargetsStagesAssignments(tx, {
        ...input,
        taskId: task.id,
      });

      return this.findTaskInTransaction(tx, input.schoolId, task.id);
    });
  }

  async duplicateTaskWithTargetsStagesAssignments(
    input: CreateTaskWithChildrenInput,
  ): Promise<ReinforcementTaskRecord> {
    return this.createTaskWithTargetsStagesAssignments(input);
  }

  async cancelTaskAndAssignments(params: {
    schoolId: string;
    taskId: string;
    actorId: string;
    reason?: string | null;
  }): Promise<{ task: ReinforcementTaskRecord; affectedAssignmentCount: number }> {
    return this.prisma.$transaction(async (tx) => {
      const cancelledAt = new Date();
      await tx.reinforcementTask.updateMany({
        where: {
          id: params.taskId,
          schoolId: params.schoolId,
          deletedAt: null,
        },
        data: {
          status: ReinforcementTaskStatus.CANCELLED,
          cancelledAt,
          cancelledById: params.actorId,
          cancellationReason: params.reason ?? null,
        },
      });

      const affected = await tx.reinforcementAssignment.updateMany({
        where: {
          taskId: params.taskId,
          schoolId: params.schoolId,
          status: {
            notIn: [
              ReinforcementTaskStatus.COMPLETED,
              ReinforcementTaskStatus.CANCELLED,
            ],
          },
        },
        data: {
          status: ReinforcementTaskStatus.CANCELLED,
          cancelledAt,
        },
      });

      const task = await this.findTaskInTransaction(
        tx,
        params.schoolId,
        params.taskId,
      );
      return { task, affectedAssignmentCount: affected.count };
    });
  }

  async resolveEnrollmentsForTargets(params: {
    academicYearId: string;
    termId: string;
    targets: NormalizedTargetForWrite[];
  }): Promise<EnrollmentTargetRecord[]> {
    const byStudentId = new Map<string, EnrollmentTargetRecord>();

    for (const target of params.targets) {
      const enrollments = await this.scopedPrisma.enrollment.findMany({
        where: this.buildEnrollmentWhere(params, target),
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: ENROLLMENT_SELECT,
      });

      for (const enrollment of enrollments) {
        if (!byStudentId.has(enrollment.studentId)) {
          byStudentId.set(enrollment.studentId, enrollment);
        }
      }
    }

    return [...byStudentId.values()];
  }

  private async createTargetsStagesAssignments(
    tx: Prisma.TransactionClient,
    input: CreateTaskWithChildrenInput & { taskId: string },
  ): Promise<void> {
    if (input.targets.length > 0) {
      await tx.reinforcementTaskTarget.createMany({
        data: input.targets.map((target) => ({
          schoolId: input.schoolId,
          taskId: input.taskId,
          scopeType: target.scopeType,
          scopeKey: target.scopeKey,
          stageId: target.stageId,
          gradeId: target.gradeId,
          sectionId: target.sectionId,
          classroomId: target.classroomId,
          studentId: target.studentId,
        })),
        skipDuplicates: true,
      });
    }

    if (input.stages.length > 0) {
      await tx.reinforcementTaskStage.createMany({
        data: input.stages.map((stage) => ({
          schoolId: input.schoolId,
          taskId: input.taskId,
          sortOrder: stage.sortOrder,
          titleEn: stage.titleEn,
          titleAr: stage.titleAr,
          descriptionEn: stage.descriptionEn,
          descriptionAr: stage.descriptionAr,
          proofType: stage.proofType,
          requiresApproval: stage.requiresApproval,
          metadata: this.toJsonInput(stage.metadata),
        })),
      });
    }

    if (input.assignments.length > 0) {
      await tx.reinforcementAssignment.createMany({
        data: input.assignments.map((assignment) => ({
          schoolId: input.schoolId,
          taskId: input.taskId,
          academicYearId: input.task.academicYearId as string,
          termId: input.task.termId as string,
          studentId: assignment.studentId,
          enrollmentId: assignment.enrollmentId,
          status: ReinforcementTaskStatus.NOT_COMPLETED,
        })),
        skipDuplicates: true,
      });
    }
  }

  private async findTaskInTransaction(
    tx: Prisma.TransactionClient,
    schoolId: string,
    taskId: string,
  ): Promise<ReinforcementTaskRecord> {
    const task = await tx.reinforcementTask.findFirst({
      where: { id: taskId, schoolId, deletedAt: null },
      ...TASK_DETAIL_ARGS,
    });

    if (!task) {
      throw new Error('Reinforcement task mutation result was not found');
    }

    return task;
  }

  private buildListWhere(
    filters: ListTasksFilters,
  ): Prisma.ReinforcementTaskWhereInput {
    const and: Prisma.ReinforcementTaskWhereInput[] = [];

    if (!filters.includeCancelled) {
      and.push({ status: { not: ReinforcementTaskStatus.CANCELLED } });
    }

    if (filters.dueFrom) {
      and.push({ dueDate: { gte: filters.dueFrom } });
    }

    if (filters.dueTo) {
      and.push({ dueDate: { lte: filters.dueTo } });
    }

    const search = filters.search?.trim();
    if (search) {
      const searchOr: Prisma.ReinforcementTaskWhereInput[] = [
        { titleEn: { contains: search, mode: 'insensitive' } },
        { titleAr: { contains: search, mode: 'insensitive' } },
        { assignedByName: { contains: search, mode: 'insensitive' } },
        { subject: { nameEn: { contains: search, mode: 'insensitive' } } },
        { subject: { nameAr: { contains: search, mode: 'insensitive' } } },
      ];

      if (isUuid(search)) {
        searchOr.unshift({ id: { equals: search } });
      }

      and.push({
        OR: searchOr,
      });
    }

    if (filters.targetScope || filters.targetId) {
      and.push({
        targets: {
          some: {
            ...(filters.targetScope ? { scopeType: filters.targetScope } : {}),
            ...(filters.targetId ? { scopeKey: filters.targetId } : {}),
          },
        },
      });
    }

    if (filters.stageId) {
      and.push({ targets: { some: { stageId: filters.stageId } } });
    }
    if (filters.gradeId) {
      and.push({ targets: { some: { gradeId: filters.gradeId } } });
    }
    if (filters.sectionId) {
      and.push({ targets: { some: { sectionId: filters.sectionId } } });
    }
    if (filters.classroomId) {
      and.push({ targets: { some: { classroomId: filters.classroomId } } });
    }
    if (filters.studentId) {
      and.push({
        OR: [
          { targets: { some: { studentId: filters.studentId } } },
          { assignments: { some: { studentId: filters.studentId } } },
        ],
      });
    }

    return {
      ...(filters.academicYearId
        ? { academicYearId: filters.academicYearId }
        : {}),
      ...(filters.termId ? { termId: filters.termId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.source ? { source: filters.source } : {}),
      ...(filters.subjectId ? { subjectId: filters.subjectId } : {}),
      ...(and.length > 0 ? { AND: and } : {}),
    };
  }

  private buildEnrollmentWhere(
    params: {
      academicYearId: string;
      termId: string;
    },
    target: NormalizedTargetForWrite,
  ): Prisma.EnrollmentWhereInput {
    const base: Prisma.EnrollmentWhereInput = {
      academicYearId: params.academicYearId,
      termId: params.termId,
      status: StudentEnrollmentStatus.ACTIVE,
      student: { status: StudentStatus.ACTIVE },
    };

    switch (target.scopeType) {
      case ReinforcementTargetScope.SCHOOL:
        return base;
      case ReinforcementTargetScope.STAGE:
        return {
          ...base,
          classroom: {
            section: {
              grade: {
                stageId: target.stageId ?? target.scopeKey,
              },
            },
          },
        };
      case ReinforcementTargetScope.GRADE:
        return {
          ...base,
          classroom: {
            section: {
              gradeId: target.gradeId ?? target.scopeKey,
            },
          },
        };
      case ReinforcementTargetScope.SECTION:
        return {
          ...base,
          classroom: {
            sectionId: target.sectionId ?? target.scopeKey,
          },
        };
      case ReinforcementTargetScope.CLASSROOM:
        return {
          ...base,
          classroomId: target.classroomId ?? target.scopeKey,
        };
      case ReinforcementTargetScope.STUDENT:
        return {
          ...base,
          studentId: target.studentId ?? target.scopeKey,
        };
    }
  }

  private toJsonInput(value: unknown): Prisma.InputJsonValue | undefined {
    return value === undefined ? undefined : (value as Prisma.InputJsonValue);
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
