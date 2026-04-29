import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
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
  ValidateNested,
} from 'class-validator';

function toBooleanValue(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes'].includes(normalized)) return true;
  if (['false', '0', 'no'].includes(normalized)) return false;
  return value;
}

const MISSION_STATUSES = ['draft', 'published', 'archived'] as const;

export class ListHeroBadgesQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @Transform(({ value }) => toBooleanValue(value))
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Transform(({ value }) => toBooleanValue(value))
  @IsBoolean()
  includeDeleted?: boolean;
}

export class CreateHeroBadgeDto {
  @IsString()
  @MaxLength(100)
  slug!: string;

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
  @MaxLength(1000)
  descriptionEn?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  descriptionAr?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  assetPath?: string | null;

  @IsOptional()
  @IsUUID()
  fileId?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown> | null;
}

export class UpdateHeroBadgeDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  slug?: string;

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
  @MaxLength(1000)
  descriptionEn?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  descriptionAr?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  assetPath?: string | null;

  @IsOptional()
  @IsUUID()
  fileId?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown> | null;
}

export class ListHeroMissionsQueryDto {
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
  stageId?: string;

  @IsOptional()
  @IsUUID()
  subjectId?: string;

  @IsOptional()
  @IsIn(MISSION_STATUSES)
  status?: string;

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

export class HeroMissionObjectiveDto {
  @IsOptional()
  @IsString()
  @MaxLength(32)
  type?: string;

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
  @MaxLength(500)
  subtitleEn?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  subtitleAr?: string | null;

  @IsOptional()
  @IsUUID()
  linkedAssessmentId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  linkedLessonRef?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number | null;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean | null;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown> | null;
}

export class CreateHeroMissionDto {
  @IsOptional()
  @IsUUID()
  academicYearId?: string;

  @IsOptional()
  @IsUUID()
  yearId?: string;

  @IsUUID()
  termId!: string;

  @IsUUID()
  stageId!: string;

  @IsOptional()
  @IsUUID()
  subjectId?: string | null;

  @IsOptional()
  @IsUUID()
  linkedAssessmentId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  linkedLessonRef?: string | null;

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
  briefEn?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  briefAr?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  requiredLevel?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  rewardXp?: number;

  @IsOptional()
  @IsUUID()
  badgeRewardId?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  positionX?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  positionY?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown> | null;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => HeroMissionObjectiveDto)
  objectives!: HeroMissionObjectiveDto[];
}

export class UpdateHeroMissionDto {
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
  stageId?: string;

  @IsOptional()
  @IsUUID()
  subjectId?: string | null;

  @IsOptional()
  @IsUUID()
  linkedAssessmentId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  linkedLessonRef?: string | null;

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
  briefEn?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  briefAr?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  requiredLevel?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  rewardXp?: number;

  @IsOptional()
  @IsUUID()
  badgeRewardId?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  positionX?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  positionY?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown> | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HeroMissionObjectiveDto)
  objectives?: HeroMissionObjectiveDto[];
}

export class ArchiveHeroMissionDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string | null;
}

export class DeleteHeroResourceResponseDto {
  ok!: boolean;
}
