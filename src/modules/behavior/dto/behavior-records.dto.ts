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
  ValidateIf,
} from 'class-validator';

const BEHAVIOR_TYPES = ['positive', 'negative'] as const;
const BEHAVIOR_SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
const BEHAVIOR_RECORD_STATUSES = [
  'draft',
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

export class ListBehaviorRecordsQueryDto {
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
  @IsIn(BEHAVIOR_RECORD_STATUSES)
  status?: string;

  @IsOptional()
  @IsDateString()
  occurredFrom?: string;

  @IsOptional()
  @IsDateString()
  occurredTo?: string;

  @IsOptional()
  @IsUUID()
  createdById?: string;

  @IsOptional()
  @Transform(({ value }) => toBooleanValue(value))
  @IsBoolean()
  includeDeleted?: boolean;

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

export class CreateBehaviorRecordDto {
  @IsUUID()
  academicYearId!: string;

  @IsOptional()
  @IsUUID()
  termId?: string;

  @IsUUID()
  studentId!: string;

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
  @IsString()
  @MaxLength(255)
  titleEn?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  titleAr?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  noteEn?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  noteAr?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  points?: number;

  @IsDateString()
  occurredAt!: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown> | null;
}

export class UpdateBehaviorRecordDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsIn(BEHAVIOR_TYPES)
  type?: string;

  @IsOptional()
  @IsIn(BEHAVIOR_SEVERITIES)
  severity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  titleEn?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  titleAr?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  noteEn?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  noteAr?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  points?: number;

  @IsOptional()
  @IsDateString()
  occurredAt?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown> | null;
}

export class CancelBehaviorRecordDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  cancellationReasonEn?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  cancellationReasonAr?: string | null;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown> | null;
}
