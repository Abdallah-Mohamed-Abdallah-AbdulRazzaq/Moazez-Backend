import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { DashboardAnalyticsChartDto } from './dashboard-analytics.dto';
import { DashboardAnalyticsChartDataResponseDto } from './dashboard-analytics-data.dto';
import { DashboardWidgetActionDto, DashboardWidgetDto } from './dashboard-widgets.dto';
import {
  DASHBOARD_MODULE_MAX_LIMIT,
  DASHBOARD_MODULE_DEFAULT_LIMIT,
  DASHBOARD_MODULE_SOURCES,
  DASHBOARD_MODULE_STATUSES,
} from '../domain/dashboard-module-pages';
import type {
  DashboardModuleActionKind,
  DashboardModuleCapabilityStatus,
  DashboardModuleKey,
  DashboardModuleSectionKey,
  DashboardModuleSource,
  DashboardModuleStatus,
  DashboardModuleTone,
} from '../domain/dashboard-module-pages';

export class ListDashboardModulesQueryDto {
  @IsOptional()
  @IsIn(DASHBOARD_MODULE_STATUSES)
  status?: DashboardModuleStatus;

  @IsOptional()
  @IsIn(DASHBOARD_MODULE_SOURCES)
  source?: DashboardModuleSource;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(DASHBOARD_MODULE_MAX_LIMIT)
  limit = DASHBOARD_MODULE_DEFAULT_LIMIT;
}

export class DashboardModuleActionDto {
  label!: string;
  target!: string;
  kind!: DashboardModuleActionKind;
}

export class DashboardModuleCapabilitiesDto {
  widgets!: DashboardModuleCapabilityStatus;
  analyticsDefinitions!: DashboardModuleCapabilityStatus;
  analyticsData!: DashboardModuleCapabilityStatus;
  drilldowns!: 'deferred';
  exports!: 'deferred';
  realtime!: 'deferred';
}

export class DashboardModuleSummaryCountsDto {
  widgetCount!: number;
  chartCount!: number;
  availableChartDataCount!: number;
  riskCount!: number;
  actionCount!: number;
}

export class DashboardModuleBaseDto {
  moduleKey!: DashboardModuleKey;
  source!: DashboardModuleSource;
  title!: string;
  description!: string;
  status!: DashboardModuleStatus;
  iconKey!: string;
  tone!: DashboardModuleTone;
  frontendRoute!: string;
  sourceRoute!: string;
}

export class DashboardModuleListItemDto extends DashboardModuleBaseDto {
  summary!: DashboardModuleSummaryCountsDto;
  capabilities!: DashboardModuleCapabilitiesDto;
}

export class DashboardModulesSummaryDto {
  total!: number;
  byStatus!: Partial<Record<DashboardModuleStatus, number>>;
  bySource!: Partial<Record<DashboardModuleSource, number>>;
}

export class DashboardModulesFiltersDto {
  status!: DashboardModuleStatus | null;
  source!: DashboardModuleSource | null;
  limit!: number;
}

export class DashboardModulesDeferredDto {
  customLayouts!: 'deferred';
  userPreferences!: 'deferred';
  exports!: 'deferred';
  realtime!: 'deferred';
}

export class DashboardModulesMetaDto {
  source!: 'dashboard_module_pages';
  version!: 'v1';
}

export class DashboardModulesResponseDto {
  generatedAt!: string;
  modules!: DashboardModuleListItemDto[];
  summary!: DashboardModulesSummaryDto;
  filters!: DashboardModulesFiltersDto;
  deferred!: DashboardModulesDeferredDto;
  meta!: DashboardModulesMetaDto;
}

export class DashboardModuleQuickStatDto {
  key!: string;
  label!: string;
  value!: number | string;
  unit!: string | null;
  tone!: DashboardModuleTone;
  iconKey!: string;
  source!: DashboardModuleSource;
  action!: DashboardWidgetActionDto | null;
}

export class DashboardModuleRiskDto {
  key!: string;
  severity!: 'info' | 'warning' | 'critical';
  title!: string;
  count!: number;
  source!: DashboardModuleSource;
  action!: DashboardModuleActionDto;
}

export class DashboardModuleNextActionDto {
  key!: string;
  priority!: 'low' | 'medium' | 'high' | 'critical';
  label!: string;
  description!: string;
  source!: DashboardModuleSource;
  action!: DashboardModuleActionDto;
}

export class DashboardModuleOverviewDto {
  quickStats!: DashboardModuleQuickStatDto[];
  risks!: DashboardModuleRiskDto[];
  actions!: DashboardModuleNextActionDto[];
}

export class DashboardModuleAnalyticsDto {
  charts!: DashboardAnalyticsChartDto[];
  availableData!: DashboardAnalyticsChartDataResponseDto[];
  plannedCharts!: DashboardAnalyticsChartDto[];
}

export class DashboardModuleSectionDto {
  sectionKey!: DashboardModuleSectionKey;
  title!: string;
  status!: DashboardModuleCapabilityStatus;
  items!: readonly string[];
}

export class DashboardModuleEmptyStateDto {
  reason!: 'no_widgets_or_charts';
  message!: string;
}

export class DashboardModulePageDeferredDto {
  customLayouts!: 'deferred';
  userPreferences!: 'deferred';
  drilldowns!: 'deferred';
  exports!: 'deferred';
  realtime!: 'deferred';
}

export class DashboardModulePageMetaDto {
  source!: 'dashboard_module_page';
  version!: 'v1';
  dataFreshness!: 'live';
  deferred!: DashboardModulePageDeferredDto;
}

export class DashboardModulePageResponseDto {
  generatedAt!: string;
  module!: DashboardModuleBaseDto;
  overview!: DashboardModuleOverviewDto;
  widgets!: DashboardWidgetDto[];
  analytics!: DashboardModuleAnalyticsDto;
  sections!: DashboardModuleSectionDto[];
  capabilities!: DashboardModuleCapabilitiesDto;
  emptyState!: DashboardModuleEmptyStateDto | null;
  meta!: DashboardModulePageMetaDto;
}

export {
  DASHBOARD_MODULE_DEFAULT_LIMIT,
  DASHBOARD_MODULE_MAX_LIMIT,
  DASHBOARD_MODULE_SOURCES,
  DASHBOARD_MODULE_STATUSES,
};
