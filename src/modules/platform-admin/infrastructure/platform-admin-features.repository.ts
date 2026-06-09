import { Injectable } from '@nestjs/common';
import { Prisma, SchoolFeatureControlSource } from '@prisma/client';
import { PlatformScope } from '../../../common/decorators/platform-scope.decorator';
import { platformBypassScope } from '../../../infrastructure/database/platform-bypass.helper';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { PlatformSchoolFeatureKey } from '../domain/platform-admin-feature-registry';

const FEATURE_CONTROL_SCHOOL_SELECT = Prisma.validator<Prisma.SchoolSelect>()({
  id: true,
  organizationId: true,
  name: true,
  slug: true,
  status: true,
  deletedAt: true,
});

const SCHOOL_FEATURE_CONTROL_SELECT =
  Prisma.validator<Prisma.SchoolFeatureControlSelect>()({
    id: true,
    schoolId: true,
    organizationId: true,
    featureKey: true,
    enabled: true,
    source: true,
    notes: true,
    createdAt: true,
    updatedAt: true,
  });

export type PlatformFeatureControlSchoolRecord = Prisma.SchoolGetPayload<{
  select: typeof FEATURE_CONTROL_SCHOOL_SELECT;
}>;

export type PlatformSchoolFeatureControlRecord =
  Prisma.SchoolFeatureControlGetPayload<{
    select: typeof SCHOOL_FEATURE_CONTROL_SELECT;
  }>;

export interface PlatformFeatureOverviewCounters {
  configuredSchools: number;
  enabledControls: number;
  disabledControls: number;
}

export interface UpsertSchoolFeatureControlData {
  schoolId: string;
  organizationId: string;
  featureKey: PlatformSchoolFeatureKey;
  enabled: boolean;
  source: SchoolFeatureControlSource;
  notes?: string | null;
}

@Injectable()
@PlatformScope()
export class PlatformAdminFeaturesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findSchoolById(
    schoolId: string,
  ): Promise<PlatformFeatureControlSchoolRecord | null> {
    return platformBypassScope(() =>
      this.prisma.school.findFirst({
        where: { id: schoolId, deletedAt: null },
        select: FEATURE_CONTROL_SCHOOL_SELECT,
      }),
    );
  }

  listFeatureControlsBySchoolId(
    schoolId: string,
  ): Promise<PlatformSchoolFeatureControlRecord[]> {
    return platformBypassScope(() =>
      this.prisma.schoolFeatureControl.findMany({
        where: { schoolId },
        orderBy: { featureKey: 'asc' },
        select: SCHOOL_FEATURE_CONTROL_SELECT,
      }),
    );
  }

  findFeatureControlBySchoolAndKey(params: {
    schoolId: string;
    featureKey: PlatformSchoolFeatureKey;
  }): Promise<PlatformSchoolFeatureControlRecord | null> {
    return platformBypassScope(() =>
      this.prisma.schoolFeatureControl.findUnique({
        where: {
          schoolId_featureKey: {
            schoolId: params.schoolId,
            featureKey: params.featureKey,
          },
        },
        select: SCHOOL_FEATURE_CONTROL_SELECT,
      }),
    );
  }

  upsertFeatureControl(
    data: UpsertSchoolFeatureControlData,
  ): Promise<PlatformSchoolFeatureControlRecord> {
    return platformBypassScope(() =>
      this.prisma.schoolFeatureControl.upsert({
        where: {
          schoolId_featureKey: {
            schoolId: data.schoolId,
            featureKey: data.featureKey,
          },
        },
        create: {
          schoolId: data.schoolId,
          organizationId: data.organizationId,
          featureKey: data.featureKey,
          enabled: data.enabled,
          source: data.source,
          notes: data.notes ?? null,
        },
        update: {
          enabled: data.enabled,
          source: data.source,
          ...(data.notes !== undefined ? { notes: data.notes } : {}),
        },
        select: SCHOOL_FEATURE_CONTROL_SELECT,
      }),
    );
  }

  upsertFeatureControlsTransactionally(params: {
    schoolId: string;
    organizationId: string;
    controls: UpsertSchoolFeatureControlData[];
  }): Promise<PlatformSchoolFeatureControlRecord[]> {
    return platformBypassScope(() =>
      this.prisma.$transaction(async (transaction) => {
        for (const control of params.controls) {
          await transaction.schoolFeatureControl.upsert({
            where: {
              schoolId_featureKey: {
                schoolId: params.schoolId,
                featureKey: control.featureKey,
              },
            },
            create: {
              schoolId: params.schoolId,
              organizationId: params.organizationId,
              featureKey: control.featureKey,
              enabled: control.enabled,
              source: control.source,
              notes: control.notes ?? null,
            },
            update: {
              enabled: control.enabled,
              source: control.source,
              ...(control.notes !== undefined ? { notes: control.notes } : {}),
            },
          });
        }

        return transaction.schoolFeatureControl.findMany({
          where: { schoolId: params.schoolId },
          orderBy: { featureKey: 'asc' },
          select: SCHOOL_FEATURE_CONTROL_SELECT,
        });
      }),
    );
  }

  async loadOverviewCounters(): Promise<PlatformFeatureOverviewCounters> {
    return platformBypassScope(async () => {
      const [configuredSchools, enabledControls, disabledControls] =
        await Promise.all([
          this.prisma.schoolFeatureControl.findMany({
            distinct: ['schoolId'],
            select: { schoolId: true },
          }),
          this.prisma.schoolFeatureControl.count({
            where: { enabled: true },
          }),
          this.prisma.schoolFeatureControl.count({
            where: { enabled: false },
          }),
        ]);

      return {
        configuredSchools: configuredSchools.length,
        enabledControls,
        disabledControls,
      };
    });
  }
}
