import { IsOptional, IsString, MaxLength } from 'class-validator';
import {
  DismissalRequestChildDto,
  DismissalRequestGateDto,
  DismissalRequestTimelineEventDto,
} from './dismissal-request-query.dto';

export class DeliverDismissalRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(32)
  pickupCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  receiverName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  receiverRelation?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string | null;
}

export class DismissalRequestDeliveryReceiverDto {
  name!: string | null;
  relation!: string | null;
}

export class DismissalRequestDeliveryItemDto {
  id!: string;
  status!: 'handed_over';
  previousStatus!: 'ready';
  handedOverAt!: string;
  pickupCodeVerified!: boolean;
  child!: DismissalRequestChildDto;
  gate!: DismissalRequestGateDto;
  receiver!: DismissalRequestDeliveryReceiverDto;
  timeline!: DismissalRequestTimelineEventDto[];
}

export class DeliverDismissalRequestResponseDto {
  delivery!: DismissalRequestDeliveryItemDto;
}
