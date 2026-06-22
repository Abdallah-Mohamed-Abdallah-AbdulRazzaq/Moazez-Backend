import { Transform } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import {
  APP_DEVICE_TOKEN_APP_VERSION_MAX_LENGTH,
  APP_DEVICE_TOKEN_DEVICE_ID_MAX_LENGTH,
  APP_DEVICE_TOKEN_LOCALE_MAX_LENGTH,
  APP_DEVICE_TOKEN_MAX_LENGTH,
  APP_DEVICE_TOKEN_PLATFORM_VALUES,
  APP_DEVICE_TOKEN_TIMEZONE_MAX_LENGTH,
} from '../domain/app-device-token-domain';

function trimRequiredString(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function trimOptionalString(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return undefined;
  return typeof value === 'string' ? value.trim() : value;
}

function lowerPlatform(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return value;
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

export class RegisterAppDeviceTokenDto {
  @Transform(({ value }) => trimRequiredString(value))
  @IsString()
  @MaxLength(APP_DEVICE_TOKEN_MAX_LENGTH)
  token!: string;

  @Transform(({ value }) => lowerPlatform(value))
  @IsString()
  @IsIn(APP_DEVICE_TOKEN_PLATFORM_VALUES)
  platform!: string;

  @IsOptional()
  @Transform(({ value }) => trimOptionalString(value))
  @IsString()
  @MaxLength(APP_DEVICE_TOKEN_DEVICE_ID_MAX_LENGTH)
  deviceId?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptionalString(value))
  @IsString()
  @MaxLength(APP_DEVICE_TOKEN_APP_VERSION_MAX_LENGTH)
  appVersion?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptionalString(value))
  @IsString()
  @MaxLength(APP_DEVICE_TOKEN_LOCALE_MAX_LENGTH)
  locale?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptionalString(value))
  @IsString()
  @MaxLength(APP_DEVICE_TOKEN_TIMEZONE_MAX_LENGTH)
  timezone?: string;
}

export class UnregisterAppDeviceTokenDto {
  @ValidateIf((body, value) => value !== undefined || !body.deviceId)
  @Transform(({ value }) => trimOptionalString(value))
  @IsString()
  @MaxLength(APP_DEVICE_TOKEN_MAX_LENGTH)
  token?: string;

  @ValidateIf((body, value) => value !== undefined || !body.token)
  @Transform(({ value }) => trimOptionalString(value))
  @IsString()
  @MaxLength(APP_DEVICE_TOKEN_DEVICE_ID_MAX_LENGTH)
  deviceId?: string;
}

export class AppDeviceTokenRegisterResponseDto {
  deviceTokenId!: string;
  platform!: string;
  appSurface!: string;
  isActive!: boolean;
  lastSeenAt!: string;
  createdAt!: string;
  updatedAt!: string;
  revokedAt!: string | null;
}

export class AppDeviceTokenDualRegisterResponseDto extends AppDeviceTokenRegisterResponseDto {
  device_token_id!: string;
  app_surface!: string;
  is_active!: boolean;
  last_seen_at!: string;
  created_at!: string;
  updated_at!: string;
  revoked_at!: string | null;
}

export class AppDeviceTokenUnregisterResponseDto {
  deviceTokenId!: string | null;
  platform?: string;
  appSurface!: string;
  isActive?: boolean;
  lastSeenAt?: string;
  createdAt?: string;
  updatedAt?: string;
  revokedAt!: string | null;
  revoked!: boolean;
}

export class AppDeviceTokenDualUnregisterResponseDto extends AppDeviceTokenUnregisterResponseDto {
  device_token_id!: string | null;
  app_surface!: string;
  is_active?: boolean;
  last_seen_at?: string;
  created_at?: string;
  updated_at?: string;
  revoked_at!: string | null;
}
