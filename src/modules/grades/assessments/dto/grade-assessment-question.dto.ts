import { RESPONSE_CONFIG_OPENAPI } from '../../../../common/assessment-answer/response-config.openapi';
import { IsResponseConfig } from '../../../../common/assessment-answer/response-config.validator';
import {
  ApiProperty,
  ApiPropertyOptional as ResponseApiProperty,
} from '@nestjs/swagger';
import type { RichContent } from '../../../../common/rich-content/rich-content.types';
import { Type, Transform } from 'class-transformer';
import {
  Allow,
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
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
import { GRADE_RUNTIME_QUESTION_TYPES } from '../domain/grade-runtime-types';
import { GradeQuestionContractDto } from '../../shared/presenters/grade-question-contract';

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
  // Validated presence-sensitively by the Grades domain and final transaction.
  @Allow()
  @ResponseApiProperty({
    type: 'object',
    additionalProperties: true,
    description:
      'Closed Safe RichQuestionContent V1; asset references remain owner-bound',
  })
  richContent?: unknown;
  @IsOptional()
  @IsUUID()
  @ResponseApiProperty({ type: String, format: 'uuid' })
  id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @ResponseApiProperty({ type: String })
  label?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @ResponseApiProperty({ type: String })
  textEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @ResponseApiProperty({ type: String })
  labelAr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @ResponseApiProperty({ type: String })
  textAr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @ResponseApiProperty({ type: String, nullable: true })
  value?: string | null;

  @IsOptional()
  @Transform(({ value }) => toBooleanValue(value))
  @IsBoolean()
  @ResponseApiProperty({
    type: Boolean,
    description:
      'Private authoring field; ordinary review and learner projections omit it',
  })
  isCorrect?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @ResponseApiProperty({ type: Number })
  sortOrder?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @ResponseApiProperty({ type: Number })
  order?: number;

  @IsOptional()
  @IsObject()
  @ResponseApiProperty({
    type: 'object',
    additionalProperties: true,
    nullable: true,
  })
  metadata?: Record<string, unknown> | null;
}

export class CreateGradeAssessmentQuestionDto {
  @ResponseApiProperty(RESPONSE_CONFIG_OPENAPI)
  @IsResponseConfig()
  responseConfig?: unknown;
  @Allow()
  @ResponseApiProperty({
    type: 'object',
    additionalProperties: true,
    description:
      'Closed Safe RichQuestionContent V1; asset references remain owner-bound',
  })
  richContent?: unknown;
  @IsOptional()
  @Transform(({ value }) => toUpperEnumValue(value))
  @IsIn(GRADE_RUNTIME_QUESTION_TYPES)
  @ResponseApiProperty({ enum: GRADE_RUNTIME_QUESTION_TYPES })
  type?: GradeQuestionType;

  @IsOptional()
  @Transform(({ value }) => toUpperEnumValue(value))
  @IsIn(GRADE_RUNTIME_QUESTION_TYPES)
  @ResponseApiProperty({ enum: GRADE_RUNTIME_QUESTION_TYPES })
  questionType?: GradeQuestionType;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  @ResponseApiProperty({ type: String })
  prompt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  @ResponseApiProperty({ type: String })
  questionTextEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  @ResponseApiProperty({ type: String, nullable: true })
  promptAr?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  @ResponseApiProperty({ type: String, nullable: true })
  questionTextAr?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  @ResponseApiProperty({
    type: String,
    nullable: true,
    description:
      'Private authoring field; ordinary review and learner projections omit it',
  })
  explanation?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  @ResponseApiProperty({
    type: String,
    nullable: true,
    description:
      'Private authoring field; ordinary review and learner projections omit it',
  })
  explanationAr?: string | null;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @ApiProperty({ type: Number, minimum: 0.01 })
  points!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @ResponseApiProperty({ type: Number })
  sortOrder?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @ResponseApiProperty({ type: Number })
  order?: number;

  @IsOptional()
  @Transform(({ value }) => toBooleanValue(value))
  @IsBoolean()
  @ResponseApiProperty({ type: Boolean })
  required?: boolean;

  @IsOptional()
  @ResponseApiProperty({
    type: 'object',
    additionalProperties: true,
    description:
      'Private authoring field; ordinary review and learner projections omit it',
  })
  answerKey?: unknown;

  @IsOptional()
  @ResponseApiProperty({
    type: 'object',
    additionalProperties: true,
    description:
      'Private authoring field; ordinary review and learner projections omit it',
  })
  correctAnswer?: unknown;

  @IsOptional()
  @IsObject()
  @ResponseApiProperty({
    type: 'object',
    additionalProperties: true,
    nullable: true,
  })
  metadata?: Record<string, unknown> | null;

