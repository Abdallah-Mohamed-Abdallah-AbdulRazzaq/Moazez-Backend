import { GRADE_RELEASED_KEY_OPENAPI } from './grade-review.openapi';
import { RESPONSE_CONFIG_OPENAPI } from '../../../../common/assessment-answer/response-config.openapi';
import type { ResponseConfigV1 } from '../../../../common/assessment-answer/response-config';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { GradeQuestionType, GradeReviewReleaseLevel } from '@prisma/client';
import { GradeQuestionInteractionDto } from '../../shared/presenters/grade-question-contract';
import {
  QuestionGroupDisplayResponseDto,
  QuestionGroupDisplayItemResponseDto,
} from '../../../../common/question-groups/question-group.dto';
import { AnswerMediaAssetDto } from '../../../files/assessment-media/dto/answer-media.dto';
import type { RichContent } from '../../../../common/rich-content/rich-content.types';
import type { EvaluationOutcome } from '../../../../common/question-evaluation';
import type {
  GradeReviewLevel,
  GradeReviewAudience,
} from '../domain/grade-review-policy';
import type { gradeScoringKey } from '../domain/grade-objective-scoring';

export class SetGradeReviewReleaseDto {
  @ApiProperty({ minimum: 0, maximum: 2147483646 })
  @IsInt()
  @Min(0)
  @Max(2147483646)
  expectedVersion!: number;
  @ApiProperty({ enum: GradeReviewReleaseLevel })
  @IsEnum(GradeReviewReleaseLevel)
  studentLevel!: GradeReviewReleaseLevel;
  @ApiProperty({ enum: GradeReviewReleaseLevel })
  @IsEnum(GradeReviewReleaseLevel)
  parentLevel!: GradeReviewReleaseLevel;
  @ApiProperty({ format: 'uuid' }) @IsUUID() requestId!: string;
}
export class GradeReviewReleaseResponseDto {
  @ApiProperty({ format: 'uuid' }) assessmentId!: string;
  @ApiProperty() version!: number;
  @ApiProperty({ enum: GradeReviewReleaseLevel })
  studentLevel!: GradeReviewLevel;
  @ApiProperty({ enum: GradeReviewReleaseLevel })
  parentLevel!: GradeReviewLevel;
  @ApiProperty({ format: 'date-time', nullable: true }) updatedAt!:
    | string
    | null;
}
export class ApproveGradeKeyDto {
  @ApiProperty({ format: 'date-time' })
  @IsDateString()
  expectedQuestionUpdatedAt!: string;
}
export class RevokeGradeKeyDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() approvalId!: string;
}
export class GradeKeyApprovalResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) questionId!: string;
  @ApiProperty({ format: 'date-time' }) approvedAt!: string;
  @ApiProperty({ format: 'date-time', nullable: true }) revokedAt!:
    | string
    | null;
  @ApiProperty({ enum: [1] }) keyVersion!: 1;
}
export class ApplyGradeScoringSuggestionDto {
  @ApiProperty({ enum: ['APPLY', 'OVERRIDE'] })
  @IsIn(['APPLY', 'OVERRIDE'])
  mode!: 'APPLY' | 'OVERRIDE';
  @ApiPropertyOptional({
    minimum: 0,
    maximum: 999999.99,
    description:
      'Required only for an explicit override; at most two decimal places',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999999.99)
  awardedPoints?: number;
  @ApiPropertyOptional({
    enum: ['REVIEWER_JUDGMENT', 'PARTIAL_CREDIT', 'KEY_ISSUE'],
  })
  @IsOptional()
  @IsIn(['REVIEWER_JUDGMENT', 'PARTIAL_CREDIT', 'KEY_ISSUE'])
  reason?: 'REVIEWER_JUDGMENT' | 'PARTIAL_CREDIT' | 'KEY_ISSUE';
}
export class GradeScoringSuggestionResponseDto {
  @ApiProperty({
    format: 'uuid',
    description:
      'Opaque immutable snapshot identity; private fingerprints are never projected',
  })
  id!: string;
  @ApiProperty({ format: 'uuid' }) assessmentId!: string;
  @ApiProperty({ format: 'uuid' }) submissionId!: string;
  @ApiProperty({ format: 'uuid' }) answerId!: string;
  @ApiProperty({ format: 'uuid' }) questionId!: string;
  @ApiProperty({ enum: ['st12-objective-v1'] }) evaluationVersion!: string;
  @ApiProperty({ enum: [1] }) policyVersion!: number;
  @ApiProperty({
    enum: [
      'PROVED_EQUIVALENT',
      'PROVED_DIFFERENT',
      'UNKNOWN_REQUIRES_MANUAL_REVIEW',
      'INVALID_INPUT',
      'UNDEFINED_EXPRESSION',
    ],
  })
  outcome!: EvaluationOutcome;
  @ApiProperty({ nullable: true }) suggestedPoints!: number | null;
  @ApiProperty() maxPoints!: number;
  @ApiProperty() reason!: string;
  @ApiProperty() manualReviewRequired!: boolean;
  @ApiProperty({ enum: ['PENDING', 'MANUAL_ONLY', 'STALE', 'APPLIED'] })
  applicability!: 'PENDING' | 'MANUAL_ONLY' | 'STALE' | 'APPLIED';
  @ApiProperty({ format: 'date-time' }) evaluatedAt!: string;
  @ApiProperty({ format: 'date-time', nullable: true }) appliedAt!:
    | string
    | null;
  @ApiProperty({ nullable: true }) appliedPoints!: number | null;
  @ApiProperty({ enum: ['APPLY', 'OVERRIDE'], nullable: true }) decision!:
    | string
    | null;
}
export class GradeReleasedOptionDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() label!: string;
  @ApiProperty({ nullable: true }) labelAr!: string | null;
  @ApiProperty({ nullable: true }) value!: string | null;
  @ApiPropertyOptional({
    type: Object,
    description: 'Validated ST08 display-only option content',
  })
  richContent?: RichContent;
}
export class GradeReleasedAnswerDto {
  @ApiProperty({ enum: GradeQuestionType, nullable: true })
  canonicalType!: GradeQuestionType | null;
  @ApiProperty({ type: GradeQuestionInteractionDto })
  interaction!: GradeQuestionInteractionDto;
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ nullable: true }) answerText!: string | null;
  @ApiProperty({
    type: Object,
    nullable: true,
    description:
      'Canonical question-type answer; never a key or private metadata',
  })
  answerJson!: unknown;
  @ApiProperty({ type: [String] }) selectedOptionIds!: string[];
  @ApiProperty({ nullable: true }) awardedPoints!: number | null;
  @ApiProperty({ nullable: true }) maxPoints!: number | null;
  @ApiProperty({ nullable: true }) reviewerComment!: string | null;
  @ApiProperty({ nullable: true }) reviewerCommentAr!: string | null;
  @ApiProperty({ format: 'date-time', nullable: true }) reviewedAt!:
    | string
    | null;
  @ApiPropertyOptional({
    type: [AnswerMediaAssetDto],
    description:
      'Exact released resources; Parent visibility additionally requires the School media policy',
  })
  assets?: AnswerMediaAssetDto[];
}
export class GradeReleasedReviewQuestionDto {
  @ApiPropertyOptional(RESPONSE_CONFIG_OPENAPI)
  responseConfig?: ResponseConfigV1;
  @ApiPropertyOptional({ format: 'uuid' }) groupId?: string;
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() type!: string;
  @ApiProperty({ enum: GradeQuestionType, nullable: true })
  canonicalType!: GradeQuestionType | null;
  @ApiProperty({ type: GradeQuestionInteractionDto })
  interaction!: GradeQuestionInteractionDto;
  @ApiProperty() prompt!: string;
  @ApiProperty({ nullable: true }) promptAr!: string | null;
  @ApiProperty() points!: number;
  @ApiProperty() required!: boolean;
  @ApiProperty({ type: [GradeReleasedOptionDto] })
  options!: GradeReleasedOptionDto[];
  @ApiPropertyOptional({
    type: Object,
    description: 'Validated ST08 public display-only content',
  })
  richContent?: RichContent;
  @ApiProperty({ type: GradeReleasedAnswerDto, nullable: true })
  answer!: GradeReleasedAnswerDto | null;
  @ApiProperty() correctAnswerAvailable!: boolean;
  @ApiPropertyOptional({
    oneOf: GRADE_RELEASED_KEY_OPENAPI,
    description: 'KEYS level only, exact currently approved key projection',
  })
  correctAnswer?: ReturnType<typeof gradeScoringKey>;
  @ApiPropertyOptional({ nullable: true }) explanation?: string | null;
  @ApiPropertyOptional({ nullable: true }) explanationAr?: string | null;
}
export class GradeReleasedReviewResponseDto {
  @ApiProperty({ format: 'uuid' }) assessmentId!: string;
  @ApiProperty({ format: 'uuid' }) submissionId!: string;
  @ApiProperty({ format: 'uuid' }) studentId!: string;
  @ApiProperty({ enum: ['STUDENT', 'PARENT'] }) audience!: GradeReviewAudience;
  @ApiProperty({ enum: ['DETAILS', 'KEYS'] }) level!: 'DETAILS' | 'KEYS';
  @ApiProperty() policyVersion!: number;
  @ApiProperty({ format: 'date-time' }) correctedAt!: string;
  @ApiProperty({ nullable: true }) totalScore!: number | null;
  @ApiProperty({ nullable: true }) maxScore!: number | null;
  @ApiProperty({ type: [GradeReleasedReviewQuestionDto] })
  questions!: GradeReleasedReviewQuestionDto[];
  @ApiPropertyOptional({ type: [QuestionGroupDisplayResponseDto] })
  groups?: unknown[];
  @ApiPropertyOptional({ type: [QuestionGroupDisplayItemResponseDto] })
  displayItems?: unknown[];
}
