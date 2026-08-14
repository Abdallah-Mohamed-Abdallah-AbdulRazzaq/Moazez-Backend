import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Env } from '../../../../config/env.validation';
import {
  decryptVersionedSecret,
  EMAIL_SECRET_KEY_FAMILY,
  encryptSecretV2,
  LEGACY_SECRET_KEY_ENV_NAME,
  resolveLegacySecretKey,
  resolveSecretKeyring,
  SecretKeyring,
  SecretRuntimeEnvironment,
} from '../../../../shared/crypto/versioned-secret-crypto';

export function resolveEmailSecretKeyring(
  environment: Record<string, string | undefined>,
  nodeEnvironment: SecretRuntimeEnvironment,
): SecretKeyring {
  return resolveSecretKeyring(
    environment,
    EMAIL_SECRET_KEY_FAMILY,
    nodeEnvironment,
  );
}

export function resolveEmailSecretKey(
  rawKey: string | undefined,
  nodeEnvironment: SecretRuntimeEnvironment = 'development',
): Buffer | undefined {
  return resolveLegacySecretKey(
    rawKey,
    nodeEnvironment,
    EMAIL_SECRET_KEY_FAMILY,
  );
}

export function encryptEmailSecret(
  plainText: string,
  keyring: SecretKeyring,
): string {
  return encryptSecretV2(plainText, keyring);
}

export function decryptEmailSecret(
  cipherText: string,
  keyring: SecretKeyring,
  legacyKey?: Buffer,
): string {
  return decryptVersionedSecret(cipherText, keyring, legacyKey);
}

@Injectable()
export class EmailSecretCrypto {
  private readonly keyring: SecretKeyring;
  private readonly legacyKey: Buffer | undefined;

  constructor(private readonly configService: ConfigService<Env>) {
    const nodeEnvironment = (this.configService.get<string>('NODE_ENV') ??
      process.env.NODE_ENV ??
      'development') as SecretRuntimeEnvironment;
    const environment = readFamilyEnvironment(this.configService);
    this.keyring = resolveEmailSecretKeyring(environment, nodeEnvironment);
    this.legacyKey = resolveEmailSecretKey(
      environment[LEGACY_SECRET_KEY_ENV_NAME],
      nodeEnvironment,
    );
  }

  encrypt(plainText: string): string {
    return encryptEmailSecret(plainText, this.keyring);
  }

  decrypt(cipherText: string): string {
    return decryptEmailSecret(cipherText, this.keyring, this.legacyKey);
  }
}

function readFamilyEnvironment(
  configService: ConfigService<Env>,
): Record<string, string | undefined> {
  return {
    [EMAIL_SECRET_KEY_FAMILY.activeKeyIdEnvironmentName]:
      configService.get<string>(
        EMAIL_SECRET_KEY_FAMILY.activeKeyIdEnvironmentName,
      ),
    [EMAIL_SECRET_KEY_FAMILY.activeKeyEnvironmentName]:
      configService.get<string>(
        EMAIL_SECRET_KEY_FAMILY.activeKeyEnvironmentName,
      ),
    [EMAIL_SECRET_KEY_FAMILY.previousKeyIdEnvironmentName]:
      configService.get<string>(
        EMAIL_SECRET_KEY_FAMILY.previousKeyIdEnvironmentName,
      ),
    [EMAIL_SECRET_KEY_FAMILY.previousKeyEnvironmentName]:
      configService.get<string>(
        EMAIL_SECRET_KEY_FAMILY.previousKeyEnvironmentName,
      ),
    [LEGACY_SECRET_KEY_ENV_NAME]: configService.get<string>(
      LEGACY_SECRET_KEY_ENV_NAME,
    ),
  };
}
