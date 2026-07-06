import { IsOptional, IsString, MaxLength } from 'class-validator';
import {
  DismissalRequestChildDto,
  DismissalRequestGateDto,
  DismissalRequestTimelineEventDto,
} from './dismissal-request-query.dto';

export class DeliverDismissalRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  pickupRecipientToken?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  pickupCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string | null;
}

export class DismissalRequestDeliveryReceiverDto {
  name!: string | null;
  relation!: string | null;
  verified!: true;
  source!: 'guardian_link';
}

export class DismissalRequestDeliveryItemDto {
  id!: string;
  status!: 'handed_over';
  previousStatus!: 'ready';
  handedOverAt!: string;
  pickupCodeVerified!: boolean;
  pickupRecipientVerified!: true;
  child!: DismissalRequestChildDto;
  gate!: DismissalRequestGateDto;
  receiver!: DismissalRequestDeliveryReceiverDto;
  timeline!: DismissalRequestTimelineEventDto[];
}

export class DeliverDismissalRequestResponseDto {
  delivery!: DismissalRequestDeliveryItemDto;
}
