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
          STORAGE_PROVIDER: 'gcs',
          STORAGE_ENDPOINT: undefined,
          STORAGE_ACCESS_KEY: undefined,
          STORAGE_SECRET_KEY: undefined,
          GCP_PROJECT_ID: 'moazez-nonprod-project',
        }),
      ),
    ).not.toThrow();
  });

  it('keeps Maintenance Scheduler database-free', () => {
    const scheduler = validateMaintenanceSchedulerEnv({
      QUEUE_REDIS_URL: 'redis://127.0.0.1:6379',
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
          QUEUE_REDIS_URL: 'redis://127.0.0.1:6379',
          [field]: '1',
        }),
      ).toThrow(new RegExp(field, 'u'));
    }
  });

  it('requires Queue and Realtime Redis for Core Worker', () => {
    expect(() =>
      validateCoreWorkerEnv(
        coreEnvironment({
          QUEUE_REDIS_URL: undefined,
          REALTIME_REDIS_URL: undefined,
          REDIS_URL: 'redis://127.0.0.1:6379',
        }),
      ),
    ).toThrow(/QUEUE_REDIS_URL.*REALTIME_REDIS_URL/su);
  });

  it('requires only Queue Redis for Media Worker and Maintenance Scheduler', () => {
    const media = validateMediaWorkerEnv(mediaEnvironment());
    const scheduler = validateMaintenanceSchedulerEnv({
      NODE_ENV: 'production',
      QUEUE_REDIS_URL: 'rediss://queue-cache.invalid:6379',
      REALTIME_REDIS_URL: 'rediss://realtime-cache.invalid:6379',
    });

    expect(media.QUEUE_REDIS_URL).toBe('redis://127.0.0.1:6379');
    expect(media).not.toHaveProperty('REALTIME_REDIS_URL');
    expect(scheduler.QUEUE_REDIS_URL).toBe('rediss://queue-cache.invalid:6379');
    expect(scheduler).not.toHaveProperty('REALTIME_REDIS_URL');
  });

  it('rejects same-endpoint Core Worker Redis URLs in staging and production', () => {
    expect(() =>
      validateCoreWorkerEnv(
        coreEnvironment({
          NODE_ENV: 'production',
          DATABASE_URL:
            'postgresql://runtime-user:runtime-value@database.internal/moazez?sslmode=require',
          QUEUE_REDIS_URL: 'rediss://queue-user:value@cache.invalid:6379/0',
          REALTIME_REDIS_URL:
            'rediss://realtime-user:value@cache.invalid:6379/1',
        }),
      ),
    ).toThrow(/must use different Redis endpoints/u);
  });

  it('accepts equal Core Worker Redis endpoints in test', () => {
    expect(validateCoreWorkerEnv(coreEnvironment())).toMatchObject({
      QUEUE_REDIS_URL: 'redis://127.0.0.1:6379',
      REALTIME_REDIS_URL: 'redis://127.0.0.1:6379',
    });
  });

  it('accepts Core and Media GCS object access without signer configuration', () => {
    const core = validateCoreWorkerEnv(
      coreEnvironment({
        NODE_ENV: 'staging',
        DATABASE_URL:
          'postgresql://runtime-user:runtime-value@database.internal/moazez?sslmode=require',
        QUEUE_REDIS_URL: 'rediss://queue-cache.invalid:6379',
        REALTIME_REDIS_URL: 'rediss://realtime-cache.invalid:6379',
        STORAGE_PROVIDER: 'gcs',
        STORAGE_ENDPOINT: undefined,
        STORAGE_ACCESS_KEY: undefined,
        STORAGE_SECRET_KEY: undefined,
        GCP_PROJECT_ID: 'moazez-nonprod-project',
      }),
    );
    const media = validateMediaWorkerEnv(
      mediaEnvironment({
        NODE_ENV: 'production',
        DATABASE_URL:
          'postgresql://runtime-user:runtime-value@database.internal/moazez?sslmode=require',
        STORAGE_PROVIDER: 'gcs',
        STORAGE_ENDPOINT: undefined,
        STORAGE_ACCESS_KEY: undefined,
        STORAGE_SECRET_KEY: undefined,
        GCP_PROJECT_ID: 'moazez-nonprod-project',
      }),
    );

    expect(core.STORAGE_PROVIDER).toBe('gcs');
    expect(media.STORAGE_PROVIDER).toBe('gcs');
    expect(core.GCS_SIGNING_SERVICE_ACCOUNT).toBeUndefined();
    expect(media.GCS_SIGNING_SERVICE_ACCOUNT).toBeUndefined();
  });

  it.each([
    ['core', 'staging'],
    ['core', 'production'],
    ['media', 'staging'],
    ['media', 'production'],
  ] as const)(
    'accepts %s Worker GCS without signer configuration in %s',
    (role, nodeEnvironment) => {
      const overrides = secureWorkerStorageOverrides(nodeEnvironment);
      const env =
        role === 'core'
          ? validateCoreWorkerEnv(coreEnvironment(overrides))
          : validateMediaWorkerEnv(mediaEnvironment(overrides));

      expect(env.STORAGE_PROVIDER).toBe('gcs');
      expect(env.GCP_PROJECT_ID).toBe(`moazez-${nodeEnvironment}`);
      expect(env.GCS_SIGNING_SERVICE_ACCOUNT).toBeUndefined();
    },
  );

  it.each([
    ['core', 'staging', 'minio'],
    ['core', 'staging', 's3'],
    ['core', 'production', 'minio'],
    ['core', 'production', 's3'],
    ['media', 'staging', 'minio'],
    ['media', 'staging', 's3'],
    ['media', 'production', 'minio'],
    ['media', 'production', 's3'],
  ])(
    'requires GCS for %s Worker storage in %s and rejects %s',
    (role, nodeEnvironment, storageProvider) => {
      const overrides = {
        ...secureWorkerStorageOverrides(nodeEnvironment),
        STORAGE_PROVIDER: storageProvider,
        STORAGE_ENDPOINT: 'http://127.0.0.1:9000',
        STORAGE_ACCESS_KEY: 'runtime-access',
        STORAGE_SECRET_KEY: 'runtime-value',
      };
      expect(() =>
        role === 'core'
          ? validateCoreWorkerEnv(coreEnvironment(overrides))
          : validateMediaWorkerEnv(mediaEnvironment(overrides)),
      ).toThrow(/STORAGE_PROVIDER must be gcs/u);
    },
  );

  it.each([
    ['core', 'minio'],
    ['core', 's3'],
    ['media', 'minio'],
    ['media', 's3'],
  ])('retains local/test %s Worker compatibility with %s', (role, provider) => {
    const env =
      role === 'core'
        ? validateCoreWorkerEnv(coreEnvironment({ STORAGE_PROVIDER: provider }))
        : validateMediaWorkerEnv(
            mediaEnvironment({ STORAGE_PROVIDER: provider }),
          );
    expect(env.STORAGE_PROVIDER).toBe(provider);
  });

  it.each(['core', 'media'])(
    'fails %s Worker closed for unsupported or implicit production provider',
    (role) => {
      const secure = secureWorkerStorageOverrides('production');
      const validator =
        role === 'core' ? validateCoreWorkerEnv : validateMediaWorkerEnv;
      const environment = role === 'core' ? coreEnvironment : mediaEnvironment;

      expect(() =>
        validator(environment({ ...secure, STORAGE_PROVIDER: 'unsupported' })),
      ).toThrow(/STORAGE_PROVIDER/u);
      expect(() =>
        validator(environment({ ...secure, STORAGE_PROVIDER: undefined })),
      ).toThrow(/STORAGE_PROVIDER must be gcs/u);
    },
  );

  it('requires a GCS project for workers but never a signing principal', () => {
    expect(() =>
      validateCoreWorkerEnv(
        coreEnvironment({
          STORAGE_PROVIDER: 'gcs',
          STORAGE_ENDPOINT: undefined,
          STORAGE_ACCESS_KEY: undefined,
          STORAGE_SECRET_KEY: undefined,
        }),
      ),
    ).toThrow(/GCP_PROJECT_ID/u);
  });

  it('keeps Maintenance Scheduler storage-free', () => {
    const scheduler = validateMaintenanceSchedulerEnv({
      QUEUE_REDIS_URL: 'redis://127.0.0.1:6379',
      STORAGE_PROVIDER: 'gcs',
      GCP_PROJECT_ID: 'ignored-storage-project',
      GCS_SIGNING_SERVICE_ACCOUNT: 'ignored-signer@example.invalid',
    });

    expect(scheduler).not.toHaveProperty('STORAGE_PROVIDER');
    expect(scheduler).not.toHaveProperty('GCP_PROJECT_ID');
    expect(scheduler).not.toHaveProperty('GCS_SIGNING_SERVICE_ACCOUNT');
  });

  it('keeps development and test Core Worker usable without configured encryption keys', () => {
    const withoutKeys = {
      SETTINGS_EMAIL_SECRET_ENCRYPTION_ACTIVE_KEY_ID: undefined,
      SETTINGS_EMAIL_SECRET_ENCRYPTION_ACTIVE_KEY: undefined,
      APP_DEVICE_TOKEN_ENCRYPTION_ACTIVE_KEY_ID: undefined,
      APP_DEVICE_TOKEN_ENCRYPTION_ACTIVE_KEY: undefined,
    };
    expect(() =>
      validateCoreWorkerEnv(coreEnvironment(withoutKeys)),
    ).not.toThrow();
    expect(() =>
      validateCoreWorkerEnv(
        coreEnvironment({ ...withoutKeys, NODE_ENV: 'development' }),
      ),
    ).not.toThrow();
  });

  it.each([
    'SETTINGS_EMAIL_SECRET_ENCRYPTION_ACTIVE_KEY_ID',
    'SETTINGS_EMAIL_SECRET_ENCRYPTION_ACTIVE_KEY',
    'APP_DEVICE_TOKEN_ENCRYPTION_ACTIVE_KEY_ID',
    'APP_DEVICE_TOKEN_ENCRYPTION_ACTIVE_KEY',
  ])('requires strict-runtime Core Worker encryption field %s', (field) => {
    expect(() =>
      validateCoreWorkerEnv(
        coreEnvironment({
          ...secureWorkerStorageOverrides('production'),
          [field]: undefined,
        }),
      ),
    ).toThrow(new RegExp(field, 'u'));
  });

  it('validates Core Worker previous pairs and family-specific key IDs', () => {
    expect(() =>
      validateCoreWorkerEnv(
        coreEnvironment({
          SETTINGS_EMAIL_SECRET_ENCRYPTION_PREVIOUS_KEY_ID: 'email-previous',
        }),
      ),
    ).toThrow(/SETTINGS_EMAIL_SECRET_ENCRYPTION_PREVIOUS_KEY/u);
    expect(() =>
      validateCoreWorkerEnv(
        coreEnvironment({
          APP_DEVICE_TOKEN_ENCRYPTION_PREVIOUS_KEY_ID: 'device-active-v2',
          APP_DEVICE_TOKEN_ENCRYPTION_PREVIOUS_KEY: `hex:${'44'.repeat(32)}`,
        }),
      ),
    ).toThrow(/APP_DEVICE_TOKEN_ENCRYPTION_PREVIOUS_KEY_ID.*differ/u);
  });

  it('rejects Core Worker cross-family key reuse without exposing material', () => {
    const sensitiveKey = `hex:${'cc'.repeat(32)}`;
    let message = '';
    try {
      validateCoreWorkerEnv(
        coreEnvironment({
          SETTINGS_EMAIL_SECRET_ENCRYPTION_ACTIVE_KEY_ID: 'email-key-id',
          SETTINGS_EMAIL_SECRET_ENCRYPTION_ACTIVE_KEY: sensitiveKey,
          APP_DEVICE_TOKEN_ENCRYPTION_ACTIVE_KEY_ID: 'device-key-id',
          APP_DEVICE_TOKEN_ENCRYPTION_ACTIVE_KEY: sensitiveKey,
        }),
      );
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain('APP_DEVICE_TOKEN_ENCRYPTION_ACTIVE_KEY');
    expect(message).toContain(
      'must not reuse encryption key material from the smtp-secret family',
    );
    expect(message).not.toContain(sensitiveKey);
    expect(message).not.toContain('cc'.repeat(32));
  });

  it('keeps Media Worker and Maintenance Scheduler free of crypto dependencies', () => {
    const unrelatedCryptoFields = {
      SETTINGS_EMAIL_SECRET_ENCRYPTION_ACTIVE_KEY_ID: 'ignored-email-key',
      SETTINGS_EMAIL_SECRET_ENCRYPTION_ACTIVE_KEY: 'invalid-and-ignored',
      APP_DEVICE_TOKEN_ENCRYPTION_ACTIVE_KEY_ID: 'ignored-device-key',
      APP_DEVICE_TOKEN_ENCRYPTION_ACTIVE_KEY: 'invalid-and-ignored',
      SETTINGS_SECRET_ENCRYPTION_KEY: 'invalid-and-ignored',
    };
    const media = validateMediaWorkerEnv(
      mediaEnvironment(unrelatedCryptoFields),
    );
    const scheduler = validateMaintenanceSchedulerEnv({
      QUEUE_REDIS_URL: 'redis://127.0.0.1:6379',
      ...unrelatedCryptoFields,
    });

    for (const field of Object.keys(unrelatedCryptoFields)) {
      expect(media).not.toHaveProperty(field);
      expect(scheduler).not.toHaveProperty(field);
    }
  });
});

