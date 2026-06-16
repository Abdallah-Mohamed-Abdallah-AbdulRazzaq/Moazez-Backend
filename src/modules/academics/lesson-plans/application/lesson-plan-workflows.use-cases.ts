import { Injectable } from '@nestjs/common';
import {
  AuditOutcome,
  LessonPlanItemStatus,
  LessonPlanStatus,
  Prisma,
} from '@prisma/client';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { AcademicsScope, requireAcademicsScope } from '../../academics-context';
import {
  AutoPlanLessonPlanDto,
  LessonPlanSummaryQueryDto,
  LessonPlanValidationQueryDto,
  LessonPlanWeeksQueryDto,
  MoveLessonPlanItemDto,
} from '../dto/lesson-plans.dto';
import {
  AutoPlanLessonPlanResponseDto,
  LessonPlanItemResponseDto,
  LessonPlanSummaryResponseDto,
  LessonPlanValidationResponseDto,
  LessonPlanWeeksResponseDto,
} from '../dto/lesson-plans-response.dto';
import {
  assertDayOfWeek,
  assertSortOrder,
  dayOfWeekFromDate,
  normalizeDateOnly,
} from '../domain/lesson-plan-inputs';
import {
  LessonPlanAutoPlanNoCurriculumException,
  LessonPlanAutoPlanNoSlotsException,
  LessonPlanClosedTermException,
  LessonPlanHolidayDateException,
  LessonPlanInvalidDateRangeException,
  LessonPlanInvalidScopeException,
  LessonPlanInvalidTimetableEntryException,
  LessonPlanItemNotFoundException,
  LessonPlanReadOnlyException,
} from '../domain/lesson-plan.exceptions';
import {
  LessonPlanAllocationRecord,
  LessonPlanCurriculumLessonRecord,
  LessonPlanDetailRecord,
  LessonPlanHolidayRecord,
  LessonPlanItemRecord,
  LessonPlansRepository,
  LessonPlanTermRecord,
  LessonPlanTimetableEntryRecord,
  LessonPlanWorkflowFilters,
  PersistAutoPlanItemInput,
} from '../infrastructure/lesson-plans.repository';
import {
  presentAutoPlanLessonPlan,
  presentLessonPlanItem,
  presentLessonPlanSummary,
  presentLessonPlanValidation,
  presentLessonPlanWeeks,
} from '../presenters/lesson-plans.presenter';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

type DateRange = {
  from: Date;
  to: Date;
};

type WeekBucket = {
  weekIndex: number;
  startsAt: Date;
  endsAt: Date;
  instructionalDays: Date[];
  holidayDays: Array<{
    date: Date;
    eventId: string;
    title: string;
  }>;
  plannedItemsCount: number;
};

type HolidayMap = Map<
  string,
  Array<{
    eventId: string;
    title: string;
  }>
>;

type ProposedAutoPlanItem = {
  curriculumId: string;
  unitId: string;
  lessonId: string;
  title: string;
  plannedDate: Date;
  dayOfWeek: number;
  periodId: string | null;
  periodLabel: string | null;
  timetableEntryId: string | null;
  weekIndex: number;
  weekStartDate: Date;
  weekEndDate: Date;
  sortOrder: number;
  existingItemId?: string;
};

@Injectable()
export class ListLessonPlanWeeksUseCase {
  constructor(private readonly lessonPlansRepository: LessonPlansRepository) {}

  async execute(
    query: LessonPlanWeeksQueryDto,
  ): Promise<LessonPlanWeeksResponseDto> {
    requireAcademicsScope();
    const { term, allocation } = await resolveTermAndOptionalAllocation(
      this.lessonPlansRepository,
      query.termId,
      query.teacherSubjectAllocationId,
    );
    const range = resolveDateRange(term, query.from, query.to);
    const holidays = await loadHolidays(
      this.lessonPlansRepository,
      term.id,
      range,
      allocation,
    );
    const plans = await this.lessonPlansRepository.listPlanDetailsForWorkflows({
      termId: term.id,
      teacherSubjectAllocationId: allocation?.id,
    });
    const weeks = buildWeekBuckets(term, range, holidays, plans);

    return presentLessonPlanWeeks({
      termId: term.id,
      academicYearId: term.academicYearId,
      weeks,
    });
  }
}

@Injectable()
export class GetLessonPlanSummaryUseCase {
  constructor(private readonly lessonPlansRepository: LessonPlansRepository) {}

