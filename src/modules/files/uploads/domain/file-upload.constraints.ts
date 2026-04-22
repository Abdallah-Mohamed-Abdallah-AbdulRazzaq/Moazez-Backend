export const FILES_UPLOAD_ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'text/plain',
] as const;

export const FILES_UPLOAD_MAX_SIZE_BYTES = 10 * 1024 * 1024;

const FILES_UPLOAD_ALLOWED_MIME_TYPE_SET = new Set<string>(
  FILES_UPLOAD_ALLOWED_MIME_TYPES,
);

export function isFilesUploadMimeTypeAllowed(mimeType: string): boolean {
  return FILES_UPLOAD_ALLOWED_MIME_TYPE_SET.has(
    mimeType.trim().toLowerCase(),
  );
}
