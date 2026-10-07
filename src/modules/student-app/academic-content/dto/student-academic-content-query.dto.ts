import { ApiPropertyOptional } from '@nestjs/swagger';
import { AcademicOnlineSessionPlatform } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import {
  STUDENT_ACADEMIC_CONTENT_TYPES,
  type StudentAcademicContentType,
} from '../../../academics/academic-content/domain/academic-content-recipient.query';

@ValidatorConstraint({
  name: 'studentAcademicContentOrderedRange',
  async: false,
})
class OrderedRange implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    const query = args.object as StudentAcademicContentQueryDto;
    const start: unknown =
      args.property === 'weeklyDateTo'
        ? query.weeklyDateFrom
        : query.sessionStartAtFrom;
    if (typeof value !== 'string' || typeof start !== 'string') return true;
    return args.property === 'weeklyDateTo'
      ? start <= value
      : Date.parse(start) <= Date.parse(value);
  }
  defaultMessage(): string {
    return 'Range end must be greater than or equal to range start';
  }
}

const trimmed = (value: unknown): unknown =>
  typeof value === 'string' ? value.trim() || undefined : value;
const INSTANT_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u;

export class StudentAcademicContentQueryDto {
  @ApiPropertyOptional({ enum: STUDENT_ACADEMIC_CONTENT_TYPES })
  @IsOptional()
  @IsIn(STUDENT_ACADEMIC_CONTENT_TYPES)
  type?: StudentAcademicContentType;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  subjectId?: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => trimmed(value))
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => trimmed(value))
  @IsString()
  @MaxLength(80)
  tag?: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/u)
  @IsDateString({ strict: true })
  weeklyDateFrom?: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/u)
  @IsDateString({ strict: true })
  @Validate(OrderedRange)
  weeklyDateTo?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(INSTANT_PATTERN)
  sessionStartAtFrom?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(INSTANT_PATTERN)
  @Validate(OrderedRange)
  sessionStartAtTo?: string;

  @ApiPropertyOptional({ enum: AcademicOnlineSessionPlatform })
  @IsOptional()
  @IsEnum(AcademicOnlineSessionPlatform)
  sessionPlatform?: AcademicOnlineSessionPlatform;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  page?: number;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
