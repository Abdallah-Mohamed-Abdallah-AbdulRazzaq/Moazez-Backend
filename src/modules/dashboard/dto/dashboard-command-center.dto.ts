import { UserType } from '@prisma/client';
import { DashboardActivityActorType } from './dashboard-activity-feed.dto';
import {
  DashboardAlertSeverity,
  DashboardAlertSource,
} from './dashboard-alerts.dto';
import {
  DashboardAcademicContextDto,
  DashboardSchoolSummaryDto,
} from './dashboard-summary.dto';
import {
  DashboardCapabilityState,
  DashboardFreshnessMetadataDto,
} from './dashboard-metadata.dto';

export type DashboardCommandCenterActionKind = 'frontend-route';
export type DashboardCommandCenterTone =
  | 'info'
  | 'success'
  | 'warning'
  | 'critical'
  | 'neutral';
export type DashboardCommandCenterHealthStatus =
  | 'healthy'
  | 'info'
  | 'warning'
  | 'critical'
  | 'not_configured';
export type DashboardCommandCenterActionPriority =
  | 'low'
  | 'medium'
  | 'high'
  | 'critical';

export class DashboardCommandCenterResponseDto {
  generatedAt!: string;
  school!: DashboardSchoolSummaryDto;
  academicContext!: DashboardAcademicContextDto;
  operator!: DashboardCommandCenterOperatorDto;
  today!: DashboardCommandCenterTodayDto;
  quickStats!: DashboardCommandCenterQuickStatDto[];
  operationalHealth!: DashboardCommandCenterHealthDto[];
  moduleReadiness!: DashboardCommandCenterModuleReadinessDto[];
  topRisks!: DashboardCommandCenterRiskDto[];
  topActions!: DashboardCommandCenterNextActionDto[];
  alertsPreview!: DashboardCommandCenterAlertPreviewDto[];
  activityPreview!: DashboardCommandCenterActivityPreviewDto[];
  meta!: DashboardCommandCenterMetaDto;
}

export class DashboardCommandCenterOperatorDto {
  displayName!: string;
  userType!: UserType;
}

export class DashboardCommandCenterTodayDto {
  date!: string;
  dayOfWeek!: string;
  timezone!: string;
}

export class DashboardCommandCenterActionDto {
  label!: string;
  target!: string;
  kind!: DashboardCommandCenterActionKind;
}

export class DashboardCommandCenterQuickStatDto {
  key!: string;
  label!: string;
  value!: number;
  unit!: string | null;
  tone!: DashboardCommandCenterTone;
  iconKey!: string;
  source!: string;
  action!: DashboardCommandCenterActionDto;
}

export class DashboardCommandCenterHealthDto {
  key!: string;
  label!: string;
  status!: DashboardCommandCenterHealthStatus;
  score!: number;
  summary!: string;
  source!: string;
  action!: DashboardCommandCenterActionDto;
}

export class DashboardCommandCenterMetricDto {
  key!: string;
  label!: string;
  value!: string | number | boolean | null;
}

export class DashboardCommandCenterModuleReadinessDto {
  source!: string;
  label!: string;
  status!: DashboardCommandCenterHealthStatus;
  score!: number;
  summary!: string;
  metrics!: DashboardCommandCenterMetricDto[];
  action!: DashboardCommandCenterActionDto;
}

export class DashboardCommandCenterRiskDto {
  key!: string;
  severity!: DashboardAlertSeverity;
  title!: string;
  count!: number;
  source!: DashboardAlertSource;
  action!: DashboardCommandCenterActionDto;
}

export class DashboardCommandCenterNextActionDto {
  key!: string;
  priority!: DashboardCommandCenterActionPriority;
  label!: string;
  description!: string;
  source!: string;
  action!: DashboardCommandCenterActionDto;
}

export class DashboardCommandCenterAlertPreviewDto {
  key!: string;
  severity!: DashboardAlertSeverity;
  title!: string;
  count!: number;
  source!: DashboardAlertSource;
  action!: DashboardCommandCenterActionDto;
}

export class DashboardCommandCenterActivityActorDto {
  displayName!: string;
  type!: DashboardActivityActorType;
}

export class DashboardCommandCenterActivitySubjectDto {
  type!: string;
  label!: string;
}

export class DashboardCommandCenterActivityPreviewDto {
  source!: string;
  eventType!: string;
  title!: string;
  description!: string;
  actor!: DashboardCommandCenterActivityActorDto;
  subject!: DashboardCommandCenterActivitySubjectDto;
  occurredAt!: string;
}

export class DashboardCommandCenterDeferredDto {
  widgets!: Extract<DashboardCapabilityState, 'available' | 'deferred'>;
  analytics!: Extract<DashboardCapabilityState, 'snapshot_only' | 'deferred'>;
  lightModeDropdown!: Extract<
    DashboardCapabilityState,
    'foundation' | 'deferred'
  >;
  todos!: Extract<DashboardCapabilityState, 'persisted' | 'deferred'>;
  weather!: 'deferred';
  planner!: 'deferred';
  alertLifecycle!: 'deferred';
  realtime!: 'deferred';
}

export class DashboardCommandCenterMetaDto {
  source!: 'dashboard_command_center';
  version!: 'v2';
  dataFreshness!: 'live';
  freshness!: DashboardFreshnessMetadataDto;
  deferred!: DashboardCommandCenterDeferredDto;
}
