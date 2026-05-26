import { Injectable } from '@nestjs/common';
import { LessonPlanItemStatus, Prisma } from '@prisma/client';
import { getRequestContext } from '../../../../common/context/request-context';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

const SUMMARY_NAME_ARGS = {
  select: {
    id: true,
    nameAr: true,
    nameEn: true,
  },
} satisfies Prisma.AcademicYearDefaultArgs;

const TEACHER_SUMMARY_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
} satisfies Prisma.UserSelect;

const CLASSROOM_SUMMARY_SELECT = {
  id: true,
  nameAr: true,
  nameEn: true,
  section: {
    select: {
      id: true,
      gradeId: true,
    },
  },
} satisfies Prisma.ClassroomSelect;

const SUBJECT_SUMMARY_SELECT = {
  id: true,
  nameAr: true,
  nameEn: true,
  code: true,
  color: true,
} satisfies Prisma.SubjectSelect;

const CURRICULUM_SUMMARY_SELECT = {
  id: true,
  academicYearId: true,
  termId: true,
  gradeId: true,
  subjectId: true,
  title: true,
  status: true,
} satisfies Prisma.CurriculumSelect;

const LESSON_PLAN_LIST_ARGS =
  Prisma.validator<Prisma.LessonPlanDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      academicYearId: true,
      termId: true,
      teacherSubjectAllocationId: true,
      teacherUserId: true,
      classroomId: true,
      subjectId: true,
      curriculumId: true,
      title: true,
      description: true,
      status: true,
      weekStartDate: true,
      weekEndDate: true,
      createdByUserId: true,
      updatedByUserId: true,
      activatedAt: true,
      archivedAt: true,
      deletedAt: true,
      createdAt: true,
      updatedAt: true,
      academicYear: SUMMARY_NAME_ARGS,
      term: SUMMARY_NAME_ARGS,
      teacherUser: { select: TEACHER_SUMMARY_SELECT },
      classroom: { select: CLASSROOM_SUMMARY_SELECT },
      subject: { select: SUBJECT_SUMMARY_SELECT },
      curriculum: { select: CURRICULUM_SUMMARY_SELECT },
      items: {
        where: { deletedAt: null },
        select: { id: true },
      },
    },
  });

const LESSON_PLAN_ITEM_ARGS =
  Prisma.validator<Prisma.LessonPlanItemDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      lessonPlanId: true,
      curriculumId: true,
      unitId: true,
      lessonId: true,
      timetableEntryId: true,
      plannedDate: true,
      dayOfWeek: true,
      periodId: true,
      periodLabel: true,
      title: true,
      notes: true,
      status: true,
      sortOrder: true,
      startedAt: true,
      completedAt: true,
      skippedAt: true,
      cancelledAt: true,
      rescheduledFromItemId: true,
      createdByUserId: true,
      updatedByUserId: true,
      deletedAt: true,
      createdAt: true,
      updatedAt: true,
      unit: {
        select: {
          id: true,
          title: true,
        },
      },
      lesson: {
        select: {
          id: true,
          title: true,
        },
      },
    },
  });

const LESSON_PLAN_DETAIL_ARGS =
  Prisma.validator<Prisma.LessonPlanDefaultArgs>()({
    select: {
      ...LESSON_PLAN_LIST_ARGS.select,
      items: {
        where: { deletedAt: null },
        orderBy: [
          { sortOrder: 'asc' },
          { plannedDate: 'asc' },
          { createdAt: 'asc' },
          { id: 'asc' },
        ],
        ...LESSON_PLAN_ITEM_ARGS,
      },
    },
  });

const ACADEMIC_YEAR_ARGS = Prisma.validator<Prisma.AcademicYearDefaultArgs>()({
  select: {
    id: true,
    schoolId: true,
    isActive: true,
  },
});

const TERM_ARGS = Prisma.validator<Prisma.TermDefaultArgs>()({
  select: {
    id: true,
    schoolId: true,
    academicYearId: true,
    isActive: true,
  },
});

