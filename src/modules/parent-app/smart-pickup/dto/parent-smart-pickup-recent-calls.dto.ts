import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import type { PublicDismissalGateStatus } from '../../../dismissal/shared/dismissal.types';

export type ParentSmartPickupRecentStatus =
  | 'requested'
  | 'queued'
  | 'called'
  | 'moving'
  | 'at_gate'
  | 'ready'
  | 'handed_over'
  | 'cancelled'
  | 'expired';

export class ParentSmartPickupRecentCallsQueryDto {
  @IsOptional()
  @IsUUID()
  childId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(24)
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  activeOnly?: string;

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
  @MaxLength(32)
  sort?: string;
}

export class ParentSmartPickupRecentCallChildDto {
  id!: string;
  displayName!: string;
  grade!: string | null;
  section!: string | null;
  classroom!: string | null;
}

export class ParentSmartPickupRecentCallGateDto {
  id!: string;
  code!: string;
  name!: string;
  status!: PublicDismissalGateStatus;
}

export class ParentSmartPickupRecentCallPickupDto {
  codeRequired!: boolean;
  codeIssued!: boolean;
}

export class ParentSmartPickupRecentCallTimelineEventDto {
  type!: 'request_created' | 'request_status_changed';
  statusFrom!: ParentSmartPickupRecentStatus | null;
  statusTo!: ParentSmartPickupRecentStatus | null;
  createdAt!: string;
  note!: string | null;
}

export class ParentSmartPickupRecentCallDto {
  id!: string;
  status!: ParentSmartPickupRecentStatus;
  requestedAt!: string;
  updatedAt!: string;
  canCancel!: boolean;
  child!: ParentSmartPickupRecentCallChildDto;
  gate!: ParentSmartPickupRecentCallGateDto;
  pickup!: ParentSmartPickupRecentCallPickupDto;
  timeline!: ParentSmartPickupRecentCallTimelineEventDto[];
}

export class ParentSmartPickupRecentCallsSummaryDto {
  totalCount!: number;
  activeCount!: number;
  requestedCount!: number;
  queuedCount!: number;
  calledCount!: number;
  movingCount!: number;
  atGateCount!: number;
  readyCount!: number;
  handedOverCount!: number;
  cancelledCount!: number;
  expiredCount!: number;
  cancellableCount!: number;
}

export class ParentSmartPickupRecentCallsPaginationDto {
  page!: number;
  limit!: number;
  totalPages!: number;
}

export class ParentSmartPickupRecentCallsResponseDto {
  data!: ParentSmartPickupRecentCallDto[];
  summary!: ParentSmartPickupRecentCallsSummaryDto;
  pagination!: ParentSmartPickupRecentCallsPaginationDto;
}
