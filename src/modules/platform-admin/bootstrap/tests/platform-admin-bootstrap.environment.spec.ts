import { randomBytes } from 'node:crypto';
import type { PlatformAdminBootstrapEnvironment } from '../platform-admin-bootstrap.constants';
import { PlatformAdminBootstrapError } from '../platform-admin-bootstrap.errors';
import {
  assertPlatformAdminBootstrapEnvironment,
  validatePlatformAdminBootstrapEnvironment,
} from '../platform-admin-bootstrap.environment';

const SYNTHETIC_DATABASE_SECRET = randomBytes(24).toString('base64url');

const ENVIRONMENT_CONTRACTS = {
  staging: {
    NODE_ENV: 'staging',
    APP_URL: 'https://staging-api.moazez.cloud',
    GCP_PROJECT_ID: 'moazez-nonprod-91001421934',
  },
  production: {
    NODE_ENV: 'production',
    APP_URL: 'https://api.moazez.cloud',
    GCP_PROJECT_ID: 'moazez-production',
  },
} as const;

const CROSS_ENVIRONMENT_CASES: ReadonlyArray<
  readonly [
    string,
    PlatformAdminBootstrapEnvironment,
    Partial<NodeJS.ProcessEnv>,
  ]
> = [
  ['production with staging NODE_ENV', 'production', { NODE_ENV: 'staging' }],
  [
    'production with staging APP_URL',
    'production',
    { APP_URL: ENVIRONMENT_CONTRACTS.staging.APP_URL },
  ],
  [
    'production with staging GCP_PROJECT_ID',
    'production',
    { GCP_PROJECT_ID: ENVIRONMENT_CONTRACTS.staging.GCP_PROJECT_ID },
  ],
  ['staging with production NODE_ENV', 'staging', { NODE_ENV: 'production' }],
  [
    'staging with production APP_URL',
    'staging',
    { APP_URL: ENVIRONMENT_CONTRACTS.production.APP_URL },
  ],
  [
    'staging with production GCP_PROJECT_ID',
    'staging',
    { GCP_PROJECT_ID: ENVIRONMENT_CONTRACTS.production.GCP_PROJECT_ID },
  ],
];

describe('Platform Administrator bootstrap environment guard', () => {
  it.each(['staging', 'production'] as const)(
    'accepts the exact governed %s API identity tuple',
    (environment) => {
      expect(
        assertPlatformAdminBootstrapEnvironment(
          environment,
          bootstrapEnvironment(environment),
        ),
      ).toMatchObject({
        ...ENVIRONMENT_CONTRACTS[environment],
        DATABASE_RUNTIME_ROLE: 'api',
        DATABASE_CONNECTION_LIMIT: 5,
        DATABASE_POOL_TIMEOUT_SECONDS: 5,
        DATABASE_CONNECT_TIMEOUT_SECONDS: 5,
      });
    },
  );

  it.each(CROSS_ENVIRONMENT_CASES)(
    'rejects %s without exposing configuration',
    (_label, requestedEnvironment, environmentDrift) => {
      expectSafeEnvironmentRejection(
        requestedEnvironment,
        bootstrapEnvironment(requestedEnvironment, environmentDrift),
      );
    },
  );

  it.each(['development', 'test', 'prod', 'qa', 'custom'])(
    'rejects unsupported environment %s without aliases',
    (requestedEnvironment) => {
      expectSafeEnvironmentRejection(
        requestedEnvironment,
        bootstrapEnvironment('staging'),
      );
    },
  );

  it.each(['staging', 'production'] as const)(
    'rejects database runtime-role and transport drift for %s',
    (environment) => {
      expectSafeEnvironmentRejection(
        environment,
        bootstrapEnvironment(environment, {
          DATABASE_RUNTIME_ROLE: 'core-worker',
        }),
      );
      expectSafeEnvironmentRejection(
        environment,
        bootstrapEnvironment(environment, {
          DATABASE_URL: databaseUrl('moazez_api', 'disable'),
        }),
      );
    },
  );

  it.each(['moazez_migration', 'postgres', 'admin', 'cloudsqlsuperuser'])(
    'rejects forbidden database identity %s in both environments',
    (databaseUser) => {
      for (const environment of ['staging', 'production'] as const) {
        expectSafeEnvironmentRejection(
          environment,
          bootstrapEnvironment(environment, {
            DATABASE_URL: databaseUrl(databaseUser),
          }),
        );
      }
    },
  );

  it.each(['staging', 'production'] as const)(
    'selects the governed %s tuple during Nest configuration validation',
    (environment) => {
      expect(
        validatePlatformAdminBootstrapEnvironment(
          bootstrapEnvironment(environment),
        ),
      ).toMatchObject(ENVIRONMENT_CONTRACTS[environment]);
    },
  );
});

function bootstrapEnvironment(
  environment: PlatformAdminBootstrapEnvironment,
  override: Partial<NodeJS.ProcessEnv> = {},
): NodeJS.ProcessEnv {
  return {
    ...ENVIRONMENT_CONTRACTS[environment],
    DATABASE_URL: databaseUrl('moazez_api'),
    DATABASE_RUNTIME_ROLE: 'api',
    DATABASE_CONNECTION_LIMIT: '5',
    DATABASE_POOL_TIMEOUT_SECONDS: '5',
    DATABASE_CONNECT_TIMEOUT_SECONDS: '5',
    ...override,
  };
}

function databaseUrl(
  username: string,
  sslmode: 'require' | 'disable' = 'require',
): string {
  return `postgresql://${username}:${SYNTHETIC_DATABASE_SECRET}@127.0.0.1:5432/moazez?sslmode=${sslmode}`;
}

function expectSafeEnvironmentRejection(
  requestedEnvironment: string,
  rawEnvironment: NodeJS.ProcessEnv,
): void {
  let caught: unknown;
  try {
    assertPlatformAdminBootstrapEnvironment(
      requestedEnvironment,
      rawEnvironment,
    );
  } catch (error) {
    caught = error;
  }

  expect(caught).toBeInstanceOf(PlatformAdminBootstrapError);
  expect((caught as PlatformAdminBootstrapError).reason).toBe(
    'UNSUPPORTED_ENVIRONMENT',
  );
  expect(String(caught)).not.toContain(SYNTHETIC_DATABASE_SECRET);
}
