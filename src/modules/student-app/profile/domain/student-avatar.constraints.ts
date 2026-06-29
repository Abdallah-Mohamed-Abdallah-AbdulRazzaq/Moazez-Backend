export const STUDENT_AVATAR_ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export const STUDENT_AVATAR_MAX_SIZE_BYTES = 5 * 1024 * 1024;

const STUDENT_AVATAR_ALLOWED_MIME_TYPE_SET = new Set<string>(
  STUDENT_AVATAR_ALLOWED_MIME_TYPES,
);

export function isStudentAvatarMimeTypeAllowed(mimeType: string): boolean {
  return STUDENT_AVATAR_ALLOWED_MIME_TYPE_SET.has(
    mimeType.trim().toLowerCase(),
  );
}
