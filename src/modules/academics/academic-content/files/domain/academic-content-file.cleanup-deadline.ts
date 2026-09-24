import {
  FileUploadSessionStatus,
  type FileUploadSession,
} from '@prisma/client';
import { MAX_RESUMABLE_UPLOAD_CAPABILITY_LIFETIME_MS } from '../../../../../infrastructure/storage/object-storage.port';

export function missingAcademicCapabilityCleanupDeadline(now: Date): Date {
  return new Date(Number(now) + MAX_RESUMABLE_UPLOAD_CAPABILITY_LIFETIME_MS);
}

export function academicContentFinalCleanupDeadline(
  now: Date,
  session: Pick<FileUploadSession, 'status' | 'latestUploadUrlExpiresAt'>,
): Date {
  if (session.status === FileUploadSessionStatus.CREATED) return now;
  const capabilityExpiry =
    session.latestUploadUrlExpiresAt ??
    missingAcademicCapabilityCleanupDeadline(now);
  return new Date(Math.max(Number(now), Number(capabilityExpiry)));
}
