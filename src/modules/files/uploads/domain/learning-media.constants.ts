export const LEARNING_MEDIA_ALLOWED_MIME_TYPES = [
  'application/pdf',
  'text/plain',
  'image/jpeg',
  'image/png',
  'audio/mpeg',
  'audio/mp4',
  'audio/webm',
  'video/mp4',
  'video/webm',
] as const;
export const LEARNING_MEDIA_NON_VIDEO_MAX_SIZE_BYTES = 10_485_760n;
export const LEARNING_MEDIA_VIDEO_MAX_SIZE_BYTES = 209_715_200n;
export const LEARNING_MEDIA_MAX_SIZE_BYTES =
  LEARNING_MEDIA_VIDEO_MAX_SIZE_BYTES;
export const LEARNING_MEDIA_UPLOAD_URL_TTL_SECONDS = 3_600;
export const LEARNING_MEDIA_SESSION_TTL_MS = 7_200_000;
export const LEARNING_MEDIA_MAX_DURATION_SECONDS = 3_600;
export const LEARNING_MEDIA_MAX_WIDTH = 1_920;
export const LEARNING_MEDIA_MAX_HEIGHT = 1_080;
export const LEARNING_MEDIA_READY_RETENTION_MS = 7 * 24 * 60 * 60 * 1_000;
export const LEARNING_MEDIA_CLEANUP_INTERVAL_MS = 15 * 60 * 1_000;
export const LEARNING_MEDIA_STALE_CLAIM_MS = 15 * 60 * 1_000;
export const LEARNING_MEDIA_VERIFICATION_VERSION =
  'ffprobe-5.1.9-debian12-learning-media-v1';

export type LearningMediaMimeType =
  (typeof LEARNING_MEDIA_ALLOWED_MIME_TYPES)[number];

export function normalizeLearningMediaMimeType(
  value: string,
): LearningMediaMimeType | null {
  const normalized = value.trim().toLowerCase();
  return (
    LEARNING_MEDIA_ALLOWED_MIME_TYPES.find((item) => item === normalized) ??
    null
  );
}

export function learningMediaMaximumSizeBytes(
  mimeType: LearningMediaMimeType,
): bigint {
  return mimeType === 'video/mp4' || mimeType === 'video/webm'
    ? LEARNING_MEDIA_VIDEO_MAX_SIZE_BYTES
    : LEARNING_MEDIA_NON_VIDEO_MAX_SIZE_BYTES;
}
