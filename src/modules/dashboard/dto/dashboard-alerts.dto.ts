import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export const DASHBOARD_ALERT_SOURCES = [
  'admissions',
  'academics',
  'attendance',
  'grades',
  'homework',
  'behavior',
  'reinforcement',
  'communication',
  'settings',
] as const;

export const DASHBOARD_ALERT_SEVERITIES = [
  'info',
  'warning',
  'critical',
] as const;

export type DashboardAlertSource = (typeof DASHBOARD_ALERT_SOURCES)[number];
export type DashboardAlertSeverity =
  (typeof DASHBOARD_ALERT_SEVERITIES)[number];

export class ListDashboardAlertsQueryDto {
  @IsOptional()
  @IsIn(DASHBOARD_ALERT_SOURCES)
  source?: DashboardAlertSource;

  @IsOptional()
  @IsIn(DASHBOARD_ALERT_SEVERITIES)
  severity?: DashboardAlertSeverity;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @IsOptional()
  @Transform(({ value }) => toBooleanValue(value))
  @IsBoolean()
  includeZeroCount = false;
}

export class DashboardAlertActionDto {
  label!: string;
  target!: string;
}

export class DashboardAlertDto {
  key!: string;
  source!: DashboardAlertSource;
  severity!: DashboardAlertSeverity;
  title!: string;
  description!: string;
  count!: number;
  action!: DashboardAlertActionDto;
}

export class DashboardAlertsSummaryDto {
  total!: number;
  critical!: number;
  warning!: number;
  info!: number;
  bySource!: Record<string, number>;
}

export class DashboardAlertsDeferredDto {
  persistence!: 'deferred';
  acknowledge!: 'deferred';
  dismiss!: 'deferred';
  activityFeed!: 'deferred';
}

export class DashboardAlertsResponseDto {
  generatedAt!: string;
  alerts!: DashboardAlertDto[];
  summary!: DashboardAlertsSummaryDto;
  deferred!: DashboardAlertsDeferredDto;
}

function toBooleanValue(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;

  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes'].includes(normalized)) return true;
  if (['false', '0', 'no'].includes(normalized)) return false;

  return value;
}
