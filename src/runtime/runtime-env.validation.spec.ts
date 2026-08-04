import {
  validateCoreWorkerEnv,
  validateMaintenanceSchedulerEnv,
  validateMediaWorkerEnv,
} from './runtime-env.validation';

describe('runtime role database environment validation', () => {
  it('applies exact Core Worker database defaults', () => {
    expect(validateCoreWorkerEnv(coreEnvironment())).toMatchObject({
      DATABASE_RUNTIME_ROLE: 'core-worker',
      DATABASE_CONNECTION_LIMIT: 6,
      DATABASE_POOL_TIMEOUT_SECONDS: 10,
      DATABASE_CONNECT_TIMEOUT_SECONDS: 5,
    });
  });

  it('applies exact Media Worker database defaults', () => {
    expect(validateMediaWorkerEnv(mediaEnvironment())).toMatchObject({
      DATABASE_RUNTIME_ROLE: 'media-worker',
      DATABASE_CONNECTION_LIMIT: 3,
      DATABASE_POOL_TIMEOUT_SECONDS: 10,
      DATABASE_CONNECT_TIMEOUT_SECONDS: 5,
    });
  });

  it('accepts lower bounded worker overrides', () => {
    expect(
      validateCoreWorkerEnv(
        coreEnvironment({
          DATABASE_CONNECTION_LIMIT: '2',
          DATABASE_POOL_TIMEOUT_SECONDS: '4',
          DATABASE_CONNECT_TIMEOUT_SECONDS: '2',
        }),
      ),
    ).toMatchObject({
      DATABASE_CONNECTION_LIMIT: 2,
      DATABASE_POOL_TIMEOUT_SECONDS: 4,
      DATABASE_CONNECT_TIMEOUT_SECONDS: 2,
    });
  });

  it.each([
    ['DATABASE_CONNECTION_LIMIT', '0'],
    ['DATABASE_CONNECTION_LIMIT', '-1'],
    ['DATABASE_CONNECTION_LIMIT', '1.5'],
    ['DATABASE_CONNECTION_LIMIT', '7'],
    ['DATABASE_POOL_TIMEOUT_SECONDS', '0'],
    ['DATABASE_POOL_TIMEOUT_SECONDS', '11'],
    ['DATABASE_CONNECT_TIMEOUT_SECONDS', '0'],
    ['DATABASE_CONNECT_TIMEOUT_SECONDS', '6'],
  ])('rejects invalid Core Worker %s=%s', (field, value) => {
    expect(() =>
      validateCoreWorkerEnv(coreEnvironment({ [field]: value })),
    ).toThrow(new RegExp(field, 'u'));
  });

  it('rejects incorrect worker roles', () => {
    expect(() =>
      validateCoreWorkerEnv(
        coreEnvironment({ DATABASE_RUNTIME_ROLE: 'media-worker' }),
      ),
    ).toThrow(/DATABASE_RUNTIME_ROLE/u);
    expect(() =>
      validateMediaWorkerEnv(
        mediaEnvironment({ DATABASE_RUNTIME_ROLE: 'api' }),
      ),
    ).toThrow(/DATABASE_RUNTIME_ROLE/u);
  });

  it('requires encrypted PostgreSQL transport in staging and production', () => {
    expect(() =>
      validateCoreWorkerEnv(coreEnvironment({ NODE_ENV: 'production' })),
    ).toThrow(/DATABASE_URL.*sslmode|sslmode.*DATABASE_URL/su);
    expect(() =>
      validateMediaWorkerEnv(
        mediaEnvironment({
          NODE_ENV: 'staging',
          DATABASE_URL:
            'postgresql://runtime-user:runtime-value@database.internal/moazez?sslmode=require',
        }),
      ),
    ).not.toThrow();
  });

  it('keeps Maintenance Scheduler database-free', () => {
    const scheduler = validateMaintenanceSchedulerEnv({
      REDIS_URL: 'redis://127.0.0.1:6379',
    });
    expect(scheduler).not.toHaveProperty('DATABASE_URL');
    expect(scheduler).not.toHaveProperty('DATABASE_RUNTIME_ROLE');

    for (const field of [
      'DATABASE_URL',
      'DATABASE_RUNTIME_ROLE',
      'DATABASE_CONNECTION_LIMIT',
      'DATABASE_POOL_TIMEOUT_SECONDS',
      'DATABASE_CONNECT_TIMEOUT_SECONDS',
    ]) {
      expect(() =>
        validateMaintenanceSchedulerEnv({
          REDIS_URL: 'redis://127.0.0.1:6379',
          [field]: '1',
        }),
      ).toThrow(new RegExp(field, 'u'));
    }
  });
});

function coreEnvironment(
  overrides: Record<string, string> = {},
): Record<string, string> {
  return {
    NODE_ENV: 'test',
    APP_URL: 'http://127.0.0.1:3000',
    DATABASE_URL:
      'postgresql://runtime-user:runtime-value@127.0.0.1:5432/moazez',
    REDIS_URL: 'redis://127.0.0.1:6379',
    STORAGE_ENDPOINT: 'http://127.0.0.1:9000',
    STORAGE_ACCESS_KEY: 'runtime-access',
    STORAGE_SECRET_KEY: 'runtime-value',
    STORAGE_BUCKET: 'runtime-private',
    STORAGE_PUBLIC_BUCKET: 'runtime-public',
    ...overrides,
  };
}

function mediaEnvironment(
  overrides: Record<string, string> = {},
): Record<string, string> {
  return {
    NODE_ENV: 'test',
    DATABASE_URL:
      'postgresql://runtime-user:runtime-value@127.0.0.1:5432/moazez',
    REDIS_URL: 'redis://127.0.0.1:6379',
    STORAGE_ENDPOINT: 'http://127.0.0.1:9000',
    STORAGE_ACCESS_KEY: 'runtime-access',
    STORAGE_SECRET_KEY: 'runtime-value',
    STORAGE_BUCKET: 'runtime-private',
    STORAGE_PUBLIC_BUCKET: 'runtime-public',
    ...overrides,
  };
}