const TEACHER_ALLOCATION_ARGS =
  Prisma.validator<Prisma.TeacherSubjectAllocationDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      teacherUserId: true,
      subjectId: true,
      classroomId: true,
      termId: true,
      teacherUser: { select: TEACHER_SUMMARY_SELECT },
      classroom: { select: CLASSROOM_SUMMARY_SELECT },
      subject: { select: SUBJECT_SUMMARY_SELECT },
      term: {
        select: {
          id: true,
          academicYearId: true,
        },
      },
    },
  });

const CURRICULUM_ARGS = Prisma.validator<Prisma.CurriculumDefaultArgs>()({
  select: CURRICULUM_SUMMARY_SELECT,
});

const UNIT_ARGS = Prisma.validator<Prisma.CurriculumUnitDefaultArgs>()({
  select: {
    id: true,
    curriculumId: true,
    title: true,
  },
});

const LESSON_ARGS = Prisma.validator<Prisma.CurriculumLessonDefaultArgs>()({
  select: {
    id: true,
    curriculumId: true,
    unitId: true,
    title: true,
  },
});

const TIMETABLE_ENTRY_ARGS =
  Prisma.validator<Prisma.TimetableEntryDefaultArgs>()({
    select: {
      id: true,
      academicYearId: true,
      termId: true,
      teacherSubjectAllocationId: true,
      teacherUserId: true,
      classroomId: true,
      subjectId: true,
      periodId: true,
      dayOfWeek: true,
      status: true,
      period: {
        select: {
          id: true,
          label: true,
        },
      },
    },
  });

export type LessonPlanListRecord = Prisma.LessonPlanGetPayload<
  typeof LESSON_PLAN_LIST_ARGS
>;
export type LessonPlanDetailRecord = Prisma.LessonPlanGetPayload<
  typeof LESSON_PLAN_DETAIL_ARGS
>;
export type LessonPlanItemRecord = Prisma.LessonPlanItemGetPayload<
  typeof LESSON_PLAN_ITEM_ARGS
>;
export type LessonPlanAcademicYearRecord = Prisma.AcademicYearGetPayload<
  typeof ACADEMIC_YEAR_ARGS
>;
export type LessonPlanTermRecord = Prisma.TermGetPayload<typeof TERM_ARGS>;
export type LessonPlanAllocationRecord =
  Prisma.TeacherSubjectAllocationGetPayload<typeof TEACHER_ALLOCATION_ARGS>;
export type LessonPlanCurriculumRecord = Prisma.CurriculumGetPayload<
  typeof CURRICULUM_ARGS
>;
export type LessonPlanUnitRecord = Prisma.CurriculumUnitGetPayload<
  typeof UNIT_ARGS
>;
export type LessonPlanLessonRecord = Prisma.CurriculumLessonGetPayload<
  typeof LESSON_ARGS
>;
export type LessonPlanTimetableEntryRecord = Prisma.TimetableEntryGetPayload<
  typeof TIMETABLE_ENTRY_ARGS
>;

export type ListLessonPlansFilters = {
  academicYearId?: string;
  termId?: string;
  teacherSubjectAllocationId?: string;
  teacherUserId?: string;
  classroomId?: string;
  subjectId?: string;
  curriculumId?: string;
  status?: Prisma.EnumLessonPlanStatusFilter['equals'];
  weekStartDate?: Date;
  search?: string;
};

export type SoftDeleteLessonPlanResult =
  | { status: 'deleted'; lessonPlan: LessonPlanDetailRecord }
  | { status: 'not_found' };

export type SoftDeleteLessonPlanItemResult =
  | { status: 'deleted'; item: LessonPlanItemRecord }
  | { status: 'not_found' };

@Injectable()
export class LessonPlansRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  private getCurrentSchoolId(): string {
    const schoolId = getRequestContext()?.activeMembership?.schoolId;
    if (!schoolId) {
      throw new Error(
        'LessonPlansRepository requires an active school membership',
      );
    }

