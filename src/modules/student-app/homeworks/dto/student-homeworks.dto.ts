import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { HomeworkAnswerInputDto } from '../../../homework/dto/homework-answer.dto';

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

export const STUDENT_HOMEWORK_SUBMISSION_STATUSES = [
  'draft',
  'submitted',
  'late',
  'reviewed',
] as const;

export type StudentHomeworkSubmissionStatus =
  (typeof STUDENT_HOMEWORK_SUBMISSION_STATUSES)[number];

export const STUDENT_HOMEWORK_SUBMISSION_BODY_TEXT_MAX_LENGTH = 20_000;

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

export class StudentHomeworkQuestionOptionDto {
  optionId!: string;
  questionId!: string;
  text!: string;
  sortOrder!: number;
}

export class StudentHomeworkQuestionDto {
  questionId!: string;
  homeworkId!: string;
  type!: string;
  prompt!: string;
  instructions!: string | null;
  points!: number;
  sortOrder!: number;
  isRequired!: boolean;
  options!: StudentHomeworkQuestionOptionDto[];
}

export class StudentHomeworkAttachmentFileDto {
  filename!: string;
  mimeType!: string;
  sizeBytes!: string;
}

export class StudentHomeworkAttachmentDto {
  attachmentId!: string;
  homeworkId!: string;
  fileId!: string;
  title!: string | null;
  description!: string | null;
  sortOrder!: number;
  file!: StudentHomeworkAttachmentFileDto;
}

export class StudentHomeworkSubmissionDto {
  id!: string;
  homeworkId!: string;
  status!: StudentHomeworkSubmissionStatus;
  bodyText!: string | null;
  answers!: StudentHomeworkAnswerDto[];
  attachments!: StudentHomeworkSubmissionAttachmentDto[];
  submittedAt!: string | null;
  reviewedAt!: string | null;
  reviewNote!: string | null;
  awardedMarks!: number | null;
  updatedAt!: string;
}

export class StudentHomeworkAnswerSelectedOptionDto {
  optionId!: string;
  questionId!: string;
  text!: string;
  sortOrder!: number;
}

export class StudentHomeworkAnswerDto {
  answerId!: string;
  homeworkId!: string;
  submissionId!: string;
  questionId!: string;
  type!: string;
  textAnswer!: string | null;
  selectedOptionIds!: string[];
  selectedOptions!: StudentHomeworkAnswerSelectedOptionDto[];
  isDraft!: boolean;
  createdAt!: string;
  updatedAt!: string;
}

export class StudentHomeworkSubmissionAttachmentDto {
  attachmentId!: string;
  homeworkId!: string;
  submissionId!: string;
  fileId!: string;
  title!: string | null;
  description!: string | null;
  sortOrder!: number;
  file!: StudentHomeworkAttachmentFileDto;
  createdAt!: string;
  updatedAt!: string;
}

export class StudentHomeworkDetailDto extends StudentHomeworkListItemDto {
  publishAt!: string | null;
  closedAt!: string | null;
  questions!: StudentHomeworkQuestionDto[];
  attachments!: StudentHomeworkAttachmentDto[];
  submission!: StudentHomeworkSubmissionDto | null;
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

export class StudentHomeworkSubmissionBodyDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(STUDENT_HOMEWORK_SUBMISSION_BODY_TEXT_MAX_LENGTH)
  bodyText!: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HomeworkAnswerInputDto)
  answers?: HomeworkAnswerInputDto[];
}

export class StudentHomeworkSubmitBodyDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(STUDENT_HOMEWORK_SUBMISSION_BODY_TEXT_MAX_LENGTH)
  bodyText?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HomeworkAnswerInputDto)
  answers?: HomeworkAnswerInputDto[];
}

export class StudentHomeworkSubmissionResponseDto {
  submission!: StudentHomeworkSubmissionDto | null;
}
