import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

export const DASHBOARD_ACTIVITY_FEED_SOURCES = [
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
] as const;

export const DASHBOARD_ACTIVITY_ACTOR_TYPES = [
  'system',
  'admin',
  'teacher',
  'student',
  'parent',
  'unknown',
] as const;

export const DASHBOARD_ACTIVITY_FEED_DEFAULT_LIMIT = 20;
export const DASHBOARD_ACTIVITY_FEED_MAX_LIMIT = 100;

export type DashboardActivityFeedSource =
  (typeof DASHBOARD_ACTIVITY_FEED_SOURCES)[number];
export type DashboardActivityActorType =
  (typeof DASHBOARD_ACTIVITY_ACTOR_TYPES)[number];

const DASHBOARD_ACTIVITY_EVENT_TYPE_PATTERN =
  /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

export class ListDashboardActivityFeedQueryDto {
  @IsOptional()
  @IsIn(DASHBOARD_ACTIVITY_FEED_SOURCES)
  source?: DashboardActivityFeedSource;

  @IsOptional()
  @IsString()
  @Matches(DASHBOARD_ACTIVITY_EVENT_TYPE_PATTERN, {
    message: 'eventType must be a dotted dashboard activity event type',
  })
  eventType?: string;

  @IsOptional()
  @IsIn(DASHBOARD_ACTIVITY_ACTOR_TYPES)
  actorType?: DashboardActivityActorType;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(DASHBOARD_ACTIVITY_FEED_MAX_LIMIT)
  limit = DASHBOARD_ACTIVITY_FEED_DEFAULT_LIMIT;

  @IsOptional()
  @IsString()
  cursor?: string;
}

export class DashboardActivityActorDto {
  id!: string | null;
  displayName!: string;
  type!: DashboardActivityActorType;
}

export class DashboardActivitySubjectDto {
  type!: string;
  id!: string | null;
  label!: string;
}

export class DashboardActivityFeedItemDto {
  activityId!: string;
  source!: DashboardActivityFeedSource;
  eventType!: string;
  title!: string;
  description!: string;
  actor!: DashboardActivityActorDto;
  subject!: DashboardActivitySubjectDto;
  occurredAt!: string;
}

export class DashboardActivityFeedPageInfoDto {
  limit!: number;
  nextCursor!: string | null;
  hasMore!: boolean;
}

export class DashboardActivityFeedFiltersDto {
  source!: DashboardActivityFeedSource | null;
  eventType!: string | null;
  actorType!: DashboardActivityActorType | null;
  dateFrom!: string | null;
  dateTo!: string | null;
}

export class DashboardActivityFeedDeferredDto {
  readState!: 'deferred';
  pinning!: 'deferred';
  realtime!: 'deferred';
  analyticsBuilder!: 'deferred';
}

export class DashboardActivityFeedResponseDto {
  generatedAt!: string;
  items!: DashboardActivityFeedItemDto[];
  pageInfo!: DashboardActivityFeedPageInfoDto;
  filters!: DashboardActivityFeedFiltersDto;
  deferred!: DashboardActivityFeedDeferredDto;
}
