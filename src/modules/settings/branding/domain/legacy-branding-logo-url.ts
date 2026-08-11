import {
  classifyPersistedUrl,
  isSyntacticallyPublicHostname,
} from '../../../../infrastructure/storage/provider-url.policy';

export type LegacyBrandingLogoValueClass =
  | 'external_https'
  | 'managed_internal_reference'
  | 'gcs_provider_url'
  | 's3_compatible_provider_url'
  | 'invalid_or_unsafe'
  | 'absent';

export function classifyLegacyBrandingLogoValue(
  value: string | null | undefined,
): LegacyBrandingLogoValueClass {
  const result = classifyPersistedUrl(value);
  if (result.classification === 'unsafe') return 'invalid_or_unsafe';
  return result.classification;
}

/** Read-only compatibility helper. New branding writes never accept logoUrl. */
export function toSafeLegacyBrandingLogoUrl(
  value: string | null,
): string | null {
  const result = classifyPersistedUrl(value);
  return result.classification === 'external_https'
    ? (result.normalizedValue as string)
    : null;
}

export { isSyntacticallyPublicHostname };
