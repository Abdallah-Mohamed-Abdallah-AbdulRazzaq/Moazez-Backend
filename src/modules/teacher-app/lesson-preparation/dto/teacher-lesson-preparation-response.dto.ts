export class TeacherLessonPreparationSubjectDto {
  id!: string;
  name!: string;
  nameAr!: string;
  nameEn!: string;
  code!: string | null;
  color!: string | null;
}

export class TeacherLessonPreparationClassroomDto {
  id!: string;
  name!: string;
  nameAr!: string;
  nameEn!: string;
}

export class TeacherLessonPreparationPeriodDto {
  id!: string;
  label!: string;
  periodIndex!: number;
  startTime!: string;
  endTime!: string;
}

export class TeacherLessonPreparationCurriculumDto {
  id!: string;
  title!: string;
}

export class TeacherLessonPreparationUnitDto {
  id!: string;
  title!: string;
  sortOrder!: number;
}

export class TeacherLessonPreparationLessonDto {
  id!: string;
  title!: string;
  sortOrder!: number;
  objectives!: unknown[];
}

export class TeacherLessonPreparationFileDto {
  fileId!: string;
  filename!: string;
  mimeType!: string;
  sizeBytes!: string;
}

export class TeacherLessonPreparationContentDto {
  contentItemId!: string;
  type!: string;
  title!: string;
  bodyText!: string | null;
  url!: string | null;
  file!: TeacherLessonPreparationFileDto | null;
  sortOrder!: number;
  isRequired!: boolean;
  estimatedMinutes!: number | null;
  metadata!: unknown;
}

export class TeacherLessonPreparationItemDto {
  lessonPlanItemId!: string;
  lessonPlanId!: string;
  teacherSubjectAllocationId!: string;
  timetableEntryId!: string | null;
  plannedDate!: string | null;
  dayOfWeek!: number | null;
  status!: 'planned' | 'in_progress' | 'done' | 'skipped' | 'rescheduled' | 'cancelled';
  title!: string;
  notes!: string | null;
  subject!: TeacherLessonPreparationSubjectDto;
  classroom!: TeacherLessonPreparationClassroomDto;
  period!: TeacherLessonPreparationPeriodDto | null;
  curriculum!: TeacherLessonPreparationCurriculumDto;
  unit!: TeacherLessonPreparationUnitDto;
  lesson!: TeacherLessonPreparationLessonDto;
  content!: TeacherLessonPreparationContentDto[];
}

export class TeacherLessonPreparationTodayResponseDto {
  date!: string;
  dayOfWeek!: number;
  items!: TeacherLessonPreparationItemDto[];
}

export class TeacherLessonPreparationWeekDayDto {
  date!: string;
  dayOfWeek!: number;
  items!: TeacherLessonPreparationItemDto[];
}

export class TeacherLessonPreparationWeekResponseDto {
  weekStartDate!: string;
  weekEndDate!: string;
  days!: TeacherLessonPreparationWeekDayDto[];
}