  async execute(
    query: LessonPlanSummaryQueryDto,
  ): Promise<LessonPlanSummaryResponseDto> {
    requireAcademicsScope();
    const term = await findTermOrThrow(this.lessonPlansRepository, query.termId);
    const filters = workflowFiltersFromQuery(query);
    const [plans, allocations] = await Promise.all([
      this.lessonPlansRepository.listPlanDetailsForWorkflows(filters),
      this.lessonPlansRepository.listTeacherAllocationsForWorkflows(filters),
    ]);

    const byTeacherAllocation: LessonPlanSummaryResponseDto['byTeacherAllocation'] =
      [];
    let totalCandidateLessons = 0;
    let totalPlannedLessons = 0;

    for (const allocation of allocations) {
      const allocationPlans = plans.filter(
        (plan) => plan.teacherSubjectAllocationId === allocation.id,
      );
      const allocationItems = allocationPlans.flatMap((plan) => plan.items);
      const candidateLessons = await listCurriculumLessonsForAllocation(
        this.lessonPlansRepository,
        term,
        allocation,
      );
      const plannedLessonIds = new Set(
        allocationItems
          .filter((item) => item.status !== LessonPlanItemStatus.CANCELLED)
          .map((item) => item.lessonId),
      );
      totalCandidateLessons += candidateLessons.length;
      totalPlannedLessons += plannedLessonIds.size;

      byTeacherAllocation.push({
        teacherSubjectAllocationId: allocation.id,
        teacher: presentSafeTeacher(allocation),
        subject: presentSubject(allocation),
        classroom: presentClassroom(allocation),
        plannedItemsCount: allocationItems.filter((item) =>
          isPlannedItemStatus(item.status),
        ).length,
        completedItemsCount: allocationItems.filter(
          (item) => item.status === LessonPlanItemStatus.DONE,
        ).length,
        unplannedLessonsCount: Math.max(
          candidateLessons.length - plannedLessonIds.size,
          0,
        ),
        coveragePercent: percent(plannedLessonIds.size, candidateLessons.length),
      });
    }

    const allItems = plans.flatMap((plan) => plan.items);
    const response: LessonPlanSummaryResponseDto = {
      termId: term.id,
      academicYearId: term.academicYearId,
      summary: {
        lessonPlansCount: plans.length,
        itemsCount: allItems.length,
        plannedItemsCount: allItems.filter((item) =>
          isPlannedItemStatus(item.status),
        ).length,
        completedItemsCount: allItems.filter(
          (item) => item.status === LessonPlanItemStatus.DONE,
        ).length,
        unplannedLessonsCount: Math.max(
          totalCandidateLessons - totalPlannedLessons,
          0,
        ),
        coveragePercent: percent(totalPlannedLessons, totalCandidateLessons),
      },
      byTeacherAllocation,
    };

    return presentLessonPlanSummary(response);
  }
}

@Injectable()
export class AutoPlanLessonPlanUseCase {
  constructor(
    private readonly lessonPlansRepository: LessonPlansRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    command: AutoPlanLessonPlanDto,
  ): Promise<AutoPlanLessonPlanResponseDto> {
    const scope = requireAcademicsScope();
    const { term, allocation } = await resolveTermAndAllocation(
      this.lessonPlansRepository,
      command.termId,
      command.teacherSubjectAllocationId,
    );
    const dryRun = command.dryRun ?? false;
    if (!dryRun) {
      assertTermWritable(term);
    }

    const range = resolveDateRange(term, command.from, command.to);
    const [holidays, lessons, timetableEntries, plans] = await Promise.all([
      loadHolidays(this.lessonPlansRepository, term.id, range, allocation),
      listCurriculumLessonsForAllocation(
        this.lessonPlansRepository,
        term,
        allocation,
      ),
      this.lessonPlansRepository.listTimetableEntriesForAllocation({
        termId: term.id,
        teacherSubjectAllocationId: allocation.id,
      }),
      this.lessonPlansRepository.listPlanDetailsForWorkflows({
        termId: term.id,
        teacherSubjectAllocationId: allocation.id,
      }),
    ]);

    if (lessons.length === 0) {
      throw new LessonPlanAutoPlanNoCurriculumException({
        termId: term.id,
        teacherSubjectAllocationId: allocation.id,
      });
    }

    if (timetableEntries.length === 0) {
      throw new LessonPlanAutoPlanNoSlotsException({
        termId: term.id,
        teacherSubjectAllocationId: allocation.id,
      });
    }

    const existingItemsByLesson = new Map<string, LessonPlanItemRecord>();
    for (const item of plans.flatMap((plan) => plan.items)) {
      if (item.status !== LessonPlanItemStatus.CANCELLED) {
        existingItemsByLesson.set(item.lessonId, item);
      }
    }

    const plan = buildAutoPlan({
      term,
      range,
      holidays,
      lessons,
      timetableEntries,
      existingItemsByLesson,
      overwrite: command.overwrite ?? false,
    });

    let createdItems: LessonPlanItemRecord[] = [];
    let updatedItems: LessonPlanItemRecord[] = [];
    if (!dryRun && plan.proposedItems.length > 0) {
      const persisted = await this.lessonPlansRepository.persistAutoPlanItems({
        schoolId: scope.schoolId,
        actorId: scope.actorId,
        term,
        allocation,
        overwrite: command.overwrite ?? false,
        items: plan.proposedItems.map(toPersistAutoPlanItem),
      });
      createdItems = persisted.createdItems;
      updatedItems = persisted.updatedItems;

      await recordLessonPlanWorkflowAudit(this.authRepository, {
        scope,
        action: 'academics.lesson_plan.auto_plan',
        resourceType: 'lesson_plan',
        resourceId: allocation.id,
        after: {
          termId: term.id,
          teacherSubjectAllocationId: allocation.id,
          createdItems: createdItems.length,
          updatedItems: updatedItems.length,
        },
      });
    }

    return presentAutoPlanLessonPlan({
      termId: term.id,
      academicYearId: term.academicYearId,
      teacherSubjectAllocationId: allocation.id,
      dryRun,
      summary: {
        candidateLessons: lessons.length,
        availableSlots: plan.availableSlots,
        proposedItems: plan.proposedItems.length,
        createdItems: createdItems.length,
        skippedExistingItems: plan.skippedExistingItems,
        skippedHolidaySlots: plan.skippedHolidaySlots,
      },
      items: plan.proposedItems.map((item) => ({
        lessonId: item.lessonId,
        title: item.title,
        plannedDate: dateToDateOnly(item.plannedDate),
        timetableEntryId: item.timetableEntryId,
        weekIndex: item.weekIndex,
        status: dryRun ? 'proposed' : 'planned',
      })),
    });
  }
}

