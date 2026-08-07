import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import {
  FileUploadPurpose,
  FileUploadSessionStatus,
  OrganizationStatus,
  PrismaClient,
  SchoolStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import IORedis from 'ioredis';
import { BullmqService } from '../../src/infrastructure/queue/bullmq.service';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { MinioAdapter } from '../../src/infrastructure/storage/minio.adapter';
import { SignedUrlService } from '../../src/infrastructure/storage/signed-url.service';
import { StorageService } from '../../src/infrastructure/storage/storage.service';
import {
  LEARNING_MEDIA_CLEANUP_QUEUE,
  LearningMediaCleanupService,
  learningMediaCleanupJobId,
} from '../../src/modules/files/uploads/application/learning-media-cleanup.service';
import { LearningMediaRepository } from '../../src/modules/files/uploads/infrastructure/learning-media.repository';

jest.setTimeout(120_000);

describe('learning media cleanup and BullMQ integration', () => {
  const prisma = new PrismaClient();
  const config = new ConfigService(process.env);
  const minio = new MinioAdapter(config);
  const storage = new StorageService(
    minio,
    new SignedUrlService(minio, config),
  );
  const repository = new LearningMediaRepository(
    prisma as unknown as PrismaService,
  );
  const ids = { organizationId: '', schoolId: '', actorId: '' };
  const bucket = process.env.STORAGE_BUCKET ?? '';
  const objectKeys = new Set<string>();

  beforeAll(async () => {
    await prisma.$connect();
    const tag = randomUUID().slice(0, 8);
    const organization = await prisma.organization.create({
      data: {
        name: `Cleanup ${tag}`,
        slug: `cleanup-${tag}`,
        status: OrganizationStatus.ACTIVE,
      },
    });
    ids.organizationId = organization.id;
    const school = await prisma.school.create({
      data: {
        organizationId: organization.id,
        name: `Cleanup School ${tag}`,
        slug: `cleanup-school-${tag}`,
        status: SchoolStatus.ACTIVE,
      },
    });
    ids.schoolId = school.id;
    const actor = await prisma.user.create({
      data: {
        email: `cleanup-${tag}@example.test`,
        firstName: 'Cleanup',
        lastName: 'Actor',
        userType: UserType.SCHOOL_USER,
        status: UserStatus.ACTIVE,
      },
    });
    ids.actorId = actor.id;
  });

  afterEach(async () => {
    await clearCleanupQueue();
  });

  afterAll(async () => {
    try {
      for (const objectKey of objectKeys) {
        await storage
          .deleteObject({ bucket, objectKey })
          .catch(() => undefined);
      }
      await prisma.auditLog.deleteMany({ where: { schoolId: ids.schoolId } });
      await prisma.fileUploadSession.deleteMany({
        where: { schoolId: ids.schoolId },
      });
      await prisma.file.deleteMany({ where: { schoolId: ids.schoolId } });
      await prisma.school.deleteMany({ where: { id: ids.schoolId } });
      await prisma.organization.deleteMany({
        where: { id: ids.organizationId },
      });
      await prisma.user.deleteMany({ where: { id: ids.actorId } });
    } finally {
      await prisma.$disconnect();
    }
  });

  it('retains FAILED history and attributes confirmed cleanup to the service actor', async () => {
    const objectKey = await saveTestObject('failed-direct');
    const session = await createTerminalSession({
      objectKey,
      status: FileUploadSessionStatus.FAILED,
    });
    const service = new LearningMediaCleanupService(
      {} as BullmqService,
      repository,
      storage,
    );

    await expect(service.cleanUpload(session.id, 'staging')).resolves.toBe(
      true,
    );

    const persisted = await prisma.fileUploadSession.findUniqueOrThrow({
      where: { id: session.id },
    });
    expect(persisted.status).toBe(FileUploadSessionStatus.FAILED);
    expect(persisted.stagingCleanupClaimedAt).not.toBeNull();
    expect(persisted.stagingObjectDeletedAt).not.toBeNull();
    await expect(storage.objectExists({ bucket, objectKey })).resolves.toBe(
      false,
    );
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: {
        schoolId: ids.schoolId,
        resourceId: session.id,
        action: 'learning.media.upload.cleanup',
      },
    });
    expect(audit.actorId).toBeNull();
    expect(audit.userType).toBe(UserType.SERVICE_ACCOUNT);
  });

  it('PURGES an unreferenced READY File and leaves verified history terminal', async () => {
    const finalObjectKey = await saveTestObject('ready-final');
    const bodySize = BigInt(Buffer.byteLength('cleanup-object'));
    const file = await prisma.file.create({
      data: {
        organizationId: ids.organizationId,
        schoolId: ids.schoolId,
        uploaderId: ids.actorId,
        bucket,
        objectKey: finalObjectKey,
        originalName: 'ready.mp4',
        mimeType: 'video/mp4',
        sizeBytes: bodySize,
        checksumSha256: 'b'.repeat(64),
      },
    });
    const completedAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    const ready = await prisma.fileUploadSession.create({
      data: {
        organizationId: ids.organizationId,
        schoolId: ids.schoolId,
        createdByUserId: ids.actorId,
        clientRequestId: randomUUID(),
        purpose: FileUploadPurpose.LESSON_CONTENT,
        originalName: 'ready.mp4',
        expectedMimeType: 'video/mp4',
        expectedSizeBytes: bodySize,
        stagingBucket: null,
        stagingObjectKey: null,
        finalBucket: bucket,
        finalObjectKey,
        status: FileUploadSessionStatus.READY,
        createdAt: completedAt,
        expiresAt: completedAt,
        completedAt,
        finalCleanupEligibleAt: new Date(
          completedAt.getTime() + 7 * 24 * 60 * 60 * 1000,
        ),
        verifiedMimeType: 'video/mp4',
        actualSizeBytes: bodySize,
        checksumSha256: 'b'.repeat(64),
        durationSeconds: 1,
        width: 320,
        height: 180,
        verifiedAt: completedAt,
        verificationVersion: 'ffprobe-5.1.9-debian12-learning-media-v1',
        fileId: file.id,
      },
    });
    const service = new LearningMediaCleanupService(
      {} as BullmqService,
      repository,
      storage,
    );

    await expect(service.cleanUpload(ready.id, 'final')).resolves.toBe(true);

    const purged = await prisma.fileUploadSession.findUniqueOrThrow({
      where: { id: ready.id },
    });
    expect(purged.status).toBe(FileUploadSessionStatus.PURGED);
    expect(purged.finalCleanupClaimedAt).not.toBeNull();
    expect(purged.finalObjectDeletedAt).not.toBeNull();
    expect(
      (await prisma.file.findUniqueOrThrow({ where: { id: file.id } }))
        .deletedAt,
    ).not.toBeNull();
    await expect(
      storage.objectExists({ bucket, objectKey: finalObjectKey }),
    ).resolves.toBe(false);
  });

  it('uses a later final-phase job after completed staging cleanup history remains', async () => {
    const stagingObjectKey = await saveTestObject('multi-phase-staging');
    const finalObjectKey = await saveTestObject('multi-phase-final');
    const bodySize = BigInt(Buffer.byteLength('cleanup-object'));
    const file = await prisma.file.create({
      data: {
        organizationId: ids.organizationId,
        schoolId: ids.schoolId,
        uploaderId: ids.actorId,
        bucket,
        objectKey: finalObjectKey,
        originalName: 'multi-phase.mp4',
        mimeType: 'video/mp4',
        sizeBytes: bodySize,
        checksumSha256: 'c'.repeat(64),
      },
    });
    const createdAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const completedAt = new Date();
    const session = await prisma.fileUploadSession.create({
      data: {
        organizationId: ids.organizationId,
        schoolId: ids.schoolId,
        createdByUserId: ids.actorId,
        clientRequestId: randomUUID(),
        purpose: FileUploadPurpose.LESSON_CONTENT,
        originalName: 'multi-phase.mp4',
        expectedMimeType: 'video/mp4',
        expectedSizeBytes: bodySize,
        stagingBucket: bucket,
        stagingObjectKey,
        finalBucket: bucket,
        finalObjectKey,
        status: FileUploadSessionStatus.READY,
        createdAt,
        expiresAt: new Date(createdAt.getTime() + 7_200_000),
        latestUploadUrlExpiresAt: new Date(createdAt.getTime() + 3_600_000),
        completedAt,
        stagingCleanupEligibleAt: new Date(createdAt.getTime() + 3_600_000),
        finalCleanupEligibleAt: new Date(
          completedAt.getTime() + 7 * 24 * 60 * 60 * 1000,
        ),
        verifiedMimeType: 'video/mp4',
        actualSizeBytes: bodySize,
        checksumSha256: 'c'.repeat(64),
        durationSeconds: 1,
        width: 320,
        height: 180,
        verifiedAt: completedAt,
        verificationVersion: 'ffprobe-5.1.9-debian12-learning-media-v1',
        fileId: file.id,
      },
    });
    const bull = new BullmqService(config);
    const service = new LearningMediaCleanupService(bull, repository, storage);
    const buildTargetJobId = learningMediaCleanupJobId as unknown as (
      uploadId: string,
      target: 'staging' | 'final' | 'finalization-recovery',
    ) => string;
    try {
      await service.onModuleInit();
      await service.discoverAndEnqueue();
      const stagingJobId = buildTargetJobId(session.id, 'staging');
      await waitForJobState(bull, stagingJobId, 'completed');
      expect(
        (
          await prisma.fileUploadSession.findUniqueOrThrow({
            where: { id: session.id },
          })
        ).stagingObjectDeletedAt,
      ).not.toBeNull();

      const oldCreatedAt = new Date(Date.now() - 9 * 24 * 60 * 60 * 1000);
      const oldCompletedAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
      await prisma.fileUploadSession.update({
        where: { id: session.id },
        data: {
          createdAt: oldCreatedAt,
          expiresAt: new Date(oldCreatedAt.getTime() + 7_200_000),
          latestUploadUrlExpiresAt: new Date(
            oldCreatedAt.getTime() + 3_600_000,
          ),
          stagingCleanupEligibleAt: new Date(
            oldCreatedAt.getTime() + 3_600_000,
          ),
          completedAt: oldCompletedAt,
          finalCleanupEligibleAt: new Date(
            oldCompletedAt.getTime() + 7 * 24 * 60 * 60 * 1000,
          ),
        },
      });

      const completedStagingJob = await bull
        .getQueue(LEARNING_MEDIA_CLEANUP_QUEUE)
        .getJob(stagingJobId);
      expect(completedStagingJob).not.toBeNull();
      await expect(completedStagingJob!.getState()).resolves.toBe('completed');

      await service.discoverAndEnqueue();
      await waitForJobState(
        bull,
        buildTargetJobId(session.id, 'final'),
        'completed',
      );
      expect(
        (
          await prisma.fileUploadSession.findUniqueOrThrow({
            where: { id: session.id },
          })
        ).status,
      ).toBe(FileUploadSessionStatus.PURGED);
    } finally {
      await removeRepeatableJobs(bull);
      await bull.onModuleDestroy();
    }
  });

  it('reuses the deterministic finalization-recovery identity after its completed job is retained', async () => {
    const finalObjectKey = await saveTestObject('repeated-recovery-final');
    const createdAt = new Date(Date.now() - 30 * 60 * 1000);
    const session = await prisma.fileUploadSession.create({
      data: {
        organizationId: ids.organizationId,
        schoolId: ids.schoolId,
        createdByUserId: ids.actorId,
        clientRequestId: randomUUID(),
        purpose: FileUploadPurpose.LESSON_CONTENT,
        originalName: 'repeated-recovery.mp4',
        expectedMimeType: 'video/mp4',
        expectedSizeBytes: 1024n,
        stagingBucket: bucket,
        stagingObjectKey: `learning-media-cleanup/repeated-recovery-staging/${randomUUID()}`,
        finalBucket: bucket,
        finalObjectKey,
        status: FileUploadSessionStatus.VERIFYING,
        createdAt,
        expiresAt: new Date(createdAt.getTime() + 7_200_000),
        latestUploadUrlExpiresAt: new Date(createdAt.getTime() + 3_600_000),
        failureReason: 'finalization_cleanup_pending',
        finalCleanupEligibleAt: new Date(Date.now() - 1_000),
      },
    });
    const bull = new BullmqService(config);
    const service = new LearningMediaCleanupService(bull, repository, storage);
    const jobId = learningMediaCleanupJobId(
      session.id,
      'finalization-recovery',
    );
    try {
      await service.onModuleInit();
      await service.discoverAndEnqueue();
      await waitForJobState(bull, jobId, 'completed');
      await expectRecoveryCycle(session.id, 1);

      const retainedFirstJob = await bull
        .getQueue(LEARNING_MEDIA_CLEANUP_QUEUE)
        .getJob(jobId);
      expect(retainedFirstJob).not.toBeNull();
      await expect(retainedFirstJob!.getState()).resolves.toBe('completed');

      await storage.saveObject({
        bucket,
        objectKey: finalObjectKey,
        body: Buffer.from('second-recovery-object'),
      });
      await prisma.fileUploadSession.update({
        where: { id: session.id },
        data: {
          status: FileUploadSessionStatus.VERIFYING,
          failureReason: 'finalization_cleanup_pending',
          finalCleanupEligibleAt: new Date(Date.now() - 1_000),
          finalCleanupClaimedAt: null,
          finalObjectDeletedAt: null,
        },
      });

      await Promise.all([
        service.discoverAndEnqueue(),
        service.discoverAndEnqueue(),
      ]);
      await expectRecoveryCycle(session.id, 2);

      const queue = bull.getQueue(LEARNING_MEDIA_CLEANUP_QUEUE);
      const retainedSecondJob = await queue.getJob(jobId);
      expect(retainedSecondJob).not.toBeNull();
      await expect(retainedSecondJob!.getState()).resolves.toBe('completed');
      const liveJobs = await queue.getJobs(['active', 'waiting', 'delayed']);
      expect(liveJobs.filter((job) => job.id === jobId)).toHaveLength(0);
      expect(
        (await queue.getJobs(['completed'])).filter((job) => job.id === jobId),
      ).toHaveLength(1);
      await expect(
        storage.objectExists({ bucket, objectKey: finalObjectKey }),
      ).resolves.toBe(false);

      const audits = await prisma.auditLog.findMany({
        where: {
          schoolId: ids.schoolId,
          resourceId: session.id,
          action: 'learning.media.upload.cleanup',
        },
        orderBy: { createdAt: 'asc' },
      });
      expect(audits).toHaveLength(2);
      expect(audits).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            actorId: null,
            userType: UserType.SERVICE_ACCOUNT,
          }),
          expect.objectContaining({
            actorId: null,
            userType: UserType.SERVICE_ACCOUNT,
          }),
        ]),
      );
    } finally {
      await removeRepeatableJobs(bull);
      await bull.onModuleDestroy();
    }
  });

  it('retries one deterministic candidate twice and succeeds on its third attempt', async () => {
    const objectKey = await saveTestObject('retry-third');
    const session = await createTerminalSession({
      objectKey,
      status: FileUploadSessionStatus.FAILED,
    });
    const deletion = jest
      .fn()
      .mockRejectedValueOnce(new Error('storage unavailable 1'))
      .mockRejectedValueOnce(new Error('storage unavailable 2'))
      .mockImplementation(
        (
          input: Parameters<StorageService['deleteObjectAndConfirmAbsent']>[0],
        ) => storage.deleteObjectAndConfirmAbsent(input),
      );
    const retryStorage = {
      deleteObjectAndConfirmAbsent: deletion,
    } as unknown as StorageService;
    const bull = new BullmqService(config);
    const service = new LearningMediaCleanupService(
      bull,
      repository,
      retryStorage,
    );
    try {
      await service.onModuleInit();
      await expect(
        service.discoverAndEnqueue(),
      ).resolves.toBeGreaterThanOrEqual(1);
      const job = await waitForJobState(
        bull,
        learningMediaCleanupJobId(session.id, 'staging'),
        'completed',
      );
      expect(job.attemptsMade).toBe(3);
      expect(deletion).toHaveBeenCalledTimes(3);
      const persisted = await prisma.fileUploadSession.findUniqueOrThrow({
        where: { id: session.id },
      });
      expect(persisted.stagingCleanupClaimedAt).not.toBeNull();
      expect(persisted.stagingObjectDeletedAt).not.toBeNull();
    } finally {
      await removeRepeatableJobs(bull);
      await bull.onModuleDestroy();
    }
  });

  it('keeps the claim and failure evidence visible after all five attempts fail', async () => {
    const objectKey = await saveTestObject('retry-exhausted');
    const session = await createTerminalSession({
      objectKey,
      status: FileUploadSessionStatus.FAILED,
    });
    const deletion = jest
      .fn()
      .mockRejectedValue(new Error('storage remains unavailable'));
    const bull = new BullmqService(config);
    const service = new LearningMediaCleanupService(bull, repository, {
      deleteObjectAndConfirmAbsent: deletion,
    } as unknown as StorageService);
    try {
      await service.onModuleInit();
      await service.discoverAndEnqueue();
      const job = await waitForJobState(
        bull,
        learningMediaCleanupJobId(session.id, 'staging'),
        'failed',
      );
      expect(job.attemptsMade).toBe(5);
      expect(deletion).toHaveBeenCalledTimes(5);
      const persisted = await prisma.fileUploadSession.findUniqueOrThrow({
        where: { id: session.id },
      });
      expect(persisted.stagingCleanupClaimedAt).not.toBeNull();
      expect(persisted.stagingObjectDeletedAt).toBeNull();
      await expect(storage.objectExists({ bucket, objectKey })).resolves.toBe(
        true,
      );
    } finally {
      await removeRepeatableJobs(bull);
      await bull.onModuleDestroy();
    }
  });

  it('keeps finalization-recovery evidence visible after all five attempts fail', async () => {
    const finalObjectKey = await saveTestObject('recovery-exhausted-final');
    const createdAt = new Date(Date.now() - 30 * 60 * 1000);
    const session = await prisma.fileUploadSession.create({
      data: {
        organizationId: ids.organizationId,
        schoolId: ids.schoolId,
        createdByUserId: ids.actorId,
        clientRequestId: randomUUID(),
        purpose: FileUploadPurpose.LESSON_CONTENT,
        originalName: 'recovery.mp4',
        expectedMimeType: 'video/mp4',
        expectedSizeBytes: 1024n,
        stagingBucket: bucket,
        stagingObjectKey: `learning-media-cleanup/recovery-staging/${randomUUID()}`,
        finalBucket: bucket,
        finalObjectKey,
        status: FileUploadSessionStatus.VERIFYING,
        createdAt,
        expiresAt: new Date(createdAt.getTime() + 7_200_000),
        latestUploadUrlExpiresAt: new Date(createdAt.getTime() + 3_600_000),
        failureReason: 'finalization_cleanup_pending',
        finalCleanupEligibleAt: new Date(Date.now() - 1_000),
      },
    });
    const deletion = jest
      .fn()
      .mockRejectedValue(new Error('final storage remains unavailable'));
    const bull = new BullmqService(config);
    const service = new LearningMediaCleanupService(bull, repository, {
      deleteObjectAndConfirmAbsent: deletion,
    } as unknown as StorageService);
    try {
      await service.onModuleInit();
      await service.discoverAndEnqueue();
      const job = await waitForJobState(
        bull,
        learningMediaCleanupJobId(session.id, 'finalization-recovery'),
        'failed',
      );
      expect(job.attemptsMade).toBe(5);
      expect(deletion).toHaveBeenCalledTimes(5);
      const persisted = await prisma.fileUploadSession.findUniqueOrThrow({
        where: { id: session.id },
      });
      expect(persisted.status).toBe(FileUploadSessionStatus.VERIFYING);
      expect(persisted.failureReason).toBe('finalization_cleanup_pending');
      expect(persisted.finalCleanupClaimedAt).not.toBeNull();
      expect(persisted.finalObjectDeletedAt).toBeNull();
      await expect(
        storage.objectExists({ bucket, objectKey: finalObjectKey }),
      ).resolves.toBe(true);
    } finally {
      await removeRepeatableJobs(bull);
      await bull.onModuleDestroy();
    }
  });

  it('does not persist deletion evidence until the actual cancelled PUT capability expires', async () => {
    const objectKey = `learning-media-cleanup/cancel-replay/${randomUUID()}`;
    objectKeys.add(objectKey);
    const capability = await storage.createUploadUrl({
      bucket,
      objectKey,
      expiresInSeconds: 2,
    });
    const session = await createTerminalSession({
      objectKey,
      status: FileUploadSessionStatus.CANCELLED,
      cleanupEligibleAt: capability.expiresAt,
    });
    const service = new LearningMediaCleanupService(
      {} as BullmqService,
      repository,
      storage,
    );

    await expect(
      service.cleanUpload(session.id, 'staging', new Date()),
    ).resolves.toBe(false);
    expect(
      (
        await prisma.fileUploadSession.findUniqueOrThrow({
          where: { id: session.id },
        })
      ).stagingObjectDeletedAt,
    ).toBeNull();
    const replayBeforeExpiry = await fetch(capability.url, {
      method: 'PUT',
      body: Buffer.from('replayed-before-expiry'),
    });
    expect(replayBeforeExpiry.ok).toBe(true);

    await new Promise<void>((resolve) =>
      setTimeout(
        resolve,
        Math.max(0, capability.expiresAt.getTime() - Date.now() + 1_100),
      ),
    );
    const replayAfterExpiry = await fetch(capability.url, {
      method: 'PUT',
      body: Buffer.from('replayed-after-expiry'),
    });
    expect(replayAfterExpiry.ok).toBe(false);

    await expect(
      service.cleanUpload(session.id, 'staging', new Date()),
    ).resolves.toBe(true);
    await expect(storage.objectExists({ bucket, objectKey })).resolves.toBe(
      false,
    );
    expect(
      (
        await prisma.fileUploadSession.findUniqueOrThrow({
          where: { id: session.id },
        })
      ).stagingObjectDeletedAt,
    ).not.toBeNull();
    await expect(
      service.cleanUpload(session.id, 'staging', new Date()),
    ).resolves.toBe(false);
  });

  it('automatically expires abandoned CREATED and UPLOADING sessions idempotently', async () => {
    const createdAt = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const uploadedObjectKey = await saveTestObject('abandoned-uploaded');
    const session = await prisma.fileUploadSession.create({
      data: {
        organizationId: ids.organizationId,
        schoolId: ids.schoolId,
        createdByUserId: ids.actorId,
        clientRequestId: randomUUID(),
        purpose: FileUploadPurpose.LESSON_CONTENT,
        originalName: 'abandoned.mp4',
        expectedMimeType: 'video/mp4',
        expectedSizeBytes: 1024n,
        stagingBucket: bucket,
        stagingObjectKey: uploadedObjectKey,
        finalBucket: bucket,
        finalObjectKey: `learning-media-cleanup/abandoned-final/${randomUUID()}`,
        status: FileUploadSessionStatus.UPLOADING,
        createdAt,
        expiresAt: new Date(createdAt.getTime() + 7_200_000),
        latestUploadUrlExpiresAt: new Date(createdAt.getTime() + 3_600_000),
      },
    });
    const neverUploaded = await prisma.fileUploadSession.create({
      data: {
        organizationId: ids.organizationId,
        schoolId: ids.schoolId,
        createdByUserId: ids.actorId,
        clientRequestId: randomUUID(),
        purpose: FileUploadPurpose.LESSON_CONTENT,
        originalName: 'never-uploaded.mp4',
        expectedMimeType: 'video/mp4',
        expectedSizeBytes: 1024n,
        stagingBucket: bucket,
        stagingObjectKey: `learning-media-cleanup/never-uploaded/${randomUUID()}`,
        finalBucket: bucket,
        finalObjectKey: `learning-media-cleanup/never-uploaded-final/${randomUUID()}`,
        status: FileUploadSessionStatus.CREATED,
        createdAt,
        expiresAt: new Date(createdAt.getTime() + 7_200_000),
      },
    });
    const queue = {
      getQueueReadiness: jest.fn().mockResolvedValue({}),
      getQueue: jest.fn().mockReturnValue({
        getJob: jest.fn().mockResolvedValue(null),
      }),
      addJob: jest.fn().mockResolvedValue(undefined),
    } as unknown as BullmqService;
    const service = new LearningMediaCleanupService(queue, repository, storage);

    const discoveryAt = new Date();
    await service.discoverAndEnqueue(discoveryAt);
    await service.discoverAndEnqueue(discoveryAt);

    const persisted = await prisma.fileUploadSession.findUniqueOrThrow({
      where: { id: session.id },
    });
    expect(persisted.status).toBe(FileUploadSessionStatus.EXPIRED);
    expect(persisted.stagingCleanupEligibleAt).not.toBeNull();
    expect(
      (
        await prisma.fileUploadSession.findUniqueOrThrow({
          where: { id: neverUploaded.id },
        })
      ).status,
    ).toBe(FileUploadSessionStatus.EXPIRED);
    expect(
      await prisma.auditLog.count({
        where: {
          resourceId: session.id,
          action: 'learning.media.upload.expire',
          actorId: null,
          userType: UserType.SERVICE_ACCOUNT,
        },
      }),
    ).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: {
          resourceId: neverUploaded.id,
          action: 'learning.media.upload.expire',
          actorId: null,
          userType: UserType.SERVICE_ACCOUNT,
        },
      }),
    ).toBe(1);
    await expect(
      service.cleanUpload(session.id, 'staging', discoveryAt),
    ).resolves.toBe(true);
    await expect(
      service.cleanUpload(neverUploaded.id, 'staging', discoveryAt),
    ).resolves.toBe(true);
    await expect(
      storage.objectExists({ bucket, objectKey: uploadedObjectKey }),
    ).resolves.toBe(false);
  });

  async function createTerminalSession(input: {
    objectKey: string;
    status:
      | typeof FileUploadSessionStatus.FAILED
      | typeof FileUploadSessionStatus.CANCELLED;
    cleanupEligibleAt?: Date;
  }) {
    const cleanupEligibleAt =
      input.cleanupEligibleAt ?? new Date(Date.now() - 1_000);
    const createdAt = new Date(cleanupEligibleAt.getTime() - 3_600_000);
    return prisma.fileUploadSession.create({
      data: {
        organizationId: ids.organizationId,
        schoolId: ids.schoolId,
        createdByUserId: ids.actorId,
        clientRequestId: randomUUID(),
        purpose: FileUploadPurpose.LESSON_CONTENT,
        originalName: 'terminal.mp4',
        expectedMimeType: 'video/mp4',
        expectedSizeBytes: BigInt(Buffer.byteLength('cleanup-object')),
        stagingBucket: bucket,
        stagingObjectKey: input.objectKey,
        finalBucket: bucket,
        finalObjectKey: `${input.objectKey}-final`,
        status: input.status,
        createdAt,
        expiresAt: new Date(createdAt.getTime() + 7_200_000),
        latestUploadUrlExpiresAt: cleanupEligibleAt,
        stagingCleanupEligibleAt: cleanupEligibleAt,
        ...(input.status === FileUploadSessionStatus.FAILED
          ? {
              failedAt: new Date(createdAt.getTime() + 1_800_000),
              failureReason: 'probe_failed',
            }
          : {
              cancelledAt: new Date(createdAt.getTime() + 1_800_000),
            }),
      },
    });
  }

  async function saveTestObject(label: string): Promise<string> {
    const objectKey = `learning-media-cleanup/${label}/${randomUUID()}`;
    objectKeys.add(objectKey);
    await storage.saveObject({
      bucket,
      objectKey,
      body: Buffer.from('cleanup-object'),
    });
    return objectKey;
  }

  async function waitForJobState(
    bull: BullmqService,
    jobId: string,
    expectedState: 'completed' | 'failed',
  ) {
    const queue = bull.getQueue(LEARNING_MEDIA_CLEANUP_QUEUE);
    const deadline = Date.now() + 45_000;
    while (Date.now() < deadline) {
      const job = await queue.getJob(jobId);
      if (job && (await job.getState()) === expectedState) return job;
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`cleanup job ${jobId} did not reach ${expectedState}`);
  }

  async function expectRecoveryCycle(
    uploadId: string,
    expectedAuditCount: number,
  ): Promise<void> {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const [session, auditCount] = await Promise.all([
        prisma.fileUploadSession.findUniqueOrThrow({
          where: { id: uploadId },
        }),
        prisma.auditLog.count({
          where: {
            schoolId: ids.schoolId,
            resourceId: uploadId,
            action: 'learning.media.upload.cleanup',
          },
        }),
      ]);
      if (
        session.status === FileUploadSessionStatus.UPLOADING &&
        session.failureReason === null &&
        session.finalCleanupEligibleAt === null &&
        session.finalCleanupClaimedAt === null &&
        session.finalObjectDeletedAt === null &&
        auditCount === expectedAuditCount
      ) {
        return;
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(
      `finalization recovery ${uploadId} did not complete cycle ${expectedAuditCount}`,
    );
  }

  async function removeRepeatableJobs(bull: BullmqService): Promise<void> {
    const queue = bull.getQueue(LEARNING_MEDIA_CLEANUP_QUEUE);
    for (const job of await queue.getRepeatableJobs()) {
      await queue.removeRepeatableByKey(job.key);
    }
  }

  async function clearCleanupQueue(): Promise<void> {
    const redisUrl = process.env.TEST_QUEUE_REDIS_URL;
    if (!redisUrl) return;
    const redis = new IORedis(redisUrl, { maxRetriesPerRequest: 1 });
    try {
      const keys = await redis.keys(`bull:${LEARNING_MEDIA_CLEANUP_QUEUE}:*`);
      if (keys.length > 0) await redis.del(...keys);
    } finally {
      await redis.quit();
    }
  }
});
