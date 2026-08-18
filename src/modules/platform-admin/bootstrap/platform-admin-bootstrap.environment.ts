import { z } from 'zod';
import {
  createDatabaseRuntimeEnvironmentShape,
  refineDatabaseRuntimeEnvironment,
} from '../../../infrastructure/database/database-runtime-env.validation';
import { PLATFORM_ADMIN_BOOTSTRAP_ENVIRONMENT } from './platform-admin-bootstrap.constants';
import { PlatformAdminBootstrapError } from './platform-admin-bootstrap.errors';

const STAGING_API_URL = 'https://staging-api.moazez.cloud';
const STAGING_GCP_PROJECT_ID = 'moazez-nonprod-91001421934';
const STAGING_DATABASE_USER = 'moazez_api';

const environmentSchema = z
  .object({
    NODE_ENV: z.literal(PLATFORM_ADMIN_BOOTSTRAP_ENVIRONMENT),
    APP_URL: z.literal(STAGING_API_URL),
    GCP_PROJECT_ID: z.literal(STAGING_GCP_PROJECT_ID),
    ...createDatabaseRuntimeEnvironmentShape('api'),
  })
  .superRefine((environment, context) => {
    refineDatabaseRuntimeEnvironment(environment, context);

    try {
      const databaseUrl = new URL(environment.DATABASE_URL);
      if (databaseUrl.username !== STAGING_DATABASE_USER) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['DATABASE_URL'],
          message:
            'DATABASE_URL does not use the approved staging API identity',
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

export type PlatformAdminBootstrapEnvironment = z.infer<
  typeof environmentSchema
>;

export function assertPlatformAdminBootstrapEnvironment(
  requestedEnvironment: string,
  rawEnvironment: NodeJS.ProcessEnv,
): PlatformAdminBootstrapEnvironment {
  if (requestedEnvironment !== PLATFORM_ADMIN_BOOTSTRAP_ENVIRONMENT) {
    throw new PlatformAdminBootstrapError('UNSUPPORTED_ENVIRONMENT');
  }

  const parsed = environmentSchema.safeParse(rawEnvironment);
  if (!parsed.success) {
    throw new PlatformAdminBootstrapError('UNSUPPORTED_ENVIRONMENT');
  }

  return parsed.data;
}

export function validatePlatformAdminBootstrapEnvironment(
  rawEnvironment: Record<string, unknown>,
): PlatformAdminBootstrapEnvironment {
  return assertPlatformAdminBootstrapEnvironment(
    PLATFORM_ADMIN_BOOTSTRAP_ENVIRONMENT,
    rawEnvironment as NodeJS.ProcessEnv,
  );
}