@Injectable()
export class MoveLessonPlanItemUseCase {
  constructor(
    private readonly lessonPlansRepository: LessonPlansRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    itemId: string,
    command: MoveLessonPlanItemDto,
  ): Promise<LessonPlanItemResponseDto> {
    const scope = requireAcademicsScope();
    const existing = await this.lessonPlansRepository.findItemWithPlanById(
      itemId,
    );
    if (!existing) {
      throw new LessonPlanItemNotFoundException({ itemId });
    }

    assertPlanMutable(existing.lessonPlan);
    assertTermWritable(existing.lessonPlan.term);

    const term: LessonPlanTermRecord = {
      id: existing.lessonPlan.termId,
      schoolId: existing.lessonPlan.schoolId,
      academicYearId: existing.lessonPlan.academicYearId,
      startDate: existing.lessonPlan.term.startDate,
      endDate: existing.lessonPlan.term.endDate,
      isActive: existing.lessonPlan.term.isActive,
    };
    const plannedDate = command.plannedDate
      ? normalizeDateOnly(command.plannedDate, 'plannedDate')
      : existing.item.plannedDate;
    if (plannedDate) {
      assertDateWithinTerm(term, plannedDate, 'plannedDate');
    }

    const targetWeek =
      command.weekIndex !== undefined
        ? weekByIndex(term, command.weekIndex)
        : plannedDate
          ? weekForDate(term, plannedDate)
          : {
              weekIndex: weekForDate(term, existing.lessonPlan.weekStartDate)
                .weekIndex,
              startsAt: existing.lessonPlan.weekStartDate,
              endsAt: existing.lessonPlan.weekEndDate,
            };

    const range = { from: targetWeek.startsAt, to: targetWeek.endsAt };
    const holidays = await loadHolidays(
      this.lessonPlansRepository,
      term.id,
      range,
      allocationFromPlan(existing.lessonPlan),
    );
    const holidayMap = buildHolidayMap(holidays, range);
    const resolvedPlannedDate =
      plannedDate ??
      firstInstructionalDay(targetWeek.startsAt, targetWeek.endsAt, holidayMap);
    if (dateHasHoliday(resolvedPlannedDate, holidayMap)) {
      throw new LessonPlanHolidayDateException({
        plannedDate: dateToDateOnly(resolvedPlannedDate),
      });
    }
    if (
      command.weekIndex !== undefined &&
      weekForDate(term, resolvedPlannedDate).weekIndex !== command.weekIndex
    ) {
      throw new LessonPlanInvalidDateRangeException({
        weekIndex: command.weekIndex,
        plannedDate: dateToDateOnly(resolvedPlannedDate),
      });
    }

    const timetable = await resolveMoveTimetable(
      this.lessonPlansRepository,
      existing.lessonPlan,
      command.timetableEntryId,
    );
    if (timetable && timetable.dayOfWeek !== dayOfWeekFromDate(resolvedPlannedDate)) {
      throw new LessonPlanInvalidTimetableEntryException({
        timetableEntryId: timetable.id,
        plannedDate: dateToDateOnly(resolvedPlannedDate),
      });
    }

    if (command.sortOrder !== undefined) {
      assertSortOrder(command.sortOrder);
    }

    const data: Prisma.LessonPlanItemUncheckedUpdateInput = {
      plannedDate: resolvedPlannedDate,
      dayOfWeek: dayOfWeekFromDate(resolvedPlannedDate),
      sortOrder: command.sortOrder ?? existing.item.sortOrder,
      ...(command.timetableEntryId !== undefined
        ? {
            timetableEntryId: timetable?.id ?? null,
            periodId: timetable?.periodId ?? null,
            periodLabel: timetable?.period?.label ?? null,
          }
        : {}),
    };

    const moved = await this.lessonPlansRepository.moveItemToWeek({
      schoolId: scope.schoolId,
      actorId: scope.actorId,
      sourcePlan: existing.lessonPlan,
      item: existing.item,
      weekStartDate: targetWeek.startsAt,
      weekEndDate: targetWeek.endsAt,
      data,
    });

    await recordLessonPlanWorkflowAudit(this.authRepository, {
      scope,
      action: 'academics.lesson_plan.item.move',
      resourceType: 'lesson_plan_item',
      resourceId: moved.id,
      before: summarizeLessonPlanItem(existing.item),
      after: summarizeLessonPlanItem(moved),
    });

    return presentLessonPlanItem(moved);
  }
}

