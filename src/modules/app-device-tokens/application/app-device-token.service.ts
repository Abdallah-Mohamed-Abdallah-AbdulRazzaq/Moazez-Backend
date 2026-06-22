import { Injectable } from '@nestjs/common';
import { AppDeviceTokenSurface } from '@prisma/client';
import {
  AppDeviceTokenRegistrationInput,
  AppDeviceTokenUnregisterInput,
  normalizeAppDeviceTokenRegistration,
  normalizeAppDeviceTokenUnregister,
} from '../domain/app-device-token-domain';
import { AppDeviceTokenCrypto } from '../domain/app-device-token-crypto';
import { AppDeviceTokenRepository } from '../infrastructure/app-device-token.repository';
import {
  AppDeviceTokenAliasStyle,
  AppDeviceTokenRegisterView,
  AppDeviceTokenUnregisterView,
  presentAppDeviceTokenRegistration,
  presentAppDeviceTokenUnregistration,
} from '../presenters/app-device-token.presenter';

export interface RegisterAppDeviceTokenForActorInput {
  schoolId: string;
  userId: string;
  appSurface: AppDeviceTokenSurface;
  body: AppDeviceTokenRegistrationInput;
  aliasStyle: AppDeviceTokenAliasStyle;
}

export interface UnregisterAppDeviceTokenForActorInput {
  schoolId: string;
  userId: string;
  appSurface: AppDeviceTokenSurface;
  body: AppDeviceTokenUnregisterInput;
  aliasStyle: AppDeviceTokenAliasStyle;
}

@Injectable()
export class AppDeviceTokenService {
  constructor(
    private readonly repository: AppDeviceTokenRepository,
    private readonly crypto: AppDeviceTokenCrypto,
  ) {}

  async registerForActor(
    input: RegisterAppDeviceTokenForActorInput,
  ): Promise<AppDeviceTokenRegisterView> {
    const normalized = normalizeAppDeviceTokenRegistration(input.body);
    const token = await this.repository.upsertCurrentSchoolActorToken({
      schoolId: input.schoolId,
      userId: input.userId,
      tokenHash: this.crypto.hash(normalized.token),
      tokenCiphertext: this.crypto.encrypt(normalized.token),
      platform: normalized.platform,
      appSurface: input.appSurface,
      deviceId: normalized.deviceId,
      appVersion: normalized.appVersion,
      locale: normalized.locale,
      timezone: normalized.timezone,
    });

    return presentAppDeviceTokenRegistration({
      token,
      aliasStyle: input.aliasStyle,
    });
  }

  async unregisterForActor(
    input: UnregisterAppDeviceTokenForActorInput,
  ): Promise<AppDeviceTokenUnregisterView> {
    const normalized = normalizeAppDeviceTokenUnregister(input.body);
    const result = await this.repository.revokeCurrentSchoolActorToken({
      schoolId: input.schoolId,
      userId: input.userId,
      appSurface: input.appSurface,
      ...(normalized.token ? { tokenHash: this.crypto.hash(normalized.token) } : {}),
      ...(normalized.deviceId ? { deviceId: normalized.deviceId } : {}),
    });

    return presentAppDeviceTokenUnregistration({
      token: result.token,
      appSurface: input.appSurface,
      revoked: result.revoked,
      aliasStyle: input.aliasStyle,
    });
  }
}
