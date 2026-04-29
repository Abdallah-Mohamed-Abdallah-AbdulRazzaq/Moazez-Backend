import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsObject, IsOptional, IsUUID } from 'class-validator';

function toBooleanValue(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes'].includes(normalized)) return true;
  if (['false', '0', 'no'].includes(normalized)) return false;
  return value;
}

const PROGRESS_STATUSES = [
  'not_started',
  'in_progress',
  'completed',
  'cancelled',
] as const;

export class GetStudentHeroProgressQueryDto {
  @IsOptional()
  @IsUUID()
  academicYearId?: string;

  @IsOptional()
  @IsUUID()
  yearId?: string;

  @IsOptional()
  @IsUUID()
  termId?: string;

  @IsOptional()
  @IsUUID()
  stageId?: string;

  @IsOptional()
  @IsIn(PROGRESS_STATUSES)
  status?: string;

  @IsOptional()
  @Transform(({ value }) => toBooleanValue(value))
  @IsBoolean()
  includeAvailable?: boolean;

  @IsOptional()
  @Transform(({ value }) => toBooleanValue(value))
  @IsBoolean()
  includeArchived?: boolean;
}

export class StartHeroMissionDto {
  @IsOptional()
  @IsUUID()
  enrollmentId?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown> | null;
}

export class CompleteHeroObjectiveDto {
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown> | null;
}

export class CompleteHeroMissionDto {
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown> | null;
}
