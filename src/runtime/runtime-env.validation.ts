import { z } from 'zod';
import {
  assertDatabaseFreeRuntimeEnvironment,
  createDatabaseRuntimeEnvironmentShape,
  refineDatabaseRuntimeEnvironment,
} from '../infrastructure/database/database-runtime-env.validation';

const booleanFromString = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true');
const optionalNonEmptyString = z.preprocess(
  (value) =>
    typeof value === 'string' && value.trim().length === 0 ? undefined : value,
  z.string().trim().min(1).optional(),
);

const managementShape = {
  APP_PROBE_PORT: z.coerce.number().int().min(1).max(65_535).default(9090),
  APP_SHUTDOWN_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .max(60_000)
    .default(15_000),
  NODE_ENV: z
    .enum(['development', 'test', 'staging', 'production'])
    .default('development'),
  REDIS_URL: z.string().url(),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
};

const storageShape = {
  STORAGE_PROVIDER: z.enum(['minio', 's3']).default('minio'),
  STORAGE_ENDPOINT: z.string().url(),
  STORAGE_ACCESS_KEY: z.string().min(1),
  STORAGE_SECRET_KEY: z.string().min(1),
  STORAGE_BUCKET: z.string().min(1),
  STORAGE_PUBLIC_BUCKET: z.string().min(1),
};

const coreWorkerSchema = z
  .object({
    ...managementShape,
    ...createDatabaseRuntimeEnvironmentShape('core-worker'),
    ...storageShape,
    APP_URL: z.string().url(),
    SETTINGS_SECRET_ENCRYPTION_KEY: z.string().optional(),
    FCM_ENABLED: booleanFromString.default('false'),
    FCM_DRY_RUN: booleanFromString.default('true'),
    GOOGLE_APPLICATION_CREDENTIALS: optionalNonEmptyString,
    FIREBASE_PROJECT_ID: optionalNonEmptyString,
    FIREBASE_CLIENT_EMAIL: optionalNonEmptyString,
    FIREBASE_PRIVATE_KEY: optionalNonEmptyString,
  })
  .superRefine((env, context) => {
    refineDatabaseRuntimeEnvironment(env, context);

    const firebaseFields = [
      env.FIREBASE_PROJECT_ID,
      env.FIREBASE_CLIENT_EMAIL,
      env.FIREBASE_PRIVATE_KEY,
    ];
    const provided = firebaseFields.filter(Boolean).length;
    if (provided > 0 && provided < firebaseFields.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['FIREBASE_PROJECT_ID'],
        message: 'Firebase environment credentials must be provided together',
      });
    }
    if (!env.FCM_ENABLED || env.FCM_DRY_RUN) return;

    const hasFile = Boolean(env.GOOGLE_APPLICATION_CREDENTIALS);
    const hasTriple = provided === firebaseFields.length;
    if (hasFile === hasTriple) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['FCM_ENABLED'],
        message:
          'Enabled Firebase delivery requires exactly one credential strategy',
      });
    }
  });

const mediaWorkerSchema = z
  .object({
    ...managementShape,
    ...createDatabaseRuntimeEnvironmentShape('media-worker'),
    ...storageShape,
  })
  .superRefine((env, context) => {
    refineDatabaseRuntimeEnvironment(env, context);
  });

const maintenanceSchedulerSchema = z.object(managementShape);

export const validateCoreWorkerEnv = createValidator(coreWorkerSchema);
export const validateMediaWorkerEnv = createValidator(mediaWorkerSchema);
const validateMaintenanceSchedulerShape = createValidator(
  maintenanceSchedulerSchema,
);
export const validateMaintenanceSchedulerEnv = (
  raw: Record<string, unknown>,
) => {
  assertDatabaseFreeRuntimeEnvironment(raw, 'Maintenance Scheduler');
  return validateMaintenanceSchedulerShape(raw);
};

function createValidator<TSchema extends z.ZodTypeAny>(schema: TSchema) {
  return (raw: Record<string, unknown>): z.output<TSchema> => {
    const parsed = schema.safeParse(raw);
    if (parsed.success) return parsed.data;
    const formatted = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid runtime environment configuration:\n${formatted}`);
  };
}
