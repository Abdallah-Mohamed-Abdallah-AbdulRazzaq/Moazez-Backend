import { Transform, Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, Max, Min } from 'class-validator';
import { GradeRoundingMode, GradeRuleScale } from '@prisma/client';

function toUpperEnumValue(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return undefined;
  return typeof value === 'string' ? value.trim().toUpperCase() : value;
}

export class UpdateGradeRuleDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  passMark?: number;

  @IsOptional()
  @Transform(({ value }) => toUpperEnumValue(value))
  @IsEnum(GradeRuleScale)
  gradingScale?: GradeRuleScale;

  @IsOptional()
  @Transform(({ value }) => toUpperEnumValue(value))
  @IsEnum(GradeRoundingMode)
  rounding?: GradeRoundingMode;
}
