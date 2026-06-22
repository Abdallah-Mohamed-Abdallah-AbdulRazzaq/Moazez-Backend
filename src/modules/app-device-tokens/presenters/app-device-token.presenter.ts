import { AppDeviceTokenSurface } from '@prisma/client';
import {
  presentAppDeviceTokenPlatform,
  presentAppDeviceTokenSurface,
} from '../domain/app-device-token-domain';
import { AppDeviceTokenSafeRecord } from '../infrastructure/app-device-token.repository';

export type AppDeviceTokenAliasStyle = 'camel' | 'dual';

export interface AppDeviceTokenRegisterView {
  deviceTokenId: string;
  platform: string;
  appSurface: string;
  isActive: boolean;
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;
  revokedAt: string | null;
  device_token_id?: string;
  app_surface?: string;
  is_active?: boolean;
  last_seen_at?: string;
  created_at?: string;
  updated_at?: string;
  revoked_at?: string | null;
}

export interface AppDeviceTokenUnregisterView {
  deviceTokenId: string | null;
  platform?: string;
  appSurface: string;
  isActive?: boolean;
  lastSeenAt?: string;
  createdAt?: string;
  updatedAt?: string;
  revokedAt: string | null;
  revoked: boolean;
  device_token_id?: string | null;
  app_surface?: string;
  is_active?: boolean;
  last_seen_at?: string;
  created_at?: string;
  updated_at?: string;
  revoked_at?: string | null;
}

export function presentAppDeviceTokenRegistration(params: {
  token: AppDeviceTokenSafeRecord;
  aliasStyle: AppDeviceTokenAliasStyle;
}): AppDeviceTokenRegisterView {
  const base = {
    deviceTokenId: params.token.id,
    platform: presentAppDeviceTokenPlatform(params.token.platform),
    appSurface: presentAppDeviceTokenSurface(params.token.appSurface),
    isActive: params.token.isActive,
    lastSeenAt: params.token.lastSeenAt.toISOString(),
    createdAt: params.token.createdAt.toISOString(),
    updatedAt: params.token.updatedAt.toISOString(),
    revokedAt: params.token.revokedAt?.toISOString() ?? null,
  };

  if (params.aliasStyle !== 'dual') return base;

  return {
    ...base,
    device_token_id: base.deviceTokenId,
    app_surface: base.appSurface,
    is_active: base.isActive,
    last_seen_at: base.lastSeenAt,
    created_at: base.createdAt,
    updated_at: base.updatedAt,
    revoked_at: base.revokedAt,
  };
}

export function presentAppDeviceTokenUnregistration(params: {
  token: AppDeviceTokenSafeRecord | null;
  appSurface: AppDeviceTokenSurface;
  revoked: boolean;
  aliasStyle: AppDeviceTokenAliasStyle;
}): AppDeviceTokenUnregisterView {
  const base = params.token
    ? {
        deviceTokenId: params.token.id,
        platform: presentAppDeviceTokenPlatform(params.token.platform),
        appSurface: presentAppDeviceTokenSurface(params.token.appSurface),
        isActive: params.token.isActive,
        lastSeenAt: params.token.lastSeenAt.toISOString(),
        createdAt: params.token.createdAt.toISOString(),
        updatedAt: params.token.updatedAt.toISOString(),
        revokedAt: params.token.revokedAt?.toISOString() ?? null,
        revoked: params.revoked,
      }
    : {
        deviceTokenId: null,
        appSurface: presentAppDeviceTokenSurface(params.appSurface),
        revokedAt: null,
        revoked: false,
      };

  if (params.aliasStyle !== 'dual') return base;

  return {
    ...base,
    device_token_id: base.deviceTokenId,
    app_surface: base.appSurface,
    ...(typeof base.isActive !== 'undefined'
      ? { is_active: base.isActive }
      : {}),
    ...(typeof base.lastSeenAt !== 'undefined'
      ? { last_seen_at: base.lastSeenAt }
      : {}),
    ...(typeof base.createdAt !== 'undefined'
      ? { created_at: base.createdAt }
      : {}),
    ...(typeof base.updatedAt !== 'undefined'
      ? { updated_at: base.updatedAt }
      : {}),
    revoked_at: base.revokedAt,
  };
}
