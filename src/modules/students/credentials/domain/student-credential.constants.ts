export const STUDENT_CREDENTIAL_SELECTED_STUDENTS_MAX = 10_000;

export const STUDENT_CREDENTIAL_BATCH_EXECUTE_JOB_NAME =
  'execute-student-credential-batch';

export const STUDENT_CREDENTIAL_SECRET_ARTIFACT_VERSION = 1 as const;
export const STUDENT_CREDENTIAL_SECRET_ARTIFACT_TTL_MS = 24 * 60 * 60 * 1000;
export const STUDENT_CREDENTIAL_EXECUTION_RECOVERY_WINDOW_MS =
  24 * 60 * 60 * 1000;
export const STUDENT_CREDENTIAL_EXECUTION_RECOVERY_PAGE_SIZE = 100;
export const STUDENT_CREDENTIAL_SECRET_ARTIFACT_MAX_BYTES = 64 * 1024 * 1024;
export const STUDENT_CREDENTIAL_EXPORT_MAX_BYTES = 64 * 1024 * 1024;
export const STUDENT_CREDENTIAL_SECRET_ARTIFACT_CLEANUP_PAGE_SIZE = 100;
export const STUDENT_CREDENTIAL_SECRET_ARTIFACT_MIME =
  'application/vnd.moazez.student-credentials+json';
export const STUDENT_CREDENTIAL_SECRET_ARTIFACT_ORIGINAL_NAME =
  'student-credential-secret-v1.json';

export const STUDENT_CREDENTIAL_EXECUTION_RECOVERY_WINDOW_EXPIRED_CODE =
  'students.credentials.execution_recovery_window_expired';
export const STUDENT_CREDENTIAL_EXECUTION_TENANT_INELIGIBLE_CODE =
  'students.credentials.execution_tenant_ineligible';
export const STUDENT_CREDENTIAL_SECRET_ARTIFACT_UNAVAILABLE_CODE =
  'students.credentials.secret_artifact_unavailable';
export const STUDENT_CREDENTIAL_SECRET_ARTIFACT_EXPIRED_CODE =
  'students.credentials.secret_artifact_expired';
export const STUDENT_CREDENTIAL_SECRET_ARTIFACT_INVALID_CODE =
  'students.credentials.secret_artifact_invalid';
export const STUDENT_CREDENTIAL_EXPORT_NOT_READY_CODE =
  'students.credentials.export_not_ready';
export const STUDENT_CREDENTIAL_EXPORT_EMPTY_CODE =
  'students.credentials.export_empty';
export const STUDENT_CREDENTIAL_EXPORT_TOO_LARGE_CODE =
  'students.credentials.export_too_large';

export function studentCredentialBatchExecutionJobId(batchId: string): string {
  return `student-credential-batch-execution-${batchId}`;
}
