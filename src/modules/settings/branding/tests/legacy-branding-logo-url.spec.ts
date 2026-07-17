import {
  classifyLegacyBrandingLogoValue,
  toSafeLegacyBrandingLogoUrl,
} from '../domain/legacy-branding-logo-url';
import { classifySchoolBrandingLogoValues } from '../../../../../scripts/audits/classify-school-branding-logo-values';

describe('legacy branding logo URL compatibility', () => {
  it('accepts only public credential-free HTTPS URLs', () => {
    expect(
      toSafeLegacyBrandingLogoUrl('https://cdn.example.com/school/logo.png'),
    ).toBe('https://cdn.example.com/school/logo.png');
    expect(
      toSafeLegacyBrandingLogoUrl('http://cdn.example.com/logo.png'),
    ).toBeNull();
    expect(
      toSafeLegacyBrandingLogoUrl(
        'https://user:secret@cdn.example.com/logo.png',
      ),
    ).toBeNull();
    expect(
      toSafeLegacyBrandingLogoUrl(
        'https://assets.school-domain.com:8443/logo.png',
      ),
    ).toBe('https://assets.school-domain.com:8443/logo.png');
  });

  it.each([
    'https://localhost/logo.png',
    'https://assets.localhost/logo.png',
    'https://storage/logo.png',
    'https://127.0.0.1/logo.png',
    'https://0.0.0.0/logo.png',
    'https://10.0.0.8/logo.png',
    'https://100.64.0.1/logo.png',
    'https://169.254.1.2/logo.png',
    'https://172.16.1.2/logo.png',
    'https://192.168.1.2/logo.png',
    'https://192.0.2.1/logo.png',
    'https://198.51.100.1/logo.png',
    'https://203.0.113.1/logo.png',
    'https://224.0.0.1/logo.png',
    'https://255.255.255.255/logo.png',
    'https://[::]/logo.png',
    'https://[::1]/logo.png',
    'https://[fc00::1]/logo.png',
    'https://[fe80::1]/logo.png',
    'https://[ff02::1]/logo.png',
    'https://[2001:db8::1]/logo.png',
    'https://[100::]/logo.png',
    'https://[2001:10::1]/logo.png',
    'https://[3fff::1]/logo.png',
    'https://[5f00::1]/logo.png',
    'https://[::ffff:10.0.0.8]/logo.png',
    'https://school.localdomain/logo.png',
    'https://storage.internal/logo.png',
    'https://storage.intranet/logo.png',
    'https://school.local/logo.png',
    'https://school.lan/logo.png',
    'https://school.home/logo.png',
    'https://school.home.arpa/logo.png',
    'https://school.test/logo.png',
    'https://school.example/logo.png',
    'https://school.invalid/logo.png',
  ])('rejects private or internal host %s', (value) => {
    expect(toSafeLegacyBrandingLogoUrl(value)).toBeNull();
  });

  it.each([
    'https://8.8.8.8/logo.png',
    'https://[2606:4700:4700::1111]/logo.png',
    'https://[::ffff:8.8.8.8]/logo.png',
    'https://cdn.school-domain.com/logo.png',
  ])('accepts a trusted syntactically public HTTPS form %s', (value) => {
    expect(toSafeLegacyBrandingLogoUrl(value)).not.toBeNull();
  });

  it('rejects protected Files routes and signed storage URLs', () => {
    expect(
      toSafeLegacyBrandingLogoUrl(
        'https://api.example.com/api/v1/files/file-id/download',
      ),
    ).toBeNull();
    expect(
      toSafeLegacyBrandingLogoUrl(
        'https://cdn.example.com/logo.png?X-Amz-Signature=redacted',
      ),
    ).toBeNull();
  });

  it.each([
    [
      'AWS presigned URL',
      'https://storage.school-domain.com/logo.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=redacted&X-Amz-Date=20260717T000000Z&X-Amz-Expires=60&X-Amz-SignedHeaders=host&X-Amz-Signature=redacted',
    ],
    [
      'GCS V4 signed URL',
      'https://storage.googleapis.com/public-school-assets/logo.png?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Credential=redacted%2F20260717%2Fauto%2Fstorage%2Fgoog4_request&X-Goog-Date=20260717T000000Z&X-Goog-Expires=60&X-Goog-SignedHeaders=host&X-Goog-Signature=redacted',
    ],
    [
      'GCS legacy GoogleAccessId URL',
      'https://storage.googleapis.com/public-school-assets/logo.png?GoogleAccessId=service%40school-domain.com&Expires=1900000000&Signature=redacted%2Bvalue',
    ],
    [
      'Azure service SAS',
      'https://schoolassets.blob.core.windows.net/branding/logo.png?sv=2025-01-05&se=2026-07-17T01%3A00%3A00Z&sp=r&sr=b&sig=redacted%2Bvalue',
    ],
    [
      'Azure account SAS',
      'https://schoolassets.blob.core.windows.net/branding/logo.png?sv=2025-01-05&ss=b&srt=sco&sp=r&se=2026-07-17T01%3A00%3A00Z&sig=redacted',
    ],
    [
      'CloudFront canned policy',
      'https://assets.school-domain.com/logo.png?Expires=1900000000&Signature=redacted&Key-Pair-Id=K123456789',
    ],
    [
      'CloudFront custom policy',
      'https://assets.school-domain.com/logo.png?Policy=eyJTdGF0ZW1lbnQiOiJyZWRhY3RlZCJ9&Signature=redacted%2Bvalue&Key-Pair-Id=K123456789',
    ],
    [
      'mixed-case signed keys',
      'https://storage.googleapis.com/public-school-assets/logo.png?X-gOoG-aLgOrItHm=GOOG4-RSA-SHA256&X-GoOg-SiGnAtUrE=redacted',
    ],
  ])(
    'rejects and classifies %s without exposing query values',
    (_name, value) => {
      expect(classifyLegacyBrandingLogoValue(value)).toBe('signed_storage_url');
      expect(toSafeLegacyBrandingLogoUrl(value)).toBeNull();
    },
  );

  it('does not treat an ordinary external URL as Azure SAS solely for sig', () => {
    const value =
      'https://cdn.school-domain.com/logo.png?sig=campaign-label&utm_source=portal';

    expect(classifyLegacyBrandingLogoValue(value)).toBe('external_http_https');
    expect(toSafeLegacyBrandingLogoUrl(value)).toBe(value);
  });

  it('classifies values without fetching or mutating them', () => {
    expect(
      classifyLegacyBrandingLogoValue('https://cdn.example.com/logo.png'),
    ).toBe('external_http_https');
    expect(
      classifyLegacyBrandingLogoValue(
        'https://api.example.com/api/v1/files/id/download',
      ),
    ).toBe('protected_files_download_route');
    expect(
      classifyLegacyBrandingLogoValue(
        'https://storage.example.com/logo?X-Amz-Expires=60',
      ),
    ).toBe('signed_storage_url');
    expect(
      classifyLegacyBrandingLogoValue('schools/id/branding/logos/logo.png'),
    ).toBe('raw_storage_key');
    expect(classifyLegacyBrandingLogoValue('https://%')).toBe('invalid_url');
  });

  it('runs the repository classifier as a read-only sanitized count', async () => {
    const schoolProfile = {
      findMany: jest
        .fn()
        .mockResolvedValue([
          { logoUrl: 'https://cdn.example.com/logo.png' },
          { logoUrl: 'schools/school-id/branding/logos/logo.png' },
        ]),
    };

    const result = await classifySchoolBrandingLogoValues({
      schoolProfile,
    } as never);

    expect(schoolProfile.findMany).toHaveBeenCalledWith({
      where: { logoUrl: { not: null } },
      select: { logoUrl: true },
    });
    expect(result.external_http_https.count).toBe(1);
    expect(result.raw_storage_key.count).toBe(1);
    expect(JSON.stringify(result)).not.toContain('cdn.example.com');
    expect(JSON.stringify(result)).not.toContain('school-id');
  });
});
