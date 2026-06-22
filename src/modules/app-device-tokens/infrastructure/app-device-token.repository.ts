import { Injectable } from '@nestjs/common';
import {
  AppDeviceTokenPlatform,
  AppDeviceTokenSurface,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';

const APP_DEVICE_TOKEN_SAFE_ARGS =
  Prisma.validator<Prisma.AppDeviceTokenDefaultArgs>()({
    select: {
      id: true,
      platform: true,
      appSurface: true,
      isActive: true,
      lastSeenAt: true,
      revokedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

const APP_DEVICE_TOKEN_WITH_CIPHERTEXT_ARGS =
  Prisma.validator<Prisma.AppDeviceTokenDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      userId: true,
      tokenCiphertext: true,
      platform: true,
      appSurface: true,
      isActive: true,
      lastSeenAt: true,
      revokedAt: true,
      lastFailureCode: true,
      lastFailureAt: true,
      failureCount: true,
      createdAt: true,
      updatedAt: true,
    },
  });

export type AppDeviceTokenSafeRecord = Prisma.AppDeviceTokenGetPayload<
  typeof APP_DEVICE_TOKEN_SAFE_ARGS
>;

export type AppDeviceTokenSenderRecord = Prisma.AppDeviceTokenGetPayload<
  typeof APP_DEVICE_TOKEN_WITH_CIPHERTEXT_ARGS
>;

export interface UpsertCurrentSchoolActorTokenInput {
  schoolId: string;
  userId: string;
  tokenHash: string;
  tokenCiphertext: string;
  platform: AppDeviceTokenPlatform;
  appSurface: AppDeviceTokenSurface;
  deviceId: string | null;
  appVersion: string | null;
  locale: string | null;
  timezone: string | null;
  now?: Date;
}

export interface RevokeCurrentSchoolActorTokenInput {
  schoolId: string;
  userId: string;
  appSurface: AppDeviceTokenSurface;
  tokenHash?: string;
  deviceId?: string;
  now?: Date;
}

@Injectable()
export class AppDeviceTokenRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  upsertCurrentSchoolActorToken(
    input: UpsertCurrentSchoolActorTokenInput,
  ): Promise<AppDeviceTokenSafeRecord> {
    const now = input.now ?? new Date();

    return this.scopedPrisma.appDeviceToken.upsert({
      where: {
        schoolId_userId_tokenHash_appSurface: {
          schoolId: input.schoolId,
          userId: input.userId,
          tokenHash: input.tokenHash,
          appSurface: input.appSurface,
        },
      },
      create: {
        schoolId: input.schoolId,
        userId: input.userId,
        tokenHash: input.tokenHash,
        tokenCiphertext: input.tokenCiphertext,
        platform: input.platform,
        appSurface: input.appSurface,
        deviceId: input.deviceId,
        appVersion: input.appVersion,
        locale: input.locale,
        timezone: input.timezone,
        isActive: true,
        lastSeenAt: now,
      },
      update: {
        platform: input.platform,
        tokenCiphertext: input.tokenCiphertext,
        deviceId: input.deviceId,
        appVersion: input.appVersion,
        locale: input.locale,
        timezone: input.timezone,
        isActive: true,
        revokedAt: null,
        lastSeenAt: now,
        lastFailureCode: null,
        lastFailureAt: null,
        failureCount: 0,
      },
      ...APP_DEVICE_TOKEN_SAFE_ARGS,
    });
  }

  async revokeCurrentSchoolActorToken(
    input: RevokeCurrentSchoolActorTokenInput,
  ): Promise<{ token: AppDeviceTokenSafeRecord | null; revoked: boolean }> {
    const existing = await this.findCurrentSchoolActorTokenForRevocation(input);
    if (!existing) return { token: null, revoked: false };

    if (!existing.isActive) {
      return { token: existing, revoked: false };
    }

    const revokedAt = input.now ?? new Date();
    const token = await this.scopedPrisma.appDeviceToken.update({
      where: {
        id_schoolId: {
          id: existing.id,
          schoolId: input.schoolId,
        },
      },
      data: {
        isActive: false,
        revokedAt,
      },
      ...APP_DEVICE_TOKEN_SAFE_ARGS,
    });

    return { token, revoked: true };
  }

  listActiveCurrentSchoolUserTokens(input: {
    schoolId: string;
    userId: string;
    appSurface?: AppDeviceTokenSurface;
  }): Promise<AppDeviceTokenSenderRecord[]> {
    return this.scopedPrisma.appDeviceToken.findMany({
      where: {
        schoolId: input.schoolId,
        userId: input.userId,
        ...(input.appSurface ? { appSurface: input.appSurface } : {}),
        isActive: true,
        revokedAt: null,
      },
      orderBy: [{ lastSeenAt: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
      ...APP_DEVICE_TOKEN_WITH_CIPHERTEXT_ARGS,
    });
  }

  private findCurrentSchoolActorTokenForRevocation(
    input: RevokeCurrentSchoolActorTokenInput,
  ): Promise<AppDeviceTokenSafeRecord | null> {
    return this.scopedPrisma.appDeviceToken.findFirst({
      where: {
        schoolId: input.schoolId,
        userId: input.userId,
        appSurface: input.appSurface,
        ...(input.tokenHash ? { tokenHash: input.tokenHash } : {}),
        ...(input.deviceId ? { deviceId: input.deviceId } : {}),
      },
      orderBy: [{ lastSeenAt: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
      ...APP_DEVICE_TOKEN_SAFE_ARGS,
    });
  }
}
