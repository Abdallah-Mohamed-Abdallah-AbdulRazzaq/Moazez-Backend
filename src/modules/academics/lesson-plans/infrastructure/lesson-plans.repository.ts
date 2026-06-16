import { Injectable } from '@nestjs/common';
import {
  AcademicCalendarEventScopeType,
  AcademicCalendarEventType,
  CurriculumStatus,
  LessonPlanItemStatus,
  LessonPlanStatus,
  Prisma,
  TimetableEntryStatus,
} from '@prisma/client';
import { getRequestContext } from '../../../../common/context/request-context';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

function dateToDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

const SUMMARY_NAME_ARGS = {
  select: {
    id: true,
    nameAr: true,
    nameEn: true,
  },
} satisfies Prisma.AcademicYearDefaultArgs;

const TERM_SUMMARY_ARGS = {
  select: {
    id: true,
    nameAr: true,
    nameEn: true,
    startDate: true,
    endDate: true,
    isActive: true,
  },
} satisfies Prisma.TermDefaultArgs;

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
      grade: {
        select: {
          id: true,
          stageId: true,
        },
      },
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
      term: TERM_SUMMARY_ARGS,
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
    startDate: true,
    endDate: true,
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
          startDate: true,
          endDate: true,
          isActive: true,
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
          periodIndex: true,
        },
      },
    },
  });

const CALENDAR_HOLIDAY_ARGS =
  Prisma.validator<Prisma.AcademicCalendarEventDefaultArgs>()({
    select: {
      id: true,
      termId: true,
      title: true,
      type: true,
      scopeType: true,
      scopeKey: true,
      stageId: true,
      gradeId: true,
      sectionId: true,
      startDate: true,
      endDate: true,
    },
  });

