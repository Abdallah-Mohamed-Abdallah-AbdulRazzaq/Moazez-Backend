import {
  classifyLegacyBrandingLogoValue,
  toSafeLegacyBrandingLogoUrl,
} from '../domain/legacy-branding-logo-url';

describe('legacy branding logo URL compatibility', () => {
  it('allows only an ordinary public HTTPS value as read-only compatibility', () => {
    expect(
      toSafeLegacyBrandingLogoUrl('https://cdn.example.com/school/logo.png'),
    ).toBe('https://cdn.example.com/school/logo.png');
    expect(toSafeLegacyBrandingLogoUrl(null)).toBeNull();
  });

  it.each([
    'http://cdn.example.com/logo.png',
    'https://user:secret@cdn.example.com/logo.png',
    'https://localhost/logo.png',
    'https://10.0.0.8/logo.png',
    'https://school.internal/logo.png',
    'not a valid URL',
    'schools/school-id/branding/logos/logo.png',
  ])('rejects an unsafe or malformed legacy value %s', (value) => {
    expect(toSafeLegacyBrandingLogoUrl(value)).toBeNull();
  });

  it.each([
    ['https://storage.googleapis.com/bucket/logo.png', 'gcs_provider_url'],
    ['https://bucket.storage.googleapis.com/logo.png', 'gcs_provider_url'],
    ['gs://bucket/logo.png', 'gcs_provider_url'],
    ['https://bucket.s3.amazonaws.com/logo.png', 's3_compatible_provider_url'],
    ['http://127.0.0.1:9000/bucket/logo.png', 's3_compatible_provider_url'],
    ['s3://bucket/logo.png', 's3_compatible_provider_url'],
  ])('blocks provider URL %s as %s', (value, classification) => {
    expect(classifyLegacyBrandingLogoValue(value)).toBe(classification);
    expect(toSafeLegacyBrandingLogoUrl(value)).toBeNull();
  });

  it('does not expose signed provider query material in classification', () => {
    const value =
      'https://storage.googleapis.com/bucket/logo.png?X-Goog-Credential=do-not-leak&X-Goog-Signature=secret';
    const result = classifyLegacyBrandingLogoValue(value);

    expect(result).toBe('gcs_provider_url');
    expect(JSON.stringify(result)).not.toContain('do-not-leak');
    expect(JSON.stringify(result)).not.toContain('secret');
  });

  it('treats query parameters as irrelevant on an ordinary external host', () => {
    const value =
      'https://cdn.school-domain.com/logo.png?sig=campaign-label&utm_source=portal';

    expect(classifyLegacyBrandingLogoValue(value)).toBe('external_https');
    expect(toSafeLegacyBrandingLogoUrl(value)).toBe(value);
  });

  it('does not expose a protected managed Files route as a legacy URL', () => {
    const value = 'https://api.example.com/api/v1/files/file-id/download';
    expect(classifyLegacyBrandingLogoValue(value)).toBe(
      'managed_internal_reference',
    );
    expect(toSafeLegacyBrandingLogoUrl(value)).toBeNull();
  });
});
