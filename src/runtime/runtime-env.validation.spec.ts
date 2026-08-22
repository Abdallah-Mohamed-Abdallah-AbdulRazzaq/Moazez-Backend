import {
  validateCoreWorkerEnv,
  validateMaintenanceSchedulerEnv,
  validateMediaWorkerEnv,
} from './runtime-env.validation';
import { rootCertificates } from 'node:tls';

const QUEUE_CA_PEM = rootCertificates[0];
const REALTIME_CA_PEM = rootCertificates[1];

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
          QUEUE_REDIS_URL: 'rediss://queue-cache.invalid:6379',
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
      QUEUE_REDIS_TLS_CA_PEM: QUEUE_CA_PEM,
      REALTIME_REDIS_URL: 'rediss://realtime-cache.invalid:6379',
      REALTIME_REDIS_TLS_CA_PEM: REALTIME_CA_PEM,
    });

    expect(media.QUEUE_REDIS_URL).toBe('redis://127.0.0.1:6379');
    expect(media.QUEUE_REDIS_TLS_CA_PEM).toBe(QUEUE_CA_PEM);
    expect(media).not.toHaveProperty('REALTIME_REDIS_URL');
    expect(media).not.toHaveProperty('REALTIME_REDIS_TLS_CA_PEM');
    expect(scheduler.QUEUE_REDIS_URL).toBe('rediss://queue-cache.invalid:6379');
    expect(scheduler.QUEUE_REDIS_TLS_CA_PEM).toBe(QUEUE_CA_PEM);
    expect(scheduler).not.toHaveProperty('REALTIME_REDIS_URL');
    expect(scheduler).not.toHaveProperty('REALTIME_REDIS_TLS_CA_PEM');
  });

  it.each(['staging', 'production'] as const)(
    'enforces role-specific Redis TLS configuration in %s',
    (nodeEnvironment) => {
      const secure = secureWorkerStorageOverrides(nodeEnvironment);
      expect(validateCoreWorkerEnv(coreEnvironment(secure))).toMatchObject({
        QUEUE_REDIS_TLS_CA_PEM: QUEUE_CA_PEM,
        REALTIME_REDIS_TLS_CA_PEM: REALTIME_CA_PEM,
      });
      expect(validateMediaWorkerEnv(mediaEnvironment(secure))).toMatchObject({
        QUEUE_REDIS_TLS_CA_PEM: QUEUE_CA_PEM,
      });
      expect(
        validateMaintenanceSchedulerEnv({
          NODE_ENV: nodeEnvironment,
          QUEUE_REDIS_URL: secure.QUEUE_REDIS_URL,
          QUEUE_REDIS_TLS_CA_PEM: QUEUE_CA_PEM,
        }),
      ).toMatchObject({ QUEUE_REDIS_TLS_CA_PEM: QUEUE_CA_PEM });

      expect(() =>
        validateCoreWorkerEnv(
          coreEnvironment({
            ...secure,
            REALTIME_REDIS_TLS_CA_PEM: undefined,
          }),
        ),
      ).toThrow(/REALTIME_REDIS_TLS_CA_PEM/u);
      expect(() =>
        validateMediaWorkerEnv(
          mediaEnvironment({
            ...secure,
            QUEUE_REDIS_TLS_CA_PEM: undefined,
          }),
        ),
      ).toThrow(/QUEUE_REDIS_TLS_CA_PEM/u);
      expect(() =>
        validateMaintenanceSchedulerEnv({
          NODE_ENV: nodeEnvironment,
          QUEUE_REDIS_URL: secure.QUEUE_REDIS_URL,
        }),
      ).toThrow(/QUEUE_REDIS_TLS_CA_PEM/u);
    },
  );

  it('rejects malformed role-specific Redis CA material', () => {
    const secure = secureWorkerStorageOverrides('staging');
    expect(() =>
      validateCoreWorkerEnv(
        coreEnvironment({
          ...secure,
          REALTIME_REDIS_TLS_CA_PEM: 'malformed-realtime-ca',
        }),
      ),
    ).toThrow(/REALTIME_REDIS_TLS_CA_PEM/u);
    expect(() =>
      validateMediaWorkerEnv(
        mediaEnvironment({
          ...secure,
          QUEUE_REDIS_TLS_CA_PEM: 'malformed-queue-ca',
        }),
      ),
    ).toThrow(/QUEUE_REDIS_TLS_CA_PEM/u);
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
    expect(
      validateCoreWorkerEnv(
        coreEnvironment({
          QUEUE_REDIS_TLS_CA_PEM: undefined,
          REALTIME_REDIS_TLS_CA_PEM: undefined,
        }),
      ),
    ).toMatchObject({
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
        QUEUE_REDIS_URL: 'rediss://queue-cache.invalid:6379',
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

  it('accepts enabled Core Worker dry-run with explicit ambient ADC', () => {
    const env = validateCoreWorkerEnv(
      coreEnvironment({
        FCM_ENABLED: 'true',
        FCM_DRY_RUN: 'true',
        FIREBASE_CREDENTIAL_MODE: 'application_default',
        GCP_PROJECT_ID: 'moazez-nonprod-91001421934',
      }),
    );

    expect(env).toMatchObject({
      FCM_ENABLED: true,
      FCM_DRY_RUN: true,
      FIREBASE_CREDENTIAL_MODE: 'application_default',
      GCP_PROJECT_ID: 'moazez-nonprod-91001421934',
    });
    expect(env.GOOGLE_APPLICATION_CREDENTIALS).toBeUndefined();
    expect(env.FIREBASE_PRIVATE_KEY).toBeUndefined();
  });

  it('rejects enabled Core Worker dry-run without an explicit mode', () => {
    expect(() =>
      validateCoreWorkerEnv(
        coreEnvironment({
          FCM_ENABLED: 'true',
          FCM_DRY_RUN: 'true',
        }),
      ),
    ).toThrow(/FIREBASE_CREDENTIAL_MODE is required/u);
  });

  it('preserves both explicit Core Worker compatibility modes', () => {
    expect(
      validateCoreWorkerEnv(
        coreEnvironment({
          FCM_ENABLED: 'true',
          FCM_DRY_RUN: 'false',
          FIREBASE_CREDENTIAL_MODE: 'google_application_credentials',
          GOOGLE_APPLICATION_CREDENTIALS:
            'C:/synthetic/firebase-admin-credential.json',
        }),
      ),
    ).toMatchObject({
      FIREBASE_CREDENTIAL_MODE: 'google_application_credentials',
    });

    expect(
      validateCoreWorkerEnv(
        coreEnvironment({
          FCM_ENABLED: 'true',
          FCM_DRY_RUN: 'false',
          FIREBASE_CREDENTIAL_MODE: 'service_account_env',
          FIREBASE_PROJECT_ID: 'synthetic-firebase-project',
          FIREBASE_CLIENT_EMAIL: 'synthetic-firebase@example.invalid',
          FIREBASE_PRIVATE_KEY: 'synthetic-private-key',
        }),
      ),
    ).toMatchObject({ FIREBASE_CREDENTIAL_MODE: 'service_account_env' });
  });

  it('uses the shared fail-closed Firebase conflict and completeness rules', () => {
    expect(() =>
      validateCoreWorkerEnv(
        coreEnvironment({
          FIREBASE_CREDENTIAL_MODE: 'service_account_env',
          FIREBASE_PROJECT_ID: 'synthetic-firebase-project',
        }),
      ),
    ).toThrow(/must be provided together/u);

    expect(() =>
      validateCoreWorkerEnv(
        coreEnvironment({
          FIREBASE_CREDENTIAL_MODE: 'google_application_credentials',
          GOOGLE_APPLICATION_CREDENTIALS:
            'C:/synthetic/firebase-admin-credential.json',
          FIREBASE_PROJECT_ID: 'synthetic-firebase-project',
          FIREBASE_CLIENT_EMAIL: 'synthetic-firebase@example.invalid',
          FIREBASE_PRIVATE_KEY: 'synthetic-private-key',
        }),
      ),
    ).toThrow(/cannot be configured together/u);

    expect(() =>
      validateCoreWorkerEnv(
        coreEnvironment({
          FCM_ENABLED: 'false',
          FIREBASE_CREDENTIAL_MODE: 'google_application_credentials',
        }),
      ),
    ).toThrow(/GOOGLE_APPLICATION_CREDENTIALS is required/u);
  });

  it('keeps Firebase configuration out of non-Core-Worker roles', () => {
    const unrelatedFirebaseFields = {
      FCM_ENABLED: 'true',
      FCM_DRY_RUN: 'false',
      FIREBASE_CREDENTIAL_MODE: 'application_default',
      GOOGLE_APPLICATION_CREDENTIALS:
        'C:/synthetic/firebase-admin-credential.json',
      FIREBASE_PROJECT_ID: 'synthetic-firebase-project',
      FIREBASE_CLIENT_EMAIL: 'synthetic-firebase@example.invalid',
      FIREBASE_PRIVATE_KEY: 'synthetic-private-key',
    };
    const media = validateMediaWorkerEnv(
      mediaEnvironment(unrelatedFirebaseFields),
    );
    const scheduler = validateMaintenanceSchedulerEnv({
      QUEUE_REDIS_URL: 'redis://127.0.0.1:6379',
      ...unrelatedFirebaseFields,
    });

    for (const field of Object.keys(unrelatedFirebaseFields)) {
      expect(media).not.toHaveProperty(field);
      expect(scheduler).not.toHaveProperty(field);
    }
  });

  it('keeps Core Worker Firebase validation errors secret-safe', () => {
    const credentialPathMarker =
      'C:/synthetic/do-not-disclose-credential-marker.json';
    const privateKeyMarker = 'synthetic-do-not-disclose-private-key-marker';
    let message = '';

    try {
      validateCoreWorkerEnv(
        coreEnvironment({
          FCM_ENABLED: 'true',
          FCM_DRY_RUN: 'true',
          FIREBASE_CREDENTIAL_MODE: 'application_default',
          GOOGLE_APPLICATION_CREDENTIALS: credentialPathMarker,
          FIREBASE_PROJECT_ID: 'synthetic-project',
          FIREBASE_CLIENT_EMAIL: 'synthetic@example.invalid',
          FIREBASE_PRIVATE_KEY: privateKeyMarker,
        }),
      );
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain('application_default');
    expect(message).not.toContain(credentialPathMarker);
    expect(message).not.toContain(privateKeyMarker);
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
    QUEUE_REDIS_TLS_CA_PEM: QUEUE_CA_PEM,
    REALTIME_REDIS_URL: 'redis://127.0.0.1:6379',
    REALTIME_REDIS_TLS_CA_PEM: REALTIME_CA_PEM,
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
    QUEUE_REDIS_TLS_CA_PEM: QUEUE_CA_PEM,
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
    QUEUE_REDIS_TLS_CA_PEM: QUEUE_CA_PEM,
    REALTIME_REDIS_URL: 'rediss://realtime-cache.invalid:6380/0',
    REALTIME_REDIS_TLS_CA_PEM: REALTIME_CA_PEM,
    STORAGE_PROVIDER: 'gcs',
    STORAGE_ENDPOINT: undefined,
    STORAGE_ACCESS_KEY: undefined,
    STORAGE_SECRET_KEY: undefined,
    GCP_PROJECT_ID: `moazez-${nodeEnvironment}`,
    GCS_SIGNING_SERVICE_ACCOUNT: undefined,
  };
}
