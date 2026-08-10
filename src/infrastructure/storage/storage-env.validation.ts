import { z } from 'zod';

const optionalNonEmptyString = z.preprocess(
  (value) =>
    typeof value === 'string' && value.trim().length === 0 ? undefined : value,
  z.string().trim().min(1).optional(),
);

const optionalUrl = z.preprocess(
  (value) =>
    typeof value === 'string' && value.trim().length === 0 ? undefined : value,
  z.string().url().optional(),
);

export const storageEnvironmentShape = {
  STORAGE_PROVIDER: z.enum(['minio', 's3', 'gcs']).default('minio'),
  STORAGE_ENDPOINT: optionalUrl,
  STORAGE_ACCESS_KEY: optionalNonEmptyString,
  STORAGE_SECRET_KEY: optionalNonEmptyString,
  STORAGE_BUCKET: z.string().trim().min(1),
  STORAGE_PUBLIC_BUCKET: z.string().trim().min(1),
  GCP_PROJECT_ID: optionalNonEmptyString,
  GCS_SIGNING_SERVICE_ACCOUNT: optionalNonEmptyString,
};

type StorageEnvironment = {
  NODE_ENV: 'development' | 'test' | 'staging' | 'production';
  STORAGE_PROVIDER: 'minio' | 's3' | 'gcs';
  STORAGE_ENDPOINT?: string;
  STORAGE_ACCESS_KEY?: string;
  STORAGE_SECRET_KEY?: string;
  GCP_PROJECT_ID?: string;
  GCS_SIGNING_SERVICE_ACCOUNT?: string;
};

export function refineStorageEnvironment(
  env: StorageEnvironment,
  context: z.RefinementCtx,
  options: { requireSigner: boolean },
): void {
  const cloudEnvironment =
    env.NODE_ENV === 'staging' || env.NODE_ENV === 'production';
  if (cloudEnvironment && env.STORAGE_PROVIDER !== 'gcs') {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['STORAGE_PROVIDER'],
      message: 'STORAGE_PROVIDER must be gcs in staging and production',
    });
  }

  if (env.STORAGE_PROVIDER === 'minio' || env.STORAGE_PROVIDER === 's3') {
    requireField(env.STORAGE_ENDPOINT, 'STORAGE_ENDPOINT', context);
    requireField(env.STORAGE_ACCESS_KEY, 'STORAGE_ACCESS_KEY', context);
    requireField(env.STORAGE_SECRET_KEY, 'STORAGE_SECRET_KEY', context);
    return;
  }

  requireField(env.GCP_PROJECT_ID, 'GCP_PROJECT_ID', context);
  if (options.requireSigner) {
    requireField(
      env.GCS_SIGNING_SERVICE_ACCOUNT,
      'GCS_SIGNING_SERVICE_ACCOUNT',
      context,
    );
  }
}

function requireField(
  value: string | undefined,
  field: string,
  context: z.RefinementCtx,
): void {
  if (value) return;
  context.addIssue({
    code: z.ZodIssueCode.custom,
    path: [field],
    message: `${field} is required for the selected storage provider`,
  });
}
