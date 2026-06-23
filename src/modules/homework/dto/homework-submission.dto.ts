import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const HOMEWORK_SUBMISSION_STATUSES = [
  'submitted',
  'late',
  'reviewed',
  'pending_review',
] as const;

export type HomeworkSubmissionStatusFilter =
  (typeof HOMEWORK_SUBMISSION_STATUSES)[number];

function toLowerOptionalString(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return undefined;
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

function trimText(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class ListHomeworkSubmissionsQueryDto {
  @IsOptional()
  @Transform(({ value }) => toLowerOptionalString(value))
  @IsIn(HOMEWORK_SUBMISSION_STATUSES)
  status?: HomeworkSubmissionStatusFilter;

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

export class HomeworkSubmissionReviewDto {
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
