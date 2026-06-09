import { SchoolFeatureControlSource } from '@prisma/client';
import {
  BulkPlatformSchoolFeatureControlItemDto,
  SchoolFeatureControlSourceApiValue,
  UpsertPlatformSchoolFeatureControlDto,
} from '../dto/platform-admin-feature-control.dto';
import {
  assertPlatformSchoolFeatureKey,
  PlatformSchoolFeatureKey,
} from './platform-admin-feature-registry';
import { PlatformFeatureDuplicateKeyException } from './platform-admin-errors';

export interface NormalizedFeatureControlInput {
  featureKey: PlatformSchoolFeatureKey;
  enabled: boolean;
  source: SchoolFeatureControlSource;
  notes?: string | null;
  notesProvided: boolean;
}

export function normalizeSingleFeatureControlInput(
  featureKey: string,
  command: UpsertPlatformSchoolFeatureControlDto,
): NormalizedFeatureControlInput {
  return {
    featureKey: assertPlatformSchoolFeatureKey(featureKey),
    enabled: command.enabled,
    source: mapFeatureControlSourceFromApi(command.source ?? 'platform'),
    notes:
      command.notes !== undefined
        ? normalizeFeatureControlNotes(command.notes)
        : undefined,
    notesProvided: command.notes !== undefined,
  };
}

export function normalizeBulkFeatureControlInput(
  features: BulkPlatformSchoolFeatureControlItemDto[],
): NormalizedFeatureControlInput[] {
  const normalized = features.map((feature) =>
    normalizeSingleFeatureControlInput(feature.featureKey, feature),
  );

  const duplicates = findDuplicateFeatureKeys(
    normalized.map((feature) => feature.featureKey),
  );
  if (duplicates.length > 0) {
    throw new PlatformFeatureDuplicateKeyException(duplicates);
  }

  return normalized;
}

export function mapFeatureControlSourceFromApi(
  source: SchoolFeatureControlSourceApiValue,
): SchoolFeatureControlSource {
  switch (source) {
    case 'platform':
      return SchoolFeatureControlSource.PLATFORM;
    case 'entitlement':
      return SchoolFeatureControlSource.ENTITLEMENT;
    case 'system':
      return SchoolFeatureControlSource.SYSTEM;
  }
}

export function mapFeatureControlSourceToApi(
  source: SchoolFeatureControlSource,
): SchoolFeatureControlSourceApiValue {
  switch (source) {
    case SchoolFeatureControlSource.PLATFORM:
      return 'platform';
    case SchoolFeatureControlSource.ENTITLEMENT:
      return 'entitlement';
    case SchoolFeatureControlSource.SYSTEM:
      return 'system';
  }
}

function normalizeFeatureControlNotes(value: string | null): string | null {
  if (value === null) return null;

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function findDuplicateFeatureKeys(
  featureKeys: PlatformSchoolFeatureKey[],
): PlatformSchoolFeatureKey[] {
  const seen = new Set<PlatformSchoolFeatureKey>();
  const duplicates = new Set<PlatformSchoolFeatureKey>();

  for (const featureKey of featureKeys) {
    if (seen.has(featureKey)) {
      duplicates.add(featureKey);
    }
    seen.add(featureKey);
  }

  return [...duplicates].sort();
}
