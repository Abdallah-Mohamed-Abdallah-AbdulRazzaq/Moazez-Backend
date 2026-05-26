import { Transform, Type } from 'class-transformer';
import {
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
  @Transform(({ value }) => toUpperEnumValue(value))
  @IsEnum(HomeworkQuestionType)
  type!: HomeworkQuestionType;

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
