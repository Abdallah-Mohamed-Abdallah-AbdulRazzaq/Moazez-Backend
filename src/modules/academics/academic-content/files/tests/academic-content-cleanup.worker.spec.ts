import { FileUploadPurpose, FileUploadSessionStatus } from '@prisma/client';
import { AcademicContentCleanupWorker } from '../infrastructure/academic-content-cleanup.worker';

const uploadId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const schoolId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const fileId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const now = new Date('2026-09-24T00:00:00.000Z');
const eligible = new Date('2026-09-23T00:00:00.000Z');

describe('ACC cleanup worker', () => {
  const session = {
    id: uploadId,
    purpose: FileUploadPurpose.ACADEMIC_CONTENT,
    schoolId,
    fileId,
    status: FileUploadSessionStatus.READY,
    finalBucket: 'private',
    finalObjectKey: `academic-content/${schoolId}/objects/${uploadId}`,
    finalCleanupEligibleAt: eligible,
    finalCleanupClaimedAt: null,
    finalObjectDeletedAt: null,
  };
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([{ id: fileId }]),
    academicContentAsset: { count: jest.fn().mockResolvedValue(0) },
    fileUploadSession: { update: jest.fn().mockResolvedValue(session) },
    file: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };
  const repository = {
    lockById: jest.fn().mockResolvedValue(session),
    expireAbandoned: jest.fn().mockResolvedValue(1),
    recoverStaleVerification: jest.fn().mockResolvedValue(1),
    cleanupCandidates: jest.fn().mockResolvedValue([{ id: uploadId }]),
    prisma: {
      $transaction: jest.fn((callback: (value: typeof tx) => unknown) =>
        callback(tx),
      ),
      fileUploadSession: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    },
  };
  const queue = {
    createWorker: jest.fn(),
    ensureJobFromPersistedTruth: jest.fn().mockResolvedValue('created'),
  };
  const storage = {
    deleteObjectAndConfirmAbsent: jest.fn().mockResolvedValue(undefined),
  };
  const worker = new AcademicContentCleanupWorker(
    queue as never,
    repository as never,
    storage as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    repository.lockById.mockResolvedValue(session);
    tx.academicContentAsset.count.mockResolvedValue(0);
  });

  it('discovers purpose-scoped persisted work with a deterministic retryable job', async () => {
    await expect(worker.discoverAndEnqueue(now)).resolves.toBe(1);
    expect(repository.expireAbandoned).toHaveBeenCalledWith(now);
    expect(repository.recoverStaleVerification).toHaveBeenCalledWith(
      new Date(now.getTime() - 15 * 60 * 1000),
    );
    expect(queue.ensureJobFromPersistedTruth).toHaveBeenCalledWith(
      'academic-content-cleanup',
      'cleanup-object',
      { uploadId },
      expect.objectContaining({
        jobId: `academic-content-cleanup-${uploadId}`,
        attempts: 5,
      }),
    );
  });

  it('never claims or deletes READY File while an active asset exists', async () => {
    tx.academicContentAsset.count.mockResolvedValue(1);
    await worker.cleanUpload(uploadId, now);
    expect(storage.deleteObjectAndConfirmAbsent).not.toHaveBeenCalled();
    expect(tx.file.updateMany).not.toHaveBeenCalled();
    expect(tx.fileUploadSession.update).not.toHaveBeenCalled();
  });

  it('deletes READY orphan under lock then atomically records PURGED evidence', async () => {
    await worker.cleanUpload(uploadId, now);
    expect(storage.deleteObjectAndConfirmAbsent).toHaveBeenCalledWith({
      bucket: 'private',
      objectKey: session.finalObjectKey,
    });
    expect(tx.academicContentAsset.count).toHaveBeenCalledTimes(2);
    const fileUpdate = (
      tx.file.updateMany.mock.calls as unknown as Array<
        [
          {
            where: { id: string; schoolId: string; deletedAt: null };
            data: { deletedAt: Date };
          },
        ]
      >
    )[0][0];
    expect(fileUpdate.where).toEqual({ id: fileId, schoolId, deletedAt: null });
    expect(fileUpdate.data.deletedAt).toBeInstanceOf(Date);
    const purgedUpdate = (
      tx.fileUploadSession.update.mock.calls as unknown as Array<
        [
          {
            where: { id: string };
            data: {
              status: string;
              finalCleanupClaimedAt: Date;
              finalObjectDeletedAt: Date;
            };
          },
        ]
      >
    )[0][0];
    expect(purgedUpdate.where).toEqual({ id: uploadId });
    expect(purgedUpdate.data.status).toBe(FileUploadSessionStatus.PURGED);
    expect(purgedUpdate.data.finalCleanupClaimedAt).toEqual(now);
    expect(purgedUpdate.data.finalObjectDeletedAt).toBeInstanceOf(Date);
  });

  it('claims and deletes terminal orphan without creating a File or changing terminal state', async () => {
    const terminal = {
      ...session,
      status: FileUploadSessionStatus.FAILED,
      fileId: null,
    };
    repository.lockById
      .mockResolvedValueOnce(terminal)
      .mockResolvedValueOnce({ ...terminal, finalCleanupClaimedAt: now });
    await worker.cleanUpload(uploadId, now);
    expect(storage.deleteObjectAndConfirmAbsent).toHaveBeenCalledTimes(1);
    expect(tx.file.updateMany).not.toHaveBeenCalled();
    expect(tx.fileUploadSession.update).toHaveBeenCalledWith({
      where: { id: uploadId },
      data: { finalCleanupClaimedAt: now },
    });
    const evidenceUpdate = (
      tx.fileUploadSession.update.mock.calls as unknown as Array<
        [{ data: { finalObjectDeletedAt?: Date } }]
      >
    )[1][0];
    expect(evidenceUpdate.data.finalObjectDeletedAt).toBeInstanceOf(Date);
  });

  it('preserves a fresh terminal claim and recovers one older than the lease threshold', async () => {
    const terminal = {
      ...session,
      status: FileUploadSessionStatus.EXPIRED,
      fileId: null,
      finalCleanupClaimedAt: new Date(now.getTime() - 60_000),
    };
    repository.lockById.mockResolvedValue(terminal);
    await worker.cleanUpload(uploadId, now);
    expect(storage.deleteObjectAndConfirmAbsent).not.toHaveBeenCalled();
    const stale = {
      ...terminal,
      finalCleanupClaimedAt: new Date(now.getTime() - 16 * 60_000),
    };
    repository.lockById
      .mockResolvedValueOnce(stale)
      .mockResolvedValueOnce({ ...stale, finalCleanupClaimedAt: now });
    await worker.cleanUpload(uploadId, now);
    expect(storage.deleteObjectAndConfirmAbsent).toHaveBeenCalledTimes(1);
  });

  it('never acts on a session rejected by the ACC-purpose lock', async () => {
    repository.lockById.mockResolvedValue(null);
    await worker.cleanUpload(uploadId, now);
    expect(storage.deleteObjectAndConfirmAbsent).not.toHaveBeenCalled();
    expect(tx.file.updateMany).not.toHaveBeenCalled();
  });
});
