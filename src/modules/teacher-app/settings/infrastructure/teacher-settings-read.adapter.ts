import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type { TeacherAppContext } from '../../shared/teacher-app-context';

export interface TeacherSettingsSchoolRecord {
  name: string | null;
  logoUrl: null;
  email: null;
  phone: null;
  address: string | null;
}

@Injectable()
export class TeacherSettingsReadAdapter {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  async findSchoolSettings(
    context: TeacherAppContext,
  ): Promise<TeacherSettingsSchoolRecord> {
    const [profile, school] = await Promise.all([
      this.scopedPrisma.schoolProfile.findFirst({
        select: {
          schoolName: true,
          shortName: true,
          formattedAddress: true,
          addressLine: true,
          city: true,
          country: true,
        },
      }),
      this.scopedPrisma.school.findFirst({
        where: {
          id: context.schoolId,
          organizationId: context.organizationId,
          deletedAt: null,
        },
        select: { name: true },
      }),
    ]);

    return {
      name: profile?.schoolName ?? profile?.shortName ?? school?.name ?? null,
      logoUrl: null,
      email: null,
      phone: null,
      address: schoolAddress(profile),
    };
  }
}

function schoolAddress(
  profile:
    | {
        formattedAddress: string | null;
        addressLine: string | null;
        city: string | null;
        country: string | null;
      }
    | null
    | undefined,
): string | null {
  if (!profile) return null;

  const directAddress = profile.formattedAddress ?? profile.addressLine;
  if (directAddress?.trim()) return directAddress;

  const locationParts = [profile.city, profile.country].filter(
    (part): part is string => Boolean(part?.trim()),
  );

  return locationParts.length > 0 ? locationParts.join(', ') : null;
}
