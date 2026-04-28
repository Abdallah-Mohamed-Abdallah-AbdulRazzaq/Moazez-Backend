import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { GradeSubmissionAnswerResponseDto } from './grade-submission.dto';

const MAX_BULK_SUBMISSION_REVIEWS = 200;
const MAX_REVIEWER_COMMENT_LENGTH = 2000;

export class ReviewGradeSubmissionAnswerDto {
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  awardedPoints!: number;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_REVIEWER_COMMENT_LENGTH)
  reviewerComment?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_REVIEWER_COMMENT_LENGTH)
  reviewerCommentAr?: string | null;
}

export class BulkReviewGradeSubmissionAnswerItemDto extends ReviewGradeSubmissionAnswerDto {
  @IsUUID()
  answerId!: string;
}

export class BulkReviewGradeSubmissionAnswersDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_BULK_SUBMISSION_REVIEWS)
  @ValidateNested({ each: true })
  @Type(() => BulkReviewGradeSubmissionAnswerItemDto)
  reviews!: BulkReviewGradeSubmissionAnswerItemDto[];
}

export class BulkReviewGradeSubmissionAnswersResponseDto {
  submissionId!: string;
  reviewedCount!: number;
  answers!: GradeSubmissionAnswerResponseDto[];
}