@Injectable()
export class ValidateLessonPlansUseCase {
  constructor(private readonly lessonPlansRepository: LessonPlansRepository) {}

  async execute(
    query: LessonPlanValidationQueryDto,
  ): Promise<LessonPlanValidationResponseDto> {
    requireAcademicsScope();
    const term = await findTermOrThrow(this.lessonPlansRepository, query.termId);
    const filters = workflowFiltersFromQuery(query);
    const [plans, allocations] = await Promise.all([
      this.lessonPlansRepository.listPlanDetailsForWorkflows(filters),
      this.lessonPlansRepository.listTeacherAllocationsForWorkflows(filters),
    ]);
    const holidays = await loadHolidays(this.lessonPlansRepository, term.id, {
      from: term.startDate,
      to: term.endDate,
    });
    const holidayMap = buildHolidayMap(holidays, {
      from: term.startDate,
      to: term.endDate,
    });

    const issues: LessonPlanValidationResponseDto['issues'] = [];
    let missingPlannedLessons = 0;
    const duplicateLessons = countDuplicateLessons(plans);

    for (const allocation of allocations) {
      const lessons = await listCurriculumLessonsForAllocation(
        this.lessonPlansRepository,
        term,
        allocation,
      );
      const allocationLessonIds = new Set(
        plans
          .filter((plan) => plan.teacherSubjectAllocationId === allocation.id)
          .flatMap((plan) => plan.items)
          .filter((item) => item.status !== LessonPlanItemStatus.CANCELLED)
          .map((item) => item.lessonId),
      );

      for (const lesson of lessons) {
        if (!allocationLessonIds.has(lesson.id)) {
          missingPlannedLessons += 1;
          issues.push({
            code: 'missing_planned_lesson',
            severity: 'warning',
            lessonId: lesson.id,
            teacherSubjectAllocationId: allocation.id,
            message: 'Curriculum lesson has no lesson-plan item.',
          });
        }
      }
    }

    let holidayItems = 0;
    let outsideTermItems = 0;
    for (const plan of plans) {
      for (const item of plan.items) {
        if (!item.plannedDate) {
          issues.push({
            code: 'missing_planned_date',
            severity: 'warning',
            itemId: item.id,
            teacherSubjectAllocationId: plan.teacherSubjectAllocationId,
            message: 'Lesson-plan item has no planned date.',
          });
          continue;
        }

        if (dateHasHoliday(item.plannedDate, holidayMap)) {
          holidayItems += 1;
          issues.push({
            code: 'holiday_planned_item',
            severity: 'warning',
            itemId: item.id,
            lessonId: item.lessonId,
            teacherSubjectAllocationId: plan.teacherSubjectAllocationId,
            message: 'Lesson-plan item is scheduled on a holiday.',
          });
        }

        if (
          item.plannedDate.getTime() < term.startDate.getTime() ||
          item.plannedDate.getTime() > term.endDate.getTime()
        ) {
          outsideTermItems += 1;
          issues.push({
            code: 'outside_term_item',
            severity: 'warning',
            itemId: item.id,
            lessonId: item.lessonId,
            teacherSubjectAllocationId: plan.teacherSubjectAllocationId,
            message: 'Lesson-plan item is outside the term date range.',
          });
        }
      }
    }

    for (const duplicate of duplicateLessons.details) {
      issues.push({
        code: 'duplicate_planned_lesson',
        severity: 'warning',
        lessonId: duplicate.lessonId,
        teacherSubjectAllocationId: duplicate.teacherSubjectAllocationId,
        message: 'Curriculum lesson has duplicate lesson-plan items.',
      });
    }

    return presentLessonPlanValidation({
      termId: term.id,
      academicYearId: term.academicYearId,
      summary: {
        lessonPlansChecked: plans.length,
        itemsChecked: plans.flatMap((plan) => plan.items).length,
        missingPlannedLessons,
        holidayItems,
        outsideTermItems,
        duplicateLessons: duplicateLessons.count,
      },
      issues,
    });
  }
}

