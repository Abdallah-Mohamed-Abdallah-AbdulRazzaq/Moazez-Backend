import type {
  LessonPlanDetailRecord,
  LessonPlanItemRecord,
  LessonPlanListRecord,
} from '../infrastructure/lesson-plans.repository';
import type {
  AutoPlanLessonPlanResponseDto,
  LessonPlanSummaryResponseDto,
  LessonPlanValidationResponseDto,
  LessonPlanWeeksResponseDto,
  LessonPlanDetailResponseDto,
  LessonPlanItemResponseDto,
  LessonPlanResponseDto,
  LessonPlansListResponseDto,
} from '../dto/lesson-plans-response.dto';

export type LessonPlanWeekPresentation = {
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

export type LessonPlanSummaryPresentation = LessonPlanSummaryResponseDto;
export type AutoPlanLessonPlanPresentation = AutoPlanLessonPlanResponseDto;
export type LessonPlanValidationPresentation = LessonPlanValidationResponseDto;

function deriveName(nameAr: string, nameEn: string): string {
  return nameEn.trim().length > 0 ? nameEn : nameAr;
}

function dateToIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function dateToDateOnly(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

export function presentLessonPlans(
  lessonPlans: LessonPlanListRecord[],
): LessonPlansListResponseDto {
  return {
    items: lessonPlans.map((lessonPlan) => presentLessonPlan(lessonPlan)),
  };
}

export function presentLessonPlan(
  lessonPlan: LessonPlanListRecord | LessonPlanDetailRecord,
): LessonPlanResponseDto {
  return {
    id: lessonPlan.id,
    lessonPlanId: lessonPlan.id,
    academicYearId: lessonPlan.academicYearId,
    termId: lessonPlan.termId,
    teacherSubjectAllocationId: lessonPlan.teacherSubjectAllocationId,
    teacherUserId: lessonPlan.teacherUserId,
    classroomId: lessonPlan.classroomId,
    subjectId: lessonPlan.subjectId,
    curriculumId: lessonPlan.curriculumId,
    title: lessonPlan.title,
    description: lessonPlan.description ?? null,
    status: lessonPlan.status.toLowerCase(),
    weekStartDate: dateToDateOnly(lessonPlan.weekStartDate) ?? '',
    weekEndDate: dateToDateOnly(lessonPlan.weekEndDate) ?? '',
    activatedAt: dateToIso(lessonPlan.activatedAt),
    archivedAt: dateToIso(lessonPlan.archivedAt),
    createdAt: lessonPlan.createdAt.toISOString(),
    updatedAt: lessonPlan.updatedAt.toISOString(),
    academicYear: {
      id: lessonPlan.academicYear.id,
      name: deriveName(
        lessonPlan.academicYear.nameAr,
        lessonPlan.academicYear.nameEn,
      ),
      nameAr: lessonPlan.academicYear.nameAr,
      nameEn: lessonPlan.academicYear.nameEn,
    },
    term: {
      id: lessonPlan.term.id,
      name: deriveName(lessonPlan.term.nameAr, lessonPlan.term.nameEn),
      nameAr: lessonPlan.term.nameAr,
      nameEn: lessonPlan.term.nameEn,
    },
    teacher: {
      id: lessonPlan.teacherUser.id,
      name: `${lessonPlan.teacherUser.firstName} ${lessonPlan.teacherUser.lastName}`.trim(),
      firstName: lessonPlan.teacherUser.firstName,
      lastName: lessonPlan.teacherUser.lastName,
      email: lessonPlan.teacherUser.email ?? null,
    },
    classroom: {
      id: lessonPlan.classroom.id,
      name: deriveName(lessonPlan.classroom.nameAr, lessonPlan.classroom.nameEn),
      nameAr: lessonPlan.classroom.nameAr,
      nameEn: lessonPlan.classroom.nameEn,
    },
    subject: {
      id: lessonPlan.subject.id,
      name: deriveName(lessonPlan.subject.nameAr, lessonPlan.subject.nameEn),
      nameAr: lessonPlan.subject.nameAr,
      nameEn: lessonPlan.subject.nameEn,
      code: lessonPlan.subject.code ?? null,
      color: lessonPlan.subject.color ?? null,
    },
    curriculum: {
      curriculumId: lessonPlan.curriculum.id,
      title: lessonPlan.curriculum.title,
      status: lessonPlan.curriculum.status.toLowerCase(),
    },
    itemCount: lessonPlan.items.length,
  };
}

export function presentLessonPlanDetail(
  lessonPlan: LessonPlanDetailRecord,
): LessonPlanDetailResponseDto {
  return {
    ...presentLessonPlan(lessonPlan),
    items: lessonPlan.items.map((item) => presentLessonPlanItem(item)),
  };
}

export function presentLessonPlanItem(
  item: LessonPlanItemRecord,
): LessonPlanItemResponseDto {
  return {
    id: item.id,
    itemId: item.id,
    lessonPlanId: item.lessonPlanId,
    curriculumId: item.curriculumId,
    unitId: item.unitId,
    lessonId: item.lessonId,
    unitTitle: item.unit.title,
    lessonTitle: item.lesson.title,
    timetableEntryId: item.timetableEntryId ?? null,
    plannedDate: dateToDateOnly(item.plannedDate),
    dayOfWeek: item.dayOfWeek ?? null,
    periodId: item.periodId ?? null,
    periodLabel: item.periodLabel ?? null,
    title: item.title,
    notes: item.notes ?? null,
    status: item.status.toLowerCase(),
    sortOrder: item.sortOrder,
    startedAt: dateToIso(item.startedAt),
    completedAt: dateToIso(item.completedAt),
    skippedAt: dateToIso(item.skippedAt),
    cancelledAt: dateToIso(item.cancelledAt),
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

export function presentLessonPlanWeeks(input: {
  termId: string;
  academicYearId: string;
  weeks: LessonPlanWeekPresentation[];
}): LessonPlanWeeksResponseDto {
  return {
    termId: input.termId,
    academicYearId: input.academicYearId,
    weeks: input.weeks.map((week) => ({
      weekIndex: week.weekIndex,
      startsAt: dateToDateOnly(week.startsAt) ?? '',
      endsAt: dateToDateOnly(week.endsAt) ?? '',
      instructionalDays: week.instructionalDays.map(
        (day) => dateToDateOnly(day) ?? '',
      ),
      holidayDays: week.holidayDays.map((holiday) => ({
        date: dateToDateOnly(holiday.date) ?? '',
        eventId: holiday.eventId,
        title: holiday.title,
      })),
      plannedItemsCount: week.plannedItemsCount,
    })),
  };
}

export function presentLessonPlanSummary(
  input: LessonPlanSummaryPresentation,
): LessonPlanSummaryResponseDto {
  return input;
}

export function presentAutoPlanLessonPlan(
  input: AutoPlanLessonPlanPresentation,
): AutoPlanLessonPlanResponseDto {
  return input;
}

export function presentLessonPlanValidation(
  input: LessonPlanValidationPresentation,
): LessonPlanValidationResponseDto {
  return input;
}
