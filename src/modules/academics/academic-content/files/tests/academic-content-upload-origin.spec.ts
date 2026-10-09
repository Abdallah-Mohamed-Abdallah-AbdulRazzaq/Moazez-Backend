import { ConfigService } from '@nestjs/config';
import { APPROVED_PRODUCTION_APPLICATION_ORIGINS } from '../../../../../bootstrap/application-cors.policy';
import { ValidationDomainException } from '../../../../../common/exceptions/domain-exception';
import { resolveAcademicContentUploadOrigin } from '../application/academic-content-upload-origin';

const origin = 'https://schools.example.test';
function configuration(storageOrigins: string | readonly string[]) {
  return new ConfigService({
    NODE_ENV: 'test',
    APP_CORS_ORIGINS: `${origin},https://application-only.example.test`,
    STORAGE_CORS_ORIGINS: storageOrigins,
  });
}

describe('Academic Content request Origin authority', () => {
  it.each([origin, [origin]])(
    'accepts the intersection with raw or validated storage configuration %j',
    (storageOrigins) => {
      expect(
        resolveAcademicContentUploadOrigin(
          origin,
          configuration(storageOrigins),
        ),
      ).toBe(origin);
    },
  );

  it('does not fabricate an Origin for non-browser requests', () => {
    expect(
      resolveAcademicContentUploadOrigin(undefined, configuration(origin)),
    ).toBeUndefined();
  });

  it.each([
    '',
    '*',
    'null',
    'https://unapproved.example.test',
    'https://application-only.example.test',
    'https://storage-only.example.test',
    `${origin}/`,
    `${origin}/path`,
    `${origin}?query=1`,
    `${origin}#fragment`,
    'https://user:password@schools.example.test',
    ` ${origin}`,
    `${origin},${origin}`,
    null,
    [origin],
  ])('rejects malformed or non-intersecting request origin %j', (untrusted) => {
    expect(() =>
      resolveAcademicContentUploadOrigin(
        untrusted as string,
        configuration([origin, 'https://storage-only.example.test']),
      ),
    ).toThrow(ValidationDomainException);
  });

  it('does not approve an application-only production origin for storage', () => {
    const config = new ConfigService({
      NODE_ENV: 'production',
      APP_CORS_ORIGINS: APPROVED_PRODUCTION_APPLICATION_ORIGINS.join(','),
      STORAGE_CORS_ORIGINS: [
        'https://schools.moazez.cloud',
        'https://admin.moazez.cloud',
      ],
    });
    expect(
      resolveAcademicContentUploadOrigin(
        'https://schools.moazez.cloud',
        config,
      ),
    ).toBe('https://schools.moazez.cloud');
    expect(() =>
      resolveAcademicContentUploadOrigin(
        'https://student.moazez.cloud',
        config,
      ),
    ).toThrow(ValidationDomainException);
  });

  it('fails closed when the storage allowlist does not approve the origin', () => {
    expect(() =>
      resolveAcademicContentUploadOrigin(origin, configuration([])),
    ).toThrow(ValidationDomainException);
  });
});
