export class LessonPlanNamedSummaryDto {
  id!: string;
  name!: string;
  nameAr!: string;
  nameEn!: string;
}

export class LessonPlanTeacherSummaryDto {
  id!: string;
  name!: string;
  firstName!: string;
  lastName!: string;
  email!: string | null;
}

export class LessonPlanSubjectSummaryDto {
  id!: string;
  name!: string;
  nameAr!: string;
  nameEn!: string;
  code!: string | null;
  color!: string | null;
}

export class LessonPlanCurriculumSummaryDto {
  curriculumId!: string;
  title!: string;
  status!: string;
}

export class LessonPlanItemResponseDto {
  id!: string;
  itemId!: string;
  lessonPlanId!: string;
  curriculumId!: string;
  unitId!: string;
  lessonId!: string;
  unitTitle!: string;
  lessonTitle!: string;
  timetableEntryId!: string | null;
  plannedDate!: string | null;
  dayOfWeek!: number | null;
  periodId!: string | null;
  periodLabel!: string | null;
  title!: string;
  notes!: string | null;
  status!: string;
  sortOrder!: number;
  startedAt!: string | null;
  completedAt!: string | null;
  skippedAt!: string | null;
  cancelledAt!: string | null;
  createdAt!: string;
  updatedAt!: string;
}

export class LessonPlanResponseDto {
  id!: string;
  lessonPlanId!: string;
  academicYearId!: string;
  termId!: string;
  teacherSubjectAllocationId!: string;
  teacherUserId!: string;
  classroomId!: string;
  subjectId!: string;
  curriculumId!: string;
  title!: string;
  description!: string | null;
  status!: string;
  weekStartDate!: string;
  weekEndDate!: string;
  activatedAt!: string | null;
  archivedAt!: string | null;
  createdAt!: string;
  updatedAt!: string;
  academicYear!: LessonPlanNamedSummaryDto;
  term!: LessonPlanNamedSummaryDto;
  teacher!: LessonPlanTeacherSummaryDto;
  classroom!: LessonPlanNamedSummaryDto;
  subject!: LessonPlanSubjectSummaryDto;
  curriculum!: LessonPlanCurriculumSummaryDto;
  itemCount!: number;
}

export class LessonPlanDetailResponseDto extends LessonPlanResponseDto {
  items!: LessonPlanItemResponseDto[];
}

export class LessonPlansListResponseDto {
  items!: LessonPlanResponseDto[];
}

export class DeleteLessonPlanResponseDto {
  ok!: true;
}

export class DeleteLessonPlanItemResponseDto {
  ok!: true;
}