function coreEnvironment(
  overrides: Record<string, string | undefined> = {},
): Record<string, string> {
  return compact({
    NODE_ENV: 'test',
    APP_URL: 'http://127.0.0.1:3000',
    DATABASE_URL:
      'postgresql://runtime-user:runtime-value@127.0.0.1:5432/moazez',
    QUEUE_REDIS_URL: 'redis://127.0.0.1:6379',
    REALTIME_REDIS_URL: 'redis://127.0.0.1:6379',
    STORAGE_ENDPOINT: 'http://127.0.0.1:9000',
    STORAGE_ACCESS_KEY: 'runtime-access',
    STORAGE_SECRET_KEY: 'runtime-value',
    STORAGE_BUCKET: 'runtime-private',
    STORAGE_PUBLIC_BUCKET: 'runtime-public',
    SETTINGS_EMAIL_SECRET_ENCRYPTION_ACTIVE_KEY_ID: 'email-active-v2',
    SETTINGS_EMAIL_SECRET_ENCRYPTION_ACTIVE_KEY: `hex:${'11'.repeat(32)}`,
    APP_DEVICE_TOKEN_ENCRYPTION_ACTIVE_KEY_ID: 'device-active-v2',
    APP_DEVICE_TOKEN_ENCRYPTION_ACTIVE_KEY: `hex:${'22'.repeat(32)}`,
    ...overrides,
  });
}

