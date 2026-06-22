import {
  AppDeviceTokenPlatform,
  AppDeviceTokenSurface,
} from '@prisma/client';
import { AppDeviceTokenService } from '../application/app-device-token.service';
import { AppDeviceTokenCrypto } from '../domain/app-device-token-crypto';
import { AppDeviceTokenRepository } from '../infrastructure/app-device-token.repository';

const SCHOOL_ID = 'school-1';
const USER_ID = 'user-1';
const RAW_TOKEN = '  fcm-token-value-for-device-123  ';

describe('AppDeviceTokenService', () => {
  it('registers an encrypted current actor token and returns a safe dual-alias response', async () => {
    const { service, repository, crypto } = createService();

    const result = await service.registerForActor({
      schoolId: SCHOOL_ID,
      userId: USER_ID,
      appSurface: AppDeviceTokenSurface.PARENT,
      aliasStyle: 'dual',
      body: {
        token: RAW_TOKEN,
        platform: 'ANDROID',
        deviceId: ' device-1 ',
        appVersion: ' 1.0.0 ',
        locale: ' en-US ',
        timezone: ' Africa/Cairo ',
      },
    });

    expect(crypto.hash).toHaveBeenCalledWith('fcm-token-value-for-device-123');
    expect(crypto.encrypt).toHaveBeenCalledWith(
      'fcm-token-value-for-device-123',
    );
    expect(repository.upsertCurrentSchoolActorToken).toHaveBeenCalledWith({
      schoolId: SCHOOL_ID,
      userId: USER_ID,
      tokenHash: 'hashed-token',
      tokenCiphertext: 'v1:ciphertext',
      platform: AppDeviceTokenPlatform.ANDROID,
      appSurface: AppDeviceTokenSurface.PARENT,
      deviceId: 'device-1',
      appVersion: '1.0.0',
      locale: 'en-US',
      timezone: 'Africa/Cairo',
    });
    expect(result).toMatchObject({
      deviceTokenId: 'device-token-1',
      device_token_id: 'device-token-1',
      platform: 'android',
      appSurface: 'parent',
      app_surface: 'parent',
      isActive: true,
      is_active: true,
    });
    assertNoUnsafeTokenFields(result);
  });

  it('unregisters by token and deviceId inside the current actor scope', async () => {
    const { service, repository, crypto } = createService({
      revokeCurrentSchoolActorToken: jest.fn().mockResolvedValue({
        token: tokenRecord({
          appSurface: AppDeviceTokenSurface.STUDENT,
          isActive: false,
          revokedAt: new Date('2026-06-22T10:05:00.000Z'),
        }),
        revoked: true,
      }),
    });

    const result = await service.unregisterForActor({
      schoolId: SCHOOL_ID,
      userId: USER_ID,
      appSurface: AppDeviceTokenSurface.STUDENT,
      aliasStyle: 'dual',
      body: {
        token: RAW_TOKEN,
        deviceId: ' device-1 ',
      },
    });

    expect(crypto.hash).toHaveBeenCalledWith('fcm-token-value-for-device-123');
    expect(repository.revokeCurrentSchoolActorToken).toHaveBeenCalledWith({
      schoolId: SCHOOL_ID,
      userId: USER_ID,
      appSurface: AppDeviceTokenSurface.STUDENT,
      tokenHash: 'hashed-token',
      deviceId: 'device-1',
    });
    expect(result).toMatchObject({
      deviceTokenId: 'device-token-1',
      device_token_id: 'device-token-1',
      appSurface: 'student',
      app_surface: 'student',
      revoked: true,
      revokedAt: '2026-06-22T10:05:00.000Z',
      revoked_at: '2026-06-22T10:05:00.000Z',
    });
    assertNoUnsafeTokenFields(result);
  });

  it('unregistering an unknown token is idempotent and non-disclosing', async () => {
    const { service } = createService({
      revokeCurrentSchoolActorToken: jest.fn().mockResolvedValue({
        token: null,
        revoked: false,
      }),
    });

    const result = await service.unregisterForActor({
      schoolId: SCHOOL_ID,
      userId: USER_ID,
      appSurface: AppDeviceTokenSurface.TEACHER,
      aliasStyle: 'camel',
      body: { deviceId: 'unknown-device' },
    });

    expect(result).toEqual({
      deviceTokenId: null,
      appSurface: 'teacher',
      revokedAt: null,
      revoked: false,
    });
  });
});

function createService(
  repositoryOverrides?: Partial<Record<keyof AppDeviceTokenRepository, unknown>>,
): {
  service: AppDeviceTokenService;
  repository: AppDeviceTokenRepository & Record<string, jest.Mock>;
  crypto: AppDeviceTokenCrypto & Record<string, jest.Mock>;
} {
  const repository = {
    upsertCurrentSchoolActorToken: jest.fn().mockResolvedValue(tokenRecord()),
    revokeCurrentSchoolActorToken: jest.fn().mockResolvedValue({
      token: tokenRecord(),
      revoked: true,
    }),
    listActiveCurrentSchoolUserTokens: jest.fn(),
    ...(repositoryOverrides ?? {}),
  } as unknown as AppDeviceTokenRepository & Record<string, jest.Mock>;
  const crypto = {
    hash: jest.fn().mockReturnValue('hashed-token'),
    encrypt: jest.fn().mockReturnValue('v1:ciphertext'),
  } as unknown as AppDeviceTokenCrypto & Record<string, jest.Mock>;

  return {
    service: new AppDeviceTokenService(repository, crypto),
    repository,
    crypto,
  };
}

function tokenRecord(overrides?: Record<string, unknown>) {
  return {
    id: 'device-token-1',
    platform: AppDeviceTokenPlatform.ANDROID,
    appSurface: AppDeviceTokenSurface.PARENT,
    isActive: true,
    lastSeenAt: new Date('2026-06-22T10:00:00.000Z'),
    revokedAt: null,
    createdAt: new Date('2026-06-22T10:00:00.000Z'),
    updatedAt: new Date('2026-06-22T10:01:00.000Z'),
    ...(overrides ?? {}),
  };
}

function assertNoUnsafeTokenFields(value: unknown): void {
  const serialized = JSON.stringify(value);
  for (const forbidden of [
    'fcm-token-value',
    'tokenHash',
    'tokenCiphertext',
    'schoolId',
    'userId',
    'membershipId',
    'roleId',
    'organizationId',
  ]) {
    expect(serialized).not.toContain(forbidden);
  }
}
