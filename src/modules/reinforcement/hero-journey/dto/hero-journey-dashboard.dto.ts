import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsOptional,
  IsUUID,
} from 'class-validator';

function toBooleanValue(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes'].includes(normalized)) return true;
  if (['false', '0', 'no'].includes(normalized)) return false;
  return value;
}

export class HeroDashboardAcademicScopeQueryDto {
  @IsOptional()
  @IsUUID()
  academicYearId?: string;

  @IsOptional()
  @IsUUID()
  yearId?: string;

  @IsOptional()
  @IsUUID()
  termId?: string;
}

export class HeroDashboardDateRangeQueryDto extends HeroDashboardAcademicScopeQueryDto {
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;
}

export class GetHeroOverviewQueryDto extends HeroDashboardDateRangeQueryDto {
  @IsOptional()
  @IsUUID()
  stageId?: string;

  @IsOptional()
  @IsUUID()
  gradeId?: string;

  @IsOptional()
  @IsUUID()
  sectionId?: string;

  @IsOptional()
  @IsUUID()
  classroomId?: string;

  @IsOptional()
  @IsUUID()
  studentId?: string;
}

export class GetHeroMapQueryDto extends HeroDashboardAcademicScopeQueryDto {
  @IsOptional()
  @IsUUID()
  stageId?: string;

  @IsOptional()
  @IsUUID()
  subjectId?: string;

  @IsOptional()
  @IsUUID()
  studentId?: string;

  @IsOptional()
  @Transform(({ value }) => toBooleanValue(value))
  @IsBoolean()
  includeDraft?: boolean;

  @IsOptional()
  @Transform(({ value }) => toBooleanValue(value))
  @IsBoolean()
  includeArchived?: boolean;
}

export class GetHeroStageSummaryQueryDto extends HeroDashboardDateRangeQueryDto {}

export class GetHeroClassroomSummaryQueryDto extends HeroDashboardDateRangeQueryDto {}

export class GetHeroBadgesSummaryQueryDto extends HeroDashboardAcademicScopeQueryDto {
  @IsOptional()
  @IsUUID()
  stageId?: string;

  @IsOptional()
  @IsUUID()
  classroomId?: string;

  @IsOptional()
  @IsUUID()
  studentId?: string;

  @IsOptional()
  @Transform(({ value }) => toBooleanValue(value))
  @IsBoolean()
  includeInactive?: boolean;
}
