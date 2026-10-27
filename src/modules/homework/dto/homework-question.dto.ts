import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  Allow,
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
  ValidateIf,
} from 'class-validator';
import { HomeworkQuestionType } from '@prisma/client';

function trimText(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function toUpperEnumValue(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return undefined;
  return typeof value === 'string' ? value.trim().toUpperCase() : value;
}

export class CreateHomeworkQuestionOptionDto {
  @ApiPropertyOptional({
    type: Object,
    nullable: true,
    description:
      'Closed Safe Rich AST V1 option envelope; non-null derives text. Null retains legacy creation requirements.',
  })
  @Allow()
  richContent?: unknown;

  @ApiPropertyOptional({
    minLength: 1,
    maxLength: 1000,
    description:
      'Required for legacy-only creation; may be omitted when a valid non-null Rich option derives text.',
  })
  @ValidateIf(
    (object: CreateHomeworkQuestionOptionDto, value: unknown) =>
      object.richContent == null || value !== undefined,
  )
  @Transform(({ value }) => trimText(value))
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  text!: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isCorrect?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown> | null;
}

export class CreateHomeworkQuestionDto {
  @ApiPropertyOptional({
    type: Object,
    nullable: true,
    description:
      'Closed Safe Rich AST V1 Homework question envelope; non-null derives prompt/instructions. stemAr is unsupported.',
  })
  @Allow()
  richContent?: unknown;
  @Transform(({ value }) => toUpperEnumValue(value))
  @IsEnum(HomeworkQuestionType)
  type!: HomeworkQuestionType;

  @ApiPropertyOptional({
    minLength: 1,
    maxLength: 8000,
    description:
      'Required for legacy-only creation; may be omitted when a valid non-null Rich question derives prompt.',
  })
  @ValidateIf(
    (object: CreateHomeworkQuestionDto, value: unknown) =>
      object.richContent == null || value !== undefined,
  )
  @Transform(({ value }) => trimText(value))
  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  prompt!: string;

  @IsOptional()
  @Transform(({ value }) => trimText(value))
  @IsString()
  @MaxLength(4000)
  instructions?: string | null;

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  points?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number | null;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isRequired?: boolean;

  @IsOptional()
  @Transform(({ value }) => trimText(value))
  @IsString()
  @MaxLength(8000)
  expectedAnswer?: string | null;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown> | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CreateHomeworkQuestionOptionDto)
  options?: CreateHomeworkQuestionOptionDto[];
}

export class UpdateHomeworkQuestionDto {
  @ApiPropertyOptional({
    type: Object,
    nullable: true,
    description:
      'Complete V1 replacement; omitted preserves unless legacy display changes; null clears SQL JSONB.',
  })
  @Allow()
  richContent?: unknown;
  @IsOptional()
  @Transform(({ value }) => toUpperEnumValue(value))
  @IsEnum(HomeworkQuestionType)
  type?: HomeworkQuestionType;

  @IsOptional()
  @Transform(({ value }) => trimText(value))
  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  prompt?: string;

  @IsOptional()
  @Transform(({ value }) => trimText(value))
  @IsString()
  @MaxLength(4000)
  instructions?: string | null;

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  points?: number | null;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isRequired?: boolean;

  @IsOptional()
  @Transform(({ value }) => trimText(value))
  @IsString()
  @MaxLength(8000)
  expectedAnswer?: string | null;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown> | null;
}

export class ReorderHomeworkQuestionDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder!: number;
}

export class UpdateHomeworkQuestionOptionDto {
  @ApiPropertyOptional({
    type: Object,
    nullable: true,
    description:
      'Complete V1 label replacement on this option UUID; null clears SQL JSONB.',
  })
  @Allow()
  richContent?: unknown;
  @IsOptional()
  @Transform(({ value }) => trimText(value))
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  text?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isCorrect?: boolean;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown> | null;
}

export class ReorderHomeworkQuestionOptionDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder!: number;
}
