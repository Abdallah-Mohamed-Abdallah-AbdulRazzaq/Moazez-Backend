import { z } from 'zod';
import {
  assertRawDatabaseUrlPolicy,
  DATABASE_RUNTIME_POLICY,
  type DatabaseDeploymentEnvironment,
  type DatabaseRuntimeRole,
} from './database-runtime.policy';

export const DATABASE_RUNTIME_ENVIRONMENT_FIELDS = Object.freeze([
  'DATABASE_URL',
  'DATABASE_RUNTIME_ROLE',
  'DATABASE_CONNECTION_LIMIT',
  'DATABASE_POOL_TIMEOUT_SECONDS',
  'DATABASE_CONNECT_TIMEOUT_SECONDS',
] as const);

export function createDatabaseRuntimeEnvironmentShape<
  TRole extends DatabaseRuntimeRole,
>(role: TRole) {
  const policy = DATABASE_RUNTIME_POLICY[role];
  return {
    DATABASE_URL: z.string().trim().min(1),
    DATABASE_RUNTIME_ROLE: z.literal(role).default(role),
    DATABASE_CONNECTION_LIMIT: boundedInteger(policy.connectionLimit),
    DATABASE_POOL_TIMEOUT_SECONDS: boundedInteger(policy.poolTimeoutSeconds),
    DATABASE_CONNECT_TIMEOUT_SECONDS: boundedInteger(
      policy.connectTimeoutSeconds,
    ),
  };
}

export function refineDatabaseRuntimeEnvironment(
  environment: {
    DATABASE_URL: string;
    NODE_ENV: DatabaseDeploymentEnvironment;
  },
  context: z.RefinementCtx,
): void {
  try {
    assertRawDatabaseUrlPolicy(environment.DATABASE_URL, environment.NODE_ENV);
  } catch (error) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['DATABASE_URL'],
      message:
        error instanceof Error
          ? error.message
          : 'DATABASE_URL violates the database runtime policy',
    });
  }
}

export function assertDatabaseFreeRuntimeEnvironment(
  raw: Record<string, unknown>,
  runtimeName: string,
): void {
  const forbiddenField = DATABASE_RUNTIME_ENVIRONMENT_FIELDS.find(
    (field) => raw[field] !== undefined,
  );
  if (forbiddenField) {
    throw new Error(
      `Invalid runtime environment configuration:\n  - ${forbiddenField}: ${forbiddenField} is not permitted for ${runtimeName}`,
    );
  }
}

function boundedInteger(bound: {
  default: number;
  minimum: number;
  maximum: number;
}) {
  return z.coerce
    .number()
    .int()
    .min(bound.minimum)
    .max(bound.maximum)
    .default(bound.default);
}
