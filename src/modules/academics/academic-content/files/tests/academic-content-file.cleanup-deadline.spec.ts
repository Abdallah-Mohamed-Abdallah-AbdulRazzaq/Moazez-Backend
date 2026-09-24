import { FileUploadSessionStatus } from '@prisma/client';
import { MAX_RESUMABLE_UPLOAD_CAPABILITY_LIFETIME_MS } from '../../../../../infrastructure/storage/object-storage.port';
import {
  academicContentFinalCleanupDeadline,
  missingAcademicCapabilityCleanupDeadline,
} from '../domain/academic-content-file.cleanup-deadline';

const t1 = new Date('2026-09-24T00:00:00.000Z');
const t7 = new Date('2026-10-01T00:00:00.000Z');

describe('ACC resumable capability cleanup deadline', () => {
  it('never makes a cancelled or expired UPLOADING session eligible before T7', () => {
    const uploading = {
      status: FileUploadSessionStatus.UPLOADING,
      latestUploadUrlExpiresAt: t7,
    };
    expect(academicContentFinalCleanupDeadline(t1, uploading)).toEqual(t7);
    expect(
      academicContentFinalCleanupDeadline(
        new Date(t7.getTime() - 1),
        uploading,
      ),
    ).toEqual(t7);
    expect(academicContentFinalCleanupDeadline(t7, uploading)).toEqual(t7);
    const after = new Date(t7.getTime() + 1);
    expect(academicContentFinalCleanupDeadline(after, uploading)).toEqual(
      after,
    );
  });

  it('allows a genuine CREATED session with no issued capability to clean now', () => {
    expect(
      academicContentFinalCleanupDeadline(t1, {
        status: FileUploadSessionStatus.CREATED,
        latestUploadUrlExpiresAt: null,
      }),
    ).toEqual(t1);
  });

  it('fails safe for an unexpected UPLOADING row with no persisted expiry', () => {
    const deadline = academicContentFinalCleanupDeadline(t1, {
      status: FileUploadSessionStatus.UPLOADING,
      latestUploadUrlExpiresAt: null,
    });
    expect(deadline).toEqual(missingAcademicCapabilityCleanupDeadline(t1));
    expect(deadline.getTime() - t1.getTime()).toBe(
      MAX_RESUMABLE_UPLOAD_CAPABILITY_LIFETIME_MS,
    );
  });
});