async function resolveTermAndOptionalAllocation(
  repository: LessonPlansRepository,
  termId: string,
  teacherSubjectAllocationId?: string,
): Promise<{
  term: LessonPlanTermRecord;
  allocation: LessonPlanAllocationRecord | null;
}> {
  const term = await findTermOrThrow(repository, termId);
  if (!teacherSubjectAllocationId) {
    return { term, allocation: null };
  }

  const allocation = await repository.findTeacherAllocationById(
    teacherSubjectAllocationId,
  );
  if (!allocation || allocation.termId !== term.id) {
    throw new LessonPlanInvalidScopeException({
      termId,
      teacherSubjectAllocationId,
    });
  }

  return { term, allocation };
}

async function resolveTermAndAllocation(
  repository: LessonPlansRepository,
  termId: string,
  teacherSubjectAllocationId: string,
): Promise<{
  term: LessonPlanTermRecord;
  allocation: LessonPlanAllocationRecord;
}> {
  const { term, allocation } = await resolveTermAndOptionalAllocation(
    repository,
    termId,
    teacherSubjectAllocationId,
  );
  if (!allocation) {
    throw new LessonPlanInvalidScopeException({
      termId,
      teacherSubjectAllocationId,
    });
  }

  return { term, allocation };
}

async function findTermOrThrow(
  repository: LessonPlansRepository,
  termId: string,
): Promise<LessonPlanTermRecord> {
  const term = await repository.findTermById(termId);
  if (!term) {
    throw new LessonPlanInvalidScopeException({ termId });
  }

  return term;
}

function workflowFiltersFromQuery(
  query: LessonPlanSummaryQueryDto | LessonPlanValidationQueryDto,
): LessonPlanWorkflowFilters {
  return {
    termId: query.termId,
    teacherSubjectAllocationId: query.teacherSubjectAllocationId,
    gradeId: query.gradeId,
    subjectId: query.subjectId,
    classroomId: query.classroomId,
  };
}

function resolveDateRange(
  term: LessonPlanTermRecord,
  from?: string,
  to?: string,
): DateRange {
  const start = from ? normalizeDateOnly(from, 'from') : term.startDate;
  const end = to ? normalizeDateOnly(to, 'to') : term.endDate;
  if (start.getTime() > end.getTime()) {
    throw new LessonPlanInvalidDateRangeException({
      from: dateToDateOnly(start),
      to: dateToDateOnly(end),
    });
  }

  const clampedStart = maxDate(start, term.startDate);
  const clampedEnd = minDate(end, term.endDate);
  if (clampedStart.getTime() > clampedEnd.getTime()) {
    throw new LessonPlanInvalidDateRangeException({
      from: dateToDateOnly(start),
      to: dateToDateOnly(end),
      termStartDate: dateToDateOnly(term.startDate),
      termEndDate: dateToDateOnly(term.endDate),
    });
  }

  return { from: clampedStart, to: clampedEnd };
}

async function loadHolidays(
  repository: LessonPlansRepository,
  termId: string,
  range: DateRange,
  allocation?: LessonPlanAllocationRecord | null,
): Promise<LessonPlanHolidayRecord[]> {
  return repository.listHolidayEvents({
    termId,
    from: range.from,
    to: range.to,
    stageId: allocation?.classroom.section.grade.stageId ?? null,
    gradeId: allocation?.classroom.section.gradeId ?? null,
    sectionId: allocation?.classroom.section.id ?? null,
  });
}

async function listCurriculumLessonsForAllocation(
  repository: LessonPlansRepository,
  term: LessonPlanTermRecord,
  allocation: LessonPlanAllocationRecord,
): Promise<LessonPlanCurriculumLessonRecord[]> {
  return repository.listCurriculumLessonsForAllocation({
    academicYearId: term.academicYearId,
    termId: term.id,
    gradeId: allocation.classroom.section.gradeId,
    subjectId: allocation.subjectId,
  });
}

function buildWeekBuckets(
  term: LessonPlanTermRecord,
  range: DateRange,
  holidays: LessonPlanHolidayRecord[],
  plans: LessonPlanDetailRecord[],
): WeekBucket[] {
  const holidayMap = buildHolidayMap(holidays, range);
  const weeks: WeekBucket[] = [];
  let cursor = weekForDate(term, range.from).startsAt;

  while (cursor.getTime() <= range.to.getTime()) {
    const week = weekForDate(term, cursor);
    const startsAt = maxDate(week.startsAt, range.from);
    const endsAt = minDate(week.endsAt, range.to);
    const instructionalDays: Date[] = [];
    const holidayDays: WeekBucket['holidayDays'] = [];

    for (const day of enumerateDates(startsAt, endsAt)) {
      const holidayEvents = holidayMap.get(dateToDateOnly(day)) ?? [];
      if (holidayEvents.length > 0) {
        holidayDays.push(
          ...holidayEvents.map((event) => ({
            date: day,
            eventId: event.eventId,
            title: event.title,
          })),
        );
      } else {
        instructionalDays.push(day);
      }
    }

    weeks.push({
      weekIndex: week.weekIndex,
      startsAt,
      endsAt,
      instructionalDays,
      holidayDays,
      plannedItemsCount: countPlannedItemsInRange(plans, startsAt, endsAt),
    });

    cursor = addDays(week.endsAt, 1);
  }

  return weeks;
}

