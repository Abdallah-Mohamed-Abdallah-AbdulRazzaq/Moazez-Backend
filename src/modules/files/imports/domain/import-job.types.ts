import { FileVisibility, ImportJobStatus } from '@prisma/client';

export const FILES_IMPORT_QUEUE_NAME = 'files-imports';
export const FILES_IMPORT_VALIDATE_JOB_NAME = 'validate-import';

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
