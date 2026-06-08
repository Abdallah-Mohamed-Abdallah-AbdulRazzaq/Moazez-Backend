import { OrganizationStatus, SchoolStatus } from '@prisma/client';
import {
  presentPlatformAdminOverview,
  presentPlatformOrganization,
  presentPlatformOrganizationsList,
  presentPlatformSchool,
} from '../presenters/platform-admin.presenter';
import {
  PlatformOrganizationRecord,
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
    });

    expect(response).toEqual({
      generatedAt: '2026-06-01T09:00:00.000Z',
      organizations: { total: 0, active: 0, suspended: 0, archived: 0 },
      schools: { total: 0, active: 0, suspended: 0, archived: 0 },
      deferred: {
        schoolProvisioning: 'deferred',
        entitlements: 'deferred',
        featureControl: 'deferred',
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
