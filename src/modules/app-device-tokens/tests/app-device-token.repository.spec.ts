import {
  AppDeviceTokenPlatform,
  AppDeviceTokenSurface,
} from '@prisma/client';
import { AppDeviceTokenRepository } from '../infrastructure/app-device-token.repository';

const SCHOOL_ID = 'school-1';
const USER_ID = 'user-1';

describe('AppDeviceTokenRepository', () => {
  it('upserts a current-school actor token and reactivates existing rows', async () => {
    const prisma = prismaMock();
    const repository = new AppDeviceTokenRepository(prisma as any);
    const now = new Date('2026-06-22T10:00:00.000Z');

    await repository.upsertCurrentSchoolActorToken({
      schoolId: SCHOOL_ID,
      userId: USER_ID,
      tokenHash: 'hash-1',
      tokenCiphertext: 'v1:ciphertext',
      platform: AppDeviceTokenPlatform.IOS,
      appSurface: AppDeviceTokenSurface.PARENT,
      deviceId: 'device-1',
      appVersion: '1.0.0',
      locale: 'en-US',
      timezone: 'Africa/Cairo',
      now,
    });

    expect(prisma.scoped.appDeviceToken.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          schoolId_userId_tokenHash_appSurface: {
            schoolId: SCHOOL_ID,
            userId: USER_ID,
            tokenHash: 'hash-1',
            appSurface: AppDeviceTokenSurface.PARENT,
          },
        },
        create: expect.objectContaining({
          schoolId: SCHOOL_ID,
          userId: USER_ID,
          tokenHash: 'hash-1',
          tokenCiphertext: 'v1:ciphertext',
          isActive: true,
          lastSeenAt: now,
        }),
        update: expect.objectContaining({
          tokenCiphertext: 'v1:ciphertext',
          isActive: true,
          revokedAt: null,
          lastSeenAt: now,
          lastFailureCode: null,
          lastFailureAt: null,
          failureCount: 0,
        }),
      }),
    );
  });

  it('revokes only matching current actor tokens and does not delete rows', async () => {
    const prisma = prismaMock({
      findFirst: jest.fn().mockResolvedValue(tokenRecord()),
      update: jest.fn().mockResolvedValue(
        tokenRecord({
          isActive: false,
          revokedAt: new Date('2026-06-22T10:05:00.000Z'),
        }),
      ),
    });
    const repository = new AppDeviceTokenRepository(prisma as any);

    const result = await repository.revokeCurrentSchoolActorToken({
      schoolId: SCHOOL_ID,
      userId: USER_ID,
      appSurface: AppDeviceTokenSurface.STUDENT,
      tokenHash: 'hash-1',
      deviceId: 'device-1',
      now: new Date('2026-06-22T10:05:00.000Z'),
    });

    expect(prisma.scoped.appDeviceToken.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          schoolId: SCHOOL_ID,
          userId: USER_ID,
          appSurface: AppDeviceTokenSurface.STUDENT,
          tokenHash: 'hash-1',
          deviceId: 'device-1',
        },
      }),
    );
    expect(prisma.scoped.appDeviceToken.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id_schoolId: {
            id: 'device-token-1',
            schoolId: SCHOOL_ID,
          },
        },
        data: {
          isActive: false,
          revokedAt: new Date('2026-06-22T10:05:00.000Z'),
        },
      }),
    );
    expect(result.revoked).toBe(true);
  });

  it('returns a safe idempotent result for unknown or already inactive tokens', async () => {
    const unknownPrisma = prismaMock({
      findFirst: jest.fn().mockResolvedValue(null),
    });
    const unknownRepository = new AppDeviceTokenRepository(
      unknownPrisma as any,
    );

    await expect(
      unknownRepository.revokeCurrentSchoolActorToken({
        schoolId: SCHOOL_ID,
        userId: USER_ID,
        appSurface: AppDeviceTokenSurface.TEACHER,
        deviceId: 'unknown-device',
      }),
    ).resolves.toEqual({ token: null, revoked: false });
    expect(unknownPrisma.scoped.appDeviceToken.update).not.toHaveBeenCalled();

    const inactivePrisma = prismaMock({
      findFirst: jest.fn().mockResolvedValue(
        tokenRecord({
          isActive: false,
          revokedAt: new Date('2026-06-22T09:00:00.000Z'),
        }),
      ),
    });
    const inactiveRepository = new AppDeviceTokenRepository(
      inactivePrisma as any,
    );

    await expect(
      inactiveRepository.revokeCurrentSchoolActorToken({
        schoolId: SCHOOL_ID,
        userId: USER_ID,
        appSurface: AppDeviceTokenSurface.TEACHER,
        tokenHash: 'hash-1',
      }),
    ).resolves.toMatchObject({ revoked: false });
    expect(inactivePrisma.scoped.appDeviceToken.update).not.toHaveBeenCalled();
  });
});

function prismaMock(overrides?: {
  upsert?: jest.Mock;
  findFirst?: jest.Mock;
  update?: jest.Mock;
}) {
  return {
    scoped: {
      appDeviceToken: {
        upsert: overrides?.upsert ?? jest.fn().mockResolvedValue(tokenRecord()),
        findFirst:
          overrides?.findFirst ?? jest.fn().mockResolvedValue(tokenRecord()),
        update: overrides?.update ?? jest.fn().mockResolvedValue(tokenRecord()),
        findMany: jest.fn().mockResolvedValue([]),
      },
    },
  };
}

function tokenRecord(overrides?: Record<string, unknown>) {
  return {
    id: 'device-token-1',
    platform: AppDeviceTokenPlatform.IOS,
    appSurface: AppDeviceTokenSurface.PARENT,
    isActive: true,
    lastSeenAt: new Date('2026-06-22T10:00:00.000Z'),
    revokedAt: null,
    createdAt: new Date('2026-06-22T10:00:00.000Z'),
    updatedAt: new Date('2026-06-22T10:01:00.000Z'),
    ...(overrides ?? {}),
  };
}
