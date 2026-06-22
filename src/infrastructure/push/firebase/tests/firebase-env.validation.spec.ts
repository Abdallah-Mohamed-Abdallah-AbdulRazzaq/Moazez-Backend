import { validateEnv } from '../../../../config/env.validation';

describe('FCM environment validation', () => {
  it('defaults FCM_ENABLED=false and FCM_DRY_RUN=true', () => {
    const env = validateEnv(baseEnv());

    expect(env.FCM_ENABLED).toBe(false);
    expect(env.FCM_DRY_RUN).toBe(true);
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

  it('does not require Firebase credentials in dry-run mode', () => {
    const env = validateEnv(
      baseEnv({
        FCM_ENABLED: 'true',
        FCM_DRY_RUN: 'true',
      }),
    );

    expect(env.FCM_ENABLED).toBe(true);
    expect(env.FCM_DRY_RUN).toBe(true);
  });

  it('requires credentials when real FCM send mode is enabled', () => {
    expect(() =>
      validateEnv(
        baseEnv({
          FCM_ENABLED: 'true',
          FCM_DRY_RUN: 'false',
        }),
      ),
    ).toThrow(/requires GOOGLE_APPLICATION_CREDENTIALS/);
  });

  it('accepts GOOGLE_APPLICATION_CREDENTIALS as the production credential strategy', () => {
    const env = validateEnv(
      baseEnv({
        FCM_ENABLED: 'true',
        FCM_DRY_RUN: 'false',
        GOOGLE_APPLICATION_CREDENTIALS: 'C:/secure/firebase-admin.json',
      }),
    );

    expect(env.GOOGLE_APPLICATION_CREDENTIALS).toBe(
      'C:/secure/firebase-admin.json',
    );
  });

  it('accepts the Firebase env credential triple with escaped newlines', () => {
    const env = validateEnv(
      baseEnv({
        FCM_ENABLED: 'true',
        FCM_DRY_RUN: 'false',
        FIREBASE_PROJECT_ID: 'moazez-production',
        FIREBASE_CLIENT_EMAIL: 'service-account@example.invalid',
        FIREBASE_PRIVATE_KEY: 'dummy-line-one\\ndummy-line-two',
      }),
    );

    expect(env.FIREBASE_PRIVATE_KEY).toContain('\\ndummy-line-two');
  });

  it('rejects partial Firebase env credentials', () => {
    expect(() =>
      validateEnv(
        baseEnv({
          FIREBASE_PROJECT_ID: 'moazez-production',
          FIREBASE_CLIENT_EMAIL: 'service-account@example.invalid',
        }),
      ),
    ).toThrow(/must be provided together/);
  });

  it('rejects multiple credential strategies in real send mode', () => {
    expect(() =>
      validateEnv(
        baseEnv({
          FCM_ENABLED: 'true',
          FCM_DRY_RUN: 'false',
          GOOGLE_APPLICATION_CREDENTIALS: 'C:/secure/firebase-admin.json',
          FIREBASE_PROJECT_ID: 'moazez-production',
          FIREBASE_CLIENT_EMAIL: 'service-account@example.invalid',
          FIREBASE_PRIVATE_KEY: 'dummy-line-one\\ndummy-line-two',
        }),
      ),
    ).toThrow(/Use exactly one Firebase credential strategy/);
  });
});

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
