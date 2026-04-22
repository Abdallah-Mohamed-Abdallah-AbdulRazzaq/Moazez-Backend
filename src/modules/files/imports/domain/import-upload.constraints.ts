import { FILES_UPLOAD_MAX_SIZE_BYTES } from '../../uploads/domain/file-upload.constraints';

export const FILES_IMPORT_ALLOWED_TYPES = ['students_basic'] as const;

export const FILES_IMPORT_ALLOWED_MIME_TYPES = [
  'text/csv',
  'application/vnd.ms-excel',
] as const;

export const FILES_IMPORT_MAX_SIZE_BYTES = FILES_UPLOAD_MAX_SIZE_BYTES;

const FILES_IMPORT_ALLOWED_MIME_TYPE_SET = new Set<string>(
  FILES_IMPORT_ALLOWED_MIME_TYPES,
);

export function isFilesImportMimeTypeAllowed(mimeType: string): boolean {
  return FILES_IMPORT_ALLOWED_MIME_TYPE_SET.has(mimeType.trim().toLowerCase());
}

export type FilesImportType = (typeof FILES_IMPORT_ALLOWED_TYPES)[number];
