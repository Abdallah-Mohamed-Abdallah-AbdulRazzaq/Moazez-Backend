import {
  decryptAppDeviceToken,
  encryptAppDeviceToken,
  hashAppDeviceToken,
  resolveAppDeviceTokenSecretKey,
} from '../domain/app-device-token-crypto';
import {
  AppDeviceTokenInvalidException,
  normalizeAppDeviceToken,
} from '../domain/app-device-token-domain';
import { presentAppDeviceTokenRegistration } from '../presenters/app-device-token.presenter';
import {
  AppDeviceTokenPlatform,
  AppDeviceTokenSurface,
} from '@prisma/client';

const RAW_TOKEN = '  fcm-token-value-for-device-123  ';

describe('App device token crypto', () => {
  it('encrypts and decrypts a normalized device token', () => {
    const key = resolveAppDeviceTokenSecretKey(undefined, 'test');
    const encrypted = encryptAppDeviceToken(RAW_TOKEN, key);

    expect(encrypted).toMatch(/^v1:/);
    expect(encrypted).not.toContain('fcm-token-value-for-device-123');
    expect(decryptAppDeviceToken(encrypted, key)).toBe(
      'fcm-token-value-for-device-123',
    );
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
