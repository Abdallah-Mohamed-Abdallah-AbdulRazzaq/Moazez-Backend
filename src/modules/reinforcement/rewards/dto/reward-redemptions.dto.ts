import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsISO8601,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const REDEMPTION_STATUSES = [
  'requested',
  'approved',
  'rejected',
  'fulfilled',
  'cancelled',
] as const;

const REDEMPTION_REQUEST_SOURCES = [
  'dashboard',
  'teacher',
  'student_app',
  'parent_app',
  'system',
] as const;

function toBooleanValue(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes'].includes(normalized)) return true;
  if (['false', '0', 'no'].includes(normalized)) return false;
  return value;
}

export class ListRewardRedemptionsQueryDto {
  @IsOptional()
  @IsIn(REDEMPTION_STATUSES)
  status?: string;

  @IsOptional()
  @IsUUID()
  catalogItemId?: string;

  @IsOptional()
  @IsUUID()
  studentId?: string;

  @IsOptional()
  @IsUUID()
  academicYearId?: string;

  @IsOptional()
  @IsUUID()
  termId?: string;

  @IsOptional()
  @IsIn(REDEMPTION_REQUEST_SOURCES)
  requestSource?: string;

  @IsOptional()
  @IsISO8601()
  requestedFrom?: string;

  @IsOptional()
  @IsISO8601()
  requestedTo?: string;

  @IsOptional()
  @Transform(({ value }) => toBooleanValue(value))
  @IsBoolean()
  includeTerminal?: boolean;

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

export class CreateRewardRedemptionDto {
  @IsUUID()
  catalogItemId!: string;

  @IsUUID()
  studentId!: string;

  @IsOptional()
  @IsUUID()
  enrollmentId?: string | null;

  @IsOptional()
  @IsUUID()
  academicYearId?: string | null;

  @IsOptional()
  @IsUUID()
  termId?: string | null;

  @IsOptional()
  @IsIn(REDEMPTION_REQUEST_SOURCES)
  requestSource?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  requestNoteEn?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  requestNoteAr?: string | null;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown> | null;
}

export class CancelRewardRedemptionDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  cancellationReasonEn?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  cancellationReasonAr?: string | null;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown> | null;
}

export class ApproveRewardRedemptionDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reviewNoteEn?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reviewNoteAr?: string | null;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown> | null;
}

export class RejectRewardRedemptionDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reviewNoteEn?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reviewNoteAr?: string | null;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown> | null;
}

export class FulfillRewardRedemptionDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  fulfillmentNoteEn?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  fulfillmentNoteAr?: string | null;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown> | null;
}
