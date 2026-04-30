import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const BEHAVIOR_TYPES = ['positive', 'negative'] as const;
const BEHAVIOR_SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
const BEHAVIOR_REVIEW_STATUSES = [
  'submitted',
  'approved',
  'rejected',
  'cancelled',
] as const;

function toBooleanValue(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes'].includes(normalized)) return true;
  if (['false', '0', 'no'].includes(normalized)) return false;
  return value;
}

export class ListBehaviorReviewQueueQueryDto {
  @IsOptional()
  @IsUUID()
  academicYearId?: string;

  @IsOptional()
  @IsUUID()
  termId?: string;

  @IsOptional()
  @IsUUID()
  studentId?: string;

  @IsOptional()
  @IsUUID()
  enrollmentId?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsIn(BEHAVIOR_TYPES)
  type?: string;

  @IsOptional()
  @IsIn(BEHAVIOR_SEVERITIES)
  severity?: string;

  @IsOptional()
  @IsIn(BEHAVIOR_REVIEW_STATUSES)
  status?: string;

  @IsOptional()
  @IsDateString()
  occurredFrom?: string;

  @IsOptional()
  @IsDateString()
  occurredTo?: string;

  @IsOptional()
  @IsDateString()
  submittedFrom?: string;

  @IsOptional()
  @IsDateString()
  submittedTo?: string;

  @IsOptional()
  @IsUUID()
  createdById?: string;

  @IsOptional()
  @Transform(({ value }) => toBooleanValue(value))
  @IsBoolean()
  includeReviewed?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

export class ApproveBehaviorRecordDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reviewNoteEn?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reviewNoteAr?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  pointsOverride?: number;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown> | null;
}

export class RejectBehaviorRecordDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reviewNoteEn?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reviewNoteAr?: string | null;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown> | null;
}
