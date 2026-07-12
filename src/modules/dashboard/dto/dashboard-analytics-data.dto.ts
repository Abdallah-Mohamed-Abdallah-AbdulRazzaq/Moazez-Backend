import { IsIn, IsOptional, IsUUID, Matches } from 'class-validator';
import {
  DASHBOARD_ANALYTICS_GRANULARITIES,
  DASHBOARD_ANALYTICS_RANGES,
} from '../domain/dashboard-analytics-catalog';
import type {
  DashboardAnalyticsChartType,
  DashboardAnalyticsDataQueryKey,
  DashboardAnalyticsDataAvailability,
  DashboardAnalyticsGranularity,
  DashboardAnalyticsRange,
  DashboardAnalyticsSource,
  DashboardAnalyticsStatus,
} from '../domain/dashboard-analytics-catalog';
import {
  DashboardAnalyticsChartDataPoint,
  DashboardAnalyticsPointCoordinate,
} from '../domain/dashboard-analytics-coordinate';
import { DashboardFreshnessMetadataDto } from './dashboard-metadata.dto';

export class GetDashboardAnalyticsChartDataQueryDto {
  @IsOptional()
  @IsIn(DASHBOARD_ANALYTICS_RANGES)
  range?: DashboardAnalyticsRange;

  @IsOptional()
  @IsIn(DASHBOARD_ANALYTICS_GRANULARITIES)
  granularity?: DashboardAnalyticsGranularity;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dateFrom?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dateTo?: string;

  @IsOptional()
  @IsUUID()
  academicYearId?: string;

  @IsOptional()
  @IsUUID()
  termId?: string;

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

export class DashboardAnalyticsChartDataFiltersDto {
  range!: DashboardAnalyticsRange;
  granularity!: DashboardAnalyticsGranularity;
  dateFrom!: string | null;
  dateTo!: string | null;
  academicYearId!: string | null;
  termId!: string | null;
  gradeId!: string | null;
  sectionId!: string | null;
  classroomId!: string | null;
}

export type DashboardAnalyticsChartDataPointDto =
  DashboardAnalyticsChartDataPoint;

export type DashboardAnalyticsPointCoordinateDto =
  DashboardAnalyticsPointCoordinate;

export class DashboardAnalyticsChartDataSeriesDto {
  key!: string;
  label!: string;
  points!: readonly DashboardAnalyticsChartDataPointDto[];
}

export class DashboardAnalyticsChartDataSummaryDto {
  value!: number;
  label!: string;
}

export class DashboardAnalyticsChartDataDto {
  series!: readonly DashboardAnalyticsChartDataSeriesDto[];
  totals!: Record<string, number>;
  summary!: DashboardAnalyticsChartDataSummaryDto | null;
  empty!: boolean;
}

export class DashboardAnalyticsChartDataEmptyStateDto {
  reason!: 'no_data' | 'not_implemented';
  message!: string;
}

export class DashboardAnalyticsChartDataDeferredDto {
  historicalSeries?: 'deferred';
  computedSeries?: 'deferred';
  drilldown!: 'deferred';
  exports!: 'deferred';
  realtime!: 'deferred';
}

export class DashboardAnalyticsResolvedWindowDto {
  startInclusive!: string;
  endExclusive!: string;
  startCivilDate!: string;
  endCivilDate!: string;
}

export class DashboardAnalyticsQueryMetadataDto {
  effectiveTimezone!: string;
  requestedFilters!: readonly DashboardAnalyticsDataQueryKey[];
  appliedFilters!: readonly DashboardAnalyticsDataQueryKey[];
  notApplicableFilters!: readonly DashboardAnalyticsDataQueryKey[];
  resolvedWindow!: DashboardAnalyticsResolvedWindowDto;
}

export class DashboardAnalyticsChartDataMetaDto {
  source!: 'dashboard_analytics_data_pack';
  pack!: 'operational_snapshot_v1' | null;
  dataAvailability!: DashboardAnalyticsDataAvailability;
  computation!:
    | 'dashboard_summary_snapshot'
    | 'dashboard_alert_readiness_snapshot'
    | null;
  freshness!: DashboardFreshnessMetadataDto;
  query!: DashboardAnalyticsQueryMetadataDto;
  deferred!: DashboardAnalyticsChartDataDeferredDto;
}

export class DashboardAnalyticsChartDataResponseDto {
  generatedAt!: string;
  chartKey!: string;
  source!: DashboardAnalyticsSource;
  title!: string;
  type!: DashboardAnalyticsChartType;
  status!: DashboardAnalyticsStatus;
  range!: DashboardAnalyticsRange;
  granularity!: DashboardAnalyticsGranularity;
  filters!: DashboardAnalyticsChartDataFiltersDto;
  data!: DashboardAnalyticsChartDataDto;
  emptyState!: DashboardAnalyticsChartDataEmptyStateDto | null;
  meta!: DashboardAnalyticsChartDataMetaDto;
}
