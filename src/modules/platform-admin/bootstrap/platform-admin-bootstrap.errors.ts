export const PLATFORM_ADMIN_BOOTSTRAP_FAILURE_REASONS = [
  'ALREADY_INITIALIZED',
  'EMAIL_IN_USE',
  'REFERENCE_DATA_INVALID',
  'INVALID_INPUT',
  'PASSWORD_POLICY_VIOLATION',
  'UNSUPPORTED_ENVIRONMENT',
  'CONCURRENT_BOOTSTRAP_CONFLICT',
] as const;

export type PlatformAdminBootstrapFailureReason =
  (typeof PLATFORM_ADMIN_BOOTSTRAP_FAILURE_REASONS)[number];

const SAFE_MESSAGES: Readonly<
  Record<PlatformAdminBootstrapFailureReason, string>
> = Object.freeze({
  ALREADY_INITIALIZED:
    'Platform Administrator bootstrap is already initialized',
  EMAIL_IN_USE: 'The requested identity is already in use',
  REFERENCE_DATA_INVALID: 'Required authorization reference data is invalid',
  INVALID_INPUT: 'Platform Administrator bootstrap input is invalid',
  PASSWORD_POLICY_VIOLATION: 'Password does not meet credential policy',
  UNSUPPORTED_ENVIRONMENT:
    'Platform Administrator bootstrap environment is unsupported',
  CONCURRENT_BOOTSTRAP_CONFLICT:
    'Platform Administrator bootstrap could not acquire a safe transaction outcome',
});

const REASON_SET = new Set<string>(PLATFORM_ADMIN_BOOTSTRAP_FAILURE_REASONS);

export class PlatformAdminBootstrapError extends Error {
  constructor(readonly reason: PlatformAdminBootstrapFailureReason) {
    super(SAFE_MESSAGES[reason]);
    this.name = PlatformAdminBootstrapError.name;
  }
}

export function isPlatformAdminBootstrapError(
  error: unknown,
): error is PlatformAdminBootstrapError {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'reason' in error &&
    typeof (error as { reason?: unknown }).reason === 'string' &&
    REASON_SET.has((error as { reason: string }).reason),
  );
}
