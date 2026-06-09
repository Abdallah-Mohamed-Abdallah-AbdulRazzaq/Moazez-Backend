import { SchoolStatus } from '@prisma/client';
import {
  PlatformSchoolEntitlementResponseDto,
  PlatformStudentSeatUsageDto,
} from '../dto/platform-admin-entitlement.dto';
import { mapEntitlementStatusToApi } from '../domain/platform-admin-entitlement-inputs';
import {
  PlatformEntitlementSchoolRecord,
  PlatformSchoolEntitlementRecord,
} from '../infrastructure/platform-admin-entitlements.repository';

export function presentPlatformSchoolEntitlement(input: {
  school: PlatformEntitlementSchoolRecord;
  entitlement: PlatformSchoolEntitlementRecord | null;
  activeStudentSeatUsage: number;
}): PlatformSchoolEntitlementResponseDto {
  const limit = input.entitlement?.studentSeatLimit ?? null;

  return {
    school: {
      schoolId: input.school.id,
      organizationId: input.school.organizationId,
      name: input.school.name,
      slug: input.school.slug,
      status: mapSchoolStatusToApi(input.school.status),
    },
    entitlement: input.entitlement
      ? {
          entitlementId: input.entitlement.id,
          status: mapEntitlementStatusToApi(input.entitlement.status),
          startsAt: input.entitlement.startsAt?.toISOString() ?? null,
          endsAt: input.entitlement.endsAt?.toISOString() ?? null,
          studentSeatLimit: input.entitlement.studentSeatLimit,
          notes: input.entitlement.notes,
          createdAt: input.entitlement.createdAt.toISOString(),
          updatedAt: input.entitlement.updatedAt.toISOString(),
        }
      : null,
    studentSeatUsage: buildStudentSeatUsage({
      used: input.activeStudentSeatUsage,
      limit,
    }),
    deferred: {
      seatLimitEnforcement: 'available',
      featureControl: 'deferred',
      billing: 'out_of_scope_v1',
      invoices: 'out_of_scope_v1',
      payments: 'out_of_scope_v1',
    },
  };
}

export function buildStudentSeatUsage(input: {
  used: number;
  limit: number | null;
}): PlatformStudentSeatUsageDto {
  const limit = input.limit;
  const isUnlimited = limit === null;

  return {
    used: input.used,
    limit,
    remaining: limit === null ? null : Math.max(limit - input.used, 0),
    isUnlimited,
    isOverLimit: limit === null ? false : input.used > limit,
    calculation: 'active_students',
  };
}

function mapSchoolStatusToApi(
  status: SchoolStatus,
): 'active' | 'suspended' | 'archived' {
  switch (status) {
    case SchoolStatus.ACTIVE:
      return 'active';
    case SchoolStatus.SUSPENDED:
      return 'suspended';
    case SchoolStatus.ARCHIVED:
      return 'archived';
  }
}
