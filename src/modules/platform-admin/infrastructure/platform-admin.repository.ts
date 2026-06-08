import { Injectable } from '@nestjs/common';
import {
  OrganizationStatus,
  Prisma,
  SchoolStatus,
} from '@prisma/client';
import { PlatformScope } from '../../../common/decorators/platform-scope.decorator';
import { platformBypassScope } from '../../../infrastructure/database/platform-bypass.helper';
import { PrismaService } from '../../../infrastructure/database/prisma.service';

const ORGANIZATION_SELECT = Prisma.validator<Prisma.OrganizationSelect>()({
  id: true,
  name: true,
  slug: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
});

const SCHOOL_SELECT = Prisma.validator<Prisma.SchoolSelect>()({
  id: true,
  organizationId: true,
  name: true,
  slug: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  organization: {
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
    },
  },
});

export type PlatformOrganizationBaseRecord = Prisma.OrganizationGetPayload<{
  select: typeof ORGANIZATION_SELECT;
}>;

export type PlatformOrganizationRecord = PlatformOrganizationBaseRecord & {
  schoolsCount: number;
  activeSchoolsCount: number;
};

export type PlatformSchoolRecord = Prisma.SchoolGetPayload<{
  select: typeof SCHOOL_SELECT;
}>;

export interface PlatformStatusCounters {
  total: number;
  active: number;
  suspended: number;
  archived: number;
}

export interface PlatformOverviewCounts {
  organizations: PlatformStatusCounters;
  schools: PlatformStatusCounters;
}

export interface PlatformOrganizationListParams {
  status?: OrganizationStatus;
  search?: string;
  limit: number;
  cursor?: string;
}

export interface PlatformSchoolListParams {
  organizationId?: string;
  status?: SchoolStatus;
  search?: string;
  limit: number;
  cursor?: string;
}

export interface PlatformPageResult<T> {
  items: T[];
  limit: number;
  nextCursor: string | null;
  hasMore: boolean;
}

@Injectable()
@PlatformScope()
export class PlatformAdminRepository {
  constructor(private readonly prisma: PrismaService) {}

  loadOverviewCounts(): Promise<PlatformOverviewCounts> {
    return platformBypassScope(async () => {
      const [
        organizationsTotal,
        organizationsActive,
        organizationsSuspended,
        organizationsArchived,
        schoolsTotal,
        schoolsActive,
        schoolsSuspended,
        schoolsArchived,
      ] = await Promise.all([
        this.prisma.organization.count({ where: { deletedAt: null } }),
        this.prisma.organization.count({
          where: { deletedAt: null, status: OrganizationStatus.ACTIVE },
        }),
        this.prisma.organization.count({
          where: { deletedAt: null, status: OrganizationStatus.SUSPENDED },
        }),
        this.prisma.organization.count({
          where: { deletedAt: null, status: OrganizationStatus.ARCHIVED },
        }),
        this.prisma.school.count({ where: { deletedAt: null } }),
        this.prisma.school.count({
          where: { deletedAt: null, status: SchoolStatus.ACTIVE },
        }),
        this.prisma.school.count({
          where: { deletedAt: null, status: SchoolStatus.SUSPENDED },
        }),
        this.prisma.school.count({
          where: { deletedAt: null, status: SchoolStatus.ARCHIVED },
        }),
      ]);

      return {
        organizations: {
          total: organizationsTotal,
          active: organizationsActive,
          suspended: organizationsSuspended,
          archived: organizationsArchived,
        },
        schools: {
          total: schoolsTotal,
          active: schoolsActive,
          suspended: schoolsSuspended,
          archived: schoolsArchived,
        },
      };
    });
  }

  listOrganizations(
    params: PlatformOrganizationListParams,
  ): Promise<PlatformPageResult<PlatformOrganizationRecord>> {
    return platformBypassScope(async () => {
      const rows = await this.prisma.organization.findMany({
        where: this.buildOrganizationWhere(params),
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: params.limit + 1,
        ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
        select: ORGANIZATION_SELECT,
      });

      const pageRows = rows.slice(0, params.limit);
      const items = await this.attachOrganizationCounts(pageRows);

      return {
        items,
        limit: params.limit,
        hasMore: rows.length > params.limit,
        nextCursor:
          rows.length > params.limit && pageRows.length > 0
            ? pageRows[pageRows.length - 1].id
            : null,
      };
    });
  }

  async findOrganizationById(
    organizationId: string,
  ): Promise<PlatformOrganizationRecord | null> {
    return platformBypassScope(async () => {
      const record = await this.prisma.organization.findFirst({
        where: { id: organizationId, deletedAt: null },
        select: ORGANIZATION_SELECT,
      });

      if (!record) return null;
      const [withCounts] = await this.attachOrganizationCounts([record]);
      return withCounts ?? null;
    });
  }

  findOrganizationBySlug(
    slug: string,
  ): Promise<PlatformOrganizationBaseRecord | null> {
    return platformBypassScope(() =>
      this.prisma.organization.findUnique({
        where: { slug },
        select: ORGANIZATION_SELECT,
      }),
    );
  }