function buildAutoPlan(input: {
  term: LessonPlanTermRecord;
  range: DateRange;
  holidays: LessonPlanHolidayRecord[];
  lessons: LessonPlanCurriculumLessonRecord[];
  timetableEntries: LessonPlanTimetableEntryRecord[];
  existingItemsByLesson: Map<string, LessonPlanItemRecord>;
  overwrite: boolean;
}): {
  proposedItems: ProposedAutoPlanItem[];
  availableSlots: number;
  skippedExistingItems: number;
  skippedHolidaySlots: number;
} {
  const holidayMap = buildHolidayMap(input.holidays, input.range);
  const timetableByDay = groupTimetableEntriesByDay(input.timetableEntries);
  const datedSlots: Array<{
    date: Date;
    entry: LessonPlanTimetableEntryRecord;
  }> = [];
  let skippedHolidaySlots = 0;

  for (const day of enumerateDates(input.range.from, input.range.to)) {
    const entries = timetableByDay.get(dayOfWeekFromDate(day)) ?? [];
    if (entries.length === 0) {
      continue;
    }
    if (dateHasHoliday(day, holidayMap)) {
      skippedHolidaySlots += entries.length;
      continue;
    }
    for (const entry of entries) {
      datedSlots.push({ date: day, entry });
    }
  }

  if (datedSlots.length === 0) {
    throw new LessonPlanAutoPlanNoSlotsException({
      termId: input.term.id,
    });
  }

  const proposedItems: ProposedAutoPlanItem[] = [];
  let skippedExistingItems = 0;
  let slotIndex = 0;
  for (const lesson of input.lessons) {
    const existingItem = input.existingItemsByLesson.get(lesson.id);
    if (existingItem && !input.overwrite) {
      skippedExistingItems += 1;
      continue;
    }

    const slot = datedSlots[slotIndex];
    if (!slot) {
      break;
    }
    slotIndex += 1;
    const week = weekForDate(input.term, slot.date);
    assertDayOfWeek(slot.entry.dayOfWeek);

    proposedItems.push({
      curriculumId: lesson.curriculumId,
      unitId: lesson.unitId,
      lessonId: lesson.id,
      title: lesson.title,
      plannedDate: slot.date,
      dayOfWeek: slot.entry.dayOfWeek,
      periodId: slot.entry.periodId,
      periodLabel: slot.entry.period?.label ?? null,
      timetableEntryId: slot.entry.id,
      weekIndex: week.weekIndex,
      weekStartDate: week.startsAt,
      weekEndDate: week.endsAt,
      sortOrder: proposedItems.length,
      existingItemId: existingItem?.id,
    });
  }

  return {
    proposedItems,
    availableSlots: datedSlots.length,
    skippedExistingItems,
    skippedHolidaySlots,
  };
}

function toPersistAutoPlanItem(
  item: ProposedAutoPlanItem,
): PersistAutoPlanItemInput {
  return {
    curriculumId: item.curriculumId,
    unitId: item.unitId,
    lessonId: item.lessonId,
    title: item.title,
    plannedDate: item.plannedDate,
    dayOfWeek: item.dayOfWeek,
    periodId: item.periodId,
    periodLabel: item.periodLabel,
    timetableEntryId: item.timetableEntryId,
    weekStartDate: item.weekStartDate,
    weekEndDate: item.weekEndDate,
    sortOrder: item.sortOrder,
    existingItemId: item.existingItemId,
  };
}

async function resolveMoveTimetable(
  repository: LessonPlansRepository,
  lessonPlan: LessonPlanDetailRecord,
  timetableEntryId: string | null | undefined,
): Promise<LessonPlanTimetableEntryRecord | null> {
  if (timetableEntryId === undefined) {
    return null;
  }
  if (timetableEntryId === null) {
    return null;
  }

  const timetable = await repository.findTimetableEntryById(timetableEntryId);
  if (!timetable) {
    throw new LessonPlanInvalidTimetableEntryException({ timetableEntryId });
  }

  if (
    timetable.academicYearId !== lessonPlan.academicYearId ||
    timetable.termId !== lessonPlan.termId ||
    timetable.teacherSubjectAllocationId !==
      lessonPlan.teacherSubjectAllocationId ||
    timetable.teacherUserId !== lessonPlan.teacherUserId ||
    timetable.classroomId !== lessonPlan.classroomId ||
    timetable.subjectId !== lessonPlan.subjectId
  ) {
    throw new LessonPlanInvalidTimetableEntryException({ timetableEntryId });
  }

  return timetable;
}

