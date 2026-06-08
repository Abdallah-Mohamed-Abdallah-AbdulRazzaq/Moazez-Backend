import {
  PlatformAdminOverviewResponseDto,
  PlatformAdminStatusCountersDto,
} from '../dto/platform-admin-overview.dto';
import {
  PlatformOrganizationResponseDto,
  PlatformOrganizationsListResponseDto,
} from '../dto/platform-admin-organization.dto';
import {
  PlatformSchoolResponseDto,
  PlatformSchoolsListResponseDto,
} from '../dto/platform-admin-school.dto';
import {
  PlatformOrganizationListParams,
  PlatformOrganizationRecord,
  PlatformOverviewCounts,
  PlatformPageResult,
  PlatformSchoolListParams,
  PlatformSchoolRecord,
  PlatformStatusCounters,
} from '../infrastructure/platform-admin.repository';

export function presentPlatformAdminOverview(input: {
  generatedAt: Date;
  counts: PlatformOverviewCounts;
}): PlatformAdminOverviewResponseDto {
  return {
    generatedAt: input.generatedAt.toISOString(),
    organizations: presentCounters(input.counts.organizations),
    schools: presentCounters(input.counts.schools),
    deferred: {
      schoolProvisioning: 'deferred',
      entitlements: 'deferred',
      featureControl: 'deferred',
      billing: 'out_of_scope_v1',
      advancedAnalytics: 'deferred',
    },
  };
}

export function presentPlatformOrganization(
  organization: PlatformOrganizationRecord,
): PlatformOrganizationResponseDto {
  return {
    organizationId: organization.id,
    name: organization.name,
    slug: organization.slug,
    status: organization.status,
    schoolsCount: organization.schoolsCount,
    activeSchoolsCount: organization.activeSchoolsCount,
    createdAt: organization.createdAt.toISOString(),
    updatedAt: organization.updatedAt.toISOString(),
  };
}

export function presentPlatformOrganizationsList(input: {
  generatedAt: Date;
  result: PlatformPageResult<PlatformOrganizationRecord>;
  filters: Pick<PlatformOrganizationListParams, 'status' | 'search'>;
}): PlatformOrganizationsListResponseDto {
  return {
    generatedAt: input.generatedAt.toISOString(),
    items: input.result.items.map(presentPlatformOrganization),
    pageInfo: {
      limit: input.result.limit,
      nextCursor: input.result.nextCursor,
      hasMore: input.result.hasMore,
    },
    filters: {
      ...(input.filters.status ? { status: input.filters.status } : {}),
      ...(input.filters.search ? { search: input.filters.search } : {}),
    },
  };
}

export function presentPlatformSchool(
  school: PlatformSchoolRecord,
): PlatformSchoolResponseDto {
  return {
    schoolId: school.id,
    organizationId: school.organizationId,
    organizationName: school.organization.name,
    name: school.name,
    slug: school.slug,
    status: school.status,
    createdAt: school.createdAt.toISOString(),
    updatedAt: school.updatedAt.toISOString(),
  };
}

export function presentPlatformSchoolsList(input: {
  generatedAt: Date;
  result: PlatformPageResult<PlatformSchoolRecord>;
  filters: Pick<PlatformSchoolListParams, 'organizationId' | 'status' | 'search'>;
}): PlatformSchoolsListResponseDto {
  return {
    generatedAt: input.generatedAt.toISOString(),
    items: input.result.items.map(presentPlatformSchool),
    pageInfo: {
      limit: input.result.limit,
      nextCursor: input.result.nextCursor,
      hasMore: input.result.hasMore,
    },
    filters: {
      ...(input.filters.organizationId
        ? { organizationId: input.filters.organizationId }
        : {}),
      ...(input.filters.status ? { status: input.filters.status } : {}),
      ...(input.filters.search ? { search: input.filters.search } : {}),
    },
  };
}

function presentCounters(
  counters: PlatformStatusCounters,
): PlatformAdminStatusCountersDto {
  return {
    total: counters.total,
    active: counters.active,
    suspended: counters.suspended,
    archived: counters.archived,
  };
}
