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

export const STUDENT_HOMEWORK_STATUSES = [
  'waiting',
  'completed',
  'not_completed',
] as const;

export type StudentHomeworkStatus = (typeof STUDENT_HOMEWORK_STATUSES)[number];

export const STUDENT_HOMEWORK_MODES = [
  'homework',
  'worksheet',
  'writing_task',
  'quiz',
  'reading',
  'project',
] as const;

export type StudentHomeworkMode = (typeof STUDENT_HOMEWORK_MODES)[number];

function toLowerOptionalString(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return undefined;
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

export class StudentHomeworksQueryDto {
  @IsOptional()
  @Transform(({ value }) => toLowerOptionalString(value))
  @IsIn(STUDENT_HOMEWORK_STATUSES)
  status?: StudentHomeworkStatus;

  @IsOptional()
  @Transform(({ value }) => toLowerOptionalString(value))
  @IsIn(STUDENT_HOMEWORK_MODES)
  mode?: StudentHomeworkMode;

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

export class StudentHomeworkNamedReferenceDto {
  id!: string;
  name!: string;
  nameAr!: string | null;
  nameEn!: string | null;
}

export class StudentHomeworkClassroomReferenceDto extends StudentHomeworkNamedReferenceDto {
  section!: StudentHomeworkNamedReferenceDto | null;
  grade!: StudentHomeworkNamedReferenceDto | null;
}

export class StudentHomeworkSubjectReferenceDto extends StudentHomeworkNamedReferenceDto {
  code!: string | null;
  color!: string | null;
}

export class StudentHomeworkTeacherReferenceDto {
  userId!: string;
  fullName!: string;
}

export class StudentHomeworkListItemDto {
  homeworkId!: string;
  title!: string;
  description!: string | null;
  mode!: StudentHomeworkMode;
  status!: StudentHomeworkStatus;
  assignmentStatus!: string;
  targetStatus!: string;
  subject!: StudentHomeworkSubjectReferenceDto;
  teacher!: StudentHomeworkTeacherReferenceDto;
  classroom!: StudentHomeworkClassroomReferenceDto;
  term!: StudentHomeworkNamedReferenceDto;
  academicYear!: StudentHomeworkNamedReferenceDto;
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

export class StudentHomeworkQuestionDto {}

export class StudentHomeworkAttachmentDto {}

export class StudentHomeworkDetailDto extends StudentHomeworkListItemDto {
  publishAt!: string | null;
  closedAt!: string | null;
  questions!: StudentHomeworkQuestionDto[];
  attachments!: StudentHomeworkAttachmentDto[];
  submission!: null;
}

export class StudentHomeworksPaginationDto {
  page!: number;
  limit!: number;
  total!: number;
}

export class StudentHomeworksListResponseDto {
  homeworks!: StudentHomeworkListItemDto[];
  pagination!: StudentHomeworksPaginationDto;
}

export class StudentHomeworkResponseDto {
  homework!: StudentHomeworkDetailDto;
}