function assertPlanMutable(lessonPlan: LessonPlanDetailRecord): void {
  if (lessonPlan.status === LessonPlanStatus.ARCHIVED) {
    throw new LessonPlanReadOnlyException({
      lessonPlanId: lessonPlan.id,
      status: lessonPlan.status,
    });
  }
}

function assertTermWritable(term: { id: string; isActive: boolean }): void {
  if (!term.isActive) {
    throw new LessonPlanClosedTermException({ termId: term.id });
  }
}

function assertDateWithinTerm(
  term: LessonPlanTermRecord,
  date: Date,
  field: string,
): void {
  if (
    date.getTime() < term.startDate.getTime() ||
    date.getTime() > term.endDate.getTime()
  ) {
    throw new LessonPlanInvalidDateRangeException({
      field,
      value: dateToDateOnly(date),
      termStartDate: dateToDateOnly(term.startDate),
      termEndDate: dateToDateOnly(term.endDate),
    });
  }
}

function allocationFromPlan(
  plan: LessonPlanDetailRecord,
): LessonPlanAllocationRecord {
  return {
    id: plan.teacherSubjectAllocationId,
    schoolId: plan.schoolId,
    teacherUserId: plan.teacherUserId,
    subjectId: plan.subjectId,
    classroomId: plan.classroomId,
    termId: plan.termId,
    teacherUser: plan.teacherUser,
    classroom: plan.classroom,
    subject: plan.subject,
    term: {
      id: plan.termId,
      academicYearId: plan.academicYearId,
      startDate: plan.term.startDate,
      endDate: plan.term.endDate,
      isActive: plan.term.isActive,
    },
  } as LessonPlanAllocationRecord;
}

function weekForDate(
  term: LessonPlanTermRecord,
  date: Date,
): { weekIndex: number; startsAt: Date; endsAt: Date } {
  assertDateWithinTerm(term, date, 'date');
  const offsetDays = Math.floor(
    (startOfDay(date).getTime() - startOfDay(term.startDate).getTime()) /
      MS_PER_DAY,
  );
  const weekIndex = Math.floor(offsetDays / 7) + 1;
  return weekByIndex(term, weekIndex);
}

function weekByIndex(
  term: LessonPlanTermRecord,
  weekIndex: number,
): { weekIndex: number; startsAt: Date; endsAt: Date } {
  if (!Number.isInteger(weekIndex) || weekIndex < 1) {
    throw new LessonPlanInvalidDateRangeException({ weekIndex });
  }
  const startsAt = addDays(term.startDate, (weekIndex - 1) * 7);
  const endsAt = minDate(addDays(startsAt, 6), term.endDate);
  if (startsAt.getTime() > term.endDate.getTime()) {
    throw new LessonPlanInvalidDateRangeException({ weekIndex });
  }

  return { weekIndex, startsAt, endsAt };
}

function firstInstructionalDay(
  startsAt: Date,
  endsAt: Date,
  holidays: HolidayMap,
): Date {
  for (const day of enumerateDates(startsAt, endsAt)) {
    if (!dateHasHoliday(day, holidays)) {
      return day;
    }
  }

  throw new LessonPlanHolidayDateException({
    startsAt: dateToDateOnly(startsAt),
    endsAt: dateToDateOnly(endsAt),
  });
}

function buildHolidayMap(
  holidays: LessonPlanHolidayRecord[],
  range: DateRange,
): HolidayMap {
  const map: HolidayMap = new Map();
  for (const holiday of holidays) {
    const start = maxDate(startOfDay(holiday.startDate), range.from);
    const end = minDate(startOfDay(holiday.endDate), range.to);
    for (const day of enumerateDates(start, end)) {
      const key = dateToDateOnly(day);
      const values = map.get(key) ?? [];
      values.push({ eventId: holiday.id, title: holiday.title });
      map.set(key, values);
    }
  }

  return map;
}

function dateHasHoliday(date: Date, holidays: HolidayMap): boolean {
  return holidays.has(dateToDateOnly(date));
}

function enumerateDates(from: Date, to: Date): Date[] {
  const dates: Date[] = [];
  let cursor = startOfDay(from);
  const end = startOfDay(to);
  while (cursor.getTime() <= end.getTime()) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }

  return dates;
}

function countPlannedItemsInRange(
  plans: LessonPlanDetailRecord[],
  from: Date,
  to: Date,
): number {
  return plans.reduce((count, plan) => {
    const itemsInRange = plan.items.filter((item) => {
      const plannedDate = item.plannedDate ?? plan.weekStartDate;
      return (
        plannedDate.getTime() >= from.getTime() &&
        plannedDate.getTime() <= to.getTime()
      );
    });
    return count + itemsInRange.length;
  }, 0);
}

