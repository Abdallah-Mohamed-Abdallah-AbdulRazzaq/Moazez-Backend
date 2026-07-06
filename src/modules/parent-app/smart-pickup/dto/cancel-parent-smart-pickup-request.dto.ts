import { IsOptional, IsString, MaxLength } from 'class-validator';
import {
  ParentSmartPickupRecentCallChildDto,
  ParentSmartPickupRecentCallGateDto,
  ParentSmartPickupRecentCallPickupDto,
  ParentSmartPickupRecentCallTimelineEventDto,
  ParentSmartPickupRecentStatus,
} from './parent-smart-pickup-recent-calls.dto';

export class CancelParentSmartPickupRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string | null;
}

export class CancelParentSmartPickupRequestItemDto {
  id!: string;
  status!: 'cancelled';
  previousStatus!: Extract<
    ParentSmartPickupRecentStatus,
    'requested' | 'queued' | 'cancelled'
  > | null;
  changed!: boolean;
  isActive!: false;
  isTerminal!: true;
  canCancel!: false;
  canTrack!: false;
  cancelledAt!: string | null;
  requestedAt!: string;
  updatedAt!: string;
  child!: ParentSmartPickupRecentCallChildDto;
  gate!: ParentSmartPickupRecentCallGateDto;
  pickup!: ParentSmartPickupRecentCallPickupDto;
  timeline!: ParentSmartPickupRecentCallTimelineEventDto[];
}

export class CancelParentSmartPickupRequestResponseDto {
  request!: CancelParentSmartPickupRequestItemDto;
}
