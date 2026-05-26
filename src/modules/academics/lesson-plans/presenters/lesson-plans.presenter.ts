import type {
  LessonPlanDetailRecord,
  LessonPlanItemRecord,
  LessonPlanListRecord,
} from '../infrastructure/lesson-plans.repository';
import type {
  LessonPlanDetailResponseDto,
  LessonPlanItemResponseDto,
  LessonPlanResponseDto,
  LessonPlansListResponseDto,
} from '../dto/lesson-plans-response.dto';

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
