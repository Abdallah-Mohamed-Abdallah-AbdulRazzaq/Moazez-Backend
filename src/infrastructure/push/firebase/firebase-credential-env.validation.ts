import { z } from 'zod';

export const FIREBASE_CREDENTIAL_MODES = [
  'application_default',
  'google_application_credentials',
  'service_account_env',
] as const;

export type FirebaseCredentialMode = (typeof FIREBASE_CREDENTIAL_MODES)[number];

export const firebaseCredentialModeSchema = z.enum(FIREBASE_CREDENTIAL_MODES);

const booleanFromString = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true');

const optionalNonEmptyString = z.preprocess(
  (value) =>
    typeof value === 'string' && value.trim().length === 0 ? undefined : value,
  z.string().trim().min(1).optional(),
);

const optionalFirebaseCredentialMode = z.preprocess(
  (value) =>
    typeof value === 'string' && value.trim().length === 0 ? undefined : value,
  firebaseCredentialModeSchema.optional(),
);

export const firebaseCredentialEnvironmentShape = {
  FCM_ENABLED: booleanFromString.default('false'),
  FCM_DRY_RUN: booleanFromString.default('true'),
  FIREBASE_CREDENTIAL_MODE: optionalFirebaseCredentialMode,
  GOOGLE_APPLICATION_CREDENTIALS: optionalNonEmptyString,
  FIREBASE_PROJECT_ID: optionalNonEmptyString,
  FIREBASE_CLIENT_EMAIL: optionalNonEmptyString,
  FIREBASE_PRIVATE_KEY: optionalNonEmptyString,
};

export const FIREBASE_CREDENTIAL_CONFIGURATION_ERROR =
  'Firebase credential configuration is invalid';

export type FirebaseCredentialEnvironment = {
  FCM_ENABLED: boolean;
  FIREBASE_CREDENTIAL_MODE?: string;
  GOOGLE_APPLICATION_CREDENTIALS?: string;
  FIREBASE_PROJECT_ID?: string;
  FIREBASE_CLIENT_EMAIL?: string;
  FIREBASE_PRIVATE_KEY?: string;
};

type FirebaseCredentialEnvironmentField =
  | 'FCM_ENABLED'
  | 'FIREBASE_CREDENTIAL_MODE'
  | 'GOOGLE_APPLICATION_CREDENTIALS'
  | 'FIREBASE_PROJECT_ID';

export type FirebaseCredentialEnvironmentIssue = Readonly<{
  field: FirebaseCredentialEnvironmentField;
  message: string;
}>;

export function collectFirebaseCredentialEnvironmentIssues(
  env: FirebaseCredentialEnvironment,
): FirebaseCredentialEnvironmentIssue[] {
  const issues: FirebaseCredentialEnvironmentIssue[] = [];
  const firebaseServiceAccountFields = [
    env.FIREBASE_PROJECT_ID,
    env.FIREBASE_CLIENT_EMAIL,
    env.FIREBASE_PRIVATE_KEY,
  ];
  const providedServiceAccountFieldCount =
    firebaseServiceAccountFields.filter(Boolean).length;
  const hasAnyServiceAccountField = providedServiceAccountFieldCount > 0;
  const hasCompleteServiceAccountTriple =
    providedServiceAccountFieldCount === firebaseServiceAccountFields.length;
  const hasCredentialsFile = Boolean(env.GOOGLE_APPLICATION_CREDENTIALS);

  if (hasAnyServiceAccountField && !hasCompleteServiceAccountTriple) {
    issues.push({
      field: 'FIREBASE_PROJECT_ID',
      message:
        'FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY must be provided together',
    });
  }

  if (hasCredentialsFile && hasAnyServiceAccountField) {
    issues.push({
      field: 'GOOGLE_APPLICATION_CREDENTIALS',
      message:
        'GOOGLE_APPLICATION_CREDENTIALS and Firebase service-account environment credentials cannot be configured together',
    });
  }

  const mode = env.FIREBASE_CREDENTIAL_MODE;
  if (!mode) {
    if (env.FCM_ENABLED) {
      issues.push({
        field: 'FIREBASE_CREDENTIAL_MODE',
        message: 'FIREBASE_CREDENTIAL_MODE is required when FCM_ENABLED=true',
      });
    }
    return issues;
  }

  if (!isFirebaseCredentialMode(mode)) {
    issues.push({
      field: 'FIREBASE_CREDENTIAL_MODE',
      message: 'FIREBASE_CREDENTIAL_MODE is not an approved credential mode',
    });
    return issues;
  }

  switch (mode) {
    case 'application_default':
      if (hasCredentialsFile || hasAnyServiceAccountField) {
        issues.push({
          field: 'FIREBASE_CREDENTIAL_MODE',
          message:
            'FIREBASE_CREDENTIAL_MODE=application_default cannot be combined with alternate Firebase credential material',
        });
      }
      break;
    case 'google_application_credentials':
      if (!hasCredentialsFile) {
        issues.push({
          field: 'GOOGLE_APPLICATION_CREDENTIALS',
          message:
            'GOOGLE_APPLICATION_CREDENTIALS is required when FIREBASE_CREDENTIAL_MODE=google_application_credentials',
        });
      }
      if (hasAnyServiceAccountField) {
        issues.push({
          field: 'FIREBASE_CREDENTIAL_MODE',
          message:
            'FIREBASE_CREDENTIAL_MODE=google_application_credentials cannot be combined with Firebase service-account environment credentials',
        });
      }
      break;
    case 'service_account_env':
      if (!hasCompleteServiceAccountTriple) {
        issues.push({
          field: 'FIREBASE_PROJECT_ID',
          message:
            'Complete Firebase service-account environment credentials are required when FIREBASE_CREDENTIAL_MODE=service_account_env',
        });
      }
      if (hasCredentialsFile) {
        issues.push({
          field: 'FIREBASE_CREDENTIAL_MODE',
          message:
            'FIREBASE_CREDENTIAL_MODE=service_account_env cannot be combined with GOOGLE_APPLICATION_CREDENTIALS',
        });
      }
      break;
  }

  return issues;
}

export function refineFirebaseCredentialEnvironment(
  env: FirebaseCredentialEnvironment,
  context: z.RefinementCtx,
): void {
  for (const issue of collectFirebaseCredentialEnvironmentIssues(env)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: [issue.field],
      message: issue.message,
    });
  }
}

export function assertFirebaseCredentialEnvironment(
  env: FirebaseCredentialEnvironment,
): asserts env is FirebaseCredentialEnvironment & {
  FIREBASE_CREDENTIAL_MODE: FirebaseCredentialMode;
} {
  if (
    !env.FIREBASE_CREDENTIAL_MODE ||
    collectFirebaseCredentialEnvironmentIssues(env).length > 0
  ) {
    throw new Error(FIREBASE_CREDENTIAL_CONFIGURATION_ERROR);
  }
}

function isFirebaseCredentialMode(
  value: string,
): value is FirebaseCredentialMode {
  return FIREBASE_CREDENTIAL_MODES.some((mode) => mode === value);
}