    return schoolId;
  }

  listPlans(filters: ListLessonPlansFilters): Promise<LessonPlanListRecord[]> {
    return this.scopedPrisma.lessonPlan.findMany({
      where: {
        ...(filters.academicYearId
          ? { academicYearId: filters.academicYearId }
          : {}),
        ...(filters.termId ? { termId: filters.termId } : {}),
        ...(filters.teacherSubjectAllocationId
          ? { teacherSubjectAllocationId: filters.teacherSubjectAllocationId }
          : {}),
        ...(filters.teacherUserId ? { teacherUserId: filters.teacherUserId } : {}),
        ...(filters.classroomId ? { classroomId: filters.classroomId } : {}),
        ...(filters.subjectId ? { subjectId: filters.subjectId } : {}),
        ...(filters.curriculumId ? { curriculumId: filters.curriculumId } : {}),
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.weekStartDate
          ? { weekStartDate: filters.weekStartDate }
          : {}),
        ...(filters.search
          ? {
              OR: [
                { title: { contains: filters.search, mode: 'insensitive' } },
                {
                  description: {
                    contains: filters.search,
                    mode: 'insensitive',
                  },
                },
              ],
            }
          : {}),
      },
      orderBy: [{ weekStartDate: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
      ...LESSON_PLAN_LIST_ARGS,
    });
  }

  findPlanById(lessonPlanId: string): Promise<LessonPlanDetailRecord | null> {
    return this.scopedPrisma.lessonPlan.findFirst({
      where: { id: lessonPlanId },
      ...LESSON_PLAN_DETAIL_ARGS,
    });
  }

  findDuplicatePlan(input: {
    teacherSubjectAllocationId: string;
    weekStartDate: Date;
    excludeLessonPlanId?: string;
  }): Promise<{ id: string } | null> {
    return this.scopedPrisma.lessonPlan.findFirst({
      where: {
        teacherSubjectAllocationId: input.teacherSubjectAllocationId,
        weekStartDate: input.weekStartDate,
        ...(input.excludeLessonPlanId
          ? { NOT: { id: input.excludeLessonPlanId } }
          : {}),
      },
      select: { id: true },
    });
  }

  findAcademicYearById(
    academicYearId: string,
  ): Promise<LessonPlanAcademicYearRecord | null> {
    return this.scopedPrisma.academicYear.findFirst({
      where: { id: academicYearId },
      ...ACADEMIC_YEAR_ARGS,
    });
  }

  findTermById(termId: string): Promise<LessonPlanTermRecord | null> {
    return this.scopedPrisma.term.findFirst({
      where: { id: termId },
      ...TERM_ARGS,
    });
  }

  findTeacherAllocationById(
    teacherSubjectAllocationId: string,
  ): Promise<LessonPlanAllocationRecord | null> {
    return this.scopedPrisma.teacherSubjectAllocation.findFirst({
      where: { id: teacherSubjectAllocationId },
      ...TEACHER_ALLOCATION_ARGS,
    });
  }

  findCurriculumById(
    curriculumId: string,
  ): Promise<LessonPlanCurriculumRecord | null> {
    return this.scopedPrisma.curriculum.findFirst({
      where: { id: curriculumId },
      ...CURRICULUM_ARGS,
    });
  }

  findUnitById(unitId: string): Promise<LessonPlanUnitRecord | null> {
    return this.scopedPrisma.curriculumUnit.findFirst({
      where: { id: unitId },
      ...UNIT_ARGS,
    });
  }

  findLessonById(lessonId: string): Promise<LessonPlanLessonRecord | null> {
    return this.scopedPrisma.curriculumLesson.findFirst({
      where: { id: lessonId },
      ...LESSON_ARGS,
    });
  }

  findTimetableEntryById(
    timetableEntryId: string,
  ): Promise<LessonPlanTimetableEntryRecord | null> {
    return this.scopedPrisma.timetableEntry.findFirst({
      where: { id: timetableEntryId },
      ...TIMETABLE_ENTRY_ARGS,
    });
  }

  createPlan(
    data: Prisma.LessonPlanUncheckedCreateInput,
  ): Promise<LessonPlanDetailRecord> {
    return this.scopedPrisma.lessonPlan.create({
      data,
      ...LESSON_PLAN_DETAIL_ARGS,
    });
  }

  updatePlan(
    lessonPlanId: string,
    data: Prisma.LessonPlanUncheckedUpdateInput,
  ): Promise<LessonPlanDetailRecord> {
    return this.scopedPrisma.lessonPlan.update({
      where: { id: lessonPlanId },
      data,
      ...LESSON_PLAN_DETAIL_ARGS,
    });
  }

  async softDeletePlan(
    lessonPlanId: string,
  ): Promise<SoftDeleteLessonPlanResult> {
    const schoolId = this.getCurrentSchoolId();
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.lessonPlan.findFirst({
        where: { id: lessonPlanId, schoolId, deletedAt: null },
        select: { id: true },
      });
      if (!existing) {
        return { status: 'not_found' };
      }

      await tx.lessonPlanItem.updateMany({
        where: { lessonPlanId, schoolId, deletedAt: null },
        data: { deletedAt: now },
      });

      const lessonPlan = await tx.lessonPlan.update({
        where: {
          id_schoolId: {
            id: lessonPlanId,
            schoolId,
          },
        },
        data: { deletedAt: now },
        ...LESSON_PLAN_DETAIL_ARGS,
      });

      return { status: 'deleted', lessonPlan };
    });
  }

  async getNextItemSortOrder(lessonPlanId: string): Promise<number> {
    const latest = await this.scopedPrisma.lessonPlanItem.findFirst({
      where: { lessonPlanId },
      orderBy: [{ sortOrder: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      select: { sortOrder: true },
    });

    return latest ? latest.sortOrder + 1 : 0;
  }

  findItemById(input: {
    lessonPlanId: string;
    itemId: string;
  }): Promise<LessonPlanItemRecord | null> {
    return this.scopedPrisma.lessonPlanItem.findFirst({
      where: {
        id: input.itemId,
        lessonPlanId: input.lessonPlanId,
      },
      ...LESSON_PLAN_ITEM_ARGS,
    });
  }

  createItem(
    data: Prisma.LessonPlanItemUncheckedCreateInput,
  ): Promise<LessonPlanItemRecord> {
    return this.scopedPrisma.lessonPlanItem.create({
      data,
      ...LESSON_PLAN_ITEM_ARGS,
    });
  }

  updateItem(
    itemId: string,
    data: Prisma.LessonPlanItemUncheckedUpdateInput,
  ): Promise<LessonPlanItemRecord> {
    return this.scopedPrisma.lessonPlanItem.update({
      where: { id: itemId },
      data,
      ...LESSON_PLAN_ITEM_ARGS,
    });
  }

  async softDeleteItem(input: {
    lessonPlanId: string;
    itemId: string;
  }): Promise<SoftDeleteLessonPlanItemResult> {
    const schoolId = this.getCurrentSchoolId();

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.lessonPlanItem.findFirst({
        where: {
          id: input.itemId,
          schoolId,
          lessonPlanId: input.lessonPlanId,
          deletedAt: null,
        },
        ...LESSON_PLAN_ITEM_ARGS,
      });
      if (!existing) {
        return { status: 'not_found' };
      }

      const item = await tx.lessonPlanItem.update({
        where: {
          id_schoolId: {
            id: input.itemId,
            schoolId,
          },
        },
        data: { deletedAt: new Date() },
        ...LESSON_PLAN_ITEM_ARGS,
      });

      return { status: 'deleted', item };
    });
  }

  listItemsForPlan(lessonPlanId: string): Promise<LessonPlanItemRecord[]> {
    return this.scopedPrisma.lessonPlanItem.findMany({
      where: { lessonPlanId },
      orderBy: [
        { sortOrder: 'asc' },
        { plannedDate: 'asc' },
        { createdAt: 'asc' },
        { id: 'asc' },
      ],
      ...LESSON_PLAN_ITEM_ARGS,
    });
  }

  countNonDeletedItems(lessonPlanId: string): Promise<number> {
    return this.scopedPrisma.lessonPlanItem.count({
      where: { lessonPlanId },
    });
  }

  updateManyItemsStatus(input: {
    lessonPlanId: string;
    status: LessonPlanItemStatus;
    updatedByUserId: string;
  }): Promise<Prisma.BatchPayload> {
    return this.scopedPrisma.lessonPlanItem.updateMany({
      where: { lessonPlanId: input.lessonPlanId },
      data: {
        status: input.status,
        updatedByUserId: input.updatedByUserId,
      },
    });
  }
}
