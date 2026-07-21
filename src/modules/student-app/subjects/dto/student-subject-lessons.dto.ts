import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const STUDENT_SUBJECT_LESSON_STATUSES = [
  'planned',
  'in_progress',
  'done',
  'skipped',
  'rescheduled',
  'cancelled',
] as const;

export type StudentSubjectLessonStatus =
  (typeof STUDENT_SUBJECT_LESSON_STATUSES)[number];

export class StudentSubjectLessonsQueryDto {
  @IsOptional()
  @IsString()
  @Matches(DATE_ONLY_PATTERN)
  from?: string;

  @IsOptional()
  @IsString()
  @Matches(DATE_ONLY_PATTERN)
  to?: string;

  @IsOptional()
  @IsIn(STUDENT_SUBJECT_LESSON_STATUSES)
  status?: StudentSubjectLessonStatus;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 20;
}
