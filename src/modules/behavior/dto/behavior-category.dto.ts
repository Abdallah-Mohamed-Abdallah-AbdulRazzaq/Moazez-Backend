import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const BEHAVIOR_TYPES = ['positive', 'negative'] as const;
const BEHAVIOR_SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;

function toBooleanValue(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes'].includes(normalized)) return true;
  if (['false', '0', 'no'].includes(normalized)) return false;
  return value;
}

export class ListBehaviorCategoriesQueryDto {
  @IsOptional()
  @IsIn(BEHAVIOR_TYPES)
  type?: string;

  @IsOptional()
  @IsIn(BEHAVIOR_SEVERITIES)
  severity?: string;

  @IsOptional()
  @Transform(({ value }) => toBooleanValue(value))
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @Transform(({ value }) => toBooleanValue(value))
  @IsBoolean()
  includeDeleted?: boolean;

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

export class CreateBehaviorCategoryDto {
  @IsString()
  @MaxLength(100)
  code!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  nameEn?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  nameAr?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  descriptionEn?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  descriptionAr?: string | null;

  @IsIn(BEHAVIOR_TYPES)
  type!: string;

  @IsOptional()
  @IsIn(BEHAVIOR_SEVERITIES)
  defaultSeverity?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  defaultPoints?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown> | null;
}

export class UpdateBehaviorCategoryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  nameEn?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  nameAr?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  descriptionEn?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  descriptionAr?: string | null;

  @IsOptional()
  @IsIn(BEHAVIOR_TYPES)
  type?: string;

  @IsOptional()
  @IsIn(BEHAVIOR_SEVERITIES)
  defaultSeverity?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  defaultPoints?: number | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown> | null;
}

export class DeleteBehaviorCategoryResponseDto {
  ok!: true;
}
