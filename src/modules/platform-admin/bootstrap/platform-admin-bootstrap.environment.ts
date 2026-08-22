import { z } from 'zod';
import {
  createDatabaseRuntimeEnvironmentShape,
  refineDatabaseRuntimeEnvironment,
} from '../../../infrastructure/database/database-runtime-env.validation';
import {
  isPlatformAdminBootstrapEnvironment,
  type PlatformAdminBootstrapEnvironment,
} from './platform-admin-bootstrap.constants';
import { PlatformAdminBootstrapError } from './platform-admin-bootstrap.errors';

const PLATFORM_ADMIN_BOOTSTRAP_ENVIRONMENT_CONTRACT = Object.freeze({
  staging: Object.freeze({
    NODE_ENV: 'staging',
    APP_URL: 'https://staging-api.moazez.cloud',
    GCP_PROJECT_ID: 'moazez-nonprod-91001421934',
  }),
  production: Object.freeze({
    NODE_ENV: 'production',
    APP_URL: 'https://api.moazez.cloud',
    GCP_PROJECT_ID: 'moazez-production',
  }),
} satisfies Record<
  PlatformAdminBootstrapEnvironment,
  {
    NODE_ENV: PlatformAdminBootstrapEnvironment;
    APP_URL: string;
    GCP_PROJECT_ID: string;
  }
>);

const APPROVED_DATABASE_USER = 'moazez_api';

function createEnvironmentSchema(
  environment: PlatformAdminBootstrapEnvironment,
) {
  const contract = PLATFORM_ADMIN_BOOTSTRAP_ENVIRONMENT_CONTRACT[environment];

  return z
    .object({
      NODE_ENV: z.literal(contract.NODE_ENV),
      APP_URL: z.literal(contract.APP_URL),
      GCP_PROJECT_ID: z.literal(contract.GCP_PROJECT_ID),
      ...createDatabaseRuntimeEnvironmentShape('api'),
    })
    .superRefine((environmentVariables, context) => {
      refineDatabaseRuntimeEnvironment(environmentVariables, context);

      try {
        const databaseUrl = new URL(environmentVariables.DATABASE_URL);
        if (databaseUrl.username !== APPROVED_DATABASE_USER) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['DATABASE_URL'],
            message: 'DATABASE_URL does not use the approved API identity',
          });
        }
      } catch {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['DATABASE_URL'],
          message: 'DATABASE_URL is invalid',
        });
      }
    });
}

const environmentSchemas = {
  staging: createEnvironmentSchema('staging'),
  production: createEnvironmentSchema('production'),
} as const;

export type PlatformAdminBootstrapRuntimeEnvironment = z.infer<
  (typeof environmentSchemas)[keyof typeof environmentSchemas]
>;

export function assertPlatformAdminBootstrapEnvironment(
  requestedEnvironment: string,
  rawEnvironment: NodeJS.ProcessEnv,
): PlatformAdminBootstrapRuntimeEnvironment {
  if (!isPlatformAdminBootstrapEnvironment(requestedEnvironment)) {
    throw new PlatformAdminBootstrapError('UNSUPPORTED_ENVIRONMENT');
  }

  const parsed =
    environmentSchemas[requestedEnvironment].safeParse(rawEnvironment);
  if (!parsed.success) {
    throw new PlatformAdminBootstrapError('UNSUPPORTED_ENVIRONMENT');
  }

  return parsed.data;
}

export function validatePlatformAdminBootstrapEnvironment(
  rawEnvironment: Record<string, unknown>,
): PlatformAdminBootstrapRuntimeEnvironment {
  const requestedEnvironment = rawEnvironment.NODE_ENV;
  if (!isPlatformAdminBootstrapEnvironment(requestedEnvironment)) {
    throw new PlatformAdminBootstrapError('UNSUPPORTED_ENVIRONMENT');
  }

  return assertPlatformAdminBootstrapEnvironment(requestedEnvironment, {
    ...rawEnvironment,
  } as NodeJS.ProcessEnv);
}
