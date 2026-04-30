import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
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

const REWARD_STATUSES = ['draft', 'published', 'archived'] as const;
const REWARD_TYPES = [
  'physical',
  'digital',
  'privilege',
  'certificate',
  'other',
] as const;

function toBooleanValue(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes'].includes(normalized)) return true;
  if (['false', '0', 'no'].includes(normalized)) return false;
  return value;
}

export class ListRewardCatalogQueryDto {
  @IsOptional()
  @IsUUID()
  academicYearId?: string;

  @IsOptional()
  @IsUUID()
  termId?: string;

  @IsOptional()
  @IsIn(REWARD_STATUSES)
  status?: string;

  @IsOptional()
  @IsIn(REWARD_TYPES)
  type?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @Transform(({ value }) => toBooleanValue(value))
  @IsBoolean()
  includeArchived?: boolean;

  @IsOptional()
  @Transform(({ value }) => toBooleanValue(value))
  @IsBoolean()
  includeDeleted?: boolean;

  @IsOptional()
  @Transform(({ value }) => toBooleanValue(value))
  @IsBoolean()
  onlyAvailable?: boolean;

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

export class CreateRewardCatalogItemDto {
  @IsOptional()
  @IsUUID()
  academicYearId?: string | null;

  @IsOptional()
  @IsUUID()
  termId?: string | null;

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
  @MaxLength(2000)
  descriptionEn?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  descriptionAr?: string | null;

  @IsOptional()
  @IsIn(REWARD_TYPES)
  type?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minTotalXp?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  stockQuantity?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  stockRemaining?: number | null;

  @IsOptional()
  @IsBoolean()
  isUnlimited?: boolean;

  @IsOptional()
  @IsUUID()
  imageFileId?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown> | null;
}

export class UpdateRewardCatalogItemDto {
  @IsOptional()
  @IsUUID()
  academicYearId?: string | null;

  @IsOptional()
  @IsUUID()
  termId?: string | null;

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
  @MaxLength(2000)
  descriptionEn?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  descriptionAr?: string | null;

  @IsOptional()
  @IsIn(REWARD_TYPES)
  type?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minTotalXp?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  stockQuantity?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  stockRemaining?: number | null;

  @IsOptional()
  @IsBoolean()
  isUnlimited?: boolean;

  @IsOptional()
  @IsUUID()
  imageFileId?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown> | null;
}

export class ArchiveRewardCatalogItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string | null;
}
