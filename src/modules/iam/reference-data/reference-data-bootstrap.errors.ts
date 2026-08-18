export const REFERENCE_DATA_BOOTSTRAP_FAILURE_REASONS = [
  'REFERENCE_DATA_DRIFT',
] as const;

export type ReferenceDataBootstrapFailureReason =
  (typeof REFERENCE_DATA_BOOTSTRAP_FAILURE_REASONS)[number];

const REASON_SET = new Set<string>(REFERENCE_DATA_BOOTSTRAP_FAILURE_REASONS);

export class ReferenceDataBootstrapError extends Error {
  constructor(readonly reason: ReferenceDataBootstrapFailureReason) {
    super('Authorization reference data did not pass semantic verification');
    this.name = ReferenceDataBootstrapError.name;
  }
}

export function isReferenceDataBootstrapError(
  error: unknown,
): error is ReferenceDataBootstrapError {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'reason' in error &&
    typeof (error as { reason?: unknown }).reason === 'string' &&
    REASON_SET.has((error as { reason: string }).reason),
  );
}