  createOrganization(data: {
    name: string;
    slug: string;
  }): Promise<PlatformOrganizationRecord> {
    return platformBypassScope(async () => {
      const record = await this.prisma.organization.create({
        data: {
          name: data.name,
          slug: data.slug,
          status: OrganizationStatus.ACTIVE,
        },
        select: ORGANIZATION_SELECT,
      });

      return {
        ...record,
        schoolsCount: 0,
        activeSchoolsCount: 0,
      };
    });
  }

  updateOrganization(data: {
    organizationId: string;
    name?: string;
    slug?: string;
    status?: OrganizationStatus;
  }): Promise<PlatformOrganizationRecord> {
    return platformBypassScope(async () => {
      await this.prisma.organization.update({
        where: { id: data.organizationId },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.slug !== undefined ? { slug: data.slug } : {}),
          ...(data.status !== undefined ? { status: data.status } : {}),
        },
      });

      return this.findOrganizationByIdOrThrow(data.organizationId);
    });
  }

  listSchools(
    params: PlatformSchoolListParams,
  ): Promise<PlatformPageResult<PlatformSchoolRecord>> {
    return platformBypassScope(async () => {
      const rows = await this.prisma.school.findMany({
        where: this.buildSchoolWhere(params),
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: params.limit + 1,
        ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
        select: SCHOOL_SELECT,
      });

      const pageRows = rows.slice(0, params.limit);

      return {
        items: pageRows,
        limit: params.limit,
        hasMore: rows.length > params.limit,
        nextCursor:
          rows.length > params.limit && pageRows.length > 0
            ? pageRows[pageRows.length - 1].id
            : null,
      };
    });
  }

  findSchoolById(schoolId: string): Promise<PlatformSchoolRecord | null> {
    return platformBypassScope(() =>
      this.prisma.school.findFirst({
        where: { id: schoolId, deletedAt: null },
        select: SCHOOL_SELECT,
      }),
    );
  }

  findSchoolBySlug(params: {
    organizationId: string;
    slug: string;
  }): Promise<PlatformSchoolRecord | null> {
    return platformBypassScope(() =>
      this.prisma.school.findUnique({
        where: {
          organizationId_slug: {
            organizationId: params.organizationId,
            slug: params.slug,
          },
        },
        select: SCHOOL_SELECT,
      }),
    );
  }

  createSchool(data: {
    organizationId: string;
    name: string;
    slug: string;
  }): Promise<PlatformSchoolRecord> {
    return platformBypassScope(() =>
      this.prisma.school.create({
        data: {
          organizationId: data.organizationId,
          name: data.name,
          slug: data.slug,
          status: SchoolStatus.ACTIVE,
        },
        select: SCHOOL_SELECT,
      }),
    );
  }

  updateSchool(data: {
    schoolId: string;
    name?: string;
    slug?: string;
    status?: SchoolStatus;
  }): Promise<PlatformSchoolRecord> {
    return platformBypassScope(() =>
      this.prisma.school.update({
        where: { id: data.schoolId },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.slug !== undefined ? { slug: data.slug } : {}),
          ...(data.status !== undefined ? { status: data.status } : {}),
        },
        select: SCHOOL_SELECT,
      }),
    );
  }

  private async findOrganizationByIdOrThrow(
    organizationId: string,
  ): Promise<PlatformOrganizationRecord> {
    const record = await this.findOrganizationById(organizationId);
    if (!record) {
      throw new Error(`Organization disappeared during update: ${organizationId}`);
    }
    return record;
  }

  private buildOrganizationWhere(
    params: PlatformOrganizationListParams,
  ): Prisma.OrganizationWhereInput {
    return {
      deletedAt: null,
      ...(params.status ? { status: params.status } : {}),
      ...(params.search
        ? {
            OR: [
              { name: { contains: params.search, mode: 'insensitive' } },
              { slug: { contains: params.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
  }

  private buildSchoolWhere(
    params: PlatformSchoolListParams,
  ): Prisma.SchoolWhereInput {
    return {
      deletedAt: null,
      ...(params.organizationId ? { organizationId: params.organizationId } : {}),
      ...(params.status ? { status: params.status } : {}),
      ...(params.search
        ? {
            OR: [
              { name: { contains: params.search, mode: 'insensitive' } },
              { slug: { contains: params.search, mode: 'insensitive' } },
              {
                organization: {
                  name: { contains: params.search, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
    };
  }

  private async attachOrganizationCounts(
    organizations: PlatformOrganizationBaseRecord[],
  ): Promise<PlatformOrganizationRecord[]> {
    if (organizations.length === 0) return [];

    const organizationIds = organizations.map((organization) => organization.id);
    const schoolCounts = await this.prisma.school.groupBy({
      by: ['organizationId', 'status'],
      where: {
        organizationId: { in: organizationIds },
        deletedAt: null,
      },
      _count: { _all: true },
    });

    const countsByOrganizationId = new Map<
      string,
      { total: number; active: number }
    >();

    for (const row of schoolCounts) {
      const current = countsByOrganizationId.get(row.organizationId) ?? {
        total: 0,
        active: 0,
      };
      current.total += row._count._all;
      if (row.status === SchoolStatus.ACTIVE) {
        current.active += row._count._all;
      }
      countsByOrganizationId.set(row.organizationId, current);
    }

    return organizations.map((organization) => {
      const counts = countsByOrganizationId.get(organization.id);
      return {
        ...organization,
        schoolsCount: counts?.total ?? 0,
        activeSchoolsCount: counts?.active ?? 0,
      };
    });
  }
}
