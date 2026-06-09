import { Injectable } from '@nestjs/common';
import { Prisma, SchoolEntitlementStatus } from '@prisma/client';
import { PlatformScope } from '../../../common/decorators/platform-scope.decorator';
import { platformBypassScope } from '../../../infrastructure/database/platform-bypass.helper';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { buildActiveStudentSeatWhere } from './student-seat-usage.query';

const ENTITLEMENT_SCHOOL_SELECT = Prisma.validator<Prisma.SchoolSelect>()({
  id: true,
  organizationId: true,
  name: true,
  slug: true,
  status: true,
  deletedAt: true,
});

const SCHOOL_ENTITLEMENT_SELECT =
  Prisma.validator<Prisma.SchoolEntitlementSelect>()({
    id: true,
    schoolId: true,
    organizationId: true,
    status: true,
    startsAt: true,
    endsAt: true,
    studentSeatLimit: true,
    notes: true,
    createdAt: true,
    updatedAt: true,
  });

export type PlatformEntitlementSchoolRecord = Prisma.SchoolGetPayload<{
  select: typeof ENTITLEMENT_SCHOOL_SELECT;
}>;

export type PlatformSchoolEntitlementRecord =
  Prisma.SchoolEntitlementGetPayload<{
    select: typeof SCHOOL_ENTITLEMENT_SELECT;
  }>;

export interface PlatformEntitlementOverviewCounters {
  total: number;
  active: number;
  trial: number;
  suspended: number;
  expired: number;
  archived: number;
  schoolsOverSeatLimit: number;
}

export interface UpsertSchoolEntitlementData {
  schoolId: string;
  organizationId: string;
  status?: SchoolEntitlementStatus;
  startsAt?: Date | null;
  endsAt?: Date | null;
  studentSeatLimit?: number | null;
  notes?: string | null;
}

@Injectable()
@PlatformScope()
export class PlatformAdminEntitlementsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findSchoolById(
    schoolId: string,
  ): Promise<PlatformEntitlementSchoolRecord | null> {
    return platformBypassScope(() =>
      this.prisma.school.findFirst({
        where: { id: schoolId, deletedAt: null },
        select: ENTITLEMENT_SCHOOL_SELECT,
      }),
    );
  }

  findEntitlementBySchoolId(
    schoolId: string,
  ): Promise<PlatformSchoolEntitlementRecord | null> {
    return platformBypassScope(() =>
      this.prisma.schoolEntitlement.findUnique({
        where: { schoolId },
        select: SCHOOL_ENTITLEMENT_SELECT,
      }),
    );
  }

  upsertSchoolEntitlement(
    data: UpsertSchoolEntitlementData,
  ): Promise<PlatformSchoolEntitlementRecord> {
    return platformBypassScope(() =>
      this.prisma.schoolEntitlement.upsert({
        where: { schoolId: data.schoolId },
        create: {
          schoolId: data.schoolId,
          organizationId: data.organizationId,
          ...(data.status !== undefined ? { status: data.status } : {}),
          ...(data.startsAt !== undefined ? { startsAt: data.startsAt } : {}),
          ...(data.endsAt !== undefined ? { endsAt: data.endsAt } : {}),
          ...(data.studentSeatLimit !== undefined
            ? { studentSeatLimit: data.studentSeatLimit }
            : {}),
          ...(data.notes !== undefined ? { notes: data.notes } : {}),
        },
        update: {
          ...(data.status !== undefined ? { status: data.status } : {}),
          ...(data.startsAt !== undefined ? { startsAt: data.startsAt } : {}),
          ...(data.endsAt !== undefined ? { endsAt: data.endsAt } : {}),
          ...(data.studentSeatLimit !== undefined
            ? { studentSeatLimit: data.studentSeatLimit }
            : {}),
          ...(data.notes !== undefined ? { notes: data.notes } : {}),
        },
        select: SCHOOL_ENTITLEMENT_SELECT,
      }),
    );
  }

  async countActiveStudentSeats(schoolId: string): Promise<number> {
    return platformBypassScope(async () => {
      const rows = await this.prisma.enrollment.findMany({
        where: buildActiveStudentSeatWhere({
          schoolId,
        }),
        distinct: ['studentId'],
        select: { studentId: true },
      });

      return rows.length;
    });
  }

  async loadOverviewCounters(): Promise<PlatformEntitlementOverviewCounters> {
    return platformBypassScope(async () => {
      const [statusCounts, limitedEntitlements] = await Promise.all([
        this.prisma.schoolEntitlement.groupBy({
          by: ['status'],
          _count: { _all: true },
        }),
        this.prisma.schoolEntitlement.findMany({
          where: { studentSeatLimit: { not: null } },
          select: {
            schoolId: true,
            studentSeatLimit: true,
          },
        }),
      ]);

      const counters = {
        total: 0,
        active: 0,
        trial: 0,
        suspended: 0,
        expired: 0,
        archived: 0,
        schoolsOverSeatLimit: 0,
      };

      for (const row of statusCounts) {
        counters.total += row._count._all;
        switch (row.status) {
          case SchoolEntitlementStatus.ACTIVE:
            counters.active = row._count._all;
            break;
          case SchoolEntitlementStatus.TRIAL:
            counters.trial = row._count._all;
            break;
          case SchoolEntitlementStatus.SUSPENDED:
            counters.suspended = row._count._all;
            break;
          case SchoolEntitlementStatus.EXPIRED:
            counters.expired = row._count._all;
            break;
          case SchoolEntitlementStatus.ARCHIVED:
            counters.archived = row._count._all;
            break;
        }
      }

      counters.schoolsOverSeatLimit =
        await this.countSchoolsOverSeatLimit(limitedEntitlements);

      return counters;
    });
  }

  private async countSchoolsOverSeatLimit(
    limitedEntitlements: Array<{
      schoolId: string;
      studentSeatLimit: number | null;
    }>,
  ): Promise<number> {
    if (limitedEntitlements.length === 0) return 0;

    const schoolIds = limitedEntitlements.map((item) => item.schoolId);
    const activeSeatRows = await this.prisma.enrollment.findMany({
      where: buildActiveStudentSeatWhere({
        schoolId: { in: schoolIds },
      }),
      distinct: ['schoolId', 'studentId'],
      select: { schoolId: true, studentId: true },
    });

    const usageBySchoolId = new Map<string, number>();
    for (const row of activeSeatRows) {
      usageBySchoolId.set(
        row.schoolId,
        (usageBySchoolId.get(row.schoolId) ?? 0) + 1,
      );
    }

    return limitedEntitlements.filter((item) => {
      if (item.studentSeatLimit === null) return false;
      return (usageBySchoolId.get(item.schoolId) ?? 0) > item.studentSeatLimit;
    }).length;
  }
}