function groupTimetableEntriesByDay(
  entries: LessonPlanTimetableEntryRecord[],
): Map<number, LessonPlanTimetableEntryRecord[]> {
  const grouped = new Map<number, LessonPlanTimetableEntryRecord[]>();
  for (const entry of entries) {
    const dayEntries = grouped.get(entry.dayOfWeek) ?? [];
    dayEntries.push(entry);
    grouped.set(entry.dayOfWeek, dayEntries);
  }

  return grouped;
}

function countDuplicateLessons(plans: LessonPlanDetailRecord[]): {
  count: number;
  details: Array<{
    teacherSubjectAllocationId: string;
    lessonId: string;
  }>;
} {
  const seen = new Map<string, number>();
  const details: Array<{
    teacherSubjectAllocationId: string;
    lessonId: string;
  }> = [];

  for (const plan of plans) {
    for (const item of plan.items) {
      if (item.status === LessonPlanItemStatus.CANCELLED) {
        continue;
      }
      const key = `${plan.teacherSubjectAllocationId}:${item.lessonId}`;
      const count = seen.get(key) ?? 0;
      seen.set(key, count + 1);
      if (count === 1) {
        details.push({
          teacherSubjectAllocationId: plan.teacherSubjectAllocationId,
          lessonId: item.lessonId,
        });
      }
    }
  }

  return { count: details.length, details };
}

function presentSafeTeacher(allocation: LessonPlanAllocationRecord) {
  return {
    id: allocation.teacherUser.id,
    name: `${allocation.teacherUser.firstName} ${allocation.teacherUser.lastName}`.trim(),
    firstName: allocation.teacherUser.firstName,
    lastName: allocation.teacherUser.lastName,
  };
}

function presentSubject(allocation: LessonPlanAllocationRecord) {
  return {
    id: allocation.subject.id,
    name: deriveName(allocation.subject.nameAr, allocation.subject.nameEn),
    nameAr: allocation.subject.nameAr,
    nameEn: allocation.subject.nameEn,
    code: allocation.subject.code ?? null,
    color: allocation.subject.color ?? null,
  };
}

function presentClassroom(allocation: LessonPlanAllocationRecord) {
  return {
    id: allocation.classroom.id,
    name: deriveName(allocation.classroom.nameAr, allocation.classroom.nameEn),
    nameAr: allocation.classroom.nameAr,
    nameEn: allocation.classroom.nameEn,
  };
}

function isPlannedItemStatus(status: LessonPlanItemStatus): boolean {
  return (
    status === LessonPlanItemStatus.PLANNED ||
    status === LessonPlanItemStatus.IN_PROGRESS ||
    status === LessonPlanItemStatus.RESCHEDULED
  );
}

function percent(value: number, total: number): number {
  if (total === 0) {
    return 0;
  }

  return Math.round((value / total) * 100);
}

function dateToDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function startOfDay(value: Date): Date {
  return new Date(`${dateToDateOnly(value)}T00:00:00.000Z`);
}

function addDays(value: Date, days: number): Date {
  return new Date(startOfDay(value).getTime() + days * MS_PER_DAY);
}

function maxDate(left: Date, right: Date): Date {
  return left.getTime() >= right.getTime() ? startOfDay(left) : startOfDay(right);
}

function minDate(left: Date, right: Date): Date {
  return left.getTime() <= right.getTime() ? startOfDay(left) : startOfDay(right);
}

function deriveName(nameAr: string, nameEn: string): string {
  return nameEn.trim().length > 0 ? nameEn : nameAr;
}

type LessonPlanWorkflowAuditInput = {
  scope: AcademicsScope;
  action: string;
  resourceType: string;
  resourceId: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
};

function recordLessonPlanWorkflowAudit(
  authRepository: AuthRepository,
  input: LessonPlanWorkflowAuditInput,
): Promise<unknown> {
  return authRepository.createAuditLog({
    actorId: input.scope.actorId,
    userType: input.scope.userType,
    organizationId: input.scope.organizationId,
    schoolId: input.scope.schoolId,
    module: 'academics',
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    outcome: AuditOutcome.SUCCESS,
    before: input.before,
    after: input.after,
  });
}

function summarizeLessonPlanItem(
  item: LessonPlanItemRecord,
): Record<string, unknown> {
  return {
    id: item.id,
    lessonPlanId: item.lessonPlanId,
    curriculumId: item.curriculumId,
    unitId: item.unitId,
    lessonId: item.lessonId,
    timetableEntryId: item.timetableEntryId,
    plannedDate: item.plannedDate?.toISOString() ?? null,
    status: item.status,
    sortOrder: item.sortOrder,
  };
}
