import { z } from 'zod';
import {
  assertDatabaseFreeRuntimeEnvironment,
  createDatabaseRuntimeEnvironmentShape,
  refineDatabaseRuntimeEnvironment,
} from '../infrastructure/database/database-runtime-env.validation';
import {
  refineRedisConnectionSecurity,
  redisTlsCaPemSchema,
  redisUrlSchema,
  refineRedisEndpointSeparation,
} from '../config/redis-env.validation';
import {
  refineStorageEnvironment,
  storageEnvironmentShape,
} from '../infrastructure/storage/storage-env.validation';
import { validateSecretEncryptionEnvironment } from '../shared/crypto/versioned-secret-crypto';

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
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
};

const coreWorkerSchema = z
  .object({
    ...managementShape,
    QUEUE_REDIS_URL: redisUrlSchema,
    QUEUE_REDIS_TLS_CA_PEM: redisTlsCaPemSchema,
    REALTIME_REDIS_URL: redisUrlSchema,
    REALTIME_REDIS_TLS_CA_PEM: redisTlsCaPemSchema,
    ...createDatabaseRuntimeEnvironmentShape('core-worker'),
    ...storageEnvironmentShape,
    APP_URL: z.string().url(),
    SETTINGS_EMAIL_SECRET_ENCRYPTION_ACTIVE_KEY_ID: optionalNonEmptyString,
    SETTINGS_EMAIL_SECRET_ENCRYPTION_ACTIVE_KEY: optionalNonEmptyString,
    SETTINGS_EMAIL_SECRET_ENCRYPTION_PREVIOUS_KEY_ID: optionalNonEmptyString,
    SETTINGS_EMAIL_SECRET_ENCRYPTION_PREVIOUS_KEY: optionalNonEmptyString,
    APP_DEVICE_TOKEN_ENCRYPTION_ACTIVE_KEY_ID: optionalNonEmptyString,
    APP_DEVICE_TOKEN_ENCRYPTION_ACTIVE_KEY: optionalNonEmptyString,
    APP_DEVICE_TOKEN_ENCRYPTION_PREVIOUS_KEY_ID: optionalNonEmptyString,
    APP_DEVICE_TOKEN_ENCRYPTION_PREVIOUS_KEY: optionalNonEmptyString,
    SETTINGS_SECRET_ENCRYPTION_KEY: optionalNonEmptyString,
    FCM_ENABLED: booleanFromString.default('false'),
    FCM_DRY_RUN: booleanFromString.default('true'),
    GOOGLE_APPLICATION_CREDENTIALS: optionalNonEmptyString,
    FIREBASE_PROJECT_ID: optionalNonEmptyString,
    FIREBASE_CLIENT_EMAIL: optionalNonEmptyString,
    FIREBASE_PRIVATE_KEY: optionalNonEmptyString,
  })
  .superRefine((env, context) => {
    refineDatabaseRuntimeEnvironment(env, context);
    refineRedisConnectionSecurity(env, context, ['queue', 'realtime']);
    refineRedisEndpointSeparation(env, context);
    refineStorageEnvironment(env, context, { requireSigner: false });
    for (const error of validateSecretEncryptionEnvironment(
      env,
      env.NODE_ENV,
    )) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [error.configurationField],
        message: error.message,
      });
    }

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
    QUEUE_REDIS_URL: redisUrlSchema,
    QUEUE_REDIS_TLS_CA_PEM: redisTlsCaPemSchema,
    ...createDatabaseRuntimeEnvironmentShape('media-worker'),
    ...storageEnvironmentShape,
  })
  .superRefine((env, context) => {
    refineDatabaseRuntimeEnvironment(env, context);
    refineRedisConnectionSecurity(env, context, ['queue']);
    refineStorageEnvironment(env, context, { requireSigner: false });
  });

const maintenanceSchedulerSchema = z
  .object({
    ...managementShape,
    QUEUE_REDIS_URL: redisUrlSchema,
    QUEUE_REDIS_TLS_CA_PEM: redisTlsCaPemSchema,
  })
  .superRefine((env, context) => {
    refineRedisConnectionSecurity(env, context, ['queue']);
  });

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

function createValidator<TOutput, TDefinition extends z.ZodTypeDef, TInput>(
  schema: z.ZodType<TOutput, TDefinition, TInput>,
) {
  return (raw: Record<string, unknown>): TOutput => {
    const parsed = schema.safeParse(raw);
    if (parsed.success) return parsed.data;
    const formatted = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid runtime environment configuration:\n${formatted}`);
  };
}
