import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import {
  DashboardCapabilityState,
  DashboardFreshnessMetadataDto,
} from './dashboard-metadata.dto';
import type {
  DashboardAnalyticsChartDataMetaDto,
  DashboardAnalyticsChartDataSeriesDto,
  DashboardAnalyticsChartDataSummaryDto,
} from './dashboard-analytics-data.dto';
import type { DashboardAnalyticsChartType } from '../domain/dashboard-analytics-catalog';
import type { DashboardWidgetAnalyticsChartKey } from '../domain/dashboard-widget-composition';

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
  'todos',
  'calendar',
] as const;

export const DASHBOARD_WIDGET_TYPES = [
  'stat-card',
  'progress-card',
  'risk-card',
  'action-card',
  'timeline-card',
  'mini-chart-card',
  'calendar-card',
  'todo-card',
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
  analytics!: DashboardWidgetAnalyticsReferenceDto | null;
}

export class DashboardWidgetAnalyticsReferenceDto {
  chartKey!: DashboardWidgetAnalyticsChartKey;
  chartType!: DashboardAnalyticsChartType;
  definitionEndpoint!: string;
  dataEndpoint!: string;
  defaultRange!: '30d';
  defaultGranularity!: 'day';
  dataAvailability!: DashboardAnalyticsChartDataMetaDto['dataAvailability'];
  pack!: DashboardAnalyticsChartDataMetaDto['pack'];
  computation!: DashboardAnalyticsChartDataMetaDto['computation'];
}

export class DashboardWidgetMiniChartDataDto {
  series!: readonly DashboardAnalyticsChartDataSeriesDto[];
  totals!: Record<string, number>;
  summary!: DashboardAnalyticsChartDataSummaryDto | null;
  empty!: boolean;
}

export class DashboardWidgetProgressSegmentDto {
  key!: string;
  label!: string;
  value!: number;
}

export class DashboardWidgetProgressDataDto {
  value!: number;
  max!: number;
  percent!: number;
  unit!: 'percent';
  label!: string;
  segments!: DashboardWidgetProgressSegmentDto[];
}

export class DashboardWidgetTodoItemDto {
  title!: string;
  status!: 'pending' | 'completed';
  priority!: 'low' | 'normal' | 'high';
}

export class DashboardWidgetTodoSummaryDto {
  total!: number;
  pending!: number;
  completed!: number;
}

export class DashboardWidgetTodoDataDto {
  date!: string;
  items!: DashboardWidgetTodoItemDto[];
  summary!: DashboardWidgetTodoSummaryDto;
}

export class DashboardWidgetCalendarEventDto {
  source!: 'academic_calendar' | 'todo';
  title!: string;
  date!: string;
  endDate!: string;
  startTime!: string | null;
  endTime!: string | null;
  allDay!: boolean;
  eventType!: 'holiday' | 'exam' | 'activity' | 'other' | null;
  status!: 'pending' | 'completed' | null;
  priority!: 'low' | 'normal' | 'high' | null;
  tone!: DashboardWidgetTone;
  iconKey!: string;
}

export class DashboardWidgetCalendarDataDto {
  date!: string;
  sourceMode!: 'academic_calendar_and_todos';
  eventDates!: string[];
  events!: DashboardWidgetCalendarEventDto[];
  summary!: {
    total: number;
    academicCalendar: number;
    todos: number;
  };
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
    'available' | 'integration_deferred' | 'deferred'
  >;
  weatherWidgets!: 'deferred';
  todoWidgets!: Extract<
    DashboardCapabilityState,
    'available' | 'integration_deferred' | 'deferred'
  >;
  analyticsStandalone!: Extract<
    DashboardCapabilityState,
    'available' | 'snapshot_only'
  >;
  todosStandalone!: 'persisted';
  calendarTodoComposition!: Extract<DashboardCapabilityState, 'available'>;
  plannerCalendar!: 'available';
  crossModulePlannerItems!: 'deferred';
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
