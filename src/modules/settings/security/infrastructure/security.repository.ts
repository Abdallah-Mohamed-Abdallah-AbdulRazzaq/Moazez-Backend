import { Injectable } from '@nestjs/common';
import { Prisma, SecuritySetting } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

@Injectable()
export class SecurityRepository {
  constructor(private readonly prisma: PrismaService) {}

  findBySchoolId(schoolId: string): Promise<SecuritySetting | null> {
    return this.prisma.securitySetting.findUnique({
      where: { schoolId },
    });
  }

  upsert(
    schoolId: string,
    updatedById: string,
    data: Prisma.SecuritySettingUncheckedCreateInput,
  ): Promise<SecuritySetting> {
    return this.prisma.securitySetting.upsert({
      where: { schoolId },
      update: {
        enforceTwoFactor: data.enforceTwoFactor,
        ipAllowlistEnabled: data.ipAllowlistEnabled,
        ipAllowlist: data.ipAllowlist,
        sessionTimeoutMinutes: data.sessionTimeoutMinutes,
        suspiciousLoginAlerts: data.suspiciousLoginAlerts,
        passwordMinLength: data.passwordMinLength,
        passwordRotationDays: data.passwordRotationDays,
        updatedById,
      },
      create: {
        schoolId,
        enforceTwoFactor: data.enforceTwoFactor,
        ipAllowlistEnabled: data.ipAllowlistEnabled,
        ipAllowlist: data.ipAllowlist,
        sessionTimeoutMinutes: data.sessionTimeoutMinutes,
        suspiciousLoginAlerts: data.suspiciousLoginAlerts,
        passwordMinLength: data.passwordMinLength,
        passwordRotationDays: data.passwordRotationDays,
        updatedById,
      },
    });
  }
}
