import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  TimetableConfigStatus,
  TimetableEntryStatus,
  TimetablePeriodType,
  TimetableScopeType,
} from '@prisma/client';

const HH_MM_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export class TimetableConfigScopeDto {
  @IsUUID()
  academicYearId!: string;

  @IsUUID()
  termId!: string;

  @IsOptional()
  @IsEnum(TimetableScopeType)
  scopeType?: TimetableScopeType;

  @IsOptional()
  @IsUUID()
  gradeId?: string;

  @IsOptional()
  @IsUUID()
  sectionId?: string;

  @IsOptional()
  @IsUUID()
  classroomId?: string;
}

export class GetTimetableConfigQueryDto extends TimetableConfigScopeDto {}

export class UpsertTimetableConfigDto extends TimetableConfigScopeDto {
  @IsString()
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(6)
  weekStartDay?: number;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  activeDays?: number[];

  @IsOptional()
  @IsEnum(TimetableConfigStatus)
  status?: TimetableConfigStatus;
}

export class TimetableConfigIdQueryDto {
  @IsUUID()
  timetableConfigId!: string;
}

export class PublishTimetableDto {
  @IsUUID()
  timetableConfigId!: string;
}

export class CreateTimetablePeriodDto {
  @IsUUID()
  timetableConfigId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  index!: number;

  @IsString()
  @MaxLength(80)
  label!: string;

  @IsString()
  @Matches(HH_MM_PATTERN)
  startTime!: string;

  @IsString()
  @Matches(HH_MM_PATTERN)
  endTime!: string;

  @IsOptional()
  @IsEnum(TimetablePeriodType)
  type?: TimetablePeriodType;

  @IsOptional()
  @IsBoolean()
  isInstructional?: boolean;
}

export class UpdateTimetablePeriodDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  index?: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  label?: string;

  @IsOptional()
  @IsString()
  @Matches(HH_MM_PATTERN)
  startTime?: string;

  @IsOptional()
  @IsString()
  @Matches(HH_MM_PATTERN)
  endTime?: string;

  @IsOptional()
  @IsEnum(TimetablePeriodType)
  type?: TimetablePeriodType;

  @IsOptional()
  @IsBoolean()
  isInstructional?: boolean;
}

export class TimetableEntryIdParamDto {
  @IsUUID()
  entryId!: string;
}

export class ListTimetableEntriesQueryDto extends TimetableConfigIdQueryDto {
  @IsOptional()
  @IsUUID()
  classroomId?: string;

  @IsOptional()
  @IsUUID()
  teacherUserId?: string;

  @IsOptional()
  @IsUUID()
  subjectId?: string;

  @IsOptional()
  @IsUUID()
  roomId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek?: number;

  @IsOptional()
  @IsEnum(TimetableEntryStatus)
  status?: TimetableEntryStatus;
}

export class CreateTimetableEntryDto {
  @IsUUID()
  timetableConfigId!: string;

  @IsUUID()
  periodId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number;

  @IsUUID()
  classroomId!: string;

  // The use-case derives subjectId from teacherSubjectAllocationId and validates
  // this optional value when callers send it for compatibility.
  @IsOptional()
  @IsUUID()
  subjectId?: string;

  @IsUUID()
  teacherSubjectAllocationId!: string;

  @IsOptional()
  @IsUUID()
  roomId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string | null;
}

export class UpdateTimetableEntryDto {
  @IsOptional()
  @IsUUID()
  periodId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek?: number;

  @IsOptional()
  @IsUUID()
  classroomId?: string;

  // The use-case derives subjectId from teacherSubjectAllocationId and validates
  // this optional value when callers send it for compatibility.
  @IsOptional()
  @IsUUID()
  subjectId?: string;

  @IsOptional()
  @IsUUID()
  teacherSubjectAllocationId?: string;

  @IsOptional()
  @IsUUID()
  roomId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string | null;
}
