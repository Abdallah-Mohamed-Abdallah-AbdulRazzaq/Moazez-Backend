import { Injectable } from '@nestjs/common';
import { Prisma, SchoolProfile } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

@Injectable()
export class BrandingRepository {
  constructor(private readonly prisma: PrismaService) {}

  findBySchoolId(schoolId: string): Promise<SchoolProfile | null> {
    return this.prisma.schoolProfile.findUnique({
      where: { schoolId },
    });
  }

  findSchoolName(schoolId: string): Promise<string | null> {
    return this.prisma.school.findUnique({
      where: { id: schoolId },
      select: { name: true },
    }).then((school) => school?.name ?? null);
  }

  upsert(
    schoolId: string,
    updatedById: string,
    data: Prisma.SchoolProfileUncheckedCreateInput,
  ): Promise<SchoolProfile> {
    return this.prisma.schoolProfile.upsert({
      where: { schoolId },
      update: {
        schoolName: data.schoolName,
        shortName: data.shortName,
        timezone: data.timezone,
        addressLine: data.addressLine,
        formattedAddress: data.formattedAddress,
        city: data.city,
        country: data.country,
        footerSignature: data.footerSignature,
        logoUrl: data.logoUrl,
        latitude: data.latitude,
        longitude: data.longitude,
        mapPlaceLabel: data.mapPlaceLabel,
        updatedById,
      },
      create: {
        schoolId,
        schoolName: data.schoolName,
        shortName: data.shortName,
        timezone: data.timezone,
        addressLine: data.addressLine,
        formattedAddress: data.formattedAddress,
        city: data.city,
        country: data.country,
        footerSignature: data.footerSignature,
        logoUrl: data.logoUrl,
        latitude: data.latitude,
        longitude: data.longitude,
        mapPlaceLabel: data.mapPlaceLabel,
        updatedById,
      },
    });
  }
}
