import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
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

export class ListReinforcementTemplatesQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  source?: string;

  @IsOptional()
  @Transform(({ value }) => toBooleanValue(value))
  @IsBoolean()
  includeDeleted?: boolean;
}

export class ReinforcementTaskTemplateStageDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  sortOrder?: number | null;

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
  @IsString()
  @MaxLength(32)
  proofType?: string | null;

  @IsOptional()
  @IsBoolean()
  requiresApproval?: boolean | null;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class CreateReinforcementTaskTemplateDto {
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
  @IsString()
  @MaxLength(32)
  source?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  rewardType?: string | null;

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  rewardValue?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  rewardLabelEn?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  rewardLabelAr?: string | null;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReinforcementTaskTemplateStageDto)
  stages?: ReinforcementTaskTemplateStageDto[];
}

export class ReinforcementTaskTemplateResponseDto {
  id!: string;
  nameEn!: string | null;
  nameAr!: string | null;
  descriptionEn!: string | null;
  descriptionAr!: string | null;
  source!: string;
  reward!: {
    type: string | null;
    value: number | null;
    labelEn: string | null;
    labelAr: string | null;
  };
  stages!: Array<{
    id: string;
    sortOrder: number;
    titleEn: string | null;
    titleAr: string | null;
    descriptionEn: string | null;
    descriptionAr: string | null;
    proofType: string;
    requiresApproval: boolean;
  }>;
  createdAt!: string;
  updatedAt!: string;
}

export class ReinforcementTaskTemplatesListResponseDto {
  items!: ReinforcementTaskTemplateResponseDto[];
}
