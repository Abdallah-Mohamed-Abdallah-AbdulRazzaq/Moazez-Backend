import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export type PublicDismissalHistoryStatus =
  | 'requested'
  | 'queued'
  | 'called'
  | 'moving'
  | 'at_gate'
  | 'ready'
  | 'handed_over'
  | 'cancelled'
  | 'expired';

export class ListDismissalRequestHistoryQueryDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  statuses?: string;

  @IsOptional()
  @IsUUID()
  childId?: string;

  @IsOptional()
  @IsUUID()
  gateId?: string;

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
  @IsISO8601()
  dateFrom?: string;

  @IsOptional()
  @IsISO8601()
  dateTo?: string;

  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  @IsBoolean()
  activeOnly?: boolean;

  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  @IsBoolean()
  terminalOnly?: boolean;

  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  @IsBoolean()
  delayedOnly?: boolean;

  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  @IsBoolean()
  urgentOnly?: boolean;

  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  @IsBoolean()
  escalatedOnly?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString()
  sort?: string;
}

export class DismissalHistoryWaitDto {
  minutes!: number;
  delayed!: boolean;
  urgent!: boolean;
  thresholdMinutes!: number | null;
  urgentThresholdMinutes!: number | null;
}

export class DismissalHistoryEscalationDto {
  escalated!: boolean;
  escalatedAt!: string | null;
  reason!: string | null;
  note?: string | null;
}

export class DismissalHistoryChildDto {
  id!: string;
  displayName!: string;
  grade!: string | null;
  section!: string | null;
  classroom!: string | null;
}

export class DismissalHistoryGateDto {
  id!: string;
  code!: string;
  name!: string;
}

export class DismissalRequestHistoryItemDto {
  id!: string;
  status!: PublicDismissalHistoryStatus;
  isActive!: boolean;
  isTerminal!: boolean;
  requestedAt!: string;
  updatedAt!: string | null;
  calledAt!: string | null;
  readyAt!: string | null;
  handedOverAt!: string | null;
  cancelledAt!: string | null;
  expiredAt!: string | null;
  wait!: DismissalHistoryWaitDto;
  escalation!: DismissalHistoryEscalationDto;
  child!: DismissalHistoryChildDto;
  gate!: DismissalHistoryGateDto | null;
}

export class DismissalRequestHistorySummaryDto {
  totalCount!: number;
  activeCount!: number;
  terminalCount!: number;
  delayedCount!: number;
  urgentCount!: number;
  escalatedCount!: number;
}

export class DismissalRequestHistoryPaginationDto {
  page!: number;
  limit!: number;
  totalPages!: number;
}

export class DismissalRequestHistoryListResponseDto {
  data!: DismissalRequestHistoryItemDto[];
  summary!: DismissalRequestHistorySummaryDto;
  pagination!: DismissalRequestHistoryPaginationDto;
}

export class DismissalRequestHistoryTimelineEventDto {
  type!: 'request_created' | 'request_status_changed' | 'request_escalated';
  statusFrom!: string | null;
  statusTo!: string | null;
  createdAt!: string;
  note!: string | null;
}

export class DismissalRequestHistoryDetailItemDto extends DismissalRequestHistoryItemDto {
  timeline!: DismissalRequestHistoryTimelineEventDto[];
}

export class DismissalRequestHistoryDetailResponseDto {
  request!: DismissalRequestHistoryDetailItemDto;
}

function toOptionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return undefined;

  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;

  return undefined;
}
