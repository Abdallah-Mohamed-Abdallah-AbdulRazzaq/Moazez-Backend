import { FileUploadPurpose, FileUploadSessionStatus } from '@prisma/client';
import { AcademicContentCleanupWorker } from '../infrastructure/academic-content-cleanup.worker';

const uploadId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const schoolId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const fileId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const contentId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const now = new Date('2026-09-24T00:00:00.000Z');
const eligible = new Date('2026-09-23T00:00:00.000Z');

describe('ACC cleanup worker', () => {
  const session = {
    id: uploadId,
    purpose: FileUploadPurpose.ACADEMIC_CONTENT,
    schoolId,
    purposeContextId: contentId as string | null,
    fileId,
    status: FileUploadSessionStatus.READY,
    finalBucket: 'private',
    finalObjectKey: `academic-content/${schoolId}/objects/${uploadId}`,
    finalCleanupEligibleAt: eligible,
    finalCleanupClaimedAt: null,
    finalObjectDeletedAt: null,
  };
  const tx = {
    lockUploadById: jest.fn().mockResolvedValue(session),
    lockActiveFile: jest.fn().mockResolvedValue(true),
    hasRetainedFileReferences: jest.fn().mockResolvedValue(false),
    updateUpload: jest.fn().mockResolvedValue(session),
    softDeleteFile: jest.fn().mockResolvedValue(undefined),
  };
  const retired = {
    uploadId,
    schoolId,
    contentId,
    fileId,
    bucket: session.finalBucket,
    objectKey: session.finalObjectKey,
  };
  let transactionOpen = false;
  const repository = {
    expireAbandoned: jest.fn().mockResolvedValue(1),
    recoverStaleVerification: jest.fn().mockResolvedValue(1),
    cleanupCandidates: jest.fn().mockResolvedValue([{ id: uploadId }]),
    withTransaction: jest.fn(
      async (callback: (value: typeof tx) => unknown) => {
        transactionOpen = true;
        try {
          return await callback(tx);
        } finally {
          transactionOpen = false;
        }
      },
    ),
    prepareReadyOrphanCleanup: jest.fn().mockResolvedValue(retired),
    finalizeReadyOrphanCleanup: jest.fn().mockResolvedValue(undefined),
    releaseTerminalCleanupClaim: jest.fn().mockResolvedValue(undefined),
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
    tx.lockUploadById.mockResolvedValue(session);
    tx.hasRetainedFileReferences.mockResolvedValue(false);
    repository.prepareReadyOrphanCleanup.mockResolvedValue(retired);
    repository.finalizeReadyOrphanCleanup.mockResolvedValue(undefined);
    storage.deleteObjectAndConfirmAbsent.mockResolvedValue(undefined);
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

  it('distinguishes unknown poison jobs from invalid cleanup payloads', async () => {
    worker.onModuleInit();
    type Processor = (job: {
      name: string;
      data: { uploadId?: string };
    }) => Promise<unknown>;
    const calls = queue.createWorker.mock.calls as unknown as Array<
      [string, Processor]
    >;
    const processor = calls[0][1];
    await expect(
      processor({ name: 'g03.malformed.unknown', data: {} }),
    ).rejects.toThrow('academic_content_cleanup_job_unknown');
    await expect(
      processor({ name: 'cleanup-object', data: {} }),
    ).rejects.toThrow('academic_content_cleanup_job_invalid');
    await expect(
      processor({ name: 'cleanup-object', data: { uploadId: 'invalid' } }),
    ).rejects.toThrow('academic_content_cleanup_job_invalid');
    expect(tx.lockUploadById).not.toHaveBeenCalled();
  });

  it('never claims or deletes READY File while an active asset exists', async () => {
    repository.prepareReadyOrphanCleanup.mockResolvedValue(null);
    await worker.cleanUpload(uploadId, now);
    expect(storage.deleteObjectAndConfirmAbsent).not.toHaveBeenCalled();
    expect(tx.softDeleteFile).not.toHaveBeenCalled();
    expect(tx.updateUpload).not.toHaveBeenCalled();
  });

  it('waits for committed retirement before storage and finalizes after storage outside the transaction facade', async () => {
    const phases: string[] = [];
    repository.prepareReadyOrphanCleanup.mockImplementationOnce(() => {
      expect(transactionOpen).toBe(false);
      phases.push('retirement committed');
      return Promise.resolve(retired);
    });
    storage.deleteObjectAndConfirmAbsent.mockImplementationOnce(() => {
      expect(transactionOpen).toBe(false);
      phases.push('storage confirmed absent');
      return Promise.resolve();
    });
    repository.finalizeReadyOrphanCleanup.mockImplementationOnce(() => {
      phases.push('finalization');
      return Promise.resolve();
    });
    await worker.cleanUpload(uploadId, now);
    expect(phases).toEqual([
      'retirement committed',
      'storage confirmed absent',
      'finalization',
    ]);
    expect(repository.prepareReadyOrphanCleanup).toHaveBeenCalledWith(
      uploadId,
      now,
    );
    expect(storage.deleteObjectAndConfirmAbsent).toHaveBeenCalledWith({
      bucket: 'private',
      objectKey: session.finalObjectKey,
    });
    expect(repository.finalizeReadyOrphanCleanup).toHaveBeenCalledWith(
      retired,
      expect.any(Date),
    );
    expect(tx.updateUpload).not.toHaveBeenCalled();
  });

  it('propagates READY storage failure without finalization or terminal claim release and retries', async () => {
    storage.deleteObjectAndConfirmAbsent.mockRejectedValueOnce(
      new Error('provider deletion failed'),
    );
    await expect(worker.cleanUpload(uploadId, now)).rejects.toThrow(
      'provider deletion failed',
    );
    expect(repository.finalizeReadyOrphanCleanup).not.toHaveBeenCalled();
    expect(repository.releaseTerminalCleanupClaim).not.toHaveBeenCalled();
    await worker.cleanUpload(uploadId, now);
    expect(repository.prepareReadyOrphanCleanup).toHaveBeenCalledTimes(2);
    expect(storage.deleteObjectAndConfirmAbsent).toHaveBeenCalledTimes(2);
    expect(repository.finalizeReadyOrphanCleanup).toHaveBeenCalledTimes(1);
  });

  it('retries preparation and confirm-absent after READY finalization failure', async () => {
    repository.finalizeReadyOrphanCleanup.mockRejectedValueOnce(
      new Error('finalization failed'),
    );
    await expect(worker.cleanUpload(uploadId, now)).rejects.toThrow(
      'finalization failed',
    );
    expect(storage.deleteObjectAndConfirmAbsent).toHaveBeenCalledTimes(1);
    expect(repository.releaseTerminalCleanupClaim).not.toHaveBeenCalled();
    await worker.cleanUpload(uploadId, now);
    expect(repository.prepareReadyOrphanCleanup).toHaveBeenCalledTimes(2);
    expect(storage.deleteObjectAndConfirmAbsent).toHaveBeenCalledTimes(2);
    expect(repository.finalizeReadyOrphanCleanup).toHaveBeenCalledTimes(2);
  });

  it('claims and deletes terminal orphan without creating a File or changing terminal state', async () => {
    const terminal = {
      ...session,
      status: FileUploadSessionStatus.FAILED,
      fileId: null,
    };
    tx.lockUploadById
      .mockResolvedValueOnce(terminal)
      .mockResolvedValueOnce({ ...terminal, finalCleanupClaimedAt: now });
    await worker.cleanUpload(uploadId, now);
    expect(storage.deleteObjectAndConfirmAbsent).toHaveBeenCalledTimes(1);
    expect(tx.softDeleteFile).not.toHaveBeenCalled();
    expect(tx.updateUpload).toHaveBeenCalledWith(
      { uploadId, schoolId, contentId },
      { finalCleanupClaimedAt: now },
    );
    const evidenceUpdate = (
      tx.updateUpload.mock.calls as unknown as Array<
        [
          { uploadId: string; schoolId: string; contentId: string },
          { finalObjectDeletedAt?: Date },
        ]
      >
    )[1][1];
    expect(evidenceUpdate.finalObjectDeletedAt).toBeInstanceOf(Date);
    expect(tx.updateUpload).toHaveBeenLastCalledWith(
      { uploadId, schoolId, contentId },
      expect.objectContaining({
        finalObjectDeletedAt: expect.any(Date) as unknown,
      }),
    );
  });

  it('preserves a fresh terminal claim and recovers one older than the lease threshold', async () => {
    const terminal = {
      ...session,
      status: FileUploadSessionStatus.EXPIRED,
      fileId: null,
      finalCleanupClaimedAt: new Date(now.getTime() - 60_000),
    };
    tx.lockUploadById.mockResolvedValue(terminal);
    repository.prepareReadyOrphanCleanup.mockResolvedValue(null);
    await worker.cleanUpload(uploadId, now);
    expect(storage.deleteObjectAndConfirmAbsent).not.toHaveBeenCalled();
    const stale = {
      ...terminal,
      finalCleanupClaimedAt: new Date(now.getTime() - 16 * 60_000),
    };
    tx.lockUploadById
      .mockResolvedValueOnce(stale)
      .mockResolvedValueOnce({ ...stale, finalCleanupClaimedAt: now });
    await worker.cleanUpload(uploadId, now);
    expect(storage.deleteObjectAndConfirmAbsent).toHaveBeenCalledTimes(1);
  });

  it.each([
    FileUploadSessionStatus.FAILED,
    FileUploadSessionStatus.CANCELLED,
    FileUploadSessionStatus.EXPIRED,
  ])(
    'releases persisted tenant/resource identity after %s deletion fails',
    async (status) => {
      const terminal = { ...session, status, fileId: null };
      const failure = new Error('provider deletion failed');
      tx.lockUploadById.mockResolvedValueOnce(terminal);
      storage.deleteObjectAndConfirmAbsent.mockRejectedValueOnce(failure);
      await expect(worker.cleanUpload(uploadId, now)).rejects.toBe(failure);
      expect(repository.releaseTerminalCleanupClaim).toHaveBeenCalledWith({
        uploadId: terminal.id,
        schoolId: terminal.schoolId,
        contentId: terminal.purposeContextId,
        claimedAt: now,
      });
      expect(tx.updateUpload).toHaveBeenCalledTimes(1);
      expect(tx.updateUpload).toHaveBeenCalledWith(
        { uploadId, schoolId, contentId },
        { finalCleanupClaimedAt: now },
      );
      expect(tx.softDeleteFile).not.toHaveBeenCalled();
    },
  );

  it('fails closed before claim or deletion when the terminal ACC parent is missing', async () => {
    tx.lockUploadById.mockResolvedValueOnce({
      ...session,
      status: FileUploadSessionStatus.FAILED,
      fileId: null,
      purposeContextId: null,
    });
    await expect(worker.cleanUpload(uploadId, now)).rejects.toThrow(
      'academic_content_cleanup_context_missing',
    );
    expect(tx.updateUpload).not.toHaveBeenCalled();
    expect(storage.deleteObjectAndConfirmAbsent).not.toHaveBeenCalled();
    expect(repository.releaseTerminalCleanupClaim).not.toHaveBeenCalled();
  });

  it('fails closed before File lock or deletion when a READY ACC parent is missing', async () => {
    tx.lockUploadById.mockResolvedValue({
      ...session,
      purposeContextId: null,
    });
    repository.prepareReadyOrphanCleanup.mockRejectedValueOnce(
      new Error('academic_content_cleanup_context_missing'),
    );
    await expect(worker.cleanUpload(uploadId, now)).rejects.toThrow(
      'academic_content_cleanup_context_missing',
    );
    expect(tx.lockActiveFile).not.toHaveBeenCalled();
    expect(tx.updateUpload).not.toHaveBeenCalled();
    expect(tx.softDeleteFile).not.toHaveBeenCalled();
    expect(storage.deleteObjectAndConfirmAbsent).not.toHaveBeenCalled();
  });

  it('fails closed before terminal finalization when the persisted parent is missing', async () => {
    const terminal = {
      ...session,
      status: FileUploadSessionStatus.FAILED,
      fileId: null,
    };
    tx.lockUploadById.mockResolvedValueOnce(terminal).mockResolvedValueOnce({
      ...terminal,
      purposeContextId: null,
      finalCleanupClaimedAt: now,
    });
    await expect(worker.cleanUpload(uploadId, now)).rejects.toThrow(
      'academic_content_cleanup_context_missing',
    );
    expect(tx.updateUpload).toHaveBeenCalledTimes(1);
    expect(tx.updateUpload).toHaveBeenCalledWith(
      { uploadId, schoolId, contentId },
      { finalCleanupClaimedAt: now },
    );
    expect(tx.softDeleteFile).not.toHaveBeenCalled();
  });

  it('ignores tenant/resource fields supplied in queue data when releasing a claim', async () => {
    const terminal = {
      ...session,
      status: FileUploadSessionStatus.FAILED,
      fileId: null,
    };
    tx.lockUploadById.mockResolvedValueOnce(terminal);
    storage.deleteObjectAndConfirmAbsent.mockRejectedValueOnce(
      new Error('provider deletion failed'),
    );
    worker.onModuleInit();
    type Processor = (job: {
      name: string;
      data: { uploadId: string };
    }) => Promise<unknown>;
    const calls = queue.createWorker.mock.calls as unknown as Array<
      [string, Processor]
    >;
    const job = {
      name: 'cleanup-object',
      data: { uploadId, schoolId: 'untrusted', contentId: 'untrusted' },
    };
    await expect(calls[0][1](job)).rejects.toThrow('provider deletion failed');
    const release = (
      repository.releaseTerminalCleanupClaim.mock.calls as unknown as Array<
        [
          {
            uploadId: string;
            schoolId: string;
            contentId: string;
            claimedAt: Date;
          },
        ]
      >
    )[0][0];
    expect(release).toMatchObject({
      uploadId,
      schoolId,
      contentId,
    });
    expect(release.claimedAt).toBeInstanceOf(Date);
  });

  it('never acts on a session rejected by the ACC-purpose lock', async () => {
    tx.lockUploadById.mockResolvedValue(null);
    repository.prepareReadyOrphanCleanup.mockResolvedValue(null);
    await worker.cleanUpload(uploadId, now);
    expect(storage.deleteObjectAndConfirmAbsent).not.toHaveBeenCalled();
    expect(tx.softDeleteFile).not.toHaveBeenCalled();
  });
});
