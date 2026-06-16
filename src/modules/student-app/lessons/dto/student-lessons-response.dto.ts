export class StudentLessonSubjectDto {
  id!: string;
  name!: string;
  nameAr!: string;
  nameEn!: string;
  code!: string | null;
  color!: string | null;
}

export class StudentLessonClassroomDto {
  id!: string;
  name!: string;
  nameAr!: string;
  nameEn!: string;
}

export class StudentLessonPeriodDto {
  id!: string;
  label!: string;
  periodIndex!: number;
  startTime!: string;
  endTime!: string;
}

export class StudentLessonCurriculumDto {
  id!: string;
  title!: string;
}

export class StudentLessonUnitDto {
  id!: string;
  title!: string;
  sortOrder!: number;
}

export class StudentLessonCurriculumLessonDto {
  id!: string;
  title!: string;
  sortOrder!: number;
  objectives!: unknown[];
}

export class StudentLessonFileDto {
  fileId!: string;
  filename!: string;
  mimeType!: string;
  sizeBytes!: string;
}

export class StudentLessonContentDto {
  contentItemId!: string;
  type!: string;
  title!: string;
  bodyText!: string | null;
  url!: string | null;
  file!: StudentLessonFileDto | null;
  sortOrder!: number;
  isRequired!: boolean;
  estimatedMinutes!: number | null;
}

export class StudentLessonItemDto {
  lessonPlanItemId!: string;
  lessonPlanId!: string;
  timetableEntryId!: string | null;
  plannedDate!: string | null;
  dayOfWeek!: number | null;
  status!:
    | 'planned'
    | 'in_progress'
    | 'done'
    | 'skipped'
    | 'rescheduled'
    | 'cancelled';
  title!: string;
  subject!: StudentLessonSubjectDto;
  classroom!: StudentLessonClassroomDto;
  period!: StudentLessonPeriodDto | null;
  curriculum!: StudentLessonCurriculumDto;
  unit!: StudentLessonUnitDto;
  lesson!: StudentLessonCurriculumLessonDto;
  content!: StudentLessonContentDto[];
}

export class StudentLessonsTodayResponseDto {
  date!: string;
  dayOfWeek!: number;
  items!: StudentLessonItemDto[];
}

export class StudentLessonsWeekDayDto {
  date!: string;
  dayOfWeek!: number;
  items!: StudentLessonItemDto[];
}

export class StudentLessonsWeekResponseDto {
  weekStartDate!: string;
  weekEndDate!: string;
  days!: StudentLessonsWeekDayDto[];
}
