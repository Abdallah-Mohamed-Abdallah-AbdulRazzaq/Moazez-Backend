import {
  APPROVED_PRODUCTION_APPLICATION_ORIGINS,
  APPROVED_STAGING_APPLICATION_ORIGINS,
} from '../bootstrap/application-cors.policy';
import { validateEnv } from './env.validation';

describe('bootstrap environment validation', () => {
  it('applies exact API database defaults', () => {
    expect(validateEnv(baseEnv())).toMatchObject({
      DATABASE_RUNTIME_ROLE: 'api',
      DATABASE_CONNECTION_LIMIT: 5,
      DATABASE_POOL_TIMEOUT_SECONDS: 5,
      DATABASE_CONNECT_TIMEOUT_SECONDS: 5,
    });
  });

  it('accepts lower bounded API database overrides', () => {
    expect(
      validateEnv(
        baseEnv({
          DATABASE_CONNECTION_LIMIT: '2',
          DATABASE_POOL_TIMEOUT_SECONDS: '3',
          DATABASE_CONNECT_TIMEOUT_SECONDS: '4',
        }),
      ),
    ).toMatchObject({
      DATABASE_CONNECTION_LIMIT: 2,
      DATABASE_POOL_TIMEOUT_SECONDS: 3,
      DATABASE_CONNECT_TIMEOUT_SECONDS: 4,
    });
  });

  it.each([
    ['DATABASE_CONNECTION_LIMIT', '0'],
    ['DATABASE_CONNECTION_LIMIT', '-1'],
    ['DATABASE_CONNECTION_LIMIT', '1.5'],
    ['DATABASE_CONNECTION_LIMIT', '6'],
    ['DATABASE_POOL_TIMEOUT_SECONDS', '0'],
    ['DATABASE_POOL_TIMEOUT_SECONDS', '6'],
    ['DATABASE_CONNECT_TIMEOUT_SECONDS', '0'],
    ['DATABASE_CONNECT_TIMEOUT_SECONDS', '6'],
  ])('rejects invalid API %s=%s', (field, value) => {
    expect(() => validateEnv(baseEnv({ [field]: value }))).toThrow(
      new RegExp(field, 'u'),
    );
  });

  it('rejects an incorrect API database role', () => {
    expect(() =>
      validateEnv(baseEnv({ DATABASE_RUNTIME_ROLE: 'core-worker' })),
    ).toThrow(/DATABASE_RUNTIME_ROLE/u);
  });

  it('requires encrypted PostgreSQL transport in staging and production', () => {
    expect(() =>
      validateEnv(
        productionEnv({
          DATABASE_URL:
            'postgresql://runtime-user:runtime-value@database.internal/moazez',
        }),
      ),
    ).toThrow(/sslmode/u);
  });

  it('defaults the internal management probe port to 9090', () => {
    expect(validateEnv(baseEnv()).APP_PROBE_PORT).toBe(9090);
  });

  it.each(['1', '9090', '65535'])(
    'accepts a bounded management probe port of %s',
    (value) => {
      expect(
        validateEnv(baseEnv({ APP_PROBE_PORT: value })).APP_PROBE_PORT,
      ).toBe(Number(value));
    },
  );

  it.each(['not-a-number', '1.5', '0', '-1', '65536'])(
    'rejects an invalid management probe port: %s',
    (value) => {
      expect(() => validateEnv(baseEnv({ APP_PROBE_PORT: value }))).toThrow(
        /APP_PROBE_PORT/u,
      );
    },
  );

  it('rejects a management probe port equal to the public application port', () => {
    expect(() =>
      validateEnv(baseEnv({ APP_PORT: '9090', APP_PROBE_PORT: '9090' })),
    ).toThrow(/APP_PROBE_PORT must differ from APP_PORT/u);
  });

  it('defaults the graceful shutdown timeout to 15000 milliseconds', () => {
    expect(validateEnv(baseEnv()).APP_SHUTDOWN_TIMEOUT_MS).toBe(15_000);
  });

  it.each(['1000', '15000', '60000'])(
    'accepts a bounded shutdown timeout of %s milliseconds',
    (value) => {
      expect(
        validateEnv(baseEnv({ APP_SHUTDOWN_TIMEOUT_MS: value }))
          .APP_SHUTDOWN_TIMEOUT_MS,
      ).toBe(Number(value));
    },
  );

  it.each(['not-a-number', '1.5', '0', '-1', '999', '60001'])(
    'rejects an invalid shutdown timeout: %s',
    (value) => {
      expect(() =>
        validateEnv(baseEnv({ APP_SHUTDOWN_TIMEOUT_MS: value })),
      ).toThrow(/APP_SHUTDOWN_TIMEOUT_MS/u);
    },
  );

  it('defaults Swagger to disabled', () => {
    expect(validateEnv(baseEnv()).SWAGGER_ENABLED).toBe(false);
  });

  it('requires explicit Queue and Realtime Redis URLs and never resolves legacy REDIS_URL', () => {
    expect(() =>
      validateEnv(
        baseEnv({
          QUEUE_REDIS_URL: undefined,
          REALTIME_REDIS_URL: undefined,
          REDIS_URL: 'redis://127.0.0.1:6379',
        }),
      ),
    ).toThrow(/QUEUE_REDIS_URL.*REALTIME_REDIS_URL/su);
  });

  it('accepts the same disposable Redis endpoint in development and test', () => {
    expect(
      validateEnv(
        baseEnv({
          QUEUE_REDIS_URL: 'redis://127.0.0.1:6379/0',
          REALTIME_REDIS_URL: 'redis://127.0.0.1:6379/1',
        }),
      ),
    ).toMatchObject({
      QUEUE_REDIS_URL: 'redis://127.0.0.1:6379/0',
      REALTIME_REDIS_URL: 'redis://127.0.0.1:6379/1',
    });
  });

  it.each([
    {
      QUEUE_REDIS_URL: 'redis://queue-user:queue-value@cache.invalid:6379/0',
      REALTIME_REDIS_URL:
        'redis://realtime-user:realtime-value@cache.invalid:6379/1',
    },
    {
      QUEUE_REDIS_URL: 'redis://cache.invalid/0',
      REALTIME_REDIS_URL: 'rediss://cache.invalid:6379/15?tls=true',
    },
  ])(
    'rejects logical-database or credential-only Redis separation in production',
    (redis) => {
      expect(() => validateEnv(productionEnv(redis))).toThrow(
        /must use different Redis endpoints/u,
      );
    },
  );

  it('accepts distinct Queue and Realtime Redis endpoints in staging and production', () => {
    expect(validateEnv(productionEnv())).toMatchObject({
      QUEUE_REDIS_URL: 'rediss://queue-cache.invalid:6379/0',
      REALTIME_REDIS_URL: 'rediss://realtime-cache.invalid:6379/0',
    });
  });

  it('redacts Redis endpoint components from separation errors', () => {
    let message = '';
    try {
      validateEnv(
        productionEnv({
          QUEUE_REDIS_URL:
            'redis://queue-user:queue-value@sensitive-cache.invalid:6380/0?field=value',
          REALTIME_REDIS_URL:
            'redis://other-user:other-value@sensitive-cache.invalid:6380/1?other=value',
        }),
      );
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain('REALTIME_REDIS_URL');
    for (const sensitive of [
      'queue-user',
      'queue-value',
      'sensitive-cache',
      '6380',
      '/0',
      'field=value',
    ]) {
      expect(message).not.toContain(sensitive);
    }
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
    DATABASE_URL:
      'postgresql://runtime-user:runtime-value@database.internal/moazez?sslmode=require',
    QUEUE_REDIS_URL: 'rediss://queue-cache.invalid:6379/0',
    REALTIME_REDIS_URL: 'rediss://realtime-cache.invalid:6379/0',
    ...overrides,
  });
}

function baseEnv(
  overrides: Record<string, string | undefined> = {},
): Record<string, string> {
  const values: Record<string, string | undefined> = {
    APP_URL: 'http://localhost:3000',
    DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/moazez',
    QUEUE_REDIS_URL: 'redis://localhost:6379',
    REALTIME_REDIS_URL: 'redis://localhost:6379',
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
