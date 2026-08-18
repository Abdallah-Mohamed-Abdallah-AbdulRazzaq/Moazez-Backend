import { randomBytes } from 'node:crypto';
import { PlatformAdminBootstrapError } from '../platform-admin-bootstrap.errors';
import { assertPlatformAdminBootstrapEnvironment } from '../platform-admin-bootstrap.environment';

const SYNTHETIC_DATABASE_SECRET = randomBytes(24).toString('base64url');

const ENVIRONMENT_DRIFT_CASES: ReadonlyArray<
  readonly [string, Record<string, string>]
> = [
  ['requested environment', { requestedEnvironment: 'production' }],
  ['NODE_ENV', { NODE_ENV: 'production' }],
  ['APP_URL', { APP_URL: 'https://api.example.invalid' }],
  ['GCP project', { GCP_PROJECT_ID: 'different-project' }],
  ['database runtime role', { DATABASE_RUNTIME_ROLE: 'core-worker' }],
  [
    'database login identity',
    {
      DATABASE_URL: `postgresql://different_user:${SYNTHETIC_DATABASE_SECRET}@127.0.0.1:5432/moazez?sslmode=require`,
    },
  ],
  [
    'database transport policy',
    {
      DATABASE_URL: `postgresql://moazez_api:${SYNTHETIC_DATABASE_SECRET}@127.0.0.1:5432/moazez?sslmode=disable`,
    },
  ],
];

describe('Platform Administrator bootstrap environment guard', () => {
  it('accepts only the approved existing staging API identity tuple', () => {
    expect(
      assertPlatformAdminBootstrapEnvironment('staging', stagingEnvironment()),
    ).toMatchObject({
      NODE_ENV: 'staging',
      APP_URL: 'https://staging-api.moazez.cloud',
      GCP_PROJECT_ID: 'moazez-nonprod-91001421934',
      DATABASE_RUNTIME_ROLE: 'api',
      DATABASE_CONNECTION_LIMIT: 5,
      DATABASE_POOL_TIMEOUT_SECONDS: 5,
      DATABASE_CONNECT_TIMEOUT_SECONDS: 5,
    });
  });

  it.each(ENVIRONMENT_DRIFT_CASES)(
    'rejects a mismatched %s without exposing configuration',
    (_label, drift) => {
      const { requestedEnvironment = 'staging', ...environmentDrift } = drift;

      let caught: unknown;
      try {
        assertPlatformAdminBootstrapEnvironment(requestedEnvironment, {
          ...stagingEnvironment(),
          ...environmentDrift,
        });
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(PlatformAdminBootstrapError);
      expect((caught as PlatformAdminBootstrapError).reason).toBe(
        'UNSUPPORTED_ENVIRONMENT',
      );
      expect(String(caught)).not.toContain(SYNTHETIC_DATABASE_SECRET);
    },
  );
});

function stagingEnvironment(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'staging',
    APP_URL: 'https://staging-api.moazez.cloud',
    GCP_PROJECT_ID: 'moazez-nonprod-91001421934',
    DATABASE_URL: `postgresql://moazez_api:${SYNTHETIC_DATABASE_SECRET}@127.0.0.1:5432/moazez?sslmode=require`,
    DATABASE_RUNTIME_ROLE: 'api',
    DATABASE_CONNECTION_LIMIT: '5',
    DATABASE_POOL_TIMEOUT_SECONDS: '5',
    DATABASE_CONNECT_TIMEOUT_SECONDS: '5',
  };
}
