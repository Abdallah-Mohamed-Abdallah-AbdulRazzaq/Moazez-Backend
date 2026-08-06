import { Logger } from '@nestjs/common';
import { FileVisibility } from '@prisma/client';
import { BullmqService } from '../../../../infrastructure/queue/bullmq.service';
import { StorageService } from '../../../../infrastructure/storage/storage.service';
import { BrandingLogoCleanupQueueService } from '../application/branding-logo-cleanup-queue.service';
import { ProcessBrandingLogoCleanupUseCase } from '../application/process-branding-logo-cleanup.use-case';
import { BrandingRepository } from '../infrastructure/branding.repository';
import { BrandingLogoCleanupWorker } from '../infrastructure/branding-logo-cleanup.worker';

describe('branding logo cleanup and reconciliation', () => {
  it('keeps the cleanup queue service producer-only at startup', () => {
    const bullmq = {
      addJob: jest.fn().mockResolvedValue({ id: 'job-1' }),
      ensureJobFromPersistedTruth: jest.fn().mockResolvedValue('created'),
      getQueueReadiness: jest.fn(),
    } as unknown as BullmqService;
    const service = new BrandingLogoCleanupQueueService(
      bullmq,
      createStorage(),
    );

    expect(service).not.toHaveProperty('onModuleInit');
    expect(bullmq.addJob).not.toHaveBeenCalled();
  });

  it('retries failed immediate cleanup with bounded attempts and retained failure', async () => {
    const bullmq = {
      addJob: jest.fn().mockResolvedValue({ id: 'job-1' }),
      ensureJobFromPersistedTruth: jest.fn().mockResolvedValue('created'),
      getQueueReadiness: jest.fn().mockResolvedValue({
        name: 'settings-branding-logo-cleanup',
        status: 'ok',
        counts: { waiting: 1, active: 0, delayed: 0, failed: 1 },
      }),
    } as unknown as BullmqService;
    const storage = {
      deleteObject: jest.fn().mockRejectedValue(new Error('storage offline')),
      resolveBucket: jest.fn().mockReturnValue('private-bucket'),
    } as unknown as StorageService;
    const service = new BrandingLogoCleanupQueueService(bullmq, storage);

    await service.cleanupAfterCommit(cleanupFile());

    expect(bullmq.ensureJobFromPersistedTruth).toHaveBeenCalledWith(
      'settings-branding-logo-cleanup',
      'delete-object',
      { fileId: 'file-1' },
      expect.objectContaining({
        jobId: 'branding-logo-cleanup-file-1',
        attempts: 5,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: 100,
        removeOnFail: false,
      }),
    );
    await expect(service.getReadiness()).resolves.toMatchObject({
      counts: { waiting: 1, active: 0, delayed: 0, failed: 1 },
    });
  });

  it('logs an intermediate attempt without falsely emitting terminal failure', () => {
    const errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    try {
      const harness = createWorkerHarness();

      harness.failedHandler({
        attemptsMade: 1,
        opts: { attempts: 5 },
      });

      expect(errorSpy).toHaveBeenCalledWith({
        event: 'branding.logo.cleanup.attempt_failed',
      });
      expect(errorSpy).not.toHaveBeenCalledWith({
        event: 'branding.logo.cleanup.failed',
      });
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('preserves the cleanup exception and emits one sanitized terminal failure event', async () => {
    const errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    try {
      const originalError = new Error(
        'private-bucket schools/school-id/branding/logos/file-id.png',
      );
      const harness = createWorkerHarness();
      harness.processCleanup.cleanup.mockRejectedValueOnce(originalError);
      const job = {
        name: 'delete-object',
        data: { fileId: 'private-file-id' },
        attemptsMade: 5,
        opts: { attempts: 5, removeOnFail: false },
      };

      await expect(harness.processor(job)).rejects.toBe(originalError);
      harness.failedHandler(job);

      const terminalCalls = errorSpy.mock.calls.filter(
        ([payload]) =>
          (payload as { event?: string }).event ===
          'branding.logo.cleanup.failed',
      );
      expect(terminalCalls).toEqual([
        [{ event: 'branding.logo.cleanup.failed' }],
      ]);
      expect(JSON.stringify(terminalCalls)).not.toContain('private-file-id');
      expect(JSON.stringify(terminalCalls)).not.toContain('private-bucket');
      expect(JSON.stringify(terminalCalls)).not.toContain('/branding/logos/');
      expect(job.opts.removeOnFail).toBe(false);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('fails closed on organization-mismatched cleanup metadata', async () => {
    const repository = {
      findCleanupFile: jest.fn().mockResolvedValue({
        ...cleanupFile(),
        schoolOrganizationId: 'org-2',
      }),
    } as unknown as BrandingRepository;
    const storage = createStorage();
    const process = new ProcessBrandingLogoCleanupUseCase(repository, storage, {
      enqueueCleanup: jest.fn(),
    } as unknown as BrandingLogoCleanupQueueService);

    await process.cleanup('file-1');
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });

  it('reconciles soft-deleted rows and removes only old unregistered branding objects', async () => {
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const repository = {
      findSoftDeletedBrandingFiles: jest
        .fn()
        .mockResolvedValue([
          { ...cleanupFile(), schoolOrganizationId: 'org-1' },
        ]),
      findKnownStorageLocations: jest.fn().mockResolvedValue(new Set<string>()),
    } as unknown as BrandingRepository;
    const storage = createStorage();
    storage.listObjectsPage.mockResolvedValue({
      objects: [
        {
          objectKey:
            'schools/11111111-1111-4111-8111-111111111111/branding/logos/22222222-2222-4222-8222-222222222222.png',
          size: 10,
          lastModified: old,
        },
        {
          objectKey: 'schools/not-branding/document.pdf',
          size: 10,
          lastModified: old,
        },
      ],
      nextStartAfter: null,
    });
    const cleanupQueue = {
      enqueueCleanup: jest.fn().mockResolvedValue(undefined),
    } as unknown as BrandingLogoCleanupQueueService;
    const process = new ProcessBrandingLogoCleanupUseCase(
      repository,
      storage,
      cleanupQueue,
    );

    await process.reconcile();

    expect(cleanupQueue.enqueueCleanup).toHaveBeenCalledWith('file-1');
    expect(storage.deleteObject).toHaveBeenCalledTimes(1);
    expect(storage.deleteObject).toHaveBeenCalledWith(
      expect.objectContaining({ bucket: 'private-bucket' }),
    );
  });

  it('uses bounded keyset pages so records after the first batch are not starved', async () => {
    const deletedAt = new Date();
    const files = Array.from({ length: 205 }, (_, index) => ({
      ...cleanupFile(),
      id: `file-${index}`,
      deletedAt,
      schoolOrganizationId: 'org-1',
    }));
    const repository = {
      findSoftDeletedBrandingFiles: jest.fn(
        (_limit: number, cursor: { id: string } | null) => {
          const start = cursor ? Number(cursor.id.split('-')[1]) + 1 : 0;
          return Promise.resolve(files.slice(start, start + 100));
        },
      ),
      findKnownStorageLocations: jest.fn().mockResolvedValue(new Set()),
    } as unknown as BrandingRepository;
    const storage = createStorage();
    const cleanupQueue = {
      enqueueCleanup: jest.fn().mockResolvedValue(undefined),
    } as unknown as BrandingLogoCleanupQueueService;
    const process = new ProcessBrandingLogoCleanupUseCase(
      repository,
      storage,
      cleanupQueue,
    );

    await process.reconcile();

    expect(repository.findSoftDeletedBrandingFiles).toHaveBeenCalledTimes(3);
    expect(cleanupQueue.enqueueCleanup).toHaveBeenCalledTimes(205);
    expect(cleanupQueue.enqueueCleanup).toHaveBeenCalledWith('file-204');
    expect(storage.listObjectsPage).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 100 }),
    );
  });

  it('does not endlessly reschedule completed cleanup and treats missing objects idempotently', async () => {
    const repository = {
      findCleanupFile: jest.fn().mockResolvedValue({
        ...cleanupFile(),
        schoolOrganizationId: 'org-1',
      }),
      findSoftDeletedBrandingFiles: jest
        .fn()
        .mockResolvedValue([
          { ...cleanupFile(), schoolOrganizationId: 'org-1' },
        ]),
      findKnownStorageLocations: jest.fn().mockResolvedValue(new Set()),
    } as unknown as BrandingRepository;
    const storage = createStorage();
    const notFound = Object.assign(new Error('missing'), { code: 'NoSuchKey' });
    storage.deleteObject.mockRejectedValueOnce(notFound);
    storage.statObject.mockRejectedValue(notFound);
    const cleanupQueue = {
      enqueueCleanup: jest.fn().mockResolvedValue(undefined),
    } as unknown as BrandingLogoCleanupQueueService;
    const process = new ProcessBrandingLogoCleanupUseCase(
      repository,
      storage,
      cleanupQueue,
    );

    await expect(process.cleanup('file-1')).resolves.toBeUndefined();
    await process.reconcile();
    await process.reconcile();
    expect(cleanupQueue.enqueueCleanup).not.toHaveBeenCalled();
  });

  it('recovers an enqueue failure on the next reconciliation run', async () => {
    const repository = {
      findSoftDeletedBrandingFiles: jest
        .fn()
        .mockResolvedValue([
          { ...cleanupFile(), schoolOrganizationId: 'org-1' },
        ]),
      findKnownStorageLocations: jest.fn().mockResolvedValue(new Set()),
    } as unknown as BrandingRepository;
    const storage = createStorage();
    const cleanupQueue = {
      enqueueCleanup: jest
        .fn()
        .mockRejectedValueOnce(new Error('queue unavailable'))
        .mockResolvedValueOnce(undefined),
    } as unknown as BrandingLogoCleanupQueueService;
    const process = new ProcessBrandingLogoCleanupUseCase(
      repository,
      storage,
      cleanupQueue,
    );

    await expect(process.reconcile()).rejects.toThrow(
      'branding_logo_cleanup_enqueue_failed',
    );
    await expect(process.reconcile()).resolves.toBeUndefined();
    expect(cleanupQueue.enqueueCleanup).toHaveBeenCalledTimes(2);
  });

  it('continues the bounded page after one enqueue failure so later records are not starved', async () => {
    const repository = {
      findSoftDeletedBrandingFiles: jest.fn().mockResolvedValue([
        { ...cleanupFile(), id: 'file-1', schoolOrganizationId: 'org-1' },
        { ...cleanupFile(), id: 'file-2', schoolOrganizationId: 'org-1' },
        { ...cleanupFile(), id: 'file-3', schoolOrganizationId: 'org-1' },
      ]),
      findKnownStorageLocations: jest.fn().mockResolvedValue(new Set()),
    } as unknown as BrandingRepository;
    const storage = createStorage();
    const cleanupQueue = {
      enqueueCleanup: jest
        .fn()
        .mockRejectedValueOnce(new Error('single enqueue failure'))
        .mockResolvedValue(undefined),
    } as unknown as BrandingLogoCleanupQueueService;
    const process = new ProcessBrandingLogoCleanupUseCase(
      repository,
      storage,
      cleanupQueue,
    );

    await expect(process.reconcile()).rejects.toThrow(
      'branding_logo_cleanup_enqueue_failed',
    );
    expect(cleanupQueue.enqueueCleanup).toHaveBeenCalledTimes(3);
    expect(cleanupQueue.enqueueCleanup).toHaveBeenCalledWith('file-3');
  });

  it('scans storage in bounded continuation pages', async () => {
    const repository = {
      findSoftDeletedBrandingFiles: jest.fn().mockResolvedValue([]),
      findKnownStorageLocations: jest.fn().mockResolvedValue(new Set()),
    } as unknown as BrandingRepository;
    const storage = createStorage();
    storage.listObjectsPage
      .mockResolvedValueOnce({ objects: [], nextStartAfter: 'opaque-cursor' })
      .mockResolvedValueOnce({ objects: [], nextStartAfter: null });
    const process = new ProcessBrandingLogoCleanupUseCase(repository, storage, {
      enqueueCleanup: jest.fn(),
    } as unknown as BrandingLogoCleanupQueueService);

    await process.reconcile();

    expect(storage.listObjectsPage).toHaveBeenCalledTimes(2);
    expect(storage.listObjectsPage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ startAfter: 'opaque-cursor', limit: 100 }),
    );
  });
});

function createStorage() {
  return {
    deleteObject: jest.fn().mockResolvedValue(undefined),
    resolveBucket: jest.fn().mockReturnValue('private-bucket'),
    statObject: jest.fn().mockResolvedValue({ size: 10 }),
    listObjectsPage: jest
      .fn()
      .mockResolvedValue({ objects: [], nextStartAfter: null }),
  } as unknown as jest.Mocked<
    Pick<
      StorageService,
      'deleteObject' | 'resolveBucket' | 'statObject' | 'listObjectsPage'
    >
  > as unknown as StorageService & {
    deleteObject: jest.Mock;
    resolveBucket: jest.Mock;
    statObject: jest.Mock;
    listObjectsPage: jest.Mock;
  };
}

function cleanupFile() {
  return {
    id: 'file-1',
    organizationId: 'org-1',
    schoolId: '11111111-1111-4111-8111-111111111111',
    bucket: 'private-bucket',
    objectKey:
      'schools/11111111-1111-4111-8111-111111111111/branding/logos/22222222-2222-4222-8222-222222222222.png',
    mimeType: 'image/png',
    sizeBytes: 10n,
    visibility: FileVisibility.PRIVATE,
    deletedAt: new Date(),
    createdAt: new Date(),
  };
}

function createWorkerHarness() {
  let processor: ((job: never) => Promise<void>) | undefined;
  let failedHandler: ((job: never) => void) | undefined;
  const eventWorker = {
    on: jest.fn((event: string, handler: (job: never) => void) => {
      if (event === 'failed') failedHandler = handler;
      return eventWorker;
    }),
  };
  const bullmq = {
    createWorker: jest.fn(
      (_queue: string, handler: (job: never) => Promise<void>) => {
        processor = handler;
        return eventWorker;
      },
    ),
  } as unknown as BullmqService;
  const processCleanup = {
    cleanup: jest.fn().mockResolvedValue(undefined),
    reconcile: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<ProcessBrandingLogoCleanupUseCase>;
  const cleanupQueue = {
    getReadiness: jest.fn().mockResolvedValue({
      counts: { waiting: 0, active: 0, delayed: 0, failed: 0 },
    }),
  } as unknown as BrandingLogoCleanupQueueService;
  const worker = new BrandingLogoCleanupWorker(
    bullmq,
    processCleanup,
    cleanupQueue,
  );

  worker.onModuleInit();
  if (!processor || !failedHandler) {
    throw new Error('worker handlers were not registered');
  }

  return {
    processor,
    failedHandler,
    processCleanup,
  };
}
