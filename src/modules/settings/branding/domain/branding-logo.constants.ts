export const BRANDING_LOGO_ALLOWED_MIME_TYPES = [
  'image/png',
  'image/jpeg',
] as const;

export type BrandingLogoMimeType =
  (typeof BRANDING_LOGO_ALLOWED_MIME_TYPES)[number];

export const BRANDING_LOGO_MAX_SIZE_BYTES = 5 * 1024 * 1024;
export const BRANDING_LOGO_MULTIPART_FIELD = 'file';
export const BRANDING_LOGO_CACHE_CONTROL =
  'public, max-age=300, stale-while-revalidate=60';

export const BRANDING_LOGO_CLEANUP_QUEUE = 'settings-branding-logo-cleanup';
export const BRANDING_LOGO_CLEANUP_JOB = 'delete-object';
export const BRANDING_LOGO_RECONCILE_JOB = 'reconcile';
export const BRANDING_LOGO_RECONCILE_INTERVAL_MS = 15 * 60 * 1000;
export const BRANDING_LOGO_ORPHAN_GRACE_MS = 60 * 60 * 1000;
export const BRANDING_LOGO_TRANSACTION_MAX_ATTEMPTS = 3;
export const BRANDING_LOGO_RECONCILIATION_BATCH_SIZE = 100;

export function brandingLogoObjectPrefix(schoolId: string): string {
  return `schools/${schoolId}/branding/logos/`;
}

export function isBrandingLogoObjectKeyForSchool(
  objectKey: string,
  schoolId: string,
): boolean {
  const prefix = brandingLogoObjectPrefix(schoolId);
  if (!objectKey.startsWith(prefix)) return false;

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:png|jpg)$/i.test(
    objectKey.slice(prefix.length),
  );
}

export function isBrandingLogoMimeType(
  value: string,
): value is BrandingLogoMimeType {
  return (BRANDING_LOGO_ALLOWED_MIME_TYPES as readonly string[]).includes(
    value,
  );
}

export function brandingLogoExtension(mimeType: BrandingLogoMimeType): string {
  return mimeType === 'image/png' ? 'png' : 'jpg';
}
