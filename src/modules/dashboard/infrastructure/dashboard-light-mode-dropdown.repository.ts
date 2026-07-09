import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DashboardScope } from '../dashboard-context';

export interface DashboardLightModeDropdownSchoolLocationSnapshot {
  schoolName: string | null;
  profile: {
    timezone: string | null;
    formattedAddress: string | null;
    city: string | null;
    country: string | null;
  } | null;
}

@Injectable()
export class DashboardLightModeDropdownRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  async loadSchoolLocationSnapshot(
    scope: DashboardScope,
  ): Promise<DashboardLightModeDropdownSchoolLocationSnapshot> {
    const [profile, school] = await Promise.all([
      this.scopedPrisma.schoolProfile.findFirst({
        select: {
          timezone: true,
          formattedAddress: true,
          city: true,
          country: true,
        },
      }),
      this.prisma.school.findFirst({
        where: {
          id: scope.schoolId,
          organizationId: scope.organizationId,
          deletedAt: null,
        },
        select: {
          name: true,
        },
      }),
    ]);

    return {
      schoolName: school?.name ?? null,
      profile: profile
        ? {
            timezone: profile.timezone,
            formattedAddress: profile.formattedAddress,
            city: profile.city,
            country: profile.country,
          }
        : null,
    };
  }
}
