import { FileVisibility, ImportJobStatus } from '@prisma/client';

export const FILES_IMPORT_QUEUE_NAME = 'files-imports';
export const FILES_IMPORT_VALIDATE_JOB_NAME = 'validate-import';
export const FILES_IMPORT_RECONCILE_JOB_NAME = 'files.imports.reconcile';
export const STUDENT_BULK_REGISTRATION_EXECUTE_JOB_NAME =
  'execute-student-bulk-registration';
export const FILES_IMPORT_RECONCILE_INTERVAL_MS = 5 * 60 * 1000;
export const FILES_IMPORT_RECOVERY_WINDOW_MS = 24 * 60 * 60 * 1000;
export const FILES_IMPORT_PROCESSING_LEASE_MS = 5 * 60 * 1000;
export const FILES_IMPORT_RETRYABLE_ENQUEUE_CODE =
  'import_recovery_enqueue_unavailable';
export const FILES_IMPORT_RETRYABLE_STORAGE_CODE =
  'import_recovery_storage_unavailable';
export const FILES_IMPORT_TERMINAL_METADATA_MISSING_CODE =
  'import_terminal_file_metadata_missing';
export const FILES_IMPORT_TERMINAL_OBJECT_MISSING_CODE =
  'import_terminal_object_missing';
export const FILES_IMPORT_TERMINAL_WINDOW_EXPIRED_CODE =
  'import_terminal_recovery_window_expired';
export const FILES_IMPORT_TERMINAL_SOURCE_INELIGIBLE_CODE =
  'import_terminal_source_ineligible';
export const FILES_IMPORT_TERMINAL_TENANT_INELIGIBLE_CODE =
  'import_terminal_tenant_ineligible';

export type ImportValidationJobData = {
  importJobId: string;
};

export type StudentBulkRegistrationExecutionJobData = {
  batchId: string;
};

export type StudentCredentialBatchExecutionJobData = {
  batchId: string;
};

export type FilesImportQueueJobData =
  | ImportValidationJobData
  | StudentBulkRegistrationExecutionJobData
  | StudentCredentialBatchExecutionJobData;

export function studentBulkRegistrationExecutionJobId(batchId: string): string {
  return `student-bulk-registration-execution-${batchId}`;
}

export function isStudentBulkRegistrationExecutionJobData(
  value: unknown,
): value is StudentBulkRegistrationExecutionJobData {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length === 1 &&
    'batchId' in value &&
    typeof value.batchId === 'string' &&
    value.batchId.length > 0
  );
}

export function isStudentCredentialBatchExecutionJobData(
  value: unknown,
): value is StudentCredentialBatchExecutionJobData {
  return isStudentBulkRegistrationExecutionJobData(value);
}

export type ImportUploadedFileRecord = {
  id: string;
  bucket: string;
  objectKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: bigint;
  visibility: FileVisibility;
  deletedAt?: Date | null;
};

export type ImportJobRecord = {
  id: string;
  schoolId: string;
  uploadedFileId: string;
  type: string;
  status: ImportJobStatus;
  reportJson: unknown;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
  uploadedFile: ImportUploadedFileRecord | null;
};
