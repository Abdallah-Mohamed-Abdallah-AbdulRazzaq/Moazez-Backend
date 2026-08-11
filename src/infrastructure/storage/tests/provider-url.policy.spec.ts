import {
  classifyPersistedUrl,
  isProviderUrlClassification,
} from '../provider-url.policy';

describe('provider URL persistence policy', () => {
  it.each([
    'https://media.example.org/lessons/storage/s3-introduction.mp4',
    'https://storage-school.example.org/s3/logo.png',
    'https://cdn.example.org/logo.png?version=storage',
    'https://storage.googleapis.com.external.example.org/object',
    'https://s3.amazonaws.com.external.example.org/object',
    'https://cdn.example.org/minio/bucket/object',
  ])(
    'allows ordinary public HTTPS without substring false positives: %s',
    (url) => {
      expect(classifyPersistedUrl(url)).toEqual({
        classification: 'external_https',
        normalizedValue: url,
      });
    },
  );

  it.each([
    ['https://storage.googleapis.com/bucket/object', 'gcs_provider_url'],
    ['https://bucket.storage.googleapis.com/object', 'gcs_provider_url'],
    ['https://storage.cloud.google.com/bucket/object', 'gcs_provider_url'],
    [
      'https://www.googleapis.com/storage/v1/b/bucket/o/object',
      'gcs_provider_url',
    ],
    ['gs://bucket/object', 'gcs_provider_url'],
    ['https://s3.amazonaws.com/bucket/object', 's3_compatible_provider_url'],
    [
      'https://bucket.s3.me-central-1.amazonaws.com/object',
      's3_compatible_provider_url',
    ],
    ['s3://bucket/object', 's3_compatible_provider_url'],
    ['http://127.0.0.1:9000/bucket/object', 's3_compatible_provider_url'],
    [
      'http://g06-fixture-minio:9000/bucket/object',
      's3_compatible_provider_url',
    ],
  ])('classifies provider form %s', (url, classification) => {
    const result = classifyPersistedUrl(url);
    expect(result).toEqual({ classification });
    expect(isProviderUrlClassification(result.classification)).toBe(true);
  });

  it('ignores signed query material when classifying a provider host', () => {
    const raw =
      'https://storage.googleapis.com/private/object?X-Goog-Credential=secret&X-Goog-Signature=token';
    const result = classifyPersistedUrl(raw);

    expect(result).toEqual({ classification: 'gcs_provider_url' });
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(JSON.stringify(result)).not.toContain('token');
  });

  it('uses a structurally matched configured S3-compatible endpoint', () => {
    expect(
      classifyPersistedUrl('https://objects.moazez.local.example/bucket/key', {
        s3CompatibleEndpoints: ['https://objects.moazez.local.example'],
      }),
    ).toEqual({ classification: 's3_compatible_provider_url' });
  });

  it.each([
    ['http://cdn.example.org/logo.png', 'insecure_http'],
    ['not a URL', 'malformed_url'],
    ['ftp://cdn.example.org/logo.png', 'unsupported_scheme'],
    ['https://user:password@cdn.example.org/logo.png', 'embedded_credentials'],
    ['https://localhost/logo.png', 'non_public_hostname'],
    ['', 'empty_value'],
  ])('fails unsafe value without echoing it: %s', (url, reasonCode) => {
    const result = classifyPersistedUrl(url);
    expect(result).toEqual({ classification: 'unsafe', reasonCode });
    expect(JSON.stringify(result)).not.toContain(url || 'not-present');
  });

  it.each([null, undefined])('allows absent value %s', (value) => {
    expect(classifyPersistedUrl(value)).toEqual({ classification: 'absent' });
  });

  it.each([
    '2d7b893e-cc2b-4f11-95f2-bd7483b1d8b4',
    '/api/v1/files/2d7b893e-cc2b-4f11-95f2-bd7483b1d8b4/download',
    '/badges/speed.svg',
  ])('recognizes managed/internal reference %s', (value) => {
    expect(classifyPersistedUrl(value)).toEqual({
      classification: 'managed_internal_reference',
      normalizedValue: value,
    });
  });
});
