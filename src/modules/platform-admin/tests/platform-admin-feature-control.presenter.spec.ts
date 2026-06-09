import {
  SchoolFeatureControlSource,
  SchoolStatus,
} from '@prisma/client';
import { presentPlatformSchoolFeatureControls } from '../presenters/platform-admin-feature-control.presenter';
import {
  PlatformFeatureControlSchoolRecord,
  PlatformSchoolFeatureControlRecord,
} from '../infrastructure/platform-admin-features.repository';

describe('Platform Admin feature control presenter', () => {
  it('presents all known features as disabled platform defaults when unconfigured', () => {
    const response = presentPlatformSchoolFeatureControls({
      school: schoolRecord(),
      controls: [],
    });

    expect(response.school).toEqual({
      schoolId: 'school-1',
      organizationId: 'org-1',
      name: 'Moazez Primary',
      slug: 'primary',
      status: 'active',
    });
    expect(response.features).toHaveLength(15);
    expect(response.features[0]).toEqual({
      featureKey: 'dashboard',
      label: 'Dashboard',
      category: 'school_dashboard',
      enabled: false,
      configured: false,
      source: 'platform_default',
      notes: null,
      updatedAt: null,
    });
    expect(response.summary).toEqual({
      totalKnownFeatures: 15,
      configured: 0,
      enabled: 0,
      disabled: 15,
    });
    expect(response.deferred).toEqual({
      runtimeEnforcement: 'deferred',
      planAutomation: 'deferred',
      billing: 'out_of_scope_v1',
      rollouts: 'deferred',
    });
  });

  it('presents configured rows safely without leaking out-of-scope fields', () => {
    const response = presentPlatformSchoolFeatureControls({
      school: schoolRecord(),
      controls: [
        featureControlRecord({
          featureKey: 'dashboard',
          enabled: true,
          source: SchoolFeatureControlSource.PLATFORM,
          notes: 'Enabled for launch',
        }),
      ],
    });
    const dashboard = response.features.find(
      (feature) => feature.featureKey === 'dashboard',
    );

    expect(dashboard).toMatchObject({
      enabled: true,
      configured: true,
      source: 'platform',
      notes: 'Enabled for launch',
      updatedAt: '2026-06-01T10:00:00.000Z',
    });
    expect(response.summary).toEqual({
      totalKnownFeatures: 15,
      configured: 1,
      enabled: 1,
      disabled: 14,
    });

    const serialized = JSON.stringify(response);
    for (const forbidden of [
      'invoice',
      'payment',
      'planId',
      'rolloutPercentage',
      'experiment',
      'passwordHash',
      'raw',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});

function schoolRecord(): PlatformFeatureControlSchoolRecord {
  return {
    id: 'school-1',
    organizationId: 'org-1',
    name: 'Moazez Primary',
    slug: 'primary',
    status: SchoolStatus.ACTIVE,
    deletedAt: null,
  };
}

function featureControlRecord(
  overrides: Partial<PlatformSchoolFeatureControlRecord> = {},
): PlatformSchoolFeatureControlRecord {
  return {
    id: 'feature-control-1',
    schoolId: 'school-1',
    organizationId: 'org-1',
    featureKey: 'dashboard',
    enabled: true,
    source: SchoolFeatureControlSource.PLATFORM,
    notes: null,
    createdAt: new Date('2026-06-01T09:00:00.000Z'),
    updatedAt: new Date('2026-06-01T10:00:00.000Z'),
    ...overrides,
  };
}
