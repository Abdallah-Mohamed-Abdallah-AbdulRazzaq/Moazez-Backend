import { extname } from 'node:path';

export type UploadedMultipartFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

const SAFE_EXTENSION_PATTERN = /^\.[a-z0-9]{1,10}$/i;

export function normalizeOriginalFileName(originalName: string): string {
  const normalized = originalName.trim();
  return normalized.length > 0 ? normalized : 'file';
}

export function buildSchoolFileObjectKey(
  schoolId: string,
  originalName: string,
  uniqueId: string,
): string {
  const extension = extname(normalizeOriginalFileName(originalName)).toLowerCase();
  const safeExtension = SAFE_EXTENSION_PATTERN.test(extension) ? extension : '';

  return `schools/${schoolId}/files/${uniqueId}${safeExtension}`;
}
