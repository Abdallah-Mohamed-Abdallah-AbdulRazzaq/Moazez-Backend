import { SchoolEntitlementStatus, SchoolStatus } from '@prisma/client';
import {
  buildStudentSeatUsage,
  presentPlatformSchoolEntitlement,
} from '../presenters/platform-admin-entitlement.presenter';
import {
  PlatformEntitlementSchoolRecord,
  PlatformSchoolEntitlementRecord,
} from '../infrastructure/platform-admin-entitlements.repository';

describe('Platform Admin entitlement presenter', () => {
  it('presents a null entitlement with unlimited active-student usage', () => {
    const response = presentPlatformSchoolEntitlement({
      school: schoolRecord(),
      entitlement: null,
      activeStudentSeatUsage: 3,
    });

    expect(response).toEqual({
      school: {
        schoolId: 'school-1',
        organizationId: 'org-1',
        name: 'Moazez Primary',
        slug: 'primary',
        status: 'active',
      },
      entitlement: null,
      studentSeatUsage: {
        used: 3,
        limit: null,
        remaining: null,
        isUnlimited: true,
        isOverLimit: false,
        calculation: 'active_students',
      },
      deferred: {
        seatLimitEnforcement: 'deferred',
        featureControl: 'deferred',
        billing: 'out_of_scope_v1',
        invoices: 'out_of_scope_v1',
        payments: 'out_of_scope_v1',
      },
    });
  });

  it('presents entitlement control fields and remaining seats safely', () => {
    const response = presentPlatformSchoolEntitlement({
      school: schoolRecord(),
      entitlement: entitlementRecord(),
      activeStudentSeatUsage: 7,
    });
    const serialized = JSON.stringify(response);

    expect(response.entitlement).toEqual({
      entitlementId: 'entitlement-1',
      status: 'active',
      startsAt: '2026-06-01T00:00:00.000Z',
      endsAt: '2027-06-01T00:00:00.000Z',
      studentSeatLimit: 10,
      notes: 'Annual school entitlement',
      createdAt: '2026-06-01T09:00:00.000Z',
      updatedAt: '2026-06-01T10:00:00.000Z',
    });
    expect(response.studentSeatUsage).toEqual({
      used: 7,
      limit: 10,
      remaining: 3,
      isUnlimited: false,
      isOverLimit: false,
      calculation: 'active_students',
    });

    for (const forbidden of [
      'passwordHash',
      'invoiceId',
      'billingAccount',
      'paymentProvider',
      'featureEntitlements',
      'raw',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('marks usage over limit without enforcing seats', () => {
    expect(buildStudentSeatUsage({ used: 12, limit: 10 })).toEqual({
      used: 12,
      limit: 10,
      remaining: 0,
      isUnlimited: false,
      isOverLimit: true,
      calculation: 'active_students',
    });
  });
});

function schoolRecord(): PlatformEntitlementSchoolRecord {
  return {
    id: 'school-1',
    organizationId: 'org-1',
    name: 'Moazez Primary',
    slug: 'primary',
    status: SchoolStatus.ACTIVE,
    deletedAt: null,
  };
}

function entitlementRecord(): PlatformSchoolEntitlementRecord {
  return {
    id: 'entitlement-1',
    schoolId: 'school-1',
    organizationId: 'org-1',
    status: SchoolEntitlementStatus.ACTIVE,
    startsAt: new Date('2026-06-01T00:00:00.000Z'),
    endsAt: new Date('2027-06-01T00:00:00.000Z'),
    studentSeatLimit: 10,
    notes: 'Annual school entitlement',
    createdAt: new Date('2026-06-01T09:00:00.000Z'),
    updatedAt: new Date('2026-06-01T10:00:00.000Z'),
  };
}
