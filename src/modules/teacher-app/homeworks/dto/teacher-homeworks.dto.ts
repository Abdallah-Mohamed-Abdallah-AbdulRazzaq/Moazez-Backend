import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  HomeworkAssignmentMode,
  HomeworkAssignmentStatus,
  HomeworkTargetMode,
} from '@prisma/client';
import { HomeworkAttachmentResponseDto } from '../../../homework/dto/homework-attachment-response.dto';
import { HomeworkQuestionResponseDto } from '../../../homework/dto/homework-question-response.dto';

function toUpperEnumValue(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return undefined;
  return typeof value === 'string' ? value.trim().toUpperCase() : value;
}

function toLowerOptionalString(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return undefined;
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

function trimText(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class TeacherHomeworkClassParamsDto {
  @IsUUID()
  classId!: string;
}

export class TeacherHomeworkAssignmentParamsDto extends TeacherHomeworkClassParamsDto {
  @IsUUID()
  homeworkId!: string;
}

export class TeacherHomeworkSubmissionParamsDto extends TeacherHomeworkAssignmentParamsDto {
  @IsUUID()
  submissionId!: string;
}

export class TeacherHomeworkQuestionParamsDto extends TeacherHomeworkAssignmentParamsDto {
  @IsUUID()
  questionId!: string;
}

export class TeacherHomeworkQuestionOptionParamsDto extends TeacherHomeworkQuestionParamsDto {
  @IsUUID()
  optionId!: string;
}

export class TeacherHomeworkAttachmentParamsDto extends TeacherHomeworkAssignmentParamsDto {
  @IsUUID()
  attachmentId!: string;
}

export const TEACHER_HOMEWORK_SUBMISSION_STATUSES = [
  'submitted',
  'late',
  'reviewed',
  'pending_review',
] as const;

export type TeacherHomeworkSubmissionStatus =
  (typeof TEACHER_HOMEWORK_SUBMISSION_STATUSES)[number];

export class ListTeacherHomeworkAssignmentsQueryDto {
  @IsOptional()
  @Transform(({ value }) => toUpperEnumValue(value))
  @IsEnum(HomeworkAssignmentStatus)
  status?: HomeworkAssignmentStatus;

  @IsOptional()
  @Transform(({ value }) => toUpperEnumValue(value))
  @IsEnum(HomeworkAssignmentMode)
  mode?: HomeworkAssignmentMode;

  @IsOptional()
  @IsDateString()
  dueFrom?: string;

  @IsOptional()
  @IsDateString()
  dueTo?: string;

  @IsOptional()
  @Transform(({ value }) => trimText(value))
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

export class ListTeacherHomeworkSubmissionsQueryDto {
  @IsOptional()
  @Transform(({ value }) => toLowerOptionalString(value))
  @IsIn(TEACHER_HOMEWORK_SUBMISSION_STATUSES)
  status?: TeacherHomeworkSubmissionStatus;

  @IsOptional()
  @Transform(({ value }) => trimText(value))
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

export class TeacherHomeworkSubmissionReviewDto {
  @IsOptional()
  @Transform(({ value }) => trimText(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  reviewNote?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 2 })
  @Min(0)
  awardedMarks?: number | null;
}

export class TeacherHomeworkCreateDto {
  @IsOptional()
  @IsUUID()
  timetableEntryId?: string | null;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  scheduleDate?: string | null;

  @Transform(({ value }) => trimText(value))
  @IsString()
  @MinLength(1)
  @MaxLength(180)
  title!: string;

  @IsOptional()
  @Transform(({ value }) => trimText(value))
  @IsString()
  @MaxLength(4000)
  description?: string | null;

  @IsOptional()
  @Transform(({ value }) => toUpperEnumValue(value))
  @IsEnum(HomeworkAssignmentMode)
  mode?: HomeworkAssignmentMode;

  @Transform(({ value }) => toUpperEnumValue(value))
  @IsEnum(HomeworkTargetMode)
  targetMode!: HomeworkTargetMode;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  studentIds?: string[];

  @IsOptional()
  @IsDateString()
  publishAt?: string | null;

  @IsDateString()
  dueAt!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  estimatedMinutes?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  totalMarks?: number | null;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isGraded?: boolean;
}

export class TeacherHomeworkUpdateDto {
  @IsOptional()
  @IsUUID()
  timetableEntryId?: string | null;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  scheduleDate?: string | null;

  @IsOptional()
  @Transform(({ value }) => trimText(value))
  @IsString()
  @MinLength(1)
  @MaxLength(180)
  title?: string;

  @IsOptional()
  @Transform(({ value }) => trimText(value))
  @IsString()
  @MaxLength(4000)
  description?: string | null;

  @IsOptional()
  @Transform(({ value }) => toUpperEnumValue(value))
  @IsEnum(HomeworkAssignmentMode)
  mode?: HomeworkAssignmentMode;

  @IsOptional()
  @Transform(({ value }) => toUpperEnumValue(value))
  @IsEnum(HomeworkTargetMode)
  targetMode?: HomeworkTargetMode;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  studentIds?: string[];

  @IsOptional()
  @IsDateString()
  publishAt?: string | null;

  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  estimatedMinutes?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  totalMarks?: number | null;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isGraded?: boolean;
}

export class TeacherHomeworkNamedReferenceDto {
  id!: string;
  name!: string;
  nameAr?: string | null;
  nameEn?: string | null;
}

export class TeacherHomeworkClassroomReferenceDto extends TeacherHomeworkNamedReferenceDto {
  section?: TeacherHomeworkNamedReferenceDto | null;
  grade?: TeacherHomeworkNamedReferenceDto | null;
}

export class TeacherHomeworkSubjectReferenceDto extends TeacherHomeworkNamedReferenceDto {
  code?: string | null;
  color?: string | null;
}

export class TeacherHomeworkCountersDto {
  totalTargets!: number;
  assigned!: number;
  viewed!: number;
  submitted!: number;
  late!: number;
  missing!: number;
  reviewed!: number;
  excused!: number;
}

export class TeacherHomeworkAssignmentDto {
  id!: string;
  title!: string;
  description!: string | null;
  mode!: string;
  status!: string;
  targetMode!: string;
  classId!: string;
  academicYear!: TeacherHomeworkNamedReferenceDto;
  term!: TeacherHomeworkNamedReferenceDto & {
    startDate: string;
    endDate: string;
  };
  classroom!: TeacherHomeworkClassroomReferenceDto;
  subject!: TeacherHomeworkSubjectReferenceDto;
  timetableEntryId!: string | null;
  scheduleDate!: string | null;
  publishAt!: string | null;
  publishedAt!: string | null;
  dueAt!: string;
  closedAt!: string | null;
  estimatedMinutes!: number | null;
  totalMarks!: number | null;
  isGraded!: boolean;
  questionCount!: number;
  attachmentsCount!: number;
  questions!: HomeworkQuestionResponseDto[];
  attachments!: HomeworkAttachmentResponseDto[];
  counters!: TeacherHomeworkCountersDto;
  createdAt!: string;
  updatedAt!: string;
}

export class TeacherHomeworksPaginationDto {
  page!: number;
  limit!: number;
  total!: number;
  totalPages!: number;
}

export class TeacherHomeworkAssignmentsListResponseDto {
  items!: TeacherHomeworkAssignmentDto[];
  meta!: TeacherHomeworksPaginationDto;
}

export class TeacherHomeworkTargetStudentDto {
  id!: string;
  displayName!: string;
}

export class TeacherHomeworkTargetDto {
  targetId!: string;
  studentId!: string;
  enrollmentId!: string;
  student!: TeacherHomeworkTargetStudentDto;
  status!: string;
  assignedAt!: string;
  viewedAt!: string | null;
  submittedAt!: string | null;
  reviewedAt!: string | null;
  excusedAt!: string | null;
}

export class TeacherHomeworkTargetsListResponseDto {
  items!: TeacherHomeworkTargetDto[];
}

export class TeacherHomeworkSubmissionStudentDto {
  id!: string;
  displayName!: string;
  studentNumber!: string | null;
}

export class TeacherHomeworkSubmissionDto {
  id!: string;
  homeworkId!: string;
  targetId!: string;
  student!: TeacherHomeworkSubmissionStudentDto;
  status!: string;
  bodyText!: string | null;
  submittedAt!: string | null;
  reviewedAt!: string | null;
  reviewNote!: string | null;
  awardedMarks!: number | null;
  totalMarks!: number | null;
  isLate!: boolean;
  createdAt!: string;
  updatedAt!: string;
}

export class TeacherHomeworkSubmissionsPaginationDto {
  page!: number;
  limit!: number;
  total!: number;
}

export class TeacherHomeworkSubmissionsListResponseDto {
  submissions!: TeacherHomeworkSubmissionDto[];
  pagination!: TeacherHomeworkSubmissionsPaginationDto;
}

export class TeacherHomeworkSubmissionResponseDto {
  submission!: TeacherHomeworkSubmissionDto;
}

export class TeacherHomeworkClassCountersDto extends TeacherHomeworkCountersDto {
  totalAssignments!: number;
  draft!: number;
  published!: number;
  closed!: number;
  cancelled!: number;
  waitingReview!: number;
  dueSoon!: number;
}

export class TeacherHomeworkDashboardTotalsDto {
  totalAssignments!: number;
  draft!: number;
  published!: number;
  closed!: number;
  cancelled!: number;
  waitingReview!: number;
  dueSoon!: number;
}

export class TeacherHomeworkDashboardClassDto {
  classId!: string;
  classroom!: TeacherHomeworkClassroomReferenceDto;
  subject!: TeacherHomeworkSubjectReferenceDto;
  term!: TeacherHomeworkNamedReferenceDto;
  academicYear!: TeacherHomeworkNamedReferenceDto;
  nextScheduleItem!: null;
  nextDueAt!: string | null;
  counters!: TeacherHomeworkClassCountersDto;
  latestAssignments!: TeacherHomeworkAssignmentDto[];
}

export class TeacherHomeworkDashboardResponseDto {
  totals!: TeacherHomeworkDashboardTotalsDto;
  classes!: TeacherHomeworkDashboardClassDto[];
}
