import { Injectable } from '@nestjs/common';
import {
  Prisma,
  SchoolLoginSettings,
  SchoolLoginSettingsStatus,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

export interface SaveLoginIdentitySettingsData {
  loginDomain: string;
  usernameMinLength: number;
  usernameMaxLength: number;
  allowedCharacters?: string | null;
  reservedUsernames?: Prisma.InputJsonValue;
  status: SchoolLoginSettingsStatus;
}

@Injectable()
export class LoginIdentityRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  findCurrentSettings(): Promise<SchoolLoginSettings | null> {
    return this.scopedPrisma.schoolLoginSettings.findFirst({
      where: {},
    });
  }

  async saveCurrentSettings(
    schoolId: string,
    data: SaveLoginIdentitySettingsData,
  ): Promise<SchoolLoginSettings> {
    const existing = await this.findCurrentSettings();

    if (existing) {
      await this.scopedPrisma.schoolLoginSettings.updateMany({
        where: { id: existing.id },
        data,
      });

      return this.scopedPrisma.schoolLoginSettings.findFirstOrThrow({
        where: { id: existing.id },
      });
    }

    return this.scopedPrisma.schoolLoginSettings.create({
      data: {
        schoolId,
        ...data,
      },
    });
  }

  findUserByLoginEmail(
    loginEmail: string,
  ): Promise<{ id: string; email: string } | null> {
    return this.prisma.user.findFirst({
      where: {
        email: loginEmail,
        deletedAt: null,
      },
      select: {
        id: true,
        email: true,
      },
    });
  }
}
