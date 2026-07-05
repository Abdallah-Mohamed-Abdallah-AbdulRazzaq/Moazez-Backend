import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  PublicDismissalArrivalState,
  PublicDismissalWaitingStudentStatus,
} from '../../shared/dismissal.types';
import {
  ActiveDismissalRequestsPaginationDto,
  DismissalRequestChildDto,
  DismissalRequestGateDto,
  DismissalRequestSignalsDto,
  DismissalRequestTimelineEventDto,
} from '../../requests/dto/dismissal-request-query.dto';

export class ListDismissalWaitingStudentsQueryDto {
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

export class DismissalWaitingStudentItemDto {
  id!: string;
  status!: PublicDismissalWaitingStudentStatus;
  arrivalState!: PublicDismissalArrivalState;
  requestedAt!: string;
  updatedAt!: string;
  waitMinutes!: number;
  signals!: DismissalRequestSignalsDto;
  child!: DismissalRequestChildDto;
  gate!: DismissalRequestGateDto;
}

export class DismissalWaitingStudentsSummaryDto {
  totalCount!: number;
  calledCount!: number;
  movingCount!: number;
  atGateCount!: number;
  readyCount!: number;
  arrivedCount!: number;
  notArrivedCount!: number;
  delayedCount!: number;
  urgentCount!: number;
}

export class DismissalWaitingStudentsListResponseDto {
  data!: DismissalWaitingStudentItemDto[];
  summary!: DismissalWaitingStudentsSummaryDto;
  pagination!: ActiveDismissalRequestsPaginationDto;
}

export class DismissalWaitingStudentArrivalItemDto extends DismissalWaitingStudentItemDto {
  previousStatus!: PublicDismissalWaitingStudentStatus | null;
  changed!: boolean;
  timeline!: DismissalRequestTimelineEventDto[];
}

export class ConfirmStudentArrivalResponseDto {
  student!: DismissalWaitingStudentArrivalItemDto;
}
