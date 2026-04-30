import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsUUID,
} from 'class-validator';

export const REWARD_DASHBOARD_REDEMPTION_STATUSES = [
  'requested',
  'approved',
  'rejected',
  'fulfilled',
  'cancelled',
] as const;

export const REWARD_DASHBOARD_CATALOG_STATUSES = [
  'draft',
  'published',
  'archived',
] as const;

export const REWARD_DASHBOARD_CATALOG_TYPES = [
  'physical',
  'digital',
  'privilege',
  'certificate',
  'other',
] as const;

function toBooleanValue(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes'].includes(normalized)) return true;
  if (['false', '0', 'no'].includes(normalized)) return false;
  return value;
}

export class GetRewardsOverviewQueryDto {
  @IsOptional()
  @IsUUID()
  academicYearId?: string;

  @IsOptional()
  @IsUUID()
  termId?: string;

  @IsOptional()
  @IsUUID()
  studentId?: string;

  @IsOptional()
  @IsIn(REWARD_DASHBOARD_REDEMPTION_STATUSES)
  status?: string;

  @IsOptional()
  @IsIn(REWARD_DASHBOARD_CATALOG_TYPES)
  type?: string;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @Transform(({ value }) => toBooleanValue(value))
  @IsBoolean()
  includeArchived?: boolean;
}

export class GetStudentRewardsSummaryQueryDto {
  @IsOptional()
  @IsUUID()
  academicYearId?: string;

  @IsOptional()
  @IsUUID()
  termId?: string;

  @IsOptional()
  @Transform(({ value }) => toBooleanValue(value))
  @IsBoolean()
  includeCatalogEligibility?: boolean;

  @IsOptional()
  @Transform(({ value }) => toBooleanValue(value))
  @IsBoolean()
  includeHistory?: boolean;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;
}

export class GetRewardCatalogSummaryQueryDto {
  @IsOptional()
  @IsUUID()
  academicYearId?: string;

  @IsOptional()
  @IsUUID()
  termId?: string;

  @IsOptional()
  @IsIn(REWARD_DASHBOARD_CATALOG_STATUSES)
  status?: string;

  @IsOptional()
  @IsIn(REWARD_DASHBOARD_CATALOG_TYPES)
  type?: string;

  @IsOptional()
  @Transform(({ value }) => toBooleanValue(value))
  @IsBoolean()
  includeArchived?: boolean;

  @IsOptional()
  @Transform(({ value }) => toBooleanValue(value))
  @IsBoolean()
  includeDeleted?: boolean;

  @IsOptional()
  @Transform(({ value }) => toBooleanValue(value))
  @IsBoolean()
  onlyAvailable?: boolean;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
