import {
  APPROVED_PRODUCTION_APPLICATION_ORIGINS,
  APPROVED_STAGING_APPLICATION_ORIGINS,
} from '../bootstrap/application-cors.policy';
import { rootCertificates } from 'node:tls';
import { validateEnv } from './env.validation';

const QUEUE_CA_PEM = rootCertificates[0];
const REALTIME_CA_PEM = rootCertificates[1];

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

  it('defaults the trusted proxy mode to none, including in staging', () => {
    expect(validateEnv(baseEnv()).APP_TRUSTED_PROXY_MODE).toBe('none');
    expect(
      validateEnv(strictApiEnvironment('staging')).APP_TRUSTED_PROXY_MODE,
    ).toBe('none');
  });

  it.each(['none', 'gcp_external_alb'] as const)(
    'accepts the explicit trusted proxy mode %s',
    (mode) => {
      expect(
        validateEnv(baseEnv({ APP_TRUSTED_PROXY_MODE: mode }))
          .APP_TRUSTED_PROXY_MODE,
      ).toBe(mode);
    },
  );

  it('rejects an unsupported trusted proxy mode', () => {
    expect(() =>
      validateEnv(baseEnv({ APP_TRUSTED_PROXY_MODE: 'unsupported' })),
    ).toThrow(/APP_TRUSTED_PROXY_MODE/u);
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

  it.each(['development', 'test'] as const)(
    'accepts the same plaintext endpoint without custom CAs in %s',
    (nodeEnvironment) => {
      expect(
        validateEnv(
          baseEnv({
            NODE_ENV: nodeEnvironment,
            QUEUE_REDIS_URL: 'redis://127.0.0.1:6379/0',
            QUEUE_REDIS_TLS_CA_PEM: undefined,
            REALTIME_REDIS_URL: 'redis://127.0.0.1:6379/1',
            REALTIME_REDIS_TLS_CA_PEM: undefined,
          }),
        ),
      ).toMatchObject({
        NODE_ENV: nodeEnvironment,
        QUEUE_REDIS_URL: 'redis://127.0.0.1:6379/0',
        REALTIME_REDIS_URL: 'redis://127.0.0.1:6379/1',
      });
    },
  );

  it.each([
    {
      QUEUE_REDIS_URL: 'redis://queue-user:queue-value@cache.invalid:6379/0',
      REALTIME_REDIS_URL:
        'redis://realtime-user:realtime-value@cache.invalid:6379/1',
    },
    {
      QUEUE_REDIS_URL: 'redis://cache.invalid/0',
      REALTIME_REDIS_URL: 'rediss://cache.invalid:6379/15?family=4',
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
      QUEUE_REDIS_TLS_CA_PEM: QUEUE_CA_PEM,
      REALTIME_REDIS_URL: 'rediss://realtime-cache.invalid:6379/0',
      REALTIME_REDIS_TLS_CA_PEM: REALTIME_CA_PEM,
    });
  });

  it.each(['staging', 'production'] as const)(
    'accepts valid matching Redis CAs in %s',
    (nodeEnvironment) => {
      expect(validateEnv(strictApiEnvironment(nodeEnvironment))).toMatchObject({
        NODE_ENV: nodeEnvironment,
        QUEUE_REDIS_TLS_CA_PEM: QUEUE_CA_PEM,
        REALTIME_REDIS_TLS_CA_PEM: REALTIME_CA_PEM,
      });
    },
  );

  it.each(['staging', 'production'] as const)(
    'rejects a missing or empty matching Redis CA in %s',
    (nodeEnvironment) => {
      for (const value of [undefined, '']) {
        expect(() =>
          validateEnv(
            strictApiEnvironment(nodeEnvironment, {
              QUEUE_REDIS_TLS_CA_PEM: value,
            }),
          ),
        ).toThrow(/QUEUE_REDIS_TLS_CA_PEM/u);
      }
    },
  );

  it.each(['staging', 'production'] as const)(
    'rejects plaintext Queue or Realtime Redis in %s',
    (nodeEnvironment) => {
      expect(() =>
        validateEnv(
          strictApiEnvironment(nodeEnvironment, {
            QUEUE_REDIS_URL: 'redis://queue-cache.invalid:6379',
          }),
        ),
      ).toThrow(/QUEUE_REDIS_URL.*rediss:/u);
      expect(() =>
        validateEnv(
          strictApiEnvironment(nodeEnvironment, {
            REALTIME_REDIS_URL: 'redis://realtime-cache.invalid:6379',
          }),
        ),
      ).toThrow(/REALTIME_REDIS_URL.*rediss:/u);
    },
  );

  it('rejects malformed matching CA material and accepts CA rotation bundles', () => {
    expect(() =>
      validateEnv(
        strictApiEnvironment('production', {
          REALTIME_REDIS_TLS_CA_PEM:
            '-----BEGIN CERTIFICATE-----\ninvalid\n-----END CERTIFICATE-----',
        }),
      ),
    ).toThrow(/REALTIME_REDIS_TLS_CA_PEM/u);

    const queueBundle = `${QUEUE_CA_PEM}\n${REALTIME_CA_PEM}`;
    expect(
      validateEnv(
        strictApiEnvironment('staging', {
          QUEUE_REDIS_TLS_CA_PEM: queueBundle,
        }),
      ).QUEUE_REDIS_TLS_CA_PEM,
    ).toBe(queueBundle);
  });

  it('does not substitute one Redis family CA for the other', () => {
    const environment = validateEnv(strictApiEnvironment('production'));

    expect(environment.QUEUE_REDIS_TLS_CA_PEM).toBe(QUEUE_CA_PEM);
    expect(environment.REALTIME_REDIS_TLS_CA_PEM).toBe(REALTIME_CA_PEM);
    expect(environment.QUEUE_REDIS_TLS_CA_PEM).not.toBe(
      environment.REALTIME_REDIS_TLS_CA_PEM,
    );
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

  it.each(['minio', 's3'])(
    'accepts %s as the MinIO-compatible provider in development and test',
    (provider) => {
      expect(
        validateEnv(baseEnv({ STORAGE_PROVIDER: provider })).STORAGE_PROVIDER,
      ).toBe(provider);
    },
  );

  it.each([
    'STORAGE_ENDPOINT',
    'STORAGE_ACCESS_KEY',
    'STORAGE_SECRET_KEY',
    'STORAGE_BUCKET',
    'STORAGE_PUBLIC_BUCKET',
  ])('requires MinIO-compatible field %s', (field) => {
    expect(() => validateEnv(baseEnv({ [field]: undefined }))).toThrow(
      new RegExp(field, 'u'),
    );
  });

  it('accepts API GCS with ADC configuration and no static storage credentials', () => {
    const env = validateEnv(
      baseEnv({
        STORAGE_PROVIDER: 'gcs',
        STORAGE_ENDPOINT: undefined,
        STORAGE_ACCESS_KEY: undefined,
        STORAGE_SECRET_KEY: undefined,
        GCP_PROJECT_ID: 'moazez-test-project',
        GCS_SIGNING_SERVICE_ACCOUNT:
          'moazez-gcs-signer@moazez-test-project.iam.gserviceaccount.com',
      }),
    );

    expect(env).toMatchObject({
      STORAGE_PROVIDER: 'gcs',
      GCP_PROJECT_ID: 'moazez-test-project',
    });
    expect(env.STORAGE_ENDPOINT).toBeUndefined();
    expect(env.STORAGE_ACCESS_KEY).toBeUndefined();
    expect(env.STORAGE_SECRET_KEY).toBeUndefined();
  });

  it.each(['staging', 'production'])(
    'accepts API GCS with a signing principal in %s',
    (nodeEnvironment) => {
      const env = validateEnv(
        productionEnv({
          NODE_ENV: nodeEnvironment,
          APP_CORS_ORIGINS:
            nodeEnvironment === 'production'
              ? APPROVED_PRODUCTION_APPLICATION_ORIGINS.join(',')
              : APPROVED_STAGING_APPLICATION_ORIGINS.join(','),
          GCP_PROJECT_ID: `moazez-${nodeEnvironment}`,
          GCS_SIGNING_SERVICE_ACCOUNT: `moazez-gcs-signer@moazez-${nodeEnvironment}.iam.gserviceaccount.com`,
        }),
      );

      expect(env).toMatchObject({
        NODE_ENV: nodeEnvironment,
        STORAGE_PROVIDER: 'gcs',
        GCP_PROJECT_ID: `moazez-${nodeEnvironment}`,
      });
      expect(env.GCS_SIGNING_SERVICE_ACCOUNT).toContain('moazez-gcs-signer@');
    },
  );

  it.each([
    ['minio', 'staging'],
    ['s3', 'staging'],
    ['minio', 'production'],
    ['s3', 'production'],
  ])(
    'rejects storage provider %s in %s',
    (storageProvider, nodeEnvironment) => {
      expect(() =>
        validateEnv(
          baseEnv({
            NODE_ENV: nodeEnvironment,
            APP_CORS_ORIGINS:
              nodeEnvironment === 'production'
                ? APPROVED_PRODUCTION_APPLICATION_ORIGINS.join(',')
                : APPROVED_STAGING_APPLICATION_ORIGINS.join(','),
            STORAGE_CORS_ORIGINS: 'https://schools.moazez.cloud',
            DATABASE_URL:
              'postgresql://runtime-user:runtime-value@database.internal/moazez?sslmode=require',
            QUEUE_REDIS_URL: 'rediss://queue-cache.invalid:6379/0',
            REALTIME_REDIS_URL: 'rediss://realtime-cache.invalid:6379/0',
            STORAGE_PROVIDER: storageProvider,
          }),
        ),
      ).toThrow(/STORAGE_PROVIDER must be gcs/u);
    },
  );

  it('requires the GCS project and API signing principal', () => {
    expect(() =>
      validateEnv(
        baseEnv({
          STORAGE_PROVIDER: 'gcs',
          STORAGE_ENDPOINT: undefined,
          STORAGE_ACCESS_KEY: undefined,
          STORAGE_SECRET_KEY: undefined,
          GCS_SIGNING_SERVICE_ACCOUNT:
            'moazez-gcs-signer@test.iam.gserviceaccount.com',
        }),
      ),
    ).toThrow(/GCP_PROJECT_ID/u);

    expect(() =>
      validateEnv(
        baseEnv({
          STORAGE_PROVIDER: 'gcs',
          STORAGE_ENDPOINT: undefined,
          STORAGE_ACCESS_KEY: undefined,
          STORAGE_SECRET_KEY: undefined,
          GCP_PROJECT_ID: 'moazez-test-project',
        }),
      ),
    ).toThrow(/GCS_SIGNING_SERVICE_ACCOUNT/u);
  });

  it('fails closed for an unsupported provider and for production default fallback', () => {
    expect(() =>
      validateEnv(baseEnv({ STORAGE_PROVIDER: 'unsupported' })),
    ).toThrow(/STORAGE_PROVIDER/u);
    expect(() =>
      validateEnv(
        productionEnv({
          STORAGE_PROVIDER: undefined,
        }),
      ),
    ).toThrow(/STORAGE_PROVIDER must be gcs/u);
  });

  it('keeps development and test usable without configured encryption keys', () => {
    expect(validateEnv(baseEnv())).toMatchObject({ NODE_ENV: 'development' });
    expect(validateEnv(baseEnv({ NODE_ENV: 'test' }))).toMatchObject({
      NODE_ENV: 'test',
    });
  });

  it.each([
    'SETTINGS_EMAIL_SECRET_ENCRYPTION_ACTIVE_KEY_ID',
    'SETTINGS_EMAIL_SECRET_ENCRYPTION_ACTIVE_KEY',
    'APP_DEVICE_TOKEN_ENCRYPTION_ACTIVE_KEY_ID',
    'APP_DEVICE_TOKEN_ENCRYPTION_ACTIVE_KEY',
  ])('requires strict-runtime active encryption field %s', (field) => {
    expect(() => validateEnv(productionEnv({ [field]: undefined }))).toThrow(
      new RegExp(field, 'u'),
    );
  });

  it.each([
    [
      'SETTINGS_EMAIL_SECRET_ENCRYPTION_PREVIOUS_KEY_ID',
      'SETTINGS_EMAIL_SECRET_ENCRYPTION_PREVIOUS_KEY',
    ],
    [
      'APP_DEVICE_TOKEN_ENCRYPTION_PREVIOUS_KEY_ID',
      'APP_DEVICE_TOKEN_ENCRYPTION_PREVIOUS_KEY',
    ],
  ])('requires previous pair %s and %s together', (idField, keyField) => {
    expect(() =>
      validateEnv(productionEnv({ [idField]: 'previous-key-id' })),
    ).toThrow(new RegExp(keyField, 'u'));
    expect(() =>
      validateEnv(productionEnv({ [keyField]: `hex:${'33'.repeat(32)}` })),
    ).toThrow(new RegExp(idField, 'u'));
  });

  it('requires each previous key ID to differ from its family active key ID', () => {
    expect(() =>
      validateEnv(
        productionEnv({
          SETTINGS_EMAIL_SECRET_ENCRYPTION_PREVIOUS_KEY_ID: 'email-active-v2',
          SETTINGS_EMAIL_SECRET_ENCRYPTION_PREVIOUS_KEY: `hex:${'33'.repeat(32)}`,
        }),
      ),
    ).toThrow(/SETTINGS_EMAIL_SECRET_ENCRYPTION_PREVIOUS_KEY_ID.*differ/u);
    expect(() =>
      validateEnv(
        productionEnv({
          APP_DEVICE_TOKEN_ENCRYPTION_PREVIOUS_KEY_ID: 'device-active-v2',
          APP_DEVICE_TOKEN_ENCRYPTION_PREVIOUS_KEY: `hex:${'44'.repeat(32)}`,
        }),
      ),
    ).toThrow(/APP_DEVICE_TOKEN_ENCRYPTION_PREVIOUS_KEY_ID.*differ/u);
  });

  it.each([
    [
      'email active and device active',
      {
        SETTINGS_EMAIL_SECRET_ENCRYPTION_ACTIVE_KEY: `hex:${'ab'.repeat(32)}`,
        APP_DEVICE_TOKEN_ENCRYPTION_ACTIVE_KEY: `hex:${'ab'.repeat(32)}`,
      },
      'APP_DEVICE_TOKEN_ENCRYPTION_ACTIVE_KEY',
    ],
    [
      'email active and device previous',
      {
        SETTINGS_EMAIL_SECRET_ENCRYPTION_ACTIVE_KEY: `hex:${'ab'.repeat(32)}`,
        APP_DEVICE_TOKEN_ENCRYPTION_PREVIOUS_KEY_ID: 'device-previous-v2',
        APP_DEVICE_TOKEN_ENCRYPTION_PREVIOUS_KEY: `hex:${'ab'.repeat(32)}`,
      },
      'APP_DEVICE_TOKEN_ENCRYPTION_PREVIOUS_KEY',
    ],
    [
      'email previous and device active',
      {
        SETTINGS_EMAIL_SECRET_ENCRYPTION_PREVIOUS_KEY_ID: 'email-previous-v2',
        SETTINGS_EMAIL_SECRET_ENCRYPTION_PREVIOUS_KEY: `hex:${'ab'.repeat(32)}`,
        APP_DEVICE_TOKEN_ENCRYPTION_ACTIVE_KEY: `hex:${'ab'.repeat(32)}`,
      },
      'APP_DEVICE_TOKEN_ENCRYPTION_ACTIVE_KEY',
    ],
    [
      'email previous and device previous',
      {
        SETTINGS_EMAIL_SECRET_ENCRYPTION_PREVIOUS_KEY_ID: 'email-previous-v2',
        SETTINGS_EMAIL_SECRET_ENCRYPTION_PREVIOUS_KEY: `hex:${'ab'.repeat(32)}`,
        APP_DEVICE_TOKEN_ENCRYPTION_PREVIOUS_KEY_ID: 'device-previous-v2',
        APP_DEVICE_TOKEN_ENCRYPTION_PREVIOUS_KEY: `hex:${'ab'.repeat(32)}`,
      },
      'APP_DEVICE_TOKEN_ENCRYPTION_PREVIOUS_KEY',
    ],
  ])(
    'rejects cross-family key reuse between %s without exposing material',
    (_combination, overrides, affectedField) => {
      const sensitiveKey = `hex:${'ab'.repeat(32)}`;
      let message = '';
      try {
        validateEnv(productionEnv(overrides));
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }

      expect(message).toContain(affectedField);
      expect(message).toContain(
        'must not reuse encryption key material from the smtp-secret family',
      );
      expect(message).not.toContain(sensitiveKey);
      expect(message).not.toContain('ab'.repeat(32));
    },
  );

  it.each(['bad:key', 'bad key', 'bad/key', 'مفتاح', `a${'b'.repeat(64)}`])(
    'rejects unsafe key ID %s',
    (keyId) => {
      expect(() =>
        validateEnv(
          productionEnv({
            SETTINGS_EMAIL_SECRET_ENCRYPTION_ACTIVE_KEY_ID: keyId,
          }),
        ),
      ).toThrow(/SETTINGS_EMAIL_SECRET_ENCRYPTION_ACTIVE_KEY_ID/u);
    },
  );

  it('trims configured key IDs before validation', () => {
    expect(
      validateEnv(
        productionEnv({
          SETTINGS_EMAIL_SECRET_ENCRYPTION_ACTIVE_KEY_ID: '  email-active-v2  ',
        }),
      ).SETTINGS_EMAIL_SECRET_ENCRYPTION_ACTIVE_KEY_ID,
    ).toBe('email-active-v2');
  });

  it('validates the optional legacy key without exposing supplied material', () => {
    const sensitiveValue = 'base64:must-not-appear-in-the-error';
    let message = '';
    try {
      validateEnv(
        productionEnv({ SETTINGS_SECRET_ENCRYPTION_KEY: sensitiveValue }),
      );
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain('SETTINGS_SECRET_ENCRYPTION_KEY');
    expect(message).not.toContain(sensitiveValue);
    expect(message).not.toContain('must-not-appear-in-the-error');
  });
});

function productionEnv(
  overrides: Record<string, string | undefined> = {},
): Record<string, string> {
  return baseEnv({
    NODE_ENV: 'production',
    APP_CORS_ORIGINS: APPROVED_PRODUCTION_APPLICATION_ORIGINS.join(','),
    STORAGE_CORS_ORIGINS: 'https://schools.moazez.cloud',
    STORAGE_PROVIDER: 'gcs',
    STORAGE_ENDPOINT: undefined,
    STORAGE_ACCESS_KEY: undefined,
    STORAGE_SECRET_KEY: undefined,
    GCP_PROJECT_ID: 'moazez-production',
    GCS_SIGNING_SERVICE_ACCOUNT:
      'moazez-gcs-signer@moazez-production.iam.gserviceaccount.com',
    DATABASE_URL:
      'postgresql://runtime-user:runtime-value@database.internal/moazez?sslmode=require',
    QUEUE_REDIS_URL: 'rediss://queue-cache.invalid:6379/0',
    QUEUE_REDIS_TLS_CA_PEM: QUEUE_CA_PEM,
    REALTIME_REDIS_URL: 'rediss://realtime-cache.invalid:6379/0',
    REALTIME_REDIS_TLS_CA_PEM: REALTIME_CA_PEM,
    SETTINGS_EMAIL_SECRET_ENCRYPTION_ACTIVE_KEY_ID: 'email-active-v2',
    SETTINGS_EMAIL_SECRET_ENCRYPTION_ACTIVE_KEY: `hex:${'11'.repeat(32)}`,
    APP_DEVICE_TOKEN_ENCRYPTION_ACTIVE_KEY_ID: 'device-active-v2',
    APP_DEVICE_TOKEN_ENCRYPTION_ACTIVE_KEY: `hex:${'22'.repeat(32)}`,
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
    QUEUE_REDIS_TLS_CA_PEM: QUEUE_CA_PEM,
    REALTIME_REDIS_URL: 'redis://localhost:6379',
    REALTIME_REDIS_TLS_CA_PEM: REALTIME_CA_PEM,
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

function strictApiEnvironment(
  nodeEnvironment: 'staging' | 'production',
  overrides: Record<string, string | undefined> = {},
): Record<string, string> {
  return productionEnv({
    NODE_ENV: nodeEnvironment,
    APP_CORS_ORIGINS:
      nodeEnvironment === 'staging'
        ? APPROVED_STAGING_APPLICATION_ORIGINS.join(',')
        : APPROVED_PRODUCTION_APPLICATION_ORIGINS.join(','),
    ...overrides,
  });
}
