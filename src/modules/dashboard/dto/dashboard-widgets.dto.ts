import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import {
  DashboardCapabilityState,
  DashboardFreshnessMetadataDto,
} from './dashboard-metadata.dto';

export const DASHBOARD_WIDGET_SOURCES = [
  'admissions',
  'students',
  'academics',
  'attendance',
  'grades',
  'homework',
  'behavior',
  'reinforcement',
  'communication',
  'settings',
  'activity',
] as const;

export const DASHBOARD_WIDGET_TYPES = [
  'stat-card',
  'progress-card',
  'risk-card',
  'action-card',
  'timeline-card',
] as const;

export const DASHBOARD_WIDGET_TONES = [
  'neutral',
  'info',
  'success',
  'warning',
  'critical',
] as const;

export const DASHBOARD_WIDGET_DEFAULT_LIMIT = 20;
export const DASHBOARD_WIDGET_MAX_LIMIT = 50;

export type DashboardWidgetSource = (typeof DASHBOARD_WIDGET_SOURCES)[number];
export type DashboardWidgetType = (typeof DASHBOARD_WIDGET_TYPES)[number];
export type DashboardWidgetTone = (typeof DASHBOARD_WIDGET_TONES)[number];
export type DashboardWidgetActionKind = 'frontend-route';

export class ListDashboardWidgetsQueryDto {
  @IsOptional()
  @IsIn(DASHBOARD_WIDGET_SOURCES)
  source?: DashboardWidgetSource;

  @IsOptional()
  @IsIn(DASHBOARD_WIDGET_TYPES)
  type?: DashboardWidgetType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(DASHBOARD_WIDGET_MAX_LIMIT)
  limit = DASHBOARD_WIDGET_DEFAULT_LIMIT;
}

export class DashboardWidgetActionDto {
  label!: string;
  target!: string;
  kind!: DashboardWidgetActionKind;
}

export class DashboardWidgetEmptyStateDto {
  title!: string;
  description!: string | null;
  action!: DashboardWidgetActionDto | null;
}

export class DashboardWidgetMetaDto {
  freshness!: 'live';
  freshnessDetails!: DashboardFreshnessMetadataDto;
}

export class DashboardWidgetDto {
  widgetKey!: string;
  type!: DashboardWidgetType;
  source!: DashboardWidgetSource;
  title!: string;
  subtitle!: string | null;
  iconKey!: string;
  tone!: DashboardWidgetTone;
  data!: Record<string, unknown>;
  action!: DashboardWidgetActionDto | null;
  emptyState!: DashboardWidgetEmptyStateDto | null;
  meta!: DashboardWidgetMetaDto;
}

export class DashboardWidgetsSummaryDto {
  total!: number;
  byType!: Partial<Record<DashboardWidgetType, number>>;
  bySource!: Partial<Record<DashboardWidgetSource, number>>;
}

export class DashboardWidgetsFiltersDto {
  source!: DashboardWidgetSource | null;
  type!: DashboardWidgetType | null;
  limit!: number;
}

export class DashboardWidgetsDeferredDto {
  customLayouts!: 'deferred';
  widgetPreferences!: 'deferred';
  analyticsCharts!: Extract<
    DashboardCapabilityState,
    'integration_deferred' | 'deferred'
  >;
  weatherWidgets!: 'deferred';
  todoWidgets!: Extract<
    DashboardCapabilityState,
    'integration_deferred' | 'deferred'
  >;
  analyticsStandalone!: 'snapshot_only';
  todosStandalone!: 'persisted';
}

export class DashboardWidgetsResponseDto {
  generatedAt!: string;
  widgets!: DashboardWidgetDto[];
  summary!: DashboardWidgetsSummaryDto;
  filters!: DashboardWidgetsFiltersDto;
  deferred!: DashboardWidgetsDeferredDto;
}

export class DashboardWidgetResponseDto {
  generatedAt!: string;
  widget!: DashboardWidgetDto;
  deferred!: DashboardWidgetsDeferredDto;
}
