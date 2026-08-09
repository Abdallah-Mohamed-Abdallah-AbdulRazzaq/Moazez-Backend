import { FileVisibility, ImportJobStatus } from '@prisma/client';

export const FILES_IMPORT_QUEUE_NAME = 'files-imports';
export const FILES_IMPORT_VALIDATE_JOB_NAME = 'validate-import';
export const FILES_IMPORT_RECONCILE_JOB_NAME = 'files.imports.reconcile';
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
  reportJson: unknown | null;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
  uploadedFile: ImportUploadedFileRecord | null;
};
