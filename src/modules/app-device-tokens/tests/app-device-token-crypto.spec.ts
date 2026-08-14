import { AppDeviceTokenPlatform, AppDeviceTokenSurface } from '@prisma/client';
import { createCipheriv, randomBytes } from 'node:crypto';
import {
  APP_DEVICE_TOKEN_KEY_FAMILY,
  EMAIL_SECRET_KEY_FAMILY,
  parseConfiguredSecretKey,
  SecretKeyring,
} from '../../../shared/crypto/versioned-secret-crypto';
import {
  decryptEmailSecret,
  encryptEmailSecret,
  resolveEmailSecretKeyring,
} from '../../settings/email/domain/email-secret-crypto';
import {
  decryptAppDeviceToken,
  encryptAppDeviceToken,
  hashAppDeviceToken,
  resolveAppDeviceTokenKeyring,
  resolveAppDeviceTokenSecretKey,
} from '../domain/app-device-token-crypto';
import {
  AppDeviceTokenInvalidException,
  normalizeAppDeviceToken,
} from '../domain/app-device-token-domain';
import { presentAppDeviceTokenRegistration } from '../presenters/app-device-token.presenter';

const RAW_TOKEN = '  fcm-token-value-for-device-123  ';
const ACTIVE_KEY = `hex:${'66'.repeat(32)}`;
const PREVIOUS_KEY = `hex:${'77'.repeat(32)}`;
const LEGACY_KEY = `hex:${'88'.repeat(32)}`;

