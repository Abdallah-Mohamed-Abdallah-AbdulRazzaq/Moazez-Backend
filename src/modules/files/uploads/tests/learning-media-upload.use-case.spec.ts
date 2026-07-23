import {
  FileUploadPurpose,
  FileUploadSession,
  FileUploadSessionStatus,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
} from '../../../../common/context/request-context';
import { StorageService } from '../../../../infrastructure/storage/storage.service';
import { BullmqService } from '../../../../infrastructure/queue/bullmq.service';
import {
  LEARNING_MEDIA_CLEANUP_QUEUE,
  LearningMediaCleanupService,
  learningMediaCleanupJobId,
} from '../application/learning-media-cleanup.service';
import {
  CompleteLearningMediaUploadUseCase,
  CreateLearningMediaUploadUseCase,
} from '../application/learning-media-upload.use-cases';
import {
  LearningMediaIntentInput,
  LearningMediaTransactionContext,
  LearningMediaUnitOfWork,
} from '../application/learning-media.unit-of-work';
import { sanitizeOriginalName } from '../domain/original-name';
import { LearningMediaRepository } from '../infrastructure/learning-media.repository';
import {
  detectContainerMime,
  MediaVerifierService,
  validateProbe,
} from '../application/media-verifier.service';
import {
  LEARNING_MEDIA_ALLOWED_MIME_TYPES,
  normalizeLearningMediaMimeType,
} from '../domain/learning-media.constants';

