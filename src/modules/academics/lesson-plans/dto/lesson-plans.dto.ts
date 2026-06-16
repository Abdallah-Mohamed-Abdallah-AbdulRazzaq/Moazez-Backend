import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { LessonPlanStatus } from '@prisma/client';

export class ListLessonPlansQueryDto {
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
  teacherUserId?: string;

  @IsOptional()
  @IsUUID()
  classroomId?: string;

  @IsOptional()
  @IsUUID()
  subjectId?: string;

  @IsOptional()
  @IsUUID()
  curriculumId?: string;

  @IsOptional()
  @IsEnum(LessonPlanStatus)
  status?: LessonPlanStatus;

  @IsOptional()
  @IsDateString()
  weekStartDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;
}

export class LessonPlanWeeksQueryDto {
  @IsUUID()
  termId!: string;

  @IsOptional()
  @IsUUID()
  teacherSubjectAllocationId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

export class LessonPlanSummaryQueryDto {
  @IsUUID()
  termId!: string;

  @IsOptional()
  @IsUUID()
  teacherSubjectAllocationId?: string;

  @IsOptional()
  @IsUUID()
  gradeId?: string;

  @IsOptional()
  @IsUUID()
  subjectId?: string;

  @IsOptional()
  @IsUUID()
  classroomId?: string;
}

export class AutoPlanLessonPlanDto {
  @IsUUID()
  termId!: string;

  @IsUUID()
  teacherSubjectAllocationId!: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsBoolean()
  overwrite?: boolean;

  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}

export class MoveLessonPlanItemDto {
  @IsOptional()
  @IsDateString()
  plannedDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  weekIndex?: number;

  @IsOptional()
  @IsUUID()
  timetableEntryId?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class LessonPlanValidationQueryDto extends LessonPlanSummaryQueryDto {}

export class CreateLessonPlanDto {
  @IsUUID()
  academicYearId!: string;

  @IsUUID()
  termId!: string;

  @IsUUID()
  teacherSubjectAllocationId!: string;

  @IsOptional()
  @IsUUID()
  teacherUserId?: string;

  @IsOptional()
  @IsUUID()
  classroomId?: string;

  @IsOptional()
  @IsUUID()
  subjectId?: string;

  @IsUUID()
  curriculumId!: string;

  @IsString()
  @MaxLength(180)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string | null;

  @IsDateString()
  weekStartDate!: string;

  @IsDateString()
  weekEndDate!: string;
}

export class UpdateLessonPlanDto {
  @IsOptional()
  @IsString()
  @MaxLength(180)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string | null;

  @IsOptional()
  @IsDateString()
  weekStartDate?: string;

  @IsOptional()
  @IsDateString()
  weekEndDate?: string;
}

export class CreateLessonPlanItemDto {
  @IsUUID()
  unitId!: string;

  @IsUUID()
  lessonId!: string;

  @IsOptional()
  @IsUUID()
  timetableEntryId?: string | null;

  @IsOptional()
  @IsDateString()
  plannedDate?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek?: number | null;

  @IsOptional()
  @IsUUID()
  periodId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  periodLabel?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  title?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateLessonPlanItemDto {
  @IsOptional()
  @IsUUID()
  unitId?: string;

  @IsOptional()
  @IsUUID()
  lessonId?: string;

  @IsOptional()
  @IsUUID()
  timetableEntryId?: string | null;

  @IsOptional()
  @IsDateString()
  plannedDate?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek?: number | null;

  @IsOptional()
  @IsUUID()
  periodId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  periodLabel?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  title?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string | null;
}

export class ReorderLessonPlanItemDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder!: number;
}

export class LessonPlanItemStatusNoteDto {
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  note?: string | null;
}