function mediaEnvironment(
  overrides: Record<string, string | undefined> = {},
): Record<string, string> {
  return compact({
    NODE_ENV: 'test',
    DATABASE_URL:
      'postgresql://runtime-user:runtime-value@127.0.0.1:5432/moazez',
    QUEUE_REDIS_URL: 'redis://127.0.0.1:6379',
    STORAGE_ENDPOINT: 'http://127.0.0.1:9000',
    STORAGE_ACCESS_KEY: 'runtime-access',
    STORAGE_SECRET_KEY: 'runtime-value',
    STORAGE_BUCKET: 'runtime-private',
    STORAGE_PUBLIC_BUCKET: 'runtime-public',
    ...overrides,
  });
}

function compact(
  values: Record<string, string | undefined>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined),
  ) as Record<string, string>;
}

function secureWorkerStorageOverrides(
  nodeEnvironment: string,
): Record<string, string | undefined> {
  return {
    NODE_ENV: nodeEnvironment,
    APP_URL: `https://worker.${nodeEnvironment}.example.org`,
    DATABASE_URL:
      'postgresql://runtime-user:runtime-value@database.internal/moazez?sslmode=require',
    QUEUE_REDIS_URL: 'rediss://queue-cache.invalid:6379/0',
    REALTIME_REDIS_URL: 'rediss://realtime-cache.invalid:6380/0',
    STORAGE_PROVIDER: 'gcs',
    STORAGE_ENDPOINT: undefined,
    STORAGE_ACCESS_KEY: undefined,
    STORAGE_SECRET_KEY: undefined,
    GCP_PROJECT_ID: `moazez-${nodeEnvironment}`,
    GCS_SIGNING_SERVICE_ACCOUNT: undefined,
  };
}
