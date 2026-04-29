import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

function toOptionalBoolean(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes'].includes(normalized)) return true;
  if (['false', '0', 'no'].includes(normalized)) return false;
  return value;
}

export class ListXpPoliciesQueryDto {
  @IsOptional()
  @IsUUID()
  academicYearId?: string;

  @IsOptional()
  @IsUUID()
  yearId?: string;

  @IsOptional()
  @IsUUID()
  termId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  scopeType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  scopeKey?: string;

  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  @IsBoolean()
  includeDeleted?: boolean;
}

export class GetEffectiveXpPolicyQueryDto {
  @IsOptional()
  @IsUUID()
  academicYearId?: string;

  @IsOptional()
  @IsUUID()
  yearId?: string;

  @IsUUID()
  termId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  scopeType?: string;

  @IsOptional()
  @IsUUID()
  scopeId?: string;

  @IsOptional()
  @IsUUID()
  studentId?: string;

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
  @IsUUID()
  stageId?: string;
}

export class CreateXpPolicyDto {
  @IsOptional()
  @IsUUID()
  academicYearId?: string;

  @IsOptional()
  @IsUUID()
  yearId?: string;

  @IsUUID()
  termId!: string;

  @IsString()
  @MaxLength(32)
  scopeType!: string;

  @IsOptional()
  @IsUUID()
  scopeId?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  dailyCap?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  weeklyCap?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  cooldownMinutes?: number | null;

  @IsOptional()
  allowedReasons?: unknown;

  @IsOptional()
  @IsDateString()
  startsAt?: string | null;

  @IsOptional()
  @IsDateString()
  endsAt?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateXpPolicyDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  dailyCap?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  weeklyCap?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  cooldownMinutes?: number | null;

  @IsOptional()
  allowedReasons?: unknown;

  @IsOptional()
  @IsDateString()
  startsAt?: string | null;

  @IsOptional()
  @IsDateString()
  endsAt?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ListXpLedgerQueryDto {
  @IsOptional()
  @IsUUID()
  academicYearId?: string;

  @IsOptional()
  @IsUUID()
  yearId?: string;

  @IsOptional()
  @IsUUID()
  termId?: string;

  @IsOptional()
  @IsUUID()
  studentId?: string;

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
  @IsUUID()
  stageId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(48)
  sourceType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  sourceId?: string;

  @IsOptional()
  @IsDateString()
  occurredFrom?: string;

  @IsOptional()
  @IsDateString()
  occurredTo?: string;

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

export class GetXpSummaryQueryDto {
  @IsOptional()
  @IsUUID()
  academicYearId?: string;

  @IsOptional()
  @IsUUID()
  yearId?: string;

  @IsUUID()
  termId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  scopeType?: string;

  @IsOptional()
  @IsUUID()
  scopeId?: string;

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
  @IsUUID()
  stageId?: string;

  @IsOptional()
  @IsUUID()
  studentId?: string;

  @IsOptional()
  @IsDateString()
  occurredFrom?: string;

  @IsOptional()
  @IsDateString()
  occurredTo?: string;
}

export class GrantXpForReinforcementReviewDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  amount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reasonAr?: string | null;
}

export class GrantManualXpDto {
  @IsOptional()
  @IsUUID()
  academicYearId?: string;

  @IsOptional()
  @IsUUID()
  yearId?: string;

  @IsUUID()
  termId!: string;

  @IsUUID()
  studentId!: string;

  @IsOptional()
  @IsUUID()
  enrollmentId?: string | null;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  amount!: number;

  @IsString()
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reasonAr?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  sourceId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  dedupeKey?: string | null;
}

export class XpPolicyResponseDto {
  id!: string | null;
  academicYearId!: string;
  termId!: string;
  scopeType!: string;
  scopeKey!: string;
  dailyCap!: number | null;
  weeklyCap!: number | null;
  cooldownMinutes!: number | null;
  allowedReasons!: unknown;
  startsAt!: string | null;
  endsAt!: string | null;
  isActive!: boolean;
  isDefault!: boolean;
  createdAt!: string | null;
  updatedAt!: string | null;
}

export class XpLedgerResponseDto {
  id!: string;
  academicYearId!: string;
  termId!: string;
  studentId!: string;
  enrollmentId!: string | null;
  assignmentId!: string | null;
  policyId!: string | null;
  sourceType!: string;
  sourceId!: string;
  amount!: number;
  reason!: string | null;
  reasonAr!: string | null;
  actorUserId!: string | null;
  occurredAt!: string;
  student!: Record<string, unknown> | null;
  createdAt!: string;
}
