import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { Env } from '../../../config/env.validation';
import {
  APP_DEVICE_TOKEN_KEY_FAMILY,
  decryptVersionedSecret,
  encryptSecretV2,
  LEGACY_SECRET_KEY_ENV_NAME,
  resolveLegacySecretKey,
  resolveSecretKeyring,
  SecretKeyring,
  SecretRuntimeEnvironment,
} from '../../../shared/crypto/versioned-secret-crypto';
import { normalizeAppDeviceToken } from './app-device-token-domain';

export function resolveAppDeviceTokenKeyring(
  environment: Record<string, string | undefined>,
  nodeEnvironment: SecretRuntimeEnvironment,
): SecretKeyring {
  return resolveSecretKeyring(
    environment,
    APP_DEVICE_TOKEN_KEY_FAMILY,
    nodeEnvironment,
  );
}

export function resolveAppDeviceTokenSecretKey(
  rawKey: string | undefined,
  nodeEnvironment: SecretRuntimeEnvironment = 'development',
): Buffer | undefined {
  return resolveLegacySecretKey(
    rawKey,
    nodeEnvironment,
    APP_DEVICE_TOKEN_KEY_FAMILY,
  );
}

export function hashAppDeviceToken(token: string): string {
  return createHash('sha256')
    .update(normalizeAppDeviceToken(token), 'utf8')
    .digest('hex');
}

export function encryptAppDeviceToken(
  token: string,
  keyring: SecretKeyring,
): string {
  return encryptSecretV2(normalizeAppDeviceToken(token), keyring);
}

export function decryptAppDeviceToken(
  cipherText: string,
  keyring: SecretKeyring,
  legacyKey?: Buffer,
): string {
  return decryptVersionedSecret(cipherText, keyring, legacyKey);
}

@Injectable()
export class AppDeviceTokenCrypto {
  private readonly keyring: SecretKeyring;
  private readonly legacyKey: Buffer | undefined;

  constructor(private readonly configService: ConfigService<Env>) {
    const nodeEnvironment = (this.configService.get<string>('NODE_ENV') ??
      process.env.NODE_ENV ??
      'development') as SecretRuntimeEnvironment;
    const environment = readFamilyEnvironment(this.configService);
    this.keyring = resolveAppDeviceTokenKeyring(environment, nodeEnvironment);
    this.legacyKey = resolveAppDeviceTokenSecretKey(
      environment[LEGACY_SECRET_KEY_ENV_NAME],
      nodeEnvironment,
    );
  }

  normalize(token: string): string {
    return normalizeAppDeviceToken(token);
  }

  hash(token: string): string {
    return hashAppDeviceToken(token);
  }

  encrypt(token: string): string {
    return encryptAppDeviceToken(token, this.keyring);
  }

  decrypt(cipherText: string): string {
    return decryptAppDeviceToken(cipherText, this.keyring, this.legacyKey);
  }
}

function readFamilyEnvironment(
  configService: ConfigService<Env>,
): Record<string, string | undefined> {
  return {
    [APP_DEVICE_TOKEN_KEY_FAMILY.activeKeyIdEnvironmentName]:
      configService.get<string>(
        APP_DEVICE_TOKEN_KEY_FAMILY.activeKeyIdEnvironmentName,
      ),
    [APP_DEVICE_TOKEN_KEY_FAMILY.activeKeyEnvironmentName]:
      configService.get<string>(
        APP_DEVICE_TOKEN_KEY_FAMILY.activeKeyEnvironmentName,
      ),
    [APP_DEVICE_TOKEN_KEY_FAMILY.previousKeyIdEnvironmentName]:
      configService.get<string>(
        APP_DEVICE_TOKEN_KEY_FAMILY.previousKeyIdEnvironmentName,
      ),
    [APP_DEVICE_TOKEN_KEY_FAMILY.previousKeyEnvironmentName]:
      configService.get<string>(
        APP_DEVICE_TOKEN_KEY_FAMILY.previousKeyEnvironmentName,
      ),
    [LEGACY_SECRET_KEY_ENV_NAME]: configService.get<string>(
      LEGACY_SECRET_KEY_ENV_NAME,
    ),
  };
}