describe('App device token crypto', () => {
  it('emits v2 and decrypts a normalized token using the active key', () => {
    const keyring = deviceKeyring();
    const encrypted = encryptAppDeviceToken(RAW_TOKEN, keyring);

    expect(encrypted).toMatch(/^v2:device-active:/u);
    expect(encrypted).not.toContain('fcm-token-value-for-device-123');
    expect(decryptAppDeviceToken(encrypted, keyring)).toBe(
      'fcm-token-value-for-device-123',
    );
  });

  it('decrypts v2 ciphertext selected by the previous key ID', () => {
    const keyring = deviceKeyring();
    const previousWriter: SecretKeyring = {
      family: keyring.family,
      active: keyring.previous!,
    };
    const encrypted = encryptAppDeviceToken(RAW_TOKEN, previousWriter);

    expect(encrypted).toMatch(/^v2:device-previous:/u);
    expect(decryptAppDeviceToken(encrypted, keyring)).toBe(
      'fcm-token-value-for-device-123',
    );
  });

  it('reads configured and family-specific local legacy v1 ciphertext', () => {
    const configuredLegacy = resolveAppDeviceTokenSecretKey(
      LEGACY_KEY,
      'production',
    );
    const configuredCiphertext = createLegacyV1(
      'legacy-device-token-value',
      configuredLegacy!,
    );
    expect(
      decryptAppDeviceToken(
        configuredCiphertext,
        deviceKeyring(),
        configuredLegacy,
      ),
    ).toBe('legacy-device-token-value');

    const localLegacy = resolveAppDeviceTokenSecretKey(undefined, 'test');
    const localCiphertext = createLegacyV1(
      'local-device-token-value',
      localLegacy!,
    );
    expect(
      decryptAppDeviceToken(
        localCiphertext,
        resolveAppDeviceTokenKeyring({}, 'test'),
        localLegacy,
      ),
    ).toBe('local-device-token-value');
  });

  it('fails a strict-runtime v1 read without the optional legacy key', () => {
    const ciphertext = createLegacyV1(
      'legacy-device-token-value',
      parseConfiguredSecretKey(LEGACY_KEY, 'test-fixture-key'),
    );
    const missingLegacy = resolveAppDeviceTokenSecretKey(
      undefined,
      'production',
    );

    expect(missingLegacy).toBeUndefined();
    expect(() =>
      decryptAppDeviceToken(ciphertext, deviceKeyring(), missingLegacy),
    ).toThrow(/Legacy encrypted secret key is not configured/u);
  });

  it('cryptographically separates families even when their key IDs match', () => {
    const sharedKeyId = 'same-key-id';
    const emailKeyring = resolveEmailSecretKeyring(
      {
        [EMAIL_SECRET_KEY_FAMILY.activeKeyIdEnvironmentName]: sharedKeyId,
        [EMAIL_SECRET_KEY_FAMILY.activeKeyEnvironmentName]: `hex:${'99'.repeat(32)}`,
      },
      'production',
    );
    const deviceKeyring = resolveAppDeviceTokenKeyring(
      {
        [APP_DEVICE_TOKEN_KEY_FAMILY.activeKeyIdEnvironmentName]: sharedKeyId,
        [APP_DEVICE_TOKEN_KEY_FAMILY.activeKeyEnvironmentName]: `hex:${'aa'.repeat(32)}`,
      },
      'production',
    );
    const emailCiphertext = encryptEmailSecret(
      'email-family-value',
      emailKeyring,
    );
    const deviceCiphertext = encryptAppDeviceToken(
      'device-family-token-value',
      deviceKeyring,
    );

    expect(() => decryptAppDeviceToken(emailCiphertext, deviceKeyring)).toThrow(
      /decryption failed/u,
    );
    expect(() => decryptEmailSecret(deviceCiphertext, emailKeyring)).toThrow(
      /decryption failed/u,
    );
  });

  it('authenticates family context even when key ID and key material match', () => {
    const sharedKey = parseConfiguredSecretKey(
      `hex:${'bb'.repeat(32)}`,
      'test-shared-key',
    );
    const emailKeyring: SecretKeyring = {
      family: 'smtp-secret',
      active: { id: 'shared-key-id', key: sharedKey },
    };
    const deviceKeyring: SecretKeyring = {
      family: 'app-device-token',
      active: { id: 'shared-key-id', key: sharedKey },
    };
    const emailCiphertext = encryptEmailSecret(
      'email-family-value',
      emailKeyring,
    );
    const deviceCiphertext = encryptAppDeviceToken(
      'device-family-token-value',
      deviceKeyring,
    );

    expect(() => decryptAppDeviceToken(emailCiphertext, deviceKeyring)).toThrow(
      /decryption failed/u,
    );
    expect(() => decryptEmailSecret(deviceCiphertext, emailKeyring)).toThrow(
      /decryption failed/u,
    );
  });

  it('does not include supplied ciphertext in controlled errors', () => {
    const malformed = 'v2:device-active:private-ciphertext-value';
    let message = '';
    try {
      decryptAppDeviceToken(malformed, deviceKeyring());
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).not.toContain(malformed);
    expect(message).not.toContain('private-ciphertext-value');
  });

  it('hashes deterministically after trimming and differs by token', () => {
    expect(hashAppDeviceToken(RAW_TOKEN)).toBe(
      hashAppDeviceToken('fcm-token-value-for-device-123'),
    );
    expect(hashAppDeviceToken(RAW_TOKEN)).not.toBe(
      hashAppDeviceToken('fcm-token-value-for-device-456'),
    );
  });

  it('rejects empty and too-short tokens', () => {
    expect(() => normalizeAppDeviceToken('   ')).toThrow(
      AppDeviceTokenInvalidException,
    );
    expect(() => normalizeAppDeviceToken('short')).toThrow(
      AppDeviceTokenInvalidException,
    );
  });

  it('does not include raw token, hash, ciphertext, or scope ids in safe presenter output', () => {
    const response = presentAppDeviceTokenRegistration({
      token: {
        id: 'device-token-1',
        platform: AppDeviceTokenPlatform.ANDROID,
        appSurface: AppDeviceTokenSurface.PARENT,
        isActive: true,
        lastSeenAt: new Date('2026-06-22T10:00:00.000Z'),
        revokedAt: null,
        createdAt: new Date('2026-06-22T10:00:00.000Z'),
        updatedAt: new Date('2026-06-22T10:01:00.000Z'),
      },
      aliasStyle: 'dual',
    });
    const serialized = JSON.stringify(response);

    expect(response).toMatchObject({
      deviceTokenId: 'device-token-1',
      device_token_id: 'device-token-1',
      platform: 'android',
      appSurface: 'parent',
      app_surface: 'parent',
      isActive: true,
      is_active: true,
    });
    for (const forbidden of [
      'fcm-token-value',
      'tokenHash',
      'tokenCiphertext',
      'token_hash',
      'token_ciphertext',
      'schoolId',
      'userId',
      'membershipId',
      'roleId',
      'organizationId',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});

function deviceKeyring(): SecretKeyring {
  return resolveAppDeviceTokenKeyring(
    {
      [APP_DEVICE_TOKEN_KEY_FAMILY.activeKeyIdEnvironmentName]: 'device-active',
      [APP_DEVICE_TOKEN_KEY_FAMILY.activeKeyEnvironmentName]: ACTIVE_KEY,
      [APP_DEVICE_TOKEN_KEY_FAMILY.previousKeyIdEnvironmentName]:
        'device-previous',
      [APP_DEVICE_TOKEN_KEY_FAMILY.previousKeyEnvironmentName]: PREVIOUS_KEY,
    },
    'production',
  );
}

function createLegacyV1(plainText: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plainText, 'utf8'),
    cipher.final(),
  ]);
  return [
    'v1',
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    encrypted.toString('base64url'),
  ].join(':');
}
