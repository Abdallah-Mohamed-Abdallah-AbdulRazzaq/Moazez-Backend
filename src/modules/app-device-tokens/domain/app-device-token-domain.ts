import { HttpStatus } from '@nestjs/common';
import {
  AppDeviceTokenPlatform,
  AppDeviceTokenSurface,
} from '@prisma/client';
import { DomainException } from '../../../common/exceptions/domain-exception';

export const APP_DEVICE_TOKEN_MIN_LENGTH = 10;
export const APP_DEVICE_TOKEN_MAX_LENGTH = 4096;
export const APP_DEVICE_TOKEN_DEVICE_ID_MAX_LENGTH = 200;
export const APP_DEVICE_TOKEN_APP_VERSION_MAX_LENGTH = 100;
export const APP_DEVICE_TOKEN_LOCALE_MAX_LENGTH = 35;
export const APP_DEVICE_TOKEN_TIMEZONE_MAX_LENGTH = 100;

export const APP_DEVICE_TOKEN_PLATFORM_VALUES = [
  'android',
  'ios',
  'web',
] as const;

export type AppDeviceTokenPlatformPublic =
  (typeof APP_DEVICE_TOKEN_PLATFORM_VALUES)[number];

export interface AppDeviceTokenRegistrationInput {
  token: string;
  platform: string;
  deviceId?: string;
  appVersion?: string;
  locale?: string;
  timezone?: string;
}

export interface NormalizedAppDeviceTokenRegistration {
  token: string;
  platform: AppDeviceTokenPlatform;
  deviceId: string | null;
  appVersion: string | null;
  locale: string | null;
  timezone: string | null;
}

export interface AppDeviceTokenUnregisterInput {
  token?: string;
  deviceId?: string;
}

export interface NormalizedAppDeviceTokenUnregister {
  token?: string;
  deviceId?: string;
}

export class AppDeviceTokenInvalidException extends DomainException {
  constructor(message: string, details?: Record<string, unknown>) {
    super({
      code: 'app_device_token.invalid',
      message,
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export function normalizeAppDeviceToken(
  value: string,
  field = 'token',
): string {
  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new AppDeviceTokenInvalidException('Device token is required', {
      field,
    });
  }

  if (normalized.length < APP_DEVICE_TOKEN_MIN_LENGTH) {
    throw new AppDeviceTokenInvalidException('Device token is too short', {
      field,
      minLength: APP_DEVICE_TOKEN_MIN_LENGTH,
    });
  }

  if (normalized.length > APP_DEVICE_TOKEN_MAX_LENGTH) {
    throw new AppDeviceTokenInvalidException('Device token is too long', {
      field,
      maxLength: APP_DEVICE_TOKEN_MAX_LENGTH,
    });
  }

  return normalized;
}

export function normalizeAppDeviceTokenPlatform(
  value: string,
): AppDeviceTokenPlatform {
  switch (value.trim().toLowerCase()) {
    case 'android':
      return AppDeviceTokenPlatform.ANDROID;
    case 'ios':
      return AppDeviceTokenPlatform.IOS;
    case 'web':
      return AppDeviceTokenPlatform.WEB;
    default:
      throw new AppDeviceTokenInvalidException(
        'Device token platform is invalid',
        { field: 'platform', value },
      );
  }
}

export function presentAppDeviceTokenPlatform(
  value: AppDeviceTokenPlatform,
): AppDeviceTokenPlatformPublic {
  switch (value) {
    case AppDeviceTokenPlatform.ANDROID:
      return 'android';
    case AppDeviceTokenPlatform.IOS:
      return 'ios';
    case AppDeviceTokenPlatform.WEB:
      return 'web';
  }
}

export function presentAppDeviceTokenSurface(
  value: AppDeviceTokenSurface,
): 'parent' | 'student' | 'teacher' {
  switch (value) {
    case AppDeviceTokenSurface.PARENT:
      return 'parent';
    case AppDeviceTokenSurface.STUDENT:
      return 'student';
    case AppDeviceTokenSurface.TEACHER:
      return 'teacher';
  }
}

export function normalizeAppDeviceTokenRegistration(
  input: AppDeviceTokenRegistrationInput,
): NormalizedAppDeviceTokenRegistration {
  return {
    token: normalizeAppDeviceToken(input.token),
    platform: normalizeAppDeviceTokenPlatform(input.platform),
    deviceId: normalizeOptionalDeviceTokenText(
      input.deviceId,
      'deviceId',
      APP_DEVICE_TOKEN_DEVICE_ID_MAX_LENGTH,
    ),
    appVersion: normalizeOptionalDeviceTokenText(
      input.appVersion,
      'appVersion',
      APP_DEVICE_TOKEN_APP_VERSION_MAX_LENGTH,
    ),
    locale: normalizeOptionalDeviceTokenText(
      input.locale,
      'locale',
      APP_DEVICE_TOKEN_LOCALE_MAX_LENGTH,
    ),
    timezone: normalizeOptionalDeviceTokenText(
      input.timezone,
      'timezone',
      APP_DEVICE_TOKEN_TIMEZONE_MAX_LENGTH,
    ),
  };
}

export function normalizeAppDeviceTokenUnregister(
  input: AppDeviceTokenUnregisterInput,
): NormalizedAppDeviceTokenUnregister {
  const token =
    typeof input.token === 'undefined'
      ? undefined
      : normalizeAppDeviceToken(input.token);
  const deviceId =
    normalizeOptionalDeviceTokenText(
      input.deviceId,
      'deviceId',
      APP_DEVICE_TOKEN_DEVICE_ID_MAX_LENGTH,
    ) ?? undefined;

  if (!token && !deviceId) {
    throw new AppDeviceTokenInvalidException(
      'Either token or deviceId is required',
      { field: 'token' },
    );
  }

  return {
    ...(token ? { token } : {}),
    ...(deviceId ? { deviceId } : {}),
  };
}

function normalizeOptionalDeviceTokenText(
  value: string | undefined,
  field: string,
  maxLength: number,
): string | null {
  if (typeof value === 'undefined' || value === null) return null;

  const normalized = value.trim();
  if (normalized.length === 0) return null;

  if (normalized.length > maxLength) {
    throw new AppDeviceTokenInvalidException(`${field} is too long`, {
      field,
      maxLength,
    });
  }

  return normalized;
}
