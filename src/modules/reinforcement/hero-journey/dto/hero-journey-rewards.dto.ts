import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

function toBooleanValue(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes'].includes(normalized)) return true;
  if (['false', '0', 'no'].includes(normalized)) return false;
  return value;
}

export class GrantHeroMissionXpDto {
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

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown> | null;
}

export class AwardHeroMissionBadgeDto {
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown> | null;
}

export class GetStudentHeroRewardsQueryDto {
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
  @Transform(({ value }) => toBooleanValue(value))
  @IsBoolean()
  includeEvents?: boolean;
}
