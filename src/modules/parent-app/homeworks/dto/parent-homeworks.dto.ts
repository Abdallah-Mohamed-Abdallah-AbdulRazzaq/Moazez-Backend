import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const PARENT_HOMEWORK_STATUSES = [
  'waiting',
  'completed',
  'not_completed',
] as const;

export type ParentHomeworkStatus = (typeof PARENT_HOMEWORK_STATUSES)[number];

export const PARENT_HOMEWORK_MODES = [
  'homework',
  'worksheet',
  'writing_task',
  'quiz',
  'reading',
  'project',
] as const;

export type ParentHomeworkMode = (typeof PARENT_HOMEWORK_MODES)[number];

function toLowerOptionalString(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return undefined;
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

export class ParentHomeworksQueryDto {
  @IsOptional()
  @Transform(({ value }) => toLowerOptionalString(value))
  @IsIn(PARENT_HOMEWORK_STATUSES)
  status?: ParentHomeworkStatus;

  @IsOptional()
  @Transform(({ value }) => toLowerOptionalString(value))
  @IsIn(PARENT_HOMEWORK_MODES)
  mode?: ParentHomeworkMode;

  @IsOptional()
  @IsDateString()
  dueFrom?: string;

  @IsOptional()
  @IsDateString()
  dueTo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class ParentHomeworkChildDto {
  studentId!: string;
  displayName!: string;
}

export class ParentHomeworkNamedReferenceDto {
  id!: string;
  name!: string;
  nameAr!: string | null;
  nameEn!: string | null;
}

export class ParentHomeworkClassroomReferenceDto extends ParentHomeworkNamedReferenceDto {
  section!: ParentHomeworkNamedReferenceDto | null;
  grade!: ParentHomeworkNamedReferenceDto | null;
}

export class ParentHomeworkSubjectReferenceDto extends ParentHomeworkNamedReferenceDto {
  code!: string | null;
  color!: string | null;
}

export class ParentHomeworkTeacherReferenceDto {
  userId!: string;
  fullName!: string;
}

export class ParentHomeworkListItemDto {
  homeworkId!: string;
  title!: string;
  description!: string | null;
  mode!: ParentHomeworkMode;
  status!: ParentHomeworkStatus;
  assignmentStatus!: string;
  targetStatus!: string;
  child!: ParentHomeworkChildDto;
  subject!: ParentHomeworkSubjectReferenceDto;
  teacher!: ParentHomeworkTeacherReferenceDto;
  classroom!: ParentHomeworkClassroomReferenceDto;
  term!: ParentHomeworkNamedReferenceDto;
  academicYear!: ParentHomeworkNamedReferenceDto;
  timetableEntryId!: string | null;
  scheduleDate!: string | null;
  dueAt!: string;
  publishedAt!: string | null;
  estimatedMinutes!: number | null;
  totalMarks!: number | null;
  isGraded!: boolean;
  questionCount!: number;
  attachmentsCount!: number;
  submittedAt!: string | null;
  reviewedAt!: string | null;
  createdAt!: string;
  updatedAt!: string;
}

export class ParentHomeworkQuestionDto {}

export class ParentHomeworkAttachmentDto {}

export class ParentHomeworkDetailDto extends ParentHomeworkListItemDto {
  publishAt!: string | null;
  closedAt!: string | null;
  questions!: ParentHomeworkQuestionDto[];
  attachments!: ParentHomeworkAttachmentDto[];
  submission!: null;
}

export class ParentHomeworksPaginationDto {
  page!: number;
  limit!: number;
  total!: number;
}

export class ParentHomeworksListResponseDto {
  homeworks!: ParentHomeworkListItemDto[];
  pagination!: ParentHomeworksPaginationDto;
}

export class ParentHomeworkResponseDto {
  homework!: ParentHomeworkDetailDto;
}
