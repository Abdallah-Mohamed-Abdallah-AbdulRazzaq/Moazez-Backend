import type { StudentLessonApiStatus } from '../../lessons/domain/student-lesson-status';

export class StudentSubjectLessonUnitDto {
  id!: string;
  title!: string;
  sortOrder!: number;
}

export class StudentSubjectLessonDto {
  id!: string;
  title!: string;
  sortOrder!: number;
}

export class StudentSubjectLessonPeriodDto {
  id!: string | null;
  label!: string | null;
}

export class StudentSubjectLessonContentSummaryDto {
  totalCount!: number;
  requiredCount!: number;
  videoCount!: number;
  fileCount!: number;
  hasPlayableVideo!: false;
}

export class StudentSubjectLessonItemDto {
  lessonPlanItemId!: string;
  plannedDate!: string;
  status!: StudentLessonApiStatus;
  title!: string;
  unit!: StudentSubjectLessonUnitDto;
  lesson!: StudentSubjectLessonDto;
  period!: StudentSubjectLessonPeriodDto;
  contentSummary!: StudentSubjectLessonContentSummaryDto;
}

export class StudentSubjectLessonsPageInfoDto {
  nextCursor!: string | null;
  hasNextPage!: boolean;
}

export class StudentSubjectLessonsResponseDto {
  items!: StudentSubjectLessonItemDto[];
  pageInfo!: StudentSubjectLessonsPageInfoDto;
}
