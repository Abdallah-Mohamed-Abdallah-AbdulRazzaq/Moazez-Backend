import {
  MembershipStatus,
  OrganizationStatus,
  SchoolLoginSettingsStatus,
  SchoolStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import {
  presentPlatformAdminOverview,
  presentPlatformOrganization,
  presentPlatformOrganizationsList,
  presentPlatformSchool,
  presentPlatformSchoolProvisioning,
} from '../presenters/platform-admin.presenter';
import {
  PlatformOrganizationRecord,
  PlatformSchoolProvisioningRecord,
  PlatformSchoolRecord,
} from '../infrastructure/platform-admin.repository';

describe('Platform Admin presenter', () => {
  it('presents stable overview counters with deferred markers', () => {
    const response = presentPlatformAdminOverview({
      generatedAt: new Date('2026-06-01T09:00:00.000Z'),
      counts: {
        organizations: { total: 0, active: 0, suspended: 0, archived: 0 },
        schools: { total: 0, active: 0, suspended: 0, archived: 0 },
      },
      entitlements: {
        total: 0,
        active: 0,
        trial: 0,
        suspended: 0,
        expired: 0,
        archived: 0,
        schoolsOverSeatLimit: 0,
      },
      features: {
        configuredSchools: 0,
        enabledControls: 0,
        disabledControls: 0,
      },
    });

    expect(response).toEqual({
      generatedAt: '2026-06-01T09:00:00.000Z',
      organizations: { total: 0, active: 0, suspended: 0, archived: 0 },
      schools: { total: 0, active: 0, suspended: 0, archived: 0 },
      entitlements: {
        total: 0,
        active: 0,
        trial: 0,
        suspended: 0,
        expired: 0,
        archived: 0,
        schoolsOverSeatLimit: 0,
      },
      features: {
        knownFeatures: 15,
        configuredSchools: 0,
        enabledControls: 0,
        disabledControls: 0,
      },
      deferred: {
        schoolProvisioning: 'available',
        entitlements: 'available',
        featureControl: 'available',
        billing: 'out_of_scope_v1',
        advancedAnalytics: 'deferred',
      },
    });
  });

  it('presents organization output without raw internal fields', () => {
    const response = presentPlatformOrganization(organizationRecord());
    const serialized = JSON.stringify(response);

    expect(response).toEqual({
      organizationId: 'org-1',
      name: 'Moazez Group',
      slug: 'moazez-group',
      status: OrganizationStatus.ACTIVE,
      schoolsCount: 2,
      activeSchoolsCount: 1,
      createdAt: '2026-06-01T09:00:00.000Z',
      updatedAt: '2026-06-01T10:00:00.000Z',
    });
    expect(serialized).not.toContain('deletedAt');
    expect(serialized).not.toContain('passwordHash');
    expect(serialized).not.toContain('encryptedPassword');
    expect(serialized).not.toContain('refreshTokenHash');
  });

  it('presents school output without raw internal fields', () => {
    const response = presentPlatformSchool(schoolRecord());
    const serialized = JSON.stringify(response);

    expect(response).toEqual({
      schoolId: 'school-1',
      organizationId: 'org-1',
      organizationName: 'Moazez Group',
      name: 'Moazez Primary',
      slug: 'primary',
      status: SchoolStatus.ACTIVE,
      createdAt: '2026-06-01T09:00:00.000Z',
      updatedAt: '2026-06-01T10:00:00.000Z',
    });
    expect(serialized).not.toContain('deletedAt');
    expect(serialized).not.toContain('passwordHash');
    expect(serialized).not.toContain('encryptedApiKey');
    expect(serialized).not.toContain('raw');
  });

  it('presents list pagination and filters safely', () => {
    const response = presentPlatformOrganizationsList({
      generatedAt: new Date('2026-06-01T09:00:00.000Z'),
      result: {
        items: [organizationRecord()],
        limit: 20,
        nextCursor: 'org-1',
        hasMore: true,
      },
      filters: { status: OrganizationStatus.ACTIVE, search: 'Moazez' },
    });

    expect(response.items).toHaveLength(1);
    expect(response.pageInfo).toEqual({
      limit: 20,
      nextCursor: 'org-1',
      hasMore: true,
    });
    expect(response.filters).toEqual({
      status: OrganizationStatus.ACTIVE,
      search: 'Moazez',
    });
    expect(JSON.stringify(response)).not.toContain('deletedAt');
  });

  it('presents school provisioning without leaking secrets or raw internals', () => {
    const response = presentPlatformSchoolProvisioning({
      record: provisioningRecord(),
      temporaryPassword: null,
    });
    const serialized = JSON.stringify(response);

    expect(response).toEqual({
      provisioningId: 'school-1',
      organization: {
        organizationId: 'org-1',
        name: 'Moazez Group',
        slug: 'moazez-group',
        status: OrganizationStatus.ACTIVE,
      },
      school: {
        schoolId: 'school-1',
        organizationId: 'org-1',
        name: 'Moazez Primary',
        slug: 'primary',
        status: SchoolStatus.ACTIVE,
      },
      loginIdentity: {
        loginDomain: 'primary.moazez.school',
        primaryAdminLoginEmail: 'admin@primary.moazez.school',
      },
      primaryAdmin: {
        userId: 'user-1',
        username: 'admin',
        loginEmail: 'admin@primary.moazez.school',
        contactEmail: 'admin@example.test',
        userType: 'school_user',
        status: 'active',
        mustChangePassword: true,
      },
      credentials: {
        deliveryMode: 'activation_link',
        status: 'activation_link_deferred',
        temporaryPassword: null,
      },
      deferred: {
        entitlements: 'deferred',
        featureControl: 'deferred',
        studentSeatLimit: 'deferred',
        billing: 'out_of_scope_v1',
      },
    });

    for (const forbidden of [
      'passwordHash',
      'tokenHash',
      'refreshTokenHash',
      'encryptedPassword',
      'encryptedApiKey',
      'smtp',
      'requestContext',
      'audit',
      'raw',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});

function organizationRecord(): PlatformOrganizationRecord {
  return {
    id: 'org-1',
    name: 'Moazez Group',
    slug: 'moazez-group',
    status: OrganizationStatus.ACTIVE,
    schoolsCount: 2,
    activeSchoolsCount: 1,
    createdAt: new Date('2026-06-01T09:00:00.000Z'),
    updatedAt: new Date('2026-06-01T10:00:00.000Z'),
    deletedAt: null,
    passwordHash: 'secret',
  } as PlatformOrganizationRecord & { passwordHash: string };
}

function schoolRecord(): PlatformSchoolRecord {
  return {
    id: 'school-1',
    organizationId: 'org-1',
    organization: {
      id: 'org-1',
      name: 'Moazez Group',
      slug: 'moazez-group',
      status: OrganizationStatus.ACTIVE,
    },
    name: 'Moazez Primary',
    slug: 'primary',
    status: SchoolStatus.ACTIVE,
    createdAt: new Date('2026-06-01T09:00:00.000Z'),
    updatedAt: new Date('2026-06-01T10:00:00.000Z'),
    deletedAt: null,
    encryptedPassword: 'secret',
  } as PlatformSchoolRecord & { encryptedPassword: string };
}

function provisioningRecord(): PlatformSchoolProvisioningRecord {
  return {
    organization: {
      id: 'org-1',
      name: 'Moazez Group',
      slug: 'moazez-group',
      status: OrganizationStatus.ACTIVE,
    },
    school: {
      id: 'school-1',
      organizationId: 'org-1',
      name: 'Moazez Primary',
      slug: 'primary',
      status: SchoolStatus.ACTIVE,
    },
    loginSettings: {
      id: 'login-settings-1',
      schoolId: 'school-1',
      loginDomain: 'primary.moazez.school',
      status: SchoolLoginSettingsStatus.ACTIVE,
    },
    primaryAdmin: {
      id: 'user-1',
      email: 'admin@primary.moazez.school',
      username: 'admin',
      contactEmail: 'admin@example.test',
      phone: '+201000000000',
      firstName: 'School',
      lastName: 'Admin',
      userType: UserType.SCHOOL_USER,
      status: UserStatus.ACTIVE,
      mustChangePassword: true,
      passwordProvisionedAt: null,
      credentialVersion: 0,
      passwordHash: 'hash',
      tokenHash: 'token',
    } as PlatformSchoolProvisioningRecord['primaryAdmin'] & {
      passwordHash: string;
      tokenHash: string;
    },
    membership: {
      id: 'membership-1',
      userId: 'user-1',
      organizationId: 'org-1',
      schoolId: 'school-1',
      roleId: 'role-1',
      userType: UserType.SCHOOL_USER,
      status: MembershipStatus.ACTIVE,
      role: {
        id: 'role-1',
        key: 'school_admin',
        name: 'School Admin',
      },
    },
    credentials: {
      deliveryMode: 'activation_link',
      status: 'activation_link_deferred',
      passwordHash: 'hash',
      tokenHash: 'token',
    } as PlatformSchoolProvisioningRecord['credentials'] & {
      passwordHash: string;
      tokenHash: string;
    },
  };
}