  @IsOptional()
  @ResponseApiProperty({ type: 'object', additionalProperties: true })
  matchingPairs?: unknown;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @ResponseApiProperty({ type: String, nullable: true })
  mediaMode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @ResponseApiProperty({ type: String, nullable: true })
  mediaTitle?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @ResponseApiProperty({ type: String, nullable: true })
  mediaUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @ResponseApiProperty({ type: String, nullable: true })
  mediaFileName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  @ResponseApiProperty({ type: String, nullable: true })
  mediaMimeType?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @ResponseApiProperty({
    type: 'object',
    additionalProperties: true,
    nullable: true,
  })
  mediaSize?: number | null;

  @IsOptional()
  @ResponseApiProperty({ type: 'object', additionalProperties: true })
  sampleAnswerAr?: unknown;

  @IsOptional()
  @ResponseApiProperty({ type: 'object', additionalProperties: true })
  sampleAnswerEn?: unknown;

  @IsOptional()
  @ResponseApiProperty({ type: 'object', additionalProperties: true })
  acceptedAnswersAr?: unknown;

  @IsOptional()
  @ResponseApiProperty({ type: 'object', additionalProperties: true })
  acceptedAnswersEn?: unknown;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_QUESTION_OPTIONS)
  @ValidateNested({ each: true })
  @Type(() => GradeQuestionOptionDto)
  @ResponseApiProperty({ type: () => [GradeQuestionOptionDto], maxItems: 50 })
  options?: GradeQuestionOptionDto[];
}

export class UpdateGradeAssessmentQuestionDto {
  @ResponseApiProperty(RESPONSE_CONFIG_OPENAPI)
  @IsResponseConfig()
  responseConfig?: unknown;
  @Allow()
  @ResponseApiProperty({
    type: 'object',
    additionalProperties: true,
    description:
      'Closed Safe RichQuestionContent V1; asset references remain owner-bound',
  })
  richContent?: unknown;
  @IsOptional()
  @Transform(({ value }) => toUpperEnumValue(value))
  @IsIn(GRADE_RUNTIME_QUESTION_TYPES)
  @ResponseApiProperty({ enum: GRADE_RUNTIME_QUESTION_TYPES })
  type?: GradeQuestionType;

  @IsOptional()
  @Transform(({ value }) => toUpperEnumValue(value))
  @IsIn(GRADE_RUNTIME_QUESTION_TYPES)
  @ResponseApiProperty({ enum: GRADE_RUNTIME_QUESTION_TYPES })
  questionType?: GradeQuestionType;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  @ResponseApiProperty({ type: String })
  prompt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  @ResponseApiProperty({ type: String })
  questionTextEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  @ResponseApiProperty({ type: String, nullable: true })
  promptAr?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  @ResponseApiProperty({ type: String, nullable: true })
  questionTextAr?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  @ResponseApiProperty({
    type: String,
    nullable: true,
    description:
      'Private authoring field; ordinary review and learner projections omit it',
  })
  explanation?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  @ResponseApiProperty({
    type: String,
    nullable: true,
    description:
      'Private authoring field; ordinary review and learner projections omit it',
  })
  explanationAr?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @ResponseApiProperty({ type: Number, minimum: 0.01 })
  points?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @ResponseApiProperty({ type: Number })
  sortOrder?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @ResponseApiProperty({ type: Number })
  order?: number;

  @IsOptional()
  @Transform(({ value }) => toBooleanValue(value))
  @IsBoolean()
  @ResponseApiProperty({ type: Boolean })
  required?: boolean;

  @IsOptional()
  @ResponseApiProperty({
    type: 'object',
    additionalProperties: true,
    description:
      'Private authoring field; ordinary review and learner projections omit it',
  })
  answerKey?: unknown;

  @IsOptional()
  @ResponseApiProperty({
    type: 'object',
    additionalProperties: true,
    description:
      'Private authoring field; ordinary review and learner projections omit it',
  })
  correctAnswer?: unknown;

  @IsOptional()
  @IsObject()
  @ResponseApiProperty({
    type: 'object',
    additionalProperties: true,
    nullable: true,
  })
  metadata?: Record<string, unknown> | null;

  @IsOptional()
  @ResponseApiProperty({ type: 'object', additionalProperties: true })
  matchingPairs?: unknown;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @ResponseApiProperty({ type: String, nullable: true })
  mediaMode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @ResponseApiProperty({ type: String, nullable: true })
  mediaTitle?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @ResponseApiProperty({ type: String, nullable: true })
  mediaUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @ResponseApiProperty({ type: String, nullable: true })
  mediaFileName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  @ResponseApiProperty({ type: String, nullable: true })
  mediaMimeType?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @ResponseApiProperty({
    type: 'object',
    additionalProperties: true,
    nullable: true,
  })
  mediaSize?: number | null;

