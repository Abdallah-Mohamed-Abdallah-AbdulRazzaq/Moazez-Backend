export class ParentChildLessonSubjectDto {
  id!: string;
  name!: string;
  nameAr!: string;
  nameEn!: string;
  code!: string | null;
  color!: string | null;
}

export class ParentChildLessonClassroomDto {
  id!: string;
  name!: string;
  nameAr!: string;
  nameEn!: string;
}

export class ParentChildLessonPeriodDto {
  id!: string;
  label!: string;
  periodIndex!: number;
  startTime!: string;
  endTime!: string;
}

export class ParentChildLessonCurriculumDto {
  id!: string;
  title!: string;
}

export class ParentChildLessonUnitDto {
  id!: string;
  title!: string;
  sortOrder!: number;
}

export class ParentChildCurriculumLessonDto {
  id!: string;
  title!: string;
  sortOrder!: number;
  objectives!: unknown[];
}

export class ParentChildLessonFileDto {
  fileId!: string;
  filename!: string;
  mimeType!: string;
  sizeBytes!: string;
}

export class ParentChildLessonContentDto {
  contentItemId!: string;
  type!: string;
  title!: string;
  bodyText!: string | null;
  url!: string | null;
  file!: ParentChildLessonFileDto | null;
  sortOrder!: number;
  isRequired!: boolean;
  estimatedMinutes!: number | null;
}

export class ParentChildLessonItemDto {
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
  subject!: ParentChildLessonSubjectDto;
  classroom!: ParentChildLessonClassroomDto;
  period!: ParentChildLessonPeriodDto | null;
  curriculum!: ParentChildLessonCurriculumDto;
  unit!: ParentChildLessonUnitDto;
  lesson!: ParentChildCurriculumLessonDto;
  content!: ParentChildLessonContentDto[];
}

export class ParentChildLessonsTodayResponseDto {
  studentId!: string;
  date!: string;
  dayOfWeek!: number;
  items!: ParentChildLessonItemDto[];
}

export class ParentChildLessonsWeekDayDto {
  date!: string;
  dayOfWeek!: number;
  items!: ParentChildLessonItemDto[];
}

export class ParentChildLessonsWeekResponseDto {
  studentId!: string;
  weekStartDate!: string;
  weekEndDate!: string;
  days!: ParentChildLessonsWeekDayDto[];
}
