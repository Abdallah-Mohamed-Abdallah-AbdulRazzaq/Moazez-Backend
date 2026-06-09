import { SchoolStatus } from '@prisma/client';
import {
  PlatformSchoolFeatureControlItemDto,
  PlatformSchoolFeatureControlsResponseDto,
} from '../dto/platform-admin-feature-control.dto';
import { mapFeatureControlSourceToApi } from '../domain/platform-admin-feature-control-inputs';
import { listPlatformSchoolFeatureDefinitions } from '../domain/platform-admin-feature-registry';
import {
  PlatformFeatureControlSchoolRecord,
  PlatformSchoolFeatureControlRecord,
} from '../infrastructure/platform-admin-features.repository';

export function presentPlatformSchoolFeatureControls(input: {
  school: PlatformFeatureControlSchoolRecord;
  controls: PlatformSchoolFeatureControlRecord[];
}): PlatformSchoolFeatureControlsResponseDto {
  const controlByFeatureKey = new Map(
    input.controls.map((control) => [control.featureKey, control]),
  );
  const features = listPlatformSchoolFeatureDefinitions().map((definition) => {
    const control = controlByFeatureKey.get(definition.featureKey);
    return control
      ? presentConfiguredFeature(definition, control)
      : presentDefaultFeature(definition);
  });

  const enabled = features.filter((feature) => feature.enabled).length;
  const configured = features.filter((feature) => feature.configured).length;

  return {
    school: {
      schoolId: input.school.id,
      organizationId: input.school.organizationId,
      name: input.school.name,
      slug: input.school.slug,
      status: mapSchoolStatusToApi(input.school.status),
    },
    features,
    summary: {
      totalKnownFeatures: features.length,
      configured,
      enabled,
      disabled: features.length - enabled,
    },
    deferred: {
      runtimeEnforcement: 'deferred',
      planAutomation: 'deferred',
      billing: 'out_of_scope_v1',
      rollouts: 'deferred',
    },
  };
}

function presentConfiguredFeature(
  definition: ReturnType<typeof listPlatformSchoolFeatureDefinitions>[number],
  control: PlatformSchoolFeatureControlRecord,
): PlatformSchoolFeatureControlItemDto {
  return {
    featureKey: definition.featureKey,
    label: definition.label,
    category: definition.category,
    enabled: control.enabled,
    configured: true,
    source: mapFeatureControlSourceToApi(control.source),
    notes: control.notes,
    updatedAt: control.updatedAt.toISOString(),
  };
}

function presentDefaultFeature(
  definition: ReturnType<typeof listPlatformSchoolFeatureDefinitions>[number],
): PlatformSchoolFeatureControlItemDto {
  return {
    featureKey: definition.featureKey,
    label: definition.label,
    category: definition.category,
    enabled: false,
    configured: false,
    source: 'platform_default',
    notes: null,
    updatedAt: null,
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
