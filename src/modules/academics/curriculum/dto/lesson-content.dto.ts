import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { LessonContentItemType } from '@prisma/client';

export class CreateLessonContentItemDto {
  @IsEnum(LessonContentItemType)
  type!: LessonContentItemType;

  @IsString()
  @MaxLength(180)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  bodyText?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  url?: string | null;

  @IsOptional()
  @IsUUID()
  fileId?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(600)
  estimatedMinutes?: number | null;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown> | null;
}

export class UpdateLessonContentItemDto {
  @IsOptional()
  @IsEnum(LessonContentItemType)
  type?: LessonContentItemType;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  bodyText?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  url?: string | null;

  @IsOptional()
  @IsUUID()
  fileId?: string | null;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(600)
  estimatedMinutes?: number | null;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown> | null;
}

export class ReorderLessonContentItemDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder!: number;
}