  @IsOptional()
  @ResponseApiProperty({ type: 'object', additionalProperties: true })
  sampleAnswerAr?: unknown;

  @IsOptional()
  @ResponseApiProperty({ type: 'object', additionalProperties: true })
  sampleAnswerEn?: unknown;

  @IsOptional()
  @ResponseApiProperty({ type: 'object', additionalProperties: true })
  acceptedAnswersAr?: unknown;

  @IsOptional()
  @ResponseApiProperty({ type: 'object', additionalProperties: true })
  acceptedAnswersEn?: unknown;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_QUESTION_OPTIONS)
  @ValidateNested({ each: true })
  @Type(() => GradeQuestionOptionDto)
  @ResponseApiProperty({ type: () => [GradeQuestionOptionDto], maxItems: 50 })
  options?: GradeQuestionOptionDto[];
}

export class ReorderGradeAssessmentQuestionsDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_QUESTION_BULK_ITEMS)
  @IsUUID(undefined, { each: true })
  @ApiProperty({ type: [String], maxItems: 200 })
  questionIds!: string[];
}

export class BulkQuestionPointsItemDto {
  @IsUUID()
  @ApiProperty({ type: String, format: 'uuid' })
  questionId!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @ApiProperty({ type: Number, minimum: 0.01 })
  points!: number;
}

export class BulkUpdateGradeAssessmentQuestionPointsDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_QUESTION_BULK_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => BulkQuestionPointsItemDto)
  @ResponseApiProperty({
    type: () => [BulkQuestionPointsItemDto],
    maxItems: 200,
  })
  items?: BulkQuestionPointsItemDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_QUESTION_BULK_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => BulkQuestionPointsItemDto)
  @ResponseApiProperty({
    type: () => [BulkQuestionPointsItemDto],
    maxItems: 200,
  })
  updates?: BulkQuestionPointsItemDto[];
}

export class GradeQuestionOptionResponseDto {
  @ResponseApiProperty({
    type: 'object',
    additionalProperties: true,
    description:
      'Closed Safe RichQuestionContent V1; asset references remain owner-bound',
  })
  richContent?: RichContent;
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;
  @ApiProperty({ type: String })
  label!: string;
  @ApiProperty({ type: String, nullable: true })
  labelAr!: string | null;
  @ApiProperty({ type: String, nullable: true })
  value!: string | null;
  @ResponseApiProperty({
    type: Boolean,
    description:
      'Private authoring field; ordinary review and learner projections omit it',
  })
  isCorrect?: boolean;
  @ApiProperty({ type: Number })
  sortOrder!: number;
  @ApiProperty({ type: 'object', additionalProperties: true })
  metadata!: unknown;
}

export class GradeAssessmentQuestionResponseDto extends GradeQuestionContractDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;
  @ApiProperty({ type: String, format: 'uuid' })
  assessmentId!: string;
  @ApiProperty({ type: String })
  prompt!: string;
  @ApiProperty({ type: String, nullable: true })
  promptAr!: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Private authoring field; ordinary review and learner projections omit it',
  })
  explanation!: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Private authoring field; ordinary review and learner projections omit it',
  })
  explanationAr!: string | null;
  @ApiProperty({ type: Number, minimum: 0.01 })
  points!: number;
  @ApiProperty({ type: Number })
  sortOrder!: number;
  @ApiProperty({ type: Boolean })
  required!: boolean;
  @ResponseApiProperty({
    type: 'object',
    additionalProperties: true,
    description:
      'Private authoring field; ordinary review and learner projections omit it',
  })
  answerKey?: unknown;
  @ApiProperty({ type: 'object', additionalProperties: true })
  metadata!: unknown;
  @ApiProperty({ type: () => [GradeQuestionOptionResponseDto], maxItems: 50 })
  options!: GradeQuestionOptionResponseDto[];
  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;
  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: string;
}

export class GradeAssessmentQuestionsListResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  assessmentId!: string;
  @ApiProperty({ type: Number })
  totalQuestions!: number;
  @ApiProperty({ type: Number })
  totalPoints!: number;
  @ApiProperty({ type: Boolean })
  pointsMatchMaxScore!: boolean;
  @ApiProperty({ type: () => [GradeAssessmentQuestionResponseDto] })
  questions!: GradeAssessmentQuestionResponseDto[];
}

export class DeleteGradeAssessmentQuestionResponseDto {
  @ApiProperty({ type: Boolean })
  ok!: true;
}
