import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { GradeRoundingMode, GradeRuleScale } from '@prisma/client';

function toUpperEnumValue(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return undefined;
  return typeof value === 'string' ? value.trim().toUpperCase() : value;
}

export class UpsertGradeRuleDto {
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
  scopeId?: string;

  @IsOptional()
  @IsUUID()
  gradeId?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  passMark!: number;

  @IsOptional()
  @Transform(({ value }) => toUpperEnumValue(value))
  @IsEnum(GradeRuleScale)
  gradingScale?: GradeRuleScale;

  @IsOptional()
  @Transform(({ value }) => toUpperEnumValue(value))
  @IsEnum(GradeRoundingMode)
  rounding?: GradeRoundingMode;
}
