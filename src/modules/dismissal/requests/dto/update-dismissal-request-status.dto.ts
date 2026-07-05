import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { PublicDismissalRequestStatus } from '../../shared/dismissal.types';
import {
  DismissalRequestGateDto,
  DismissalRequestChildDto,
  DismissalRequestSignalsDto,
  DismissalRequestTimelineEventDto,
} from './dismissal-request-query.dto';

export class UpdateDismissalRequestStatusDto {
  @IsString()
  @IsNotEmpty()
  status!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string | null;
}

export class DismissalRequestStatusUpdateItemDto {
  id!: string;
  status!: Exclude<PublicDismissalRequestStatus, 'requested'>;
  previousStatus!: PublicDismissalRequestStatus | null;
  changed!: boolean;
  requestedAt!: string;
  updatedAt!: string;
  waitMinutes!: number;
  signals!: DismissalRequestSignalsDto;
  child!: DismissalRequestChildDto;
  gate!: DismissalRequestGateDto;
  timeline!: DismissalRequestTimelineEventDto[];
}

export class DismissalRequestStatusUpdateResponseDto {
  request!: DismissalRequestStatusUpdateItemDto;
}
