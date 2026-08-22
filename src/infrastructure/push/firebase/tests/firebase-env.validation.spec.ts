import { validateEnv } from '../../../../config/env.validation';

describe('FCM environment validation', () => {
  it('defaults FCM_ENABLED=false and FCM_DRY_RUN=true', () => {
    const env = validateEnv(baseEnv());

    expect(env.FCM_ENABLED).toBe(false);
    expect(env.FCM_DRY_RUN).toBe(true);
    expect(env.FIREBASE_CREDENTIAL_MODE).toBeUndefined();
  });

  it('does not require Firebase credentials in disabled mode', () => {
    const env = validateEnv(
      baseEnv({
        FCM_ENABLED: 'false',
        FCM_DRY_RUN: 'false',
      }),
    );

    expect(env.FCM_ENABLED).toBe(false);
    expect(env.FCM_DRY_RUN).toBe(false);
  });

  it('accepts application_default in dry-run without file or private-key credentials', () => {
    const env = validateEnv(
      baseEnv({
        FCM_ENABLED: 'true',
        FCM_DRY_RUN: 'true',
        FIREBASE_CREDENTIAL_MODE: 'application_default',
      }),
    );

    expect(env.FCM_ENABLED).toBe(true);
    expect(env.FCM_DRY_RUN).toBe(true);
    expect(env.FIREBASE_CREDENTIAL_MODE).toBe('application_default');
    expect(env.GOOGLE_APPLICATION_CREDENTIALS).toBeUndefined();
    expect(env.FIREBASE_PRIVATE_KEY).toBeUndefined();
  });

  it('requires an explicit credential mode whenever FCM is enabled', () => {
    expect(() =>
      validateEnv(
        baseEnv({
          FCM_ENABLED: 'true',
          FCM_DRY_RUN: 'true',
        }),
      ),
    ).toThrow(/FIREBASE_CREDENTIAL_MODE is required/u);
  });

  it('accepts explicit google_application_credentials compatibility', () => {
    const env = validateEnv(
      baseEnv({
        FCM_ENABLED: 'true',
        FCM_DRY_RUN: 'false',
        FIREBASE_CREDENTIAL_MODE: 'google_application_credentials',
        GOOGLE_APPLICATION_CREDENTIALS:
          'C:/synthetic/firebase-admin-credential.json',
      }),
    );

    expect(env.GOOGLE_APPLICATION_CREDENTIALS).toBe(
      'C:/synthetic/firebase-admin-credential.json',
    );
  });

  it('accepts explicit service_account_env compatibility', () => {
    const env = validateEnv(
      baseEnv({
        FCM_ENABLED: 'true',
        FCM_DRY_RUN: 'false',
        FIREBASE_CREDENTIAL_MODE: 'service_account_env',
        FIREBASE_PROJECT_ID: 'synthetic-firebase-project',
        FIREBASE_CLIENT_EMAIL: 'synthetic-firebase@example.invalid',
        FIREBASE_PRIVATE_KEY: 'synthetic-line-one\\nsynthetic-line-two',
      }),
    );

    expect(env.FIREBASE_PRIVATE_KEY).toContain('\\nsynthetic-line-two');
  });

  it('rejects partial Firebase env credentials', () => {
    expect(() =>
      validateEnv(
        baseEnv({
          FIREBASE_PROJECT_ID: 'synthetic-firebase-project',
          FIREBASE_CLIENT_EMAIL: 'synthetic-firebase@example.invalid',
        }),
      ),
    ).toThrow(/must be provided together/);
  });

  it('rejects file and service-account strategies together', () => {
    expect(() =>
      validateEnv(
        baseEnv({
          GOOGLE_APPLICATION_CREDENTIALS:
            'C:/synthetic/firebase-admin-credential.json',
          FIREBASE_PROJECT_ID: 'synthetic-firebase-project',
          FIREBASE_CLIENT_EMAIL: 'synthetic-firebase@example.invalid',
          FIREBASE_PRIVATE_KEY: 'synthetic-private-key',
        }),
      ),
    ).toThrow(/cannot be configured together/u);
  });

  it('rejects GOOGLE_APPLICATION_CREDENTIALS in service_account_env mode', () => {
    expect(() =>
      validateEnv(
        baseEnv({
          FIREBASE_CREDENTIAL_MODE: 'service_account_env',
          GOOGLE_APPLICATION_CREDENTIALS:
            'C:/synthetic/firebase-admin-credential.json',
          FIREBASE_PROJECT_ID: 'synthetic-firebase-project',
          FIREBASE_CLIENT_EMAIL: 'synthetic-firebase@example.invalid',
          FIREBASE_PRIVATE_KEY: 'synthetic-private-key',
        }),
      ),
    ).toThrow(/service_account_env cannot be combined/u);
  });

  it.each([
    ['GOOGLE_APPLICATION_CREDENTIALS', 'C:/synthetic/credential.json'],
    ['FIREBASE_PROJECT_ID', 'synthetic-project'],
    ['FIREBASE_CLIENT_EMAIL', 'synthetic@example.invalid'],
    ['FIREBASE_PRIVATE_KEY', 'synthetic-private-key'],
  ])('rejects application_default conflict with %s', (field, value) => {
    expect(() =>
      validateEnv(
        baseEnv({
          FCM_ENABLED: 'true',
          FCM_DRY_RUN: 'true',
          FIREBASE_CREDENTIAL_MODE: 'application_default',
          [field]: value,
        }),
      ),
    ).toThrow(/application_default cannot be combined/u);
  });

  it('validates an explicit mode even when FCM is disabled', () => {
    expect(() =>
      validateEnv(
        baseEnv({
          FCM_ENABLED: 'false',
          FIREBASE_CREDENTIAL_MODE: 'google_application_credentials',
        }),
      ),
    ).toThrow(/GOOGLE_APPLICATION_CREDENTIALS is required/u);
  });

  it('rejects unsupported credential modes', () => {
    expect(() =>
      validateEnv(
        baseEnv({
          FIREBASE_CREDENTIAL_MODE: 'implicit',
        }),
      ),
    ).toThrow(/FIREBASE_CREDENTIAL_MODE/u);
  });

  it('does not disclose credential material in validation errors', () => {
    const credentialPathMarker =
      'C:/synthetic/do-not-disclose-credential-marker.json';
    const privateKeyMarker = 'synthetic-do-not-disclose-private-key-marker';
    let message = '';

    try {
      validateEnv(
        baseEnv({
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
});

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
    STORAGE_ACCESS_KEY: 'minio-access-key',
    STORAGE_SECRET_KEY: 'minio-secret-key',
    STORAGE_BUCKET: 'moazez-private',
    STORAGE_PUBLIC_BUCKET: 'moazez-public',
    ...overrides,
  };

  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => typeof value === 'string'),
  ) as Record<string, string>;
}
