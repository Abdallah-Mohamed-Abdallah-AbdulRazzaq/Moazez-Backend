import { Injectable } from '@nestjs/common';
import { MembershipStatus, Prisma, UserStatus } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

const AUDIT_RECORD_ARGS = Prisma.validator<Prisma.AuditLogDefaultArgs>()({
  select: {
    id: true,
    module: true,
    action: true,
    resourceType: true,
    resourceId: true,
    ipAddress: true,
    createdAt: true,
    actor: {
      select: {
        firstName: true,
        lastName: true,
      },
    },
  },
});

export type OverviewAuditRecord = Prisma.AuditLogGetPayload<
  typeof AUDIT_RECORD_ARGS
>;

export interface OverviewMetricsRecord {
  profileCompleteness: number;
  activeUsersCount: number;
  pendingInvitesCount: number;
}

const REQUIRED_PROFILE_FIELDS = [
  'schoolName',
  'shortName',
  'timezone',
  'addressLine',
  'formattedAddress',
  'city',
  'country',
  'footerSignature',
] as const;

@Injectable()
export class OverviewRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  async getMetrics(schoolId: string): Promise<OverviewMetricsRecord> {
    const [profile, activeMemberships, pendingInviteMemberships] = await Promise.all([
      this.prisma.schoolProfile.findUnique({
        where: { schoolId },
        select: Object.fromEntries(
          REQUIRED_PROFILE_FIELDS.map((field) => [field, true]),
        ) as Prisma.SchoolProfileSelect,
      }),
      this.scopedPrisma.membership.findMany({
        where: {
          status: MembershipStatus.ACTIVE,
          deletedAt: null,
          user: {
            deletedAt: null,
            status: UserStatus.ACTIVE,
          },
        },
        select: { userId: true },
        distinct: ['userId'],
      }),
      this.scopedPrisma.membership.findMany({
        where: {
          status: MembershipStatus.ACTIVE,
          deletedAt: null,
          user: {
            deletedAt: null,
            status: UserStatus.INVITED,
          },
        },
        select: { userId: true },
        distinct: ['userId'],
      }),
    ]);

    const completedFields = REQUIRED_PROFILE_FIELDS.filter((field) => {
      const value = profile?.[field];
      return typeof value === 'string' && value.trim().length > 0;
    }).length;

    const profileCompleteness = Math.round(
      (completedFields / REQUIRED_PROFILE_FIELDS.length) * 100,
    );

    return {
      profileCompleteness,
      activeUsersCount: activeMemberships.length,
      pendingInvitesCount: pendingInviteMemberships.length,
    };
  }

  listRecentAuditEvents(schoolId: string): Promise<OverviewAuditRecord[]> {
    return this.prisma.auditLog.findMany({
      where: { schoolId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      ...AUDIT_RECORD_ARGS,
    });
  }
}
