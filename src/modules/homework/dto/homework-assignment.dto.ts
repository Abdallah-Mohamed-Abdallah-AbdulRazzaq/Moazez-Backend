import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  MinLength,
  Min,
} from 'class-validator';
import {
  HomeworkAssignmentMode,
  HomeworkAssignmentStatus,
  HomeworkTargetMode,
} from '@prisma/client';

function toUpperEnumValue(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return undefined;
  return typeof value === 'string' ? value.trim().toUpperCase() : value;
}

function trimText(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class ListHomeworkAssignmentsQueryDto {
  @IsOptional()
  @IsUUID()
  academicYearId?: string;

  @IsOptional()
  @IsUUID()
  termId?: string;

  @IsOptional()
  @IsUUID()
  classroomId?: string;

  @IsOptional()
  @IsUUID()
  teacherUserId?: string;

  @IsOptional()
  @IsUUID()
  teacherSubjectAllocationId?: string;

  @IsOptional()
  @Transform(({ value }) => toUpperEnumValue(value))
  @IsEnum(HomeworkAssignmentStatus)
  status?: HomeworkAssignmentStatus;

  @IsOptional()
  @Transform(({ value }) => toUpperEnumValue(value))
  @IsEnum(HomeworkAssignmentMode)
  mode?: HomeworkAssignmentMode;

  @IsOptional()
  @IsDateString()
  dueFrom?: string;

  @IsOptional()
  @IsDateString()
  dueTo?: string;

  @IsOptional()
  @Transform(({ value }) => trimText(value))
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class CreateHomeworkAssignmentDto {
  @IsUUID()
  academicYearId!: string;

  @IsUUID()
  termId!: string;

  @IsUUID()
  teacherSubjectAllocationId!: string;

  @IsOptional()
  @IsUUID()
  timetableEntryId?: string | null;

  @IsOptional()
  @IsDateString()
  scheduleDate?: string | null;

  @Transform(({ value }) => trimText(value))
  @IsString()
  @MinLength(1)
  @MaxLength(180)
  title!: string;

  @IsOptional()
  @Transform(({ value }) => trimText(value))
  @IsString()
  @MaxLength(4000)
  description?: string | null;

  @IsOptional()
  @Transform(({ value }) => toUpperEnumValue(value))
  @IsEnum(HomeworkAssignmentMode)
  mode?: HomeworkAssignmentMode;

  @Transform(({ value }) => toUpperEnumValue(value))
  @IsEnum(HomeworkTargetMode)
  targetMode!: HomeworkTargetMode;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  studentIds?: string[];

  @IsOptional()
  @IsDateString()
  publishAt?: string | null;

  @IsDateString()
  dueAt!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  estimatedMinutes?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  totalMarks?: number | null;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isGraded?: boolean;
}

export class UpdateHomeworkAssignmentDto {
  @IsOptional()
  @IsUUID()
  academicYearId?: string;

  @IsOptional()
  @IsUUID()
  termId?: string;

  @IsOptional()
  @IsUUID()
  teacherSubjectAllocationId?: string;

  @IsOptional()
  @IsUUID()
  timetableEntryId?: string | null;

  @IsOptional()
  @IsDateString()
  scheduleDate?: string | null;

  @IsOptional()
  @Transform(({ value }) => trimText(value))
  @IsString()
  @MinLength(1)
  @MaxLength(180)
  title?: string;

  @IsOptional()
  @Transform(({ value }) => trimText(value))
  @IsString()
  @MaxLength(4000)
  description?: string | null;

  @IsOptional()
  @Transform(({ value }) => toUpperEnumValue(value))
  @IsEnum(HomeworkAssignmentMode)
  mode?: HomeworkAssignmentMode;

  @IsOptional()
  @Transform(({ value }) => toUpperEnumValue(value))
  @IsEnum(HomeworkTargetMode)
  targetMode?: HomeworkTargetMode;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  studentIds?: string[];

  @IsOptional()
  @IsDateString()
  publishAt?: string | null;

  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  estimatedMinutes?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  totalMarks?: number | null;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isGraded?: boolean;
}
