import { Type, Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { GradeQuestionType } from '@prisma/client';

const MAX_QUESTION_OPTIONS = 50;
const MAX_QUESTION_BULK_ITEMS = 200;

function toUpperEnumValue(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return undefined;
  return typeof value === 'string' ? value.trim().toUpperCase() : value;
}

function toBooleanValue(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;

  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes'].includes(normalized)) return true;
  if (['false', '0', 'no'].includes(normalized)) return false;

  return value;
}

export class ListGradeAssessmentQuestionsQueryDto {}

export class GradeQuestionOptionDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  label?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  textEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  labelAr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  textAr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  value?: string | null;

  @IsOptional()
  @Transform(({ value }) => toBooleanValue(value))
  @IsBoolean()
  isCorrect?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  sortOrder?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  order?: number;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown> | null;
}

export class CreateGradeAssessmentQuestionDto {
  @IsOptional()
  @Transform(({ value }) => toUpperEnumValue(value))
  @IsEnum(GradeQuestionType)
  type?: GradeQuestionType;

  @IsOptional()
  @Transform(({ value }) => toUpperEnumValue(value))
  @IsEnum(GradeQuestionType)
  questionType?: GradeQuestionType;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  prompt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  questionTextEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  promptAr?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  questionTextAr?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  explanation?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  explanationAr?: string | null;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  points!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  sortOrder?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  order?: number;

  @IsOptional()
  @Transform(({ value }) => toBooleanValue(value))
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  answerKey?: unknown;

  @IsOptional()
  correctAnswer?: unknown;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown> | null;

  @IsOptional()
  matchingPairs?: unknown;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  mediaMode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  mediaTitle?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  mediaUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  mediaFileName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  mediaMimeType?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  mediaSize?: number | null;

  @IsOptional()
  sampleAnswerAr?: unknown;

  @IsOptional()
  sampleAnswerEn?: unknown;

  @IsOptional()
  acceptedAnswersAr?: unknown;

  @IsOptional()
  acceptedAnswersEn?: unknown;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_QUESTION_OPTIONS)
  @ValidateNested({ each: true })
  @Type(() => GradeQuestionOptionDto)
  options?: GradeQuestionOptionDto[];
}

export class UpdateGradeAssessmentQuestionDto {
  @IsOptional()
  @Transform(({ value }) => toUpperEnumValue(value))
  @IsEnum(GradeQuestionType)
  type?: GradeQuestionType;

  @IsOptional()
  @Transform(({ value }) => toUpperEnumValue(value))
  @IsEnum(GradeQuestionType)
  questionType?: GradeQuestionType;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  prompt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  questionTextEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  promptAr?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  questionTextAr?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  explanation?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  explanationAr?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  points?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  sortOrder?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  order?: number;

  @IsOptional()
  @Transform(({ value }) => toBooleanValue(value))
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  answerKey?: unknown;

  @IsOptional()
  correctAnswer?: unknown;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown> | null;

  @IsOptional()
  matchingPairs?: unknown;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  mediaMode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  mediaTitle?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  mediaUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  mediaFileName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  mediaMimeType?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  mediaSize?: number | null;

  @IsOptional()
  sampleAnswerAr?: unknown;

  @IsOptional()
  sampleAnswerEn?: unknown;

  @IsOptional()
  acceptedAnswersAr?: unknown;

  @IsOptional()
  acceptedAnswersEn?: unknown;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_QUESTION_OPTIONS)
  @ValidateNested({ each: true })
  @Type(() => GradeQuestionOptionDto)
  options?: GradeQuestionOptionDto[];
}

export class ReorderGradeAssessmentQuestionsDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_QUESTION_BULK_ITEMS)
  @IsUUID(undefined, { each: true })
  questionIds!: string[];
}

export class BulkQuestionPointsItemDto {
  @IsUUID()
  questionId!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  points!: number;
}

export class BulkUpdateGradeAssessmentQuestionPointsDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_QUESTION_BULK_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => BulkQuestionPointsItemDto)
  items?: BulkQuestionPointsItemDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_QUESTION_BULK_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => BulkQuestionPointsItemDto)
  updates?: BulkQuestionPointsItemDto[];
}

export class GradeQuestionOptionResponseDto {
  id!: string;
  label!: string;
  labelAr!: string | null;
  value!: string | null;
  isCorrect!: boolean;
  sortOrder!: number;
  metadata!: unknown;
}

export class GradeAssessmentQuestionResponseDto {
  id!: string;
  assessmentId!: string;
  type!: string;
  prompt!: string;
  promptAr!: string | null;
  explanation!: string | null;
  explanationAr!: string | null;
  points!: number;
  sortOrder!: number;
  required!: boolean;
  answerKey!: unknown;
  metadata!: unknown;
  options!: GradeQuestionOptionResponseDto[];
  createdAt!: string;
  updatedAt!: string;
}

export class GradeAssessmentQuestionsListResponseDto {
  assessmentId!: string;
  totalQuestions!: number;
  totalPoints!: number;
  pointsMatchMaxScore!: boolean;
  questions!: GradeAssessmentQuestionResponseDto[];
}

export class DeleteGradeAssessmentQuestionResponseDto {
  ok!: true;
}
