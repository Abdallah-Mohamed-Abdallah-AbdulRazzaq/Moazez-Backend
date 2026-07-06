import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type { PublicDismissalGateStatus } from '../../../dismissal/shared/dismissal.types';
import type { ParentSmartPickupRecentStatus } from './parent-smart-pickup-recent-calls.dto';

export class CreateParentSmartPickupRequestDto {
  @IsUUID()
  childId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude!: number;

  @IsOptional()
  @IsUUID()
  gateId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  clientRequestId?: string;
}

export class ParentSmartPickupRequestChildDto {
  id!: string;
  displayName!: string;
  grade!: string | null;
  section!: string | null;
  classroom!: string | null;
}

export class ParentSmartPickupRequestGateDto {
  id!: string;
  code!: string;
  name!: string;
  status!: Extract<PublicDismissalGateStatus, 'open' | 'busy'>;
}

export class ParentSmartPickupRequestPoliciesDto {
  requirePickupCode!: boolean;
  allowParentCancelBeforeCalled!: boolean;
}

export class ParentSmartPickupRequestPickupDto {
  codeRequired!: boolean;
  codeIssued!: boolean;
  codeIssuedAt?: string | null;
  code?: string;
  pickupCode?: string;
}

export class ParentSmartPickupRequestDto {
  id!: string;
  status!: Extract<ParentSmartPickupRecentStatus, 'requested'>;
  isActive!: true;
  isTerminal!: false;
  canCancel!: boolean;
  canTrack!: true;
  requestedAt!: string;
  child!: ParentSmartPickupRequestChildDto;
  gate!: ParentSmartPickupRequestGateDto;
  pickup!: ParentSmartPickupRequestPickupDto;
  policies!: ParentSmartPickupRequestPoliciesDto;
}

export class CreateParentSmartPickupRequestResponseDto {
  request!: ParentSmartPickupRequestDto;
  pickup!: ParentSmartPickupRequestPickupDto;
}
