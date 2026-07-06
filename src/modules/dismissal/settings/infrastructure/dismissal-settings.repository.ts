import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

const DISMISSAL_SETTINGS_ARGS =
  Prisma.validator<Prisma.DismissalSettingsDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      enabled: true,
      timezone: true,
      schoolLatitude: true,
      schoolLongitude: true,
      allowedRadiusMeters: true,
      requestWindowStartLocal: true,
      requestWindowEndLocal: true,
      delayThresholdMinutes: true,
      urgentThresholdMinutes: true,
      expiryThresholdMinutes: true,
      requirePickupCode: true,
      allowDelegatePickup: true,
      allowParentCancelBeforeCalled: true,
      defaultGateId: true,
      updatedById: true,
      createdAt: true,
      updatedAt: true,
      defaultGate: {
        select: {
          id: true,
          code: true,
          name: true,
          status: true,
          deletedAt: true,
        },
      },
    },
  });

const SCHOOL_PROFILE_LOCATION_ARGS =
  Prisma.validator<Prisma.SchoolProfileDefaultArgs>()({
    select: {
      timezone: true,
      latitude: true,
      longitude: true,
      mapPlaceLabel: true,
      formattedAddress: true,
    },
  });

export type DismissalSettingsRecord = Prisma.DismissalSettingsGetPayload<
  typeof DISMISSAL_SETTINGS_ARGS
>;

export type DismissalSchoolProfileLocationRecord =
  Prisma.SchoolProfileGetPayload<typeof SCHOOL_PROFILE_LOCATION_ARGS>;

@Injectable()
export class DismissalSettingsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  findSettings(): Promise<DismissalSettingsRecord | null> {
    return this.scopedPrisma.dismissalSettings.findFirst({
      ...DISMISSAL_SETTINGS_ARGS,
    });
  }

  findSchoolProfileLocation(): Promise<DismissalSchoolProfileLocationRecord | null> {
    return this.scopedPrisma.schoolProfile.findFirst({
      ...SCHOOL_PROFILE_LOCATION_ARGS,
    });
  }

  upsertSettings(
    schoolId: string,
    data: Prisma.DismissalSettingsUncheckedCreateInput,
  ): Promise<DismissalSettingsRecord> {
    return this.prisma.dismissalSettings.upsert({
      where: { schoolId },
      update: {
        enabled: data.enabled,
        timezone: data.timezone,
        schoolLatitude: data.schoolLatitude,
        schoolLongitude: data.schoolLongitude,
        allowedRadiusMeters: data.allowedRadiusMeters,
        requestWindowStartLocal: data.requestWindowStartLocal,
        requestWindowEndLocal: data.requestWindowEndLocal,
        delayThresholdMinutes: data.delayThresholdMinutes,
        urgentThresholdMinutes: data.urgentThresholdMinutes,
        expiryThresholdMinutes: data.expiryThresholdMinutes,
        requirePickupCode: data.requirePickupCode,
        allowDelegatePickup: data.allowDelegatePickup,
        allowParentCancelBeforeCalled: data.allowParentCancelBeforeCalled,
        defaultGateId: data.defaultGateId,
        updatedById: data.updatedById,
      },
      create: {
        schoolId,
        enabled: data.enabled,
        timezone: data.timezone,
        schoolLatitude: data.schoolLatitude,
        schoolLongitude: data.schoolLongitude,
        allowedRadiusMeters: data.allowedRadiusMeters,
        requestWindowStartLocal: data.requestWindowStartLocal,
        requestWindowEndLocal: data.requestWindowEndLocal,
        delayThresholdMinutes: data.delayThresholdMinutes,
        urgentThresholdMinutes: data.urgentThresholdMinutes,
        expiryThresholdMinutes: data.expiryThresholdMinutes,
        requirePickupCode: data.requirePickupCode,
        allowDelegatePickup: data.allowDelegatePickup,
        allowParentCancelBeforeCalled: data.allowParentCancelBeforeCalled,
        defaultGateId: data.defaultGateId,
        updatedById: data.updatedById,
      },
      ...DISMISSAL_SETTINGS_ARGS,
    });
  }
}
