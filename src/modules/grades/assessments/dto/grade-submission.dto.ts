import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { GradeSubmissionStatus } from '@prisma/client';

const MAX_SELECTED_OPTIONS = 100;
const MAX_BULK_SUBMISSION_ANSWERS = 200;

function toUpperEnumValue(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return undefined;
  return typeof value === 'string' ? value.trim().toUpperCase() : value;
}

export class ListGradeSubmissionsQueryDto {
  @IsOptional()
  @Transform(({ value }) => toUpperEnumValue(value))
  @IsEnum(GradeSubmissionStatus)
  status?: GradeSubmissionStatus;

  @IsOptional()
  @IsUUID()
  classroomId?: string;

  @IsOptional()
  @IsUUID()
  sectionId?: string;

  @IsOptional()
  @IsUUID()
  gradeId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}

export class ResolveGradeSubmissionDto {
  @IsUUID()
  studentId!: string;

  @IsOptional()
  @IsUUID()
  enrollmentId?: string | null;
}

export class SaveGradeSubmissionAnswerDto {
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  answerText?: string | null;

  @IsOptional()
  @IsObject()
  answerJson?: Record<string, unknown> | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_SELECTED_OPTIONS)
  @IsUUID(undefined, { each: true })
  selectedOptionIds?: string[] | null;
}

export class BulkSaveGradeSubmissionAnswerItemDto extends SaveGradeSubmissionAnswerDto {
  @IsUUID()
  questionId!: string;
}

export class BulkSaveGradeSubmissionAnswersDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_BULK_SUBMISSION_ANSWERS)
  @ValidateNested({ each: true })
  @Type(() => BulkSaveGradeSubmissionAnswerItemDto)
  answers!: BulkSaveGradeSubmissionAnswerItemDto[];
}

export class GradeSubmissionStudentSummaryResponseDto {
  id!: string;
  firstName!: string;
  lastName!: string;
  nameAr!: string | null;
  nameEn!: string;
  code!: string | null;
  admissionNo!: string | null;
}

export class GradeSubmissionEnrollmentSummaryResponseDto {
  id!: string;
  classroomId!: string;
  sectionId!: string | null;
  gradeId!: string | null;
  classroomName!: string | null;
  sectionName!: string | null;
  gradeName!: string | null;
}

export class GradeSubmissionAssessmentSummaryResponseDto {
  id!: string;
  titleEn!: string | null;
  titleAr!: string | null;
  deliveryMode!: string;
  approvalStatus!: string;
  maxScore!: number | null;
}

export class GradeSubmissionProgressResponseDto {
  totalQuestions!: number;
  answeredCount!: number;
  requiredAnsweredCount!: number;
  requiredQuestionCount!: number;
  pendingCorrectionCount!: number;
}

export class GradeSubmissionSelectedOptionResponseDto {
  optionId!: string;
  label!: string;
  labelAr!: string | null;
  value!: string | null;
}

export class GradeSubmissionAnswerResponseDto {
  id!: string;
  questionId!: string;
  type!: string;
  answerText!: string | null;
  answerJson!: unknown;
  correctionStatus!: string;
  awardedPoints!: number | null;
  maxPoints!: number | null;
  reviewerComment!: string | null;
  reviewerCommentAr!: string | null;
  selectedOptions!: GradeSubmissionSelectedOptionResponseDto[];
  reviewedAt!: string | null;
  reviewedById!: string | null;
  createdAt!: string;
  updatedAt!: string;
}

export class GradeSubmissionQuestionResponseDto {
  id!: string;
  type!: string;
  prompt!: string;
  promptAr!: string | null;
  points!: number;
  sortOrder!: number;
  required!: boolean;
  answer!: GradeSubmissionAnswerResponseDto | null;
}

export class GradeSubmissionResponseDto {
  id!: string;
  assessmentId!: string;
  termId!: string;
  studentId!: string;
  enrollmentId!: string;
  status!: string;
  startedAt!: string;
  submittedAt!: string | null;
  correctedAt!: string | null;
  reviewedById!: string | null;
  totalScore!: number | null;
  maxScore!: number | null;
  student!: GradeSubmissionStudentSummaryResponseDto | null;
  enrollment!: GradeSubmissionEnrollmentSummaryResponseDto | null;
  assessment!: GradeSubmissionAssessmentSummaryResponseDto | null;
  progress!: GradeSubmissionProgressResponseDto;
  answers!: GradeSubmissionAnswerResponseDto[];
  questions!: GradeSubmissionQuestionResponseDto[];
}

export class GradeSubmissionListRowResponseDto {
  id!: string;
  assessmentId!: string;
  studentId!: string;
  enrollmentId!: string;
  status!: string;
  startedAt!: string;
  submittedAt!: string | null;
  student!: GradeSubmissionStudentSummaryResponseDto | null;
  enrollment!: GradeSubmissionEnrollmentSummaryResponseDto | null;
  progress!: GradeSubmissionProgressResponseDto;
}

export class GradeSubmissionsListResponseDto {
  items!: GradeSubmissionListRowResponseDto[];
}

export class BulkSaveGradeSubmissionAnswersResponseDto {
  submissionId!: string;
  savedCount!: number;
  answers!: GradeSubmissionAnswerResponseDto[];
}
