import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class UpdateDismissalSettingsDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  schoolLatitude?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  schoolLongitude?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  allowedRadiusMeters?: number;

  @IsOptional()
  @IsString()
  @MaxLength(5)
  requestWindowStartLocal?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(5)
  requestWindowEndLocal?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  delayThresholdMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  urgentThresholdMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  expiryThresholdMinutes?: number;

  @IsOptional()
  @IsBoolean()
  requirePickupCode?: boolean;

  @IsOptional()
  @IsBoolean()
  allowDelegatePickup?: boolean;

  @IsOptional()
  @IsBoolean()
  allowParentCancelBeforeCalled?: boolean;

  @IsOptional()
  @IsUUID()
  defaultGateId?: string | null;
}

export class DismissalSettingsSchoolZoneDto {
  latitude!: number | null;
  longitude!: number | null;
  label!: string | null;
  source!: 'settings' | 'school_profile' | 'default';
}

export class DismissalSettingsRequestWindowDto {
  startLocal!: string | null;
  endLocal!: string | null;
}

export class DismissalSettingsThresholdsDto {
  delayMinutes!: number;
  urgentMinutes!: number;
  expiryMinutes!: number;
}

export class DismissalSettingsPoliciesDto {
  requirePickupCode!: boolean;
  allowDelegatePickup!: boolean;
  allowParentCancelBeforeCalled!: boolean;
}

export class DismissalSettingsDefaultGateDto {
  id!: string;
  code!: string;
  name!: string;
  status!: string;
}

export class DismissalSettingsResponseDto {
  enabled!: boolean;
  timezone!: string;
  schoolZone!: DismissalSettingsSchoolZoneDto;
  allowedRadiusMeters!: number;
  requestWindow!: DismissalSettingsRequestWindowDto;
  thresholds!: DismissalSettingsThresholdsDto;
  policies!: DismissalSettingsPoliciesDto;
  defaultGate!: DismissalSettingsDefaultGateDto | null;
  configured!: boolean;
  updatedAt!: string | null;
}
