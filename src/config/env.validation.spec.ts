import {
  APPROVED_PRODUCTION_APPLICATION_ORIGINS,
  APPROVED_STAGING_APPLICATION_ORIGINS,
} from '../bootstrap/application-cors.policy';
import { validateEnv } from './env.validation';

describe('bootstrap environment validation', () => {
  it('defaults Swagger to disabled', () => {
    expect(validateEnv(baseEnv()).SWAGGER_ENABLED).toBe(false);
  });

  it('parses explicit Swagger enablement outside production', () => {
    expect(
      validateEnv(baseEnv({ SWAGGER_ENABLED: 'true' })).SWAGGER_ENABLED,
    ).toBe(true);
  });

  it('rejects Swagger enablement in production', () => {
    expect(() =>
      validateEnv(
        productionEnv({
          SWAGGER_ENABLED: 'true',
        }),
      ),
    ).toThrow(/forbidden in production/u);
  });

  it('accepts only the exact approved production application origins', () => {
    const env = validateEnv(productionEnv());
    expect(env.APP_CORS_ORIGINS).toBe(
      APPROVED_PRODUCTION_APPLICATION_ORIGINS.join(','),
    );
  });

  it('accepts only the exact approved staging application origins', () => {
    const env = validateEnv(
      productionEnv({
        NODE_ENV: 'staging',
        APP_CORS_ORIGINS: APPROVED_STAGING_APPLICATION_ORIGINS.join(','),
      }),
    );
    expect(env.APP_CORS_ORIGINS).toBe(
      APPROVED_STAGING_APPLICATION_ORIGINS.join(','),
    );
  });

  it.each([
    '*',
    'null',
    'https://schools.moazez.cloud/path,https://admin.moazez.cloud',
    'https://schools.moazez.cloud,https://schools.moazez.cloud',
    'https://schools.moazez.cloud,https://admin.moazez.cloud,https://extra.moazez.cloud',
  ])('rejects invalid production application origins: %s', (origins) => {
    expect(() =>
      validateEnv(productionEnv({ APP_CORS_ORIGINS: origins })),
    ).toThrow(/APP_CORS_ORIGINS/u);
  });
});

function productionEnv(
  overrides: Record<string, string | undefined> = {},
): Record<string, string> {
  return baseEnv({
    NODE_ENV: 'production',
    APP_CORS_ORIGINS: APPROVED_PRODUCTION_APPLICATION_ORIGINS.join(','),
    STORAGE_CORS_ORIGINS: 'https://schools.moazez.cloud',
    ...overrides,
  });
}

function baseEnv(
  overrides: Record<string, string | undefined> = {},
): Record<string, string> {
  const values: Record<string, string | undefined> = {
    APP_URL: 'http://localhost:3000',
    DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/moazez',
    REDIS_URL: 'redis://localhost:6379',
    JWT_ACCESS_SECRET: 'access-secret-for-tests',
    JWT_REFRESH_SECRET: 'refresh-secret-for-tests',
    JWT_ACCESS_TTL: '15m',
    JWT_REFRESH_TTL: '7d',
    STORAGE_ENDPOINT: 'http://localhost:9000',
    STORAGE_ACCESS_KEY: 'local-access-key',
    STORAGE_SECRET_KEY: 'local-secret-key',
    STORAGE_BUCKET: 'moazez-private',
    STORAGE_PUBLIC_BUCKET: 'moazez-public',
    ...overrides,
  };
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined),
  ) as Record<string, string>;
}