describe('learning media upload foundation', () => {
  describe('sanitizeOriginalName', () => {
    it.each([
      ['lesson.mp4', 'lesson.mp4'],
      ['C:\\fakepath\\lesson.mp4', 'lesson.mp4'],
      ['/tmp/lesson.webm', 'lesson.webm'],
      ['  les\u0000son.mp4  ', 'lesson.mp4'],
    ])('normalizes %p', (input, expected) => {
      expect(sanitizeOriginalName(input)).toBe(expected);
    });

    it.each([' \u0000 ', 'a'.repeat(256)])(
      'rejects invalid name length',
      (input) => {
        expect(() => sanitizeOriginalName(input)).toThrow();
        try {
          sanitizeOriginalName(input);
        } catch (error: unknown) {
          expect(error).toMatchObject({ code: 'validation.failed' });
        }
      },
    );
  });

  describe('authoritative media facts', () => {
    it.each([
      'application/pdf',
      'text/plain',
      'image/jpeg',
      'image/png',
      'audio/mpeg',
      'audio/mp4',
      'audio/webm',
      'video/mp4',
      'video/webm',
    ] as const)('accepts the locked FILE MIME %s', (mimeType) => {
      expect(normalizeLearningMediaMimeType(mimeType)).toBe(mimeType);
    });

    it('exports exactly the locked FILE MIME matrix', () => {
      expect(LEARNING_MEDIA_ALLOWED_MIME_TYPES).toEqual([
        'application/pdf',
        'text/plain',
        'image/jpeg',
        'image/png',
        'audio/mpeg',
        'audio/mp4',
        'audio/webm',
        'video/mp4',
        'video/webm',
      ]);
    });

    it('detects MP4 and WebM independently of client MIME', () => {
      expect(detectContainerMime(buildIsoBmffHead('isom'))).toBe('video/mp4');
      expect(detectContainerMime(buildEbmlHead('webm'))).toBe('video/webm');
      expect(detectContainerMime(buildIsoBmffHead('qt  '))).toBeNull();
      expect(detectContainerMime(buildEbmlHead('matroska'))).toBeNull();
      expect(detectContainerMime(Buffer.from('spoofed'))).toBeNull();
    });

    it('validates codec, duration, dimensions, and 90-degree rotation', () => {
      expect(
        validateProbe(
          {
            streams: [
              {
                codec_type: 'video',
                codec_name: 'h264',
                width: 1080,
                height: 1920,
                side_data_list: [{ rotation: 90 }],
              },
              { codec_type: 'audio', codec_name: 'aac' },
            ],
            format: {
              duration: '3600',
              format_name: 'mov,mp4,m4a,3gp,3g2,mj2',
            },
          },
          'video/mp4',
        ),
      ).toEqual({ durationSeconds: 3600, width: 1920, height: 1080 });
    });

    it.each([
      ['unsupported_video_codec', { codec_name: 'hevc' }, 'video/mp4'],
      ['invalid_dimensions', { width: 1921 }, 'video/mp4'],
      ['invalid_duration', {}, 'video/mp4'],
    ])('maps invalid probe facts to %s', (reasonCode, override, mimeType) => {
      const validate = () =>
        validateProbe(
          {
            streams: [
              {
                codec_type: 'video',
                codec_name: 'h264',
                width: 320,
                height: 180,
                ...override,
              },
            ],
            format: {
              duration: reasonCode === 'invalid_duration' ? '3601' : '1',
              format_name: 'mov,mp4,m4a,3gp,3g2,mj2',
            },
          },
          mimeType,
        );
      expect(validate).toThrow();
      try {
        validate();
      } catch (error: unknown) {
        expect(error).toMatchObject({ reasonCode });
      }
    });
  });

  it('creates one scoped intent and returns only safe URL metadata', async () => {
    const session = buildSession();
    const createOrFindIntent: jest.MockedFunction<
      LearningMediaTransactionContext['createOrFindIntent']
    > = jest.fn().mockResolvedValue({ session, created: true });
    const persistUploadUrlCapability = jest.fn().mockResolvedValue(session);
    const unitOfWork = {
      execute: (
        callback: (tx: LearningMediaTransactionContext) => Promise<unknown>,
      ) =>
        callback({
          createOrFindIntent,
          persistUploadUrlCapability,
        } as unknown as LearningMediaTransactionContext),
    } as LearningMediaUnitOfWork;
    const storage = {
      resolveBucket: jest.fn().mockReturnValue('private-bucket'),
      createUploadUrl: jest.fn().mockResolvedValue({
        url: 'https://signed.example/put',
        expiresAt: session.latestUploadUrlExpiresAt,
      }),
    };
    const useCase = new CreateLearningMediaUploadUseCase(
      unitOfWork,
      {} as LearningMediaRepository,
      storage as unknown as StorageService,
    );

    const response = await inScope(() =>
      useCase.execute({
        clientRequestId: session.clientRequestId,
        originalName: 'C:\\fakepath\\lesson.mp4',
        expectedMimeType: 'VIDEO/MP4',
        expectedSizeBytes: '1024',
      }),
    );

    const intentInput = createOrFindIntent.mock.calls[0]?.[0] as
      | LearningMediaIntentInput
      | undefined;
    expect(intentInput).toMatchObject({
      actorId: 'actor-1',
      schoolId: 'school-1',
      originalName: 'lesson.mp4',
      expectedMimeType: 'video/mp4',
      expectedSizeBytes: 1024n,
    });
    expect(intentInput?.stagingObjectKey).toMatch(
      /^learning-media\/school-1\/staging\//u,
    );
    expect(typeof intentInput?.finalObjectKey).toBe('string');
    expect(
      (intentInput as LearningMediaIntentInput & { finalObjectKey: string })
        .finalObjectKey,
    ).not.toBe(intentInput?.stagingObjectKey);
    expect(response).toEqual(
      expect.objectContaining({
        id: session.id,
        status: FileUploadSessionStatus.UPLOADING,
        uploadUrl: 'https://signed.example/put',
      }),
    );
    expect(JSON.stringify(response)).not.toContain('private-bucket');
    expect(JSON.stringify(response)).not.toContain('lesson.mp4');
  });

  it('rejects expectations above 200 MiB before signing', async () => {
    const execute = jest.fn();
    const unitOfWork = {
      execute,
    } as unknown as LearningMediaUnitOfWork;
    const storage = { resolveBucket: jest.fn(), createUploadUrl: jest.fn() };
    const useCase = new CreateLearningMediaUploadUseCase(
      unitOfWork,
      {} as LearningMediaRepository,
      storage as unknown as StorageService,
    );

    await expect(
      inScope(() =>
        useCase.execute({
          clientRequestId: '11111111-1111-4111-8111-111111111111',
          originalName: 'lesson.mp4',
          expectedMimeType: 'video/mp4',
          expectedSizeBytes: '209715201',
        }),
      ),
    ).rejects.toMatchObject({
      code: 'learning.media.size_exceeded',
      details: { maximumBytes: '209715200', actualBytes: '209715201' },
    });
    expect(execute).not.toHaveBeenCalled();
    expect(storage.createUploadUrl).not.toHaveBeenCalled();
  });

  it('preserves the 10 MiB boundary for non-video uploads', async () => {
    const execute = jest.fn();
    const unitOfWork = { execute } as unknown as LearningMediaUnitOfWork;
    const storage = { resolveBucket: jest.fn(), createUploadUrl: jest.fn() };
    const useCase = new CreateLearningMediaUploadUseCase(
      unitOfWork,
      {} as LearningMediaRepository,
      storage as unknown as StorageService,
    );

    await expect(
      inScope(() =>
        useCase.execute({
          clientRequestId: '11111111-1111-4111-8111-111111111111',
          originalName: 'lesson.pdf',
          expectedMimeType: 'application/pdf',
          expectedSizeBytes: '10485761',
        }),
      ),
    ).rejects.toMatchObject({
      code: 'learning.media.size_exceeded',
      details: { maximumBytes: '10485760', actualBytes: '10485761' },
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it('returns an existing READY result for an identical idempotent replay', async () => {
    const session = buildSession();
    Object.assign(session, {
      status: FileUploadSessionStatus.READY,
      fileId: '33333333-3333-4333-8333-333333333333',
      verifiedMimeType: 'video/mp4',
      actualSizeBytes: 1024n,
      checksumSha256: 'a'.repeat(64),
      durationSeconds: 1,
      width: 320,
      height: 180,
      verifiedAt: new Date(),
      verificationVersion: 'ffprobe-5.1.9-debian12-learning-media-v1',
      completedAt: new Date(),
      finalCleanupEligibleAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    const unitOfWork = {
      execute: (callback: (tx: LearningMediaTransactionContext) => unknown) =>
        callback({
          createOrFindIntent: jest
            .fn()
            .mockResolvedValue({ session, created: false }),
        } as unknown as LearningMediaTransactionContext),
    } as LearningMediaUnitOfWork;
    const storage = {
      resolveBucket: jest.fn().mockReturnValue('private-bucket'),
      createUploadUrl: jest.fn(),
    };
    const useCase = new CreateLearningMediaUploadUseCase(
      unitOfWork,
      {} as LearningMediaRepository,
      storage as unknown as StorageService,
    );

    await expect(
      inScope(() =>
        useCase.execute({
          clientRequestId: session.clientRequestId,
          originalName: session.originalName,
          expectedMimeType: session.expectedMimeType,
          expectedSizeBytes: session.expectedSizeBytes.toString(),
        }),
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        id: session.id,
        status: FileUploadSessionStatus.READY,
        fileId: session.fileId,
      }),
    );
    expect(storage.createUploadUrl).not.toHaveBeenCalled();
  });

  it.each([
    [FileUploadSessionStatus.VERIFYING, true, undefined],
    [FileUploadSessionStatus.FAILED, false, 'magic_mismatch'],
    [FileUploadSessionStatus.CANCELLED, false, undefined],
    [FileUploadSessionStatus.PURGED, false, undefined],
  ] as const)(
    'returns the existing safe %s idempotency state without signing',
    async (status, retryable, reasonCode) => {
      const session = buildSession();
      session.status = status;
      session.expiresAt = new Date(Date.now() - 1);
      session.failureReason = reasonCode ?? null;
      const unitOfWork = {
        execute: (callback: (tx: LearningMediaTransactionContext) => unknown) =>
          callback({
            createOrFindIntent: jest
              .fn()
              .mockResolvedValue({ session, created: false }),
          } as unknown as LearningMediaTransactionContext),
      } as LearningMediaUnitOfWork;
      const storage = {
        resolveBucket: jest.fn().mockReturnValue('private-bucket'),
        createUploadUrl: jest.fn(),
      };
      const useCase = new CreateLearningMediaUploadUseCase(
        unitOfWork,
        {} as LearningMediaRepository,
        storage as unknown as StorageService,
      );

      await expect(
        inScope(() =>
          useCase.execute({
            clientRequestId: session.clientRequestId,
            originalName: session.originalName,
            expectedMimeType: session.expectedMimeType,
            expectedSizeBytes: session.expectedSizeBytes.toString(),
          }),
        ),
      ).resolves.toEqual({
        id: session.id,
        status,
        expiresAt: session.expiresAt.toISOString(),
        retryable,
        ...(reasonCode ? { reasonCode } : {}),
      });
      expect(storage.createUploadUrl).not.toHaveBeenCalled();
    },
  );

  it('returns 410 for an identical EXPIRED idempotency replay', async () => {
    const session = buildSession();
    session.status = FileUploadSessionStatus.EXPIRED;
    const unitOfWork = {
      execute: (callback: (tx: LearningMediaTransactionContext) => unknown) =>
        callback({
          createOrFindIntent: jest
            .fn()
            .mockResolvedValue({ session, created: false }),
        } as unknown as LearningMediaTransactionContext),
    } as LearningMediaUnitOfWork;
    const useCase = new CreateLearningMediaUploadUseCase(
      unitOfWork,
      {} as LearningMediaRepository,
      {
        resolveBucket: jest.fn().mockReturnValue('private-bucket'),
      } as unknown as StorageService,
    );

    await expect(
      inScope(() =>
        useCase.execute({
          clientRequestId: session.clientRequestId,
          originalName: session.originalName,
          expectedMimeType: session.expectedMimeType,
          expectedSizeBytes: session.expectedSizeBytes.toString(),
        }),
      ),
    ).rejects.toMatchObject({
      code: 'learning.media.upload_expired',
      httpStatus: 410,
    });
  });

  it('renews only the PUT capability for an identical UPLOADING replay', async () => {
    const session = buildSession();
    const renewed = { ...session, latestUploadUrlExpiresAt: new Date() };
    const persistUploadUrlCapability = jest.fn().mockResolvedValue(renewed);
    const unitOfWork = {
      execute: (callback: (tx: LearningMediaTransactionContext) => unknown) =>
        callback({
          createOrFindIntent: jest
            .fn()
            .mockResolvedValue({ session, created: false }),
          persistUploadUrlCapability,
        } as unknown as LearningMediaTransactionContext),
    } as LearningMediaUnitOfWork;
    const storage = {
      resolveBucket: jest.fn().mockReturnValue('private-bucket'),
      createUploadUrl: jest.fn().mockResolvedValue({
        url: 'https://signed.example/new',
        expiresAt: renewed.latestUploadUrlExpiresAt,
      }),
    };
    const useCase = new CreateLearningMediaUploadUseCase(
      unitOfWork,
      {} as LearningMediaRepository,
      storage as unknown as StorageService,
    );

    await inScope(() =>
      useCase.execute({
        clientRequestId: session.clientRequestId,
        originalName: session.originalName,
        expectedMimeType: session.expectedMimeType,
        expectedSizeBytes: session.expectedSizeBytes.toString(),
      }),
    );

    expect(persistUploadUrlCapability).toHaveBeenCalledWith(
      expect.objectContaining({
        uploadId: session.id,
        schoolId: session.schoolId,
      }),
    );
    expect(storage.createUploadUrl).toHaveBeenCalledWith({
      bucket: session.stagingBucket,
      objectKey: session.stagingObjectKey,
      expiresInSeconds: 3600,
    });
    expect(renewed.expiresAt).toBe(session.expiresAt);
    expect(renewed.stagingObjectKey).toBe(session.stagingObjectKey);
  });

  it('does not classify database finalization failure as invalid media', async () => {
    const session = buildSession();
    const markFailed = jest.fn();
    const releaseVerification = jest.fn().mockResolvedValue(undefined);
    const finalize = jest.fn().mockRejectedValue(new Error('database down'));
    const unitOfWork = {
      execute: (callback: (tx: LearningMediaTransactionContext) => unknown) =>
        callback({
          claimVerification: jest
            .fn()
            .mockResolvedValue({ status: 'claimed', session }),
          finalize,
          markFailed,
          releaseVerification,
        } as unknown as LearningMediaTransactionContext),
    } as LearningMediaUnitOfWork;
    const verifier = {
      verifyAndStoreFinal: jest.fn().mockResolvedValue({
        verifiedMimeType: 'video/mp4',
        actualSizeBytes: 1024n,
        checksumSha256: 'a'.repeat(64),
        durationSeconds: 1,
        width: 320,
        height: 180,
        verifiedAt: new Date(),
        verificationVersion: 'ffprobe-5.1.9-debian12-learning-media-v1',
      }),
    };
    const storage = {
      deleteObjectAndConfirmAbsent: jest.fn().mockResolvedValue(undefined),
    };
    const useCase = new CompleteLearningMediaUploadUseCase(
      unitOfWork,
      verifier as unknown as MediaVerifierService,
      storage as unknown as StorageService,
    );

    await expect(
      inScope(() => useCase.execute(session.id)),
    ).rejects.toMatchObject({
      code: 'learning.media.upload_conflict',
      details: { retryable: true },
    });
    expect(finalize).toHaveBeenCalledTimes(1);
    expect(storage.deleteObjectAndConfirmAbsent).toHaveBeenCalledWith({
      bucket: session.finalBucket,
      objectKey: session.finalObjectKey,
    });
    expect(releaseVerification).toHaveBeenCalledWith({
      schoolId: session.schoolId,
      uploadId: session.id,
    });
    expect(markFailed).not.toHaveBeenCalled();
  });

  it('puts retry policy on each deterministic cleanup candidate job', async () => {
    const session = buildSession();
    session.status = FileUploadSessionStatus.FAILED;
    const addJob = jest.fn().mockResolvedValue(undefined);
    let processor:
      | ((job: {
          name: string;
          data: { uploadId?: string };
        }) => Promise<unknown>)
      | undefined;
    const queue = {
      addJob,
      getQueue: jest.fn().mockReturnValue({
        getJob: jest.fn().mockResolvedValue(null),
      }),
      createWorker: jest.fn(
        (_queueName: string, candidateProcessor: typeof processor) => {
          processor = candidateProcessor;
        },
      ),
    };
    const repository = {
      expireAbandonedSessions: jest.fn().mockResolvedValue(0),
      discoverCleanupCandidates: jest
        .fn()
        .mockResolvedValue([{ uploadId: session.id, target: 'staging' }]),
      claimCleanup: jest.fn().mockResolvedValue(null),
    };
    const cleanup = new LearningMediaCleanupService(
      queue as unknown as BullmqService,
      repository as unknown as LearningMediaRepository,
      {} as StorageService,
    );

    await cleanup.onModuleInit();
    await processor?.({ name: 'discover', data: {} });

    expect(addJob).toHaveBeenNthCalledWith(
      1,
      LEARNING_MEDIA_CLEANUP_QUEUE,
      'discover',
      {},
      expect.objectContaining({ attempts: 1 }),
    );
    expect(addJob).toHaveBeenNthCalledWith(
      2,
      LEARNING_MEDIA_CLEANUP_QUEUE,
      'cleanup',
      { uploadId: session.id, target: 'staging' },
      expect.objectContaining({
        jobId: `learning-media-cleanup-${session.id}-staging`,
        attempts: 5,
        backoff: { type: 'exponential', delay: 1_000 },
      }),
    );
  });

  it.each(['active', 'waiting', 'delayed'])(
    'does not remove or replace a %s cleanup job',
    async (state) => {
      const session = buildSession();
      const addJob = jest.fn().mockResolvedValue(undefined);
      const remove = jest.fn().mockResolvedValue(0);
      const getState = jest.fn().mockResolvedValue(state);
      const queue = {
        getJob: jest.fn().mockResolvedValue({ getState }),
        remove,
      };
      const repository = {
        expireAbandonedSessions: jest.fn().mockResolvedValue(0),
        discoverCleanupCandidates: jest.fn().mockResolvedValue([
          {
            uploadId: session.id,
            target: 'finalization-recovery',
          },
        ]),
      };
      const cleanup = new LearningMediaCleanupService(
        {
          addJob,
          getQueue: jest.fn().mockReturnValue(queue),
        } as unknown as BullmqService,
        repository as unknown as LearningMediaRepository,
        {} as StorageService,
      );

      await expect(cleanup.discoverAndEnqueue()).resolves.toBe(0);
      expect(remove).not.toHaveBeenCalled();
      expect(addJob).not.toHaveBeenCalled();
    },
  );

  it.each(['completed', 'failed'])(
    'removes a retained %s cleanup job before replacing it',
    async (state) => {
      const session = buildSession();
      const jobId = learningMediaCleanupJobId(
        session.id,
        'finalization-recovery',
      );
      const addJob = jest.fn().mockResolvedValue(undefined);
      const existing = { getState: jest.fn().mockResolvedValue(state) };
      const remove = jest.fn().mockResolvedValue(1);
      const redis = {
        set: jest.fn().mockResolvedValue('OK'),
        eval: jest.fn().mockResolvedValue(1),
      };
      const queue = {
        getJob: jest
          .fn()
          .mockResolvedValueOnce(existing)
          .mockResolvedValueOnce(existing)
          .mockResolvedValueOnce(null),
        remove,
        toKey: jest.fn((key: string) => `bull:cleanup:${key}`),
        client: Promise.resolve(redis),
      };
      const repository = {
        expireAbandonedSessions: jest.fn().mockResolvedValue(0),
        discoverCleanupCandidates: jest.fn().mockResolvedValue([
          {
            uploadId: session.id,
            target: 'finalization-recovery',
          },
        ]),
      };
      const cleanup = new LearningMediaCleanupService(
        {
          addJob,
          getQueue: jest.fn().mockReturnValue(queue),
        } as unknown as BullmqService,
        repository as unknown as LearningMediaRepository,
        {} as StorageService,
      );

      await expect(cleanup.discoverAndEnqueue()).resolves.toBe(1);
      expect(remove).toHaveBeenCalledWith(jobId);
      expect(addJob).toHaveBeenCalledWith(
        LEARNING_MEDIA_CLEANUP_QUEUE,
        'cleanup',
        {
          uploadId: session.id,
          target: 'finalization-recovery',
        },
        {
          jobId,
          attempts: 5,
          backoff: { type: 'exponential', delay: 1_000 },
        },
      );
      expect(redis.eval).toHaveBeenCalledTimes(1);
    },
  );

  it('uses distinct deterministic cleanup identities for staging and final work', () => {
    const buildTargetJobId = learningMediaCleanupJobId as unknown as (
      uploadId: string,
      target: 'staging' | 'final' | 'finalization-recovery',
    ) => string;

    expect(buildTargetJobId('upload-1', 'staging')).not.toBe(
      buildTargetJobId('upload-1', 'final'),
    );
    expect(buildTargetJobId('upload-1', 'final')).not.toBe(
      buildTargetJobId('upload-1', 'finalization-recovery'),
    );
  });
});

function buildSession(): FileUploadSession {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    organizationId: 'org-1',
    schoolId: 'school-1',
    createdByUserId: 'actor-1',
    clientRequestId: '11111111-1111-4111-8111-111111111111',
    purpose: FileUploadPurpose.LESSON_CONTENT,
    originalName: 'lesson.mp4',
    expectedMimeType: 'video/mp4',
    expectedSizeBytes: 1024n,
    stagingBucket: 'private-bucket',
    stagingObjectKey: 'learning-media/school-1/staging/session-1',
    finalBucket: 'private-bucket',
    finalObjectKey: 'learning-media/school-1/final/session-1',
    status: FileUploadSessionStatus.UPLOADING,
    expiresAt: new Date(Date.now() + 7_200_000),
    latestUploadUrlExpiresAt: new Date(Date.now() + 3_600_000),
    completedAt: null,
    failedAt: null,
    cancelledAt: null,
    stagingCleanupEligibleAt: null,
    stagingCleanupClaimedAt: null,
    stagingObjectDeletedAt: null,
    finalCleanupEligibleAt: null,
    finalCleanupClaimedAt: null,
    finalObjectDeletedAt: null,
    failureReason: null,
    verifiedMimeType: null,
    actualSizeBytes: null,
    checksumSha256: null,
    durationSeconds: null,
    width: null,
    height: null,
    verifiedAt: null,
    verificationVersion: null,
    fileId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function inScope<T>(callback: () => Promise<T>): Promise<T> {
  const context = createRequestContext('learning-media-test');
  context.actor = { id: 'actor-1', userType: UserType.SCHOOL_USER };
  context.activeMembership = {
    membershipId: 'membership-1',
    organizationId: 'org-1',
    schoolId: 'school-1',
    roleId: 'role-1',
    permissions: ['academics.curriculum.manage', 'files.uploads.manage'],
  };
  return runWithRequestContext(context, callback);
}

function buildIsoBmffHead(majorBrand: string): Buffer {
  const head = Buffer.alloc(20);
  head.writeUInt32BE(head.length, 0);
  head.write('ftyp', 4, 'ascii');
  head.write(majorBrand, 8, 'ascii');
  head.write(majorBrand, 16, 'ascii');
  return head;
}

function buildEbmlHead(docType: string): Buffer {
  const docTypeValue = Buffer.from(docType, 'ascii');
  const payloadSize = 3 + docTypeValue.length;
  return Buffer.concat([
    Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x80 | payloadSize, 0x42, 0x82]),
    Buffer.from([0x80 | docTypeValue.length]),
    docTypeValue,
  ]);
}
