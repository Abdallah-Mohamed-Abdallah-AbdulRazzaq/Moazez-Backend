import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import {
  PublicDismissalGateStatus,
  PublicDismissalRequestStatus,
} from '../../shared/dismissal.types';

export class ListActiveDismissalRequestsQueryDto {
  @IsOptional()
  status?: string;

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
  @IsString()
  @MaxLength(120)
  q?: string;

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
  sort?: string;
}

export class DismissalRequestSignalsDto {
  delayed!: boolean;
  urgent!: boolean;
  delayThresholdMinutes!: number;
  urgentThresholdMinutes!: number;
}

export class DismissalRequestChildDto {
  id!: string;
  displayName!: string;
  grade!: string | null;
  section!: string | null;
  classroom!: string | null;
}

export class DismissalRequestGateDto {
  id!: string;
  code!: string;
  name!: string;
  status!: PublicDismissalGateStatus;
}

export class DismissalRequestRequesterDto {
  displayName!: string | null;
}

export class ActiveDismissalRequestQueueItemDto {
  id!: string;
  status!: PublicDismissalRequestStatus;
  requestedAt!: string;
  waitMinutes!: number;
  signals!: DismissalRequestSignalsDto;
  child!: DismissalRequestChildDto;
  gate!: DismissalRequestGateDto;
  requester!: DismissalRequestRequesterDto;
}

export class ActiveDismissalRequestsSummaryDto {
  totalCount!: number;
  requestedCount!: number;
  queuedCount!: number;
  calledCount!: number;
  movingCount!: number;
  atGateCount!: number;
  readyCount!: number;
  delayedCount!: number;
  urgentCount!: number;
}

export class ActiveDismissalRequestsPaginationDto {
  page!: number;
  limit!: number;
  totalPages!: number;
}

export class ActiveDismissalRequestsListResponseDto {
  data!: ActiveDismissalRequestQueueItemDto[];
  summary!: ActiveDismissalRequestsSummaryDto;
  pagination!: ActiveDismissalRequestsPaginationDto;
}

export class DismissalRequestTimelineEventDto {
  type!: 'request_created' | 'request_status_changed';
  statusFrom!: string | null;
  statusTo!: string | null;
  createdAt!: string;
  note!: string | null;
}

export class DismissalRequestDetailItemDto extends ActiveDismissalRequestQueueItemDto {
  timeline!: DismissalRequestTimelineEventDto[];
}

export class DismissalRequestDetailResponseDto {
  request!: DismissalRequestDetailItemDto;
}
