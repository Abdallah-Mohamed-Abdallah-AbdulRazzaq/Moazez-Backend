import { z } from 'zod';

const booleanFromString = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true');

const optionalNonEmptyString = z.preprocess(
  (value) =>
    typeof value === 'string' && value.trim().length === 0
      ? undefined
      : value,
  z.string().trim().min(1).optional(),
);

export const envSchema = z
  .object({
    APP_PORT: z.coerce.number().int().positive().default(3000),
    NODE_ENV: z
      .enum(['development', 'test', 'staging', 'production'])
      .default('development'),
    APP_URL: z.string().url(),

    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().url(),

    JWT_ACCESS_SECRET: z.string().min(16),
    JWT_REFRESH_SECRET: z.string().min(16),
    JWT_ACCESS_TTL: z.string().min(1),
    JWT_REFRESH_TTL: z.string().min(1),

    STORAGE_PROVIDER: z.enum(['minio', 's3']).default('minio'),
    STORAGE_ENDPOINT: z.string().url(),
    STORAGE_ACCESS_KEY: z.string().min(1),
    STORAGE_SECRET_KEY: z.string().min(1),
    STORAGE_BUCKET: z.string().min(1),
    STORAGE_PUBLIC_BUCKET: z.string().min(1),

    // 32 decoded bytes. Supported formats: base64:<value> or hex:<value>.
    SETTINGS_SECRET_ENCRYPTION_KEY: z.string().optional(),

    FCM_ENABLED: booleanFromString.default('false'),
    FCM_DRY_RUN: booleanFromString.default('true'),
    GOOGLE_APPLICATION_CREDENTIALS: optionalNonEmptyString,
    FIREBASE_PROJECT_ID: optionalNonEmptyString,
    FIREBASE_CLIENT_EMAIL: optionalNonEmptyString,
    FIREBASE_PRIVATE_KEY: optionalNonEmptyString,

    SEED_DEMO_DATA: booleanFromString.default('false'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
      .default('info'),
  })
  .superRefine((env, ctx) => {
    const hasCredentialsFile = Boolean(env.GOOGLE_APPLICATION_CREDENTIALS);
    const firebaseEnvFields = [
      'FIREBASE_PROJECT_ID',
      'FIREBASE_CLIENT_EMAIL',
      'FIREBASE_PRIVATE_KEY',
    ] as const;
    const providedFirebaseEnvFields = firebaseEnvFields.filter((key) =>
      Boolean(env[key]),
    );
    const hasFirebaseEnvTriple =
      providedFirebaseEnvFields.length === firebaseEnvFields.length;
    const hasPartialFirebaseEnvTriple =
      providedFirebaseEnvFields.length > 0 && !hasFirebaseEnvTriple;

    if (hasPartialFirebaseEnvTriple) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['FIREBASE_PROJECT_ID'],
        message:
          'FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY must be provided together',
      });
    }

    if (!env.FCM_ENABLED || env.FCM_DRY_RUN) {
      return;
    }

    if (hasCredentialsFile && hasFirebaseEnvTriple) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['GOOGLE_APPLICATION_CREDENTIALS'],
        message:
          'Use exactly one Firebase credential strategy: GOOGLE_APPLICATION_CREDENTIALS or the Firebase env credential triple',
      });
      return;
    }

    if (!hasCredentialsFile && !hasFirebaseEnvTriple) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['FCM_ENABLED'],
        message:
          'FCM_ENABLED=true with FCM_DRY_RUN=false requires GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const formatted = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${formatted}`);
  }
  return parsed.data;
}