const CURRICULUM_LESSON_FOR_PLAN_ARGS =
  Prisma.validator<Prisma.CurriculumLessonDefaultArgs>()({
    select: {
      id: true,
      curriculumId: true,
      unitId: true,
      title: true,
      sortOrder: true,
      unit: {
        select: {
          id: true,
          title: true,
          sortOrder: true,
        },
      },
      curriculum: {
        select: {
          id: true,
          academicYearId: true,
          termId: true,
          gradeId: true,
          subjectId: true,
          title: true,
          status: true,
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
export type LessonPlanHolidayRecord = Prisma.AcademicCalendarEventGetPayload<
  typeof CALENDAR_HOLIDAY_ARGS
>;
export type LessonPlanCurriculumLessonRecord =
  Prisma.CurriculumLessonGetPayload<typeof CURRICULUM_LESSON_FOR_PLAN_ARGS>;

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

export type LessonPlanWorkflowFilters = {
  termId: string;
  teacherSubjectAllocationId?: string;
  gradeId?: string;
  subjectId?: string;
  classroomId?: string;
};

export type PersistAutoPlanItemInput = {
  curriculumId: string;
  unitId: string;
  lessonId: string;
  title: string;
  plannedDate: Date;
  dayOfWeek: number;
  periodId: string | null;
  periodLabel: string | null;
  timetableEntryId: string | null;
  weekStartDate: Date;
  weekEndDate: Date;
  sortOrder: number;
  existingItemId?: string;
};

export type PersistAutoPlanInput = {
  schoolId: string;
  actorId: string;
  term: LessonPlanTermRecord;
  allocation: LessonPlanAllocationRecord;
  overwrite: boolean;
  items: PersistAutoPlanItemInput[];
};

export type PersistAutoPlanResult = {
  createdItems: LessonPlanItemRecord[];
  updatedItems: LessonPlanItemRecord[];
};

export type MoveLessonPlanItemInput = {
  schoolId: string;
  actorId: string;
  sourcePlan: LessonPlanDetailRecord;
  item: LessonPlanItemRecord;
  weekStartDate: Date;
  weekEndDate: Date;
  data: Prisma.LessonPlanItemUncheckedUpdateInput;
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

  listPlanDetailsForWorkflows(
    filters: LessonPlanWorkflowFilters,
  ): Promise<LessonPlanDetailRecord[]> {
    return this.scopedPrisma.lessonPlan.findMany({
      where: this.buildWorkflowPlanWhere(filters),
      orderBy: [{ weekStartDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      ...LESSON_PLAN_DETAIL_ARGS,
    });
  }

  listTeacherAllocationsForWorkflows(
    filters: LessonPlanWorkflowFilters,
  ): Promise<LessonPlanAllocationRecord[]> {
    return this.scopedPrisma.teacherSubjectAllocation.findMany({
      where: {
        termId: filters.termId,
        ...(filters.teacherSubjectAllocationId
          ? { id: filters.teacherSubjectAllocationId }
          : {}),
        ...(filters.subjectId ? { subjectId: filters.subjectId } : {}),
        ...(filters.classroomId ? { classroomId: filters.classroomId } : {}),
        ...(filters.gradeId
          ? {
              classroom: {
                section: {
                  gradeId: filters.gradeId,
                },
              },
            }
          : {}),
      },
      orderBy: [{ classroomId: 'asc' }, { subjectId: 'asc' }, { id: 'asc' }],
      ...TEACHER_ALLOCATION_ARGS,
    });
  }

  listHolidayEvents(input: {
    termId: string;
    from: Date;
    to: Date;
    stageId?: string | null;
    gradeId?: string | null;
    sectionId?: string | null;
  }): Promise<LessonPlanHolidayRecord[]> {
    const scopeFilters: Prisma.AcademicCalendarEventWhereInput[] = [
      { scopeType: AcademicCalendarEventScopeType.SCHOOL },
    ];
    if (input.stageId) {
      scopeFilters.push({ stageId: input.stageId });
    }
    if (input.gradeId) {
      scopeFilters.push({ gradeId: input.gradeId });
    }
    if (input.sectionId) {
      scopeFilters.push({ sectionId: input.sectionId });
    }

    return this.scopedPrisma.academicCalendarEvent.findMany({
      where: {
        termId: input.termId,
        type: AcademicCalendarEventType.HOLIDAY,
        startDate: { lte: input.to },
        endDate: { gte: input.from },
        OR: scopeFilters,
      },
      orderBy: [{ startDate: 'asc' }, { id: 'asc' }],
      ...CALENDAR_HOLIDAY_ARGS,
    });
  }

  listCurriculumLessonsForAllocation(input: {
    academicYearId: string;
    termId: string;
    gradeId: string;
    subjectId: string;
  }): Promise<LessonPlanCurriculumLessonRecord[]> {
    return this.scopedPrisma.curriculumLesson.findMany({
      where: {
        curriculum: {
          academicYearId: input.academicYearId,
          termId: input.termId,
          gradeId: input.gradeId,
          subjectId: input.subjectId,
          status: { not: CurriculumStatus.ARCHIVED },
          deletedAt: null,
        },
        unit: { deletedAt: null },
      },
      orderBy: [
        { curriculum: { title: 'asc' } },
        { unit: { sortOrder: 'asc' } },
        { sortOrder: 'asc' },
        { id: 'asc' },
      ],
      ...CURRICULUM_LESSON_FOR_PLAN_ARGS,
    });
  }

  listTimetableEntriesForAllocation(input: {
    termId: string;
    teacherSubjectAllocationId: string;
  }): Promise<LessonPlanTimetableEntryRecord[]> {
    return this.scopedPrisma.timetableEntry.findMany({
      where: {
        termId: input.termId,
        teacherSubjectAllocationId: input.teacherSubjectAllocationId,
        status: { not: TimetableEntryStatus.CANCELLED },
      },
      orderBy: [
        { dayOfWeek: 'asc' },
        { period: { periodIndex: 'asc' } },
        { id: 'asc' },
      ],
      ...TIMETABLE_ENTRY_ARGS,
    });
  }

  async findItemWithPlanById(itemId: string): Promise<{
    item: LessonPlanItemRecord;
    lessonPlan: LessonPlanDetailRecord;
  } | null> {
    const item = await this.scopedPrisma.lessonPlanItem.findFirst({
      where: { id: itemId },
      ...LESSON_PLAN_ITEM_ARGS,
    });
    if (!item) {
      return null;
    }

    const lessonPlan = await this.findPlanById(item.lessonPlanId);
    if (!lessonPlan) {
      return null;
    }

    return { item, lessonPlan };
  }

  findPlanByAllocationAndWeek(input: {
    teacherSubjectAllocationId: string;
    weekStartDate: Date;
  }): Promise<LessonPlanDetailRecord | null> {
    return this.scopedPrisma.lessonPlan.findFirst({
      where: {
        teacherSubjectAllocationId: input.teacherSubjectAllocationId,
        weekStartDate: input.weekStartDate,
      },
      ...LESSON_PLAN_DETAIL_ARGS,
    });
  }

  async persistAutoPlanItems(
    input: PersistAutoPlanInput,
  ): Promise<PersistAutoPlanResult> {
    const createdItems: LessonPlanItemRecord[] = [];
    const updatedItems: LessonPlanItemRecord[] = [];

    await this.prisma.$transaction(async (tx) => {
      for (const item of input.items) {
        let lessonPlan = await tx.lessonPlan.findFirst({
          where: {
            schoolId: input.schoolId,
            teacherSubjectAllocationId: input.allocation.id,
            weekStartDate: item.weekStartDate,
            deletedAt: null,
          },
          ...LESSON_PLAN_DETAIL_ARGS,
        });

        if (!lessonPlan) {
          lessonPlan = await tx.lessonPlan.create({
            data: {
              schoolId: input.schoolId,
              academicYearId: input.term.academicYearId,
              termId: input.term.id,
              teacherSubjectAllocationId: input.allocation.id,
              teacherUserId: input.allocation.teacherUserId,
              classroomId: input.allocation.classroomId,
              subjectId: input.allocation.subjectId,
              curriculumId: item.curriculumId,
              title: `Auto plan week ${dateToDateOnly(item.weekStartDate)}`,
              description: null,
              status: LessonPlanStatus.DRAFT,
              weekStartDate: item.weekStartDate,
              weekEndDate: item.weekEndDate,
              createdByUserId: input.actorId,
              updatedByUserId: input.actorId,
            },
            ...LESSON_PLAN_DETAIL_ARGS,
          });
        }

        if (input.overwrite && item.existingItemId) {
          const updated = await tx.lessonPlanItem.update({
            where: {
              id_schoolId: {
                id: item.existingItemId,
                schoolId: input.schoolId,
              },
            },
            data: {
              lessonPlanId: lessonPlan.id,
              curriculumId: item.curriculumId,
              unitId: item.unitId,
              lessonId: item.lessonId,
              timetableEntryId: item.timetableEntryId,
              plannedDate: item.plannedDate,
              dayOfWeek: item.dayOfWeek,
              periodId: item.periodId,
              periodLabel: item.periodLabel,
              title: item.title,
              sortOrder: item.sortOrder,
              updatedByUserId: input.actorId,
            },
            ...LESSON_PLAN_ITEM_ARGS,
          });
          updatedItems.push(updated);
          continue;
        }

        const created = await tx.lessonPlanItem.create({
          data: {
            schoolId: input.schoolId,
            lessonPlanId: lessonPlan.id,
            curriculumId: item.curriculumId,
            unitId: item.unitId,
            lessonId: item.lessonId,
            timetableEntryId: item.timetableEntryId,
            plannedDate: item.plannedDate,
            dayOfWeek: item.dayOfWeek,
            periodId: item.periodId,
            periodLabel: item.periodLabel,
            title: item.title,
            notes: null,
            status: LessonPlanItemStatus.PLANNED,
            sortOrder: item.sortOrder,
            createdByUserId: input.actorId,
            updatedByUserId: input.actorId,
          },
          ...LESSON_PLAN_ITEM_ARGS,
        });
        createdItems.push(created);
      }
    });

    return { createdItems, updatedItems };
  }

  async moveItemToWeek(
    input: MoveLessonPlanItemInput,
  ): Promise<LessonPlanItemRecord> {
    let movedItem: LessonPlanItemRecord | null = null;

    await this.prisma.$transaction(async (tx) => {
      let targetPlan = await tx.lessonPlan.findFirst({
        where: {
          schoolId: input.schoolId,
          teacherSubjectAllocationId:
            input.sourcePlan.teacherSubjectAllocationId,
          weekStartDate: input.weekStartDate,
          deletedAt: null,
        },
        ...LESSON_PLAN_DETAIL_ARGS,
      });

      if (!targetPlan) {
        targetPlan = await tx.lessonPlan.create({
          data: {
            schoolId: input.schoolId,
            academicYearId: input.sourcePlan.academicYearId,
            termId: input.sourcePlan.termId,
            teacherSubjectAllocationId:
              input.sourcePlan.teacherSubjectAllocationId,
            teacherUserId: input.sourcePlan.teacherUserId,
            classroomId: input.sourcePlan.classroomId,
            subjectId: input.sourcePlan.subjectId,
            curriculumId: input.sourcePlan.curriculumId,
            title: `Rescheduled week ${dateToDateOnly(input.weekStartDate)}`,
            description: null,
            status: LessonPlanStatus.DRAFT,
            weekStartDate: input.weekStartDate,
            weekEndDate: input.weekEndDate,
            createdByUserId: input.actorId,
            updatedByUserId: input.actorId,
          },
          ...LESSON_PLAN_DETAIL_ARGS,
        });
      }

      movedItem = await tx.lessonPlanItem.update({
        where: {
          id_schoolId: {
            id: input.item.id,
            schoolId: input.schoolId,
          },
        },
        data: {
          ...input.data,
          lessonPlanId: targetPlan.id,
          updatedByUserId: input.actorId,
        },
        ...LESSON_PLAN_ITEM_ARGS,
      });
    });

    if (!movedItem) {
      throw new Error('Lesson plan item move transaction did not return an item');
    }

    return movedItem;
  }

  private buildWorkflowPlanWhere(
    filters: LessonPlanWorkflowFilters,
  ): Prisma.LessonPlanWhereInput {
    return {
      termId: filters.termId,
      ...(filters.teacherSubjectAllocationId
        ? { teacherSubjectAllocationId: filters.teacherSubjectAllocationId }
        : {}),
      ...(filters.subjectId ? { subjectId: filters.subjectId } : {}),
      ...(filters.classroomId ? { classroomId: filters.classroomId } : {}),
      ...(filters.gradeId
        ? {
            classroom: {
              section: {
                gradeId: filters.gradeId,
              },
            },
          }
        : {}),
    };
  }
}
