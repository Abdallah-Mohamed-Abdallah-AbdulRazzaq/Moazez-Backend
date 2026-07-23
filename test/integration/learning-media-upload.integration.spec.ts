import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import {
  CurriculumStatus,
  FileUploadPurpose,
  FileUploadSessionStatus,
  FileVisibility,
  LessonContentPublicationStatus,
  LessonContentItemType,
  OrganizationStatus,
  Prisma,
  PrismaClient,
  SchoolStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
} from '../../src/common/context/request-context';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { BullmqService } from '../../src/infrastructure/queue/bullmq.service';
import { MinioAdapter } from '../../src/infrastructure/storage/minio.adapter';
import { SignedUrlService } from '../../src/infrastructure/storage/signed-url.service';
import { StorageService } from '../../src/infrastructure/storage/storage.service';
import { LearningMediaCleanupService } from '../../src/modules/files/uploads/application/learning-media-cleanup.service';
import {
  CancelLearningMediaUploadUseCase,
  CompleteLearningMediaUploadUseCase,
  CreateLearningMediaUploadUseCase,
  VerifyLegacyLearningMediaUseCase,
} from '../../src/modules/files/uploads/application/learning-media-upload.use-cases';
import {
  LearningMediaFinalizeInput,
  LearningMediaTransactionContext,
  LearningMediaUnitOfWork,
} from '../../src/modules/files/uploads/application/learning-media.unit-of-work';
import {
  MediaVerificationError,
  MediaVerifierService,
} from '../../src/modules/files/uploads/application/media-verifier.service';
import { LearningMediaRepository } from '../../src/modules/files/uploads/infrastructure/learning-media.repository';
import { PrismaLearningMediaUnitOfWork } from '../../src/modules/files/uploads/infrastructure/prisma-learning-media.unit-of-work';

jest.setTimeout(120_000);

const legacyClassifier = createRequire(__filename)(
  join(process.cwd(), 'scripts/classify-legacy-learning-media.cjs'),
) as { sanitizeLegacyName(value: unknown): string };

describe('learning media PostgreSQL lifecycle', () => {
  const prisma = new PrismaClient();
  const repository = new LearningMediaRepository(
    prisma as unknown as PrismaService,
  );
  const config = new ConfigService(process.env);
  const realMinio = new MinioAdapter(config);
  const realStorage = new StorageService(
    realMinio,
    new SignedUrlService(realMinio, config),
  );
  const unitOfWork: LearningMediaUnitOfWork = new PrismaLearningMediaUnitOfWork(
    prisma as unknown as PrismaService,
    repository,
  );
  const storage = {
    resolveBucket: jest.fn().mockReturnValue('learning-media-integration'),
    createUploadUrl: jest.fn().mockImplementation(() =>
      Promise.resolve({
        url: 'https://signed.invalid/put',
        expiresAt: new Date(Date.now() + 3_600_000),
      }),
    ),
    deleteObjectAndConfirmAbsent: jest.fn().mockResolvedValue(undefined),
  } as unknown as StorageService;
  const verifier = {
    verifyAndStoreFinal: jest.fn().mockResolvedValue({
      verifiedMimeType: 'video/mp4',
      actualSizeBytes: 1024n,
      checksumSha256: 'a'.repeat(64),
      durationSeconds: 1,
      width: 320,
      height: 180,
      verifiedAt: new Date('2026-07-22T12:00:00.000Z'),
      verificationVersion: 'ffprobe-5.1.9-debian12-learning-media-v1',
    }),
    verifyExistingFinal: jest.fn().mockResolvedValue({
      verifiedMimeType: 'video/mp4',
      actualSizeBytes: 1024n,
      checksumSha256: 'a'.repeat(64),
      durationSeconds: 1,
      width: 320,
      height: 180,
      verifiedAt: new Date('2026-07-22T12:00:00.000Z'),
      verificationVersion: 'ffprobe-5.1.9-debian12-learning-media-v1',
    }),
  } as unknown as MediaVerifierService;
  const suffix = randomUUID().slice(0, 8);
  const ids = {
    organizationId: '',
    schoolId: '',
    actorId: '',
    academicYearId: '',
    termId: '',
    stageId: '',
    gradeId: '',
    subjectId: '',
    curriculumId: '',
    unitId: '',
    lessonId: '',
  };
  const historicalUploaderIds = new Set<string>();

  beforeAll(async () => {
    await prisma.$connect();
    const organization = await prisma.organization.create({
      data: {
        name: `Learning Media ${suffix}`,
        slug: `learning-media-${suffix}`,
        status: OrganizationStatus.ACTIVE,
      },
    });
    ids.organizationId = organization.id;
    const school = await prisma.school.create({
      data: {
        organizationId: organization.id,
        name: `Learning Media School ${suffix}`,
        slug: `learning-media-school-${suffix}`,
        status: SchoolStatus.ACTIVE,
      },
    });
    ids.schoolId = school.id;
    const actor = await prisma.user.create({
      data: {
        email: `learning-media-${suffix}@example.test`,
        firstName: 'Media',
        lastName: 'Actor',
        userType: UserType.SCHOOL_USER,
        status: UserStatus.ACTIVE,
      },
    });
    ids.actorId = actor.id;
    const academicYear = await prisma.academicYear.create({
      data: {
        schoolId: school.id,
        nameAr: `Media Year AR ${suffix}`,
        nameEn: `Media Year ${suffix}`,
        startDate: new Date('2032-09-01T00:00:00.000Z'),
        endDate: new Date('2033-06-30T00:00:00.000Z'),
        isActive: true,
      },
    });
    ids.academicYearId = academicYear.id;
    const term = await prisma.term.create({
      data: {
        schoolId: school.id,
        academicYearId: academicYear.id,
        nameAr: `Media Term AR ${suffix}`,
        nameEn: `Media Term ${suffix}`,
        startDate: new Date('2032-09-01T00:00:00.000Z'),
        endDate: new Date('2032-12-31T00:00:00.000Z'),
        isActive: true,
      },
    });
    ids.termId = term.id;
    const stage = await prisma.stage.create({
      data: {
        schoolId: school.id,
        nameAr: `Media Stage AR ${suffix}`,
        nameEn: `Media Stage ${suffix}`,
      },
    });
    ids.stageId = stage.id;
    const grade = await prisma.grade.create({
      data: {
        schoolId: school.id,
        stageId: stage.id,
        nameAr: `Media Grade AR ${suffix}`,
        nameEn: `Media Grade ${suffix}`,
      },
    });
    ids.gradeId = grade.id;
    const subject = await prisma.subject.create({
      data: {
        schoolId: school.id,
        nameAr: `Media Subject AR ${suffix}`,
        nameEn: `Media Subject ${suffix}`,
        code: `MEDIA-${suffix}`,
      },
    });
    ids.subjectId = subject.id;
    const curriculum = await prisma.curriculum.create({
      data: {
        schoolId: school.id,
        academicYearId: academicYear.id,
        termId: term.id,
        gradeId: grade.id,
        subjectId: subject.id,
        title: `Media Curriculum ${suffix}`,
        status: CurriculumStatus.ACTIVE,
        createdByUserId: actor.id,
      },
    });
    ids.curriculumId = curriculum.id;
    const unit = await prisma.curriculumUnit.create({
      data: {
        schoolId: school.id,
        curriculumId: curriculum.id,
        title: `Media Unit ${suffix}`,
      },
    });
    ids.unitId = unit.id;
    const lesson = await prisma.curriculumLesson.create({
      data: {
        schoolId: school.id,
        curriculumId: curriculum.id,
        unitId: unit.id,
        title: `Media Lesson ${suffix}`,
      },
    });
    ids.lessonId = lesson.id;
  });

  afterAll(async () => {
    try {
      const sessions = await prisma.fileUploadSession.findMany({
        where: { schoolId: ids.schoolId },
        select: {
          stagingBucket: true,
          stagingObjectKey: true,
          finalBucket: true,
          finalObjectKey: true,
        },
      });
      for (const session of sessions) {
        if (session.stagingBucket && session.stagingObjectKey) {
          await realStorage
            .deleteObject({
              bucket: session.stagingBucket,
              objectKey: session.stagingObjectKey,
            })
            .catch(() => undefined);
        }
        await realStorage
          .deleteObject({
            bucket: session.finalBucket,
            objectKey: session.finalObjectKey,
          })
          .catch(() => undefined);
      }
      await prisma.auditLog.deleteMany({ where: { schoolId: ids.schoolId } });
      await prisma.lessonContentItem.deleteMany({
        where: { schoolId: ids.schoolId },
      });
      await prisma.fileUploadSession.deleteMany({
        where: { schoolId: ids.schoolId },
      });
      await prisma.file.deleteMany({ where: { schoolId: ids.schoolId } });
      await prisma.curriculumLesson.delete({ where: { id: ids.lessonId } });
      await prisma.curriculumUnit.delete({ where: { id: ids.unitId } });
      await prisma.curriculum.delete({ where: { id: ids.curriculumId } });
      await prisma.subject.delete({ where: { id: ids.subjectId } });
      await prisma.grade.delete({ where: { id: ids.gradeId } });
      await prisma.stage.delete({ where: { id: ids.stageId } });
      await prisma.term.delete({ where: { id: ids.termId } });
      await prisma.academicYear.delete({ where: { id: ids.academicYearId } });
      await prisma.school.deleteMany({ where: { id: ids.schoolId } });
      await prisma.organization.deleteMany({
        where: { id: ids.organizationId },
      });
      await prisma.user.deleteMany({
        where: { id: { in: [ids.actorId, ...historicalUploaderIds] } },
      });
    } finally {
      await prisma.$disconnect();
    }
  });

  it('converges concurrent identical intents on one row, key, and audit', async () => {
    const useCase = new CreateLearningMediaUploadUseCase(
      unitOfWork,
      repository,
      storage,
    );
    const command = {
      clientRequestId: randomUUID(),
      originalName: 'C:\\fakepath\\lesson.mp4',
      expectedMimeType: 'video/mp4',
      expectedSizeBytes: '1024',
    };
    const [first, second] = await inScope(() =>
      Promise.all([useCase.execute(command), useCase.execute(command)]),
    );

    expect(first.id).toBe(second.id);
    const sessions = await prisma.fileUploadSession.findMany({
      where: {
        schoolId: ids.schoolId,
        clientRequestId: command.clientRequestId,
      },
    });
    expect(sessions).toHaveLength(1);
    expect(sessions[0].stagingObjectKey).not.toContain('lesson.mp4');
    expect(sessions[0].stagingObjectKey).not.toBe(sessions[0].finalObjectKey);
    expect(
      sessions[0].expiresAt.getTime() - sessions[0].createdAt.getTime(),
    ).toBe(7_200_000);
    expect(
      await prisma.auditLog.count({
        where: {
          schoolId: ids.schoolId,
          action: 'learning.media.upload_intent.create',
          resourceId: sessions[0].id,
        },
      }),
    ).toBe(1);
  });

  it.each(['complete', 'cancel', 'renew'] as const)(
    'serializes automatic expiry safely against %s',
    async (operation) => {
      const createdAt = new Date(Date.now() - 3 * 60 * 60 * 1000);
      const clientRequestId = randomUUID();
      const session = await prisma.fileUploadSession.create({
        data: {
          organizationId: ids.organizationId,
          schoolId: ids.schoolId,
          createdByUserId: ids.actorId,
          clientRequestId,
          purpose: FileUploadPurpose.LESSON_CONTENT,
          originalName: 'expiry-race.txt',
          expectedMimeType: 'text/plain',
          expectedSizeBytes: 12n,
          stagingBucket: 'learning-media-integration',
          stagingObjectKey: `expiry-race/staging/${randomUUID()}`,
          finalBucket: 'learning-media-integration',
          finalObjectKey: `expiry-race/final/${randomUUID()}`,
          status: FileUploadSessionStatus.UPLOADING,
          createdAt,
          expiresAt: new Date(createdAt.getTime() + 7_200_000),
          latestUploadUrlExpiresAt: new Date(createdAt.getTime() + 3_600_000),
        },
      });
      const request =
        operation === 'complete'
          ? inScope(() =>
              new CompleteLearningMediaUploadUseCase(
                unitOfWork,
                verifier,
                storage,
              ).execute(session.id),
            )
          : operation === 'cancel'
            ? inScope(() =>
                new CancelLearningMediaUploadUseCase(unitOfWork).execute(
                  session.id,
                ),
              )
            : inScope(() =>
                new CreateLearningMediaUploadUseCase(
                  unitOfWork,
                  repository,
                  storage,
                ).execute({
                  clientRequestId,
                  originalName: 'expiry-race.txt',
                  expectedMimeType: 'text/plain',
                  expectedSizeBytes: '12',
                }),
              );
      const [discoveryResult, requestResult] = await Promise.allSettled([
        repository.expireAbandonedSessions(new Date()),
        request,
      ]);

      expect(discoveryResult.status).toBe('fulfilled');
      if (requestResult.status === 'rejected') {
        const requestError = requestResult.reason as unknown;
        const requestErrorCode =
          typeof requestError === 'object' &&
          requestError !== null &&
          'code' in requestError &&
          typeof requestError.code === 'string'
            ? requestError.code
            : null;
        expect(
          new Set([
            'learning.media.upload_expired',
            'learning.media.upload_conflict',
            'learning.media.not_found',
          ]),
        ).toContain(requestErrorCode);
      }
      const persisted = await prisma.fileUploadSession.findUniqueOrThrow({
        where: { id: session.id },
      });
      expect(
        operation === 'cancel'
          ? [FileUploadSessionStatus.CANCELLED, FileUploadSessionStatus.EXPIRED]
          : [FileUploadSessionStatus.EXPIRED],
      ).toContain(persisted.status);
      expect(persisted.fileId).toBeNull();
      expect(
        await prisma.auditLog.count({
          where: {
            resourceId: session.id,
            action: 'learning.media.upload.complete',
          },
        }),
      ).toBe(0);
    },
  );

  it('persists signing failure as FAILED instead of leaving a false UPLOADING session', async () => {
    const requestId = randomUUID();
    const createUploadUrl = jest
      .fn()
      .mockRejectedValue(new Error('signing unavailable'));
    const signingFailureStorage = {
      resolveBucket: jest.fn().mockReturnValue('learning-media-integration'),
      createUploadUrl,
    } as unknown as StorageService;
    const create = new CreateLearningMediaUploadUseCase(
      unitOfWork,
      repository,
      signingFailureStorage,
    );

    await expect(
      inScope(() =>
        create.execute({
          clientRequestId: requestId,
          originalName: 'signing-failure.mp4',
          expectedMimeType: 'video/mp4',
          expectedSizeBytes: '1024',
        }),
      ),
    ).rejects.toMatchObject({
      code: 'learning.media.upload_conflict',
      details: { reasonCode: 'signing_failed' },
    });

    const session = await prisma.fileUploadSession.findFirstOrThrow({
      where: { schoolId: ids.schoolId, clientRequestId: requestId },
    });
    expect(session.status).toBe(FileUploadSessionStatus.FAILED);
    expect(session.failureReason).toBe('signing_failed');
    expect(session.latestUploadUrlExpiresAt).toBeNull();
    const replay = await inScope(() =>
      create.execute({
        clientRequestId: requestId,
        originalName: 'signing-failure.mp4',
        expectedMimeType: 'video/mp4',
        expectedSizeBytes: '1024',
      }),
    );
    expect(replay).toMatchObject({
      id: session.id,
      status: FileUploadSessionStatus.FAILED,
      reasonCode: 'signing_failed',
      retryable: false,
    });
    expect(createUploadUrl).toHaveBeenCalledTimes(1);
    expect(
      await prisma.auditLog.count({
        where: {
          resourceId: session.id,
          action: 'learning.media.upload_intent.create',
        },
      }),
    ).toBe(1);
  });

  it('atomically finalizes exactly one File and one completion audit', async () => {
    const create = new CreateLearningMediaUploadUseCase(
      unitOfWork,
      repository,
      storage,
    );
    const complete = new CompleteLearningMediaUploadUseCase(
      unitOfWork,
      verifier,
      storage,
    );
    const command = {
      clientRequestId: randomUUID(),
      originalName: '/tmp/final.mp4',
      expectedMimeType: 'video/mp4',
      expectedSizeBytes: '1024',
    };
    const intent = await inScope(() => create.execute(command));
    const result = await inScope(() => complete.execute(intent.id));
    const retry = await inScope(() => complete.execute(intent.id));
    const createReplay = await inScope(() => create.execute(command));

    expect(retry).toEqual(result);
    expect(createReplay).toEqual(
      expect.objectContaining({
        id: result.id,
        fileId: result.fileId,
        status: FileUploadSessionStatus.READY,
      }),
    );
    expect(result).toMatchObject({
      status: FileUploadSessionStatus.READY,
      mimeType: 'video/mp4',
      sizeBytes: '1024',
    });
    expect(await prisma.file.count({ where: { id: result.fileId } })).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: {
          action: 'learning.media.upload.complete',
          resourceId: intent.id,
        },
      }),
    ).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: {
          action: 'learning.media.upload_intent.create',
          resourceId: intent.id,
        },
      }),
    ).toBe(1);
  });

  it('keeps finalized bytes immutable when an issued staging PUT is replayed', async () => {
    const create = new CreateLearningMediaUploadUseCase(
      unitOfWork,
      repository,
      realStorage,
    );
    const complete = new CompleteLearningMediaUploadUseCase(
      unitOfWork,
      new MediaVerifierService(realStorage, config),
      realStorage,
    );
    const original = Buffer.from('authoritative lesson text A\n');
    const replacement = Buffer.from('replayed staging object bytes B\n');
    const intent = await inScope(() =>
      create.execute({
        clientRequestId: randomUUID(),
        originalName: 'lesson.txt',
        expectedMimeType: 'text/plain',
        expectedSizeBytes: original.byteLength.toString(),
      }),
    );
    const initialPut = await fetch(intent.uploadUrl!, {
      method: 'PUT',
      headers: { 'content-type': 'text/plain' },
      body: original,
    });
    expect(initialPut.ok).toBe(true);

    const completed = await inScope(() => complete.execute(intent.id));
    const session = await prisma.fileUploadSession.findUniqueOrThrow({
      where: { id: intent.id },
    });
    expect(session.latestUploadUrlExpiresAt!.getTime()).toBeGreaterThanOrEqual(
      signedPutExpiry(intent.uploadUrl!).getTime(),
    );
    const file = await prisma.file.findUniqueOrThrow({
      where: { id: completed.fileId },
    });
    expect(session.stagingObjectKey).not.toBe(session.finalObjectKey);
    expect(file.objectKey).toBe(session.finalObjectKey);
    expect(file.checksumSha256).toBe(
      createHash('sha256').update(original).digest('hex'),
    );

    const replayedPut = await fetch(intent.uploadUrl!, {
      method: 'PUT',
      headers: { 'content-type': 'text/plain' },
      body: replacement,
    });
    expect(replayedPut.ok).toBe(true);
    const finalBytes = await readStorageObject(file.bucket, file.objectKey);
    expect(finalBytes).toEqual(original);
    expect(
      (
        await prisma.file.findUniqueOrThrow({
          where: { id: completed.fileId },
        })
      ).checksumSha256,
    ).toBe(createHash('sha256').update(original).digest('hex'));

    const cleanup = new LearningMediaCleanupService(
      {} as BullmqService,
      repository,
      realStorage,
    );
    await cleanup.cleanUpload(
      intent.id,
      'staging',
      new Date(session.latestUploadUrlExpiresAt!.getTime() + 1),
    );
    await expect(
      realStorage.objectExists({
        bucket: session.stagingBucket!,
        objectKey: session.stagingObjectKey!,
      }),
    ).resolves.toBe(false);
    expect(
      (
        await prisma.fileUploadSession.findUniqueOrThrow({
          where: { id: intent.id },
        })
      ).stagingObjectDeletedAt,
    ).not.toBeNull();
    expect(await readStorageObject(file.bucket, file.objectKey)).toEqual(
      original,
    );
  });

  it('classifies deterministic media rejection without creating a final File', async () => {
    const invalid = Buffer.from([
      0x74, 0x65, 0x78, 0x74, 0x00, 0x62, 0x69, 0x6e,
    ]);
    const intent = await createUploadedText(invalid);
    const complete = createRealCompleteUseCase(unitOfWork, realStorage);

    await expect(
      inScope(() => complete.execute(intent.id)),
    ).rejects.toMatchObject({
      code: 'learning.media.verification_failed',
      details: { reasonCode: 'magic_mismatch' },
      httpStatus: 422,
    });

    const session = await prisma.fileUploadSession.findUniqueOrThrow({
      where: { id: intent.id },
    });
    expect(session.status).toBe(FileUploadSessionStatus.FAILED);
    expect(session.failureReason).toBe('magic_mismatch');
    expect(session.fileId).toBeNull();
    expect(session.stagingCleanupEligibleAt).toEqual(
      session.latestUploadUrlExpiresAt,
    );
    await expect(
      realStorage.objectExists({
        bucket: session.finalBucket,
        objectKey: session.finalObjectKey,
      }),
    ).resolves.toBe(false);
    await expectCompletionAuditCount(intent.id, 0);
    expect(
      await prisma.auditLog.count({
        where: {
          resourceId: intent.id,
          action: 'learning.media.upload.verification_failed',
          outcome: 'FAILURE',
        },
      }),
    ).toBe(1);
  });

  it('does not persist FAILED when the verification-failure audit transaction rolls back', async () => {
    const intent = await createUploadedText(
      Buffer.from([0x74, 0x65, 0x78, 0x74, 0x00, 0x62, 0x69, 0x6e]),
    );
    const failingUnitOfWork = withTransactionContext((context) => ({
      ...context,
      markFailed: (input) =>
        context.markFailed({
          ...input,
          userType: 'INVALID_TEST_AUDIT_ACTOR_TYPE' as UserType,
        }),
    }));

    await expect(
      inScope(() =>
        createRealCompleteUseCase(failingUnitOfWork, realStorage).execute(
          intent.id,
        ),
      ),
    ).rejects.toMatchObject({
      code: 'learning.media.upload_conflict',
      details: { reasonCode: 'failure_persistence_failed', retryable: true },
    });
    await expectRetryableFinalizationResidue(intent.id);
    expect(
      await prisma.auditLog.count({
        where: {
          resourceId: intent.id,
          action: 'learning.media.upload.verification_failed',
        },
      }),
    ).toBe(0);
  });

  it('keeps a final-object write failure retryable with no File or object residue', async () => {
    const body = Buffer.from('retry after final storage failure\n');
    const intent = await createUploadedText(body);
    const failingStorage = storageWithFinalWriteFailure();
    const complete = createRealCompleteUseCase(unitOfWork, failingStorage);

    await expect(
      inScope(() => complete.execute(intent.id)),
    ).rejects.toMatchObject({
      code: 'learning.media.upload_conflict',
      details: { reasonCode: 'final_object_write_failed', retryable: true },
    });
    await expectRetryableFinalizationResidue(intent.id);
  });

  it('rolls back File creation when the File insert fails', async () => {
    const existing = await prisma.file.create({
      data: {
        organizationId: ids.organizationId,
        schoolId: ids.schoolId,
        uploaderId: ids.actorId,
        bucket: realStorage.resolveBucket(FileVisibility.PRIVATE),
        objectKey: `learning-media/test-existing/${randomUUID()}`,
        originalName: 'existing.txt',
        mimeType: 'text/plain',
        sizeBytes: 1n,
      },
    });
    const intent = await createUploadedText(
      Buffer.from('file insert failure\n'),
    );
    const failingUnitOfWork = withFinalizeInput((input) => ({
      ...input,
      fileId: existing.id,
    }));

    await expect(
      inScope(() =>
        createRealCompleteUseCase(failingUnitOfWork, realStorage).execute(
          intent.id,
        ),
      ),
    ).rejects.toMatchObject({
      code: 'learning.media.upload_conflict',
      details: { reasonCode: 'finalization_failed', retryable: true },
    });
    await expectRetryableFinalizationResidue(intent.id);
    expect(await prisma.file.count({ where: { id: existing.id } })).toBe(1);
  });

  it('persists CHECK-safe finalization recovery when immediate final deletion fails', async () => {
    const intent = await createUploadedText(
      Buffer.from('finalization recovery object\n'),
    );
    const existing = await prisma.file.create({
      data: {
        organizationId: ids.organizationId,
        schoolId: ids.schoolId,
        uploaderId: ids.actorId,
        bucket: realStorage.resolveBucket(FileVisibility.PRIVATE),
        objectKey: `learning-media/recovery-existing/${randomUUID()}`,
        originalName: 'existing.txt',
        mimeType: 'text/plain',
        sizeBytes: 1n,
      },
    });
    const failingUnitOfWork = withFinalizeInput((input) => ({
      ...input,
      fileId: existing.id,
    }));
    const recoveryStorage = {
      statObject: (input: Parameters<StorageService['statObject']>[0]) =>
        realStorage.statObject(input),
      getObject: (input: Parameters<StorageService['getObject']>[0]) =>
        realStorage.getObject(input),
      saveObject: (input: Parameters<StorageService['saveObject']>[0]) =>
        realStorage.saveObject(input),
      deleteObjectAndConfirmAbsent: jest
        .fn()
        .mockRejectedValue(new Error('temporary delete failure')),
    } as unknown as StorageService;

    await expect(
      inScope(() =>
        createRealCompleteUseCase(failingUnitOfWork, recoveryStorage).execute(
          intent.id,
        ),
      ),
    ).rejects.toMatchObject({
      code: 'learning.media.upload_conflict',
      details: { reasonCode: 'finalization_failed', retryable: true },
    });

    const session = await prisma.fileUploadSession.findUniqueOrThrow({
      where: { id: intent.id },
    });
    expect(session.status).toBe(FileUploadSessionStatus.VERIFYING);
    expect(session.failureReason).toBe('finalization_cleanup_pending');
    expect(session.finalCleanupEligibleAt).not.toBeNull();
    expect(session.finalCleanupClaimedAt).toBeNull();
    expect(session.fileId).toBeNull();
    await expect(
      realStorage.objectExists({
        bucket: session.finalBucket,
        objectKey: session.finalObjectKey,
      }),
    ).resolves.toBe(true);

    const cleanup = new LearningMediaCleanupService(
      {} as BullmqService,
      repository,
      realStorage,
    );
    await expect(
      cleanup.cleanUpload(
        intent.id,
        'finalization-recovery',
        new Date(session.finalCleanupEligibleAt!.getTime() + 1),
      ),
    ).resolves.toBe(true);
    const retryable = await prisma.fileUploadSession.findUniqueOrThrow({
      where: { id: intent.id },
    });
    expect(retryable).toMatchObject({
      status: FileUploadSessionStatus.UPLOADING,
      failureReason: null,
      fileId: null,
      finalCleanupEligibleAt: null,
      finalCleanupClaimedAt: null,
      finalObjectDeletedAt: null,
    });
    await expect(
      realStorage.objectExists({
        bucket: session.finalBucket,
        objectKey: session.finalObjectKey,
      }),
    ).resolves.toBe(false);

    const completed = await inScope(() =>
      createRealCompleteUseCase(unitOfWork, realStorage).execute(intent.id),
    );
    expect(completed.status).toBe(FileUploadSessionStatus.READY);
    expect(await prisma.file.count({ where: { id: completed.fileId } })).toBe(
      1,
    );
    expect(
      await prisma.auditLog.count({
        where: {
          schoolId: ids.schoolId,
          resourceId: intent.id,
          action: 'learning.media.upload.complete',
        },
      }),
    ).toBe(1);
  });

  it('keeps SQL legacy filename normalization exactly equal to the JavaScript classifier', async () => {
    const matrix = [
      'lesson.pdf',
      '/tmp/\u00a0lesson.pdf\u00a0',
      'C:\\fakepath\\\u2003lesson.txt\u2003',
      `dir/control-${String.fromCharCode(0x01)}-${String.fromCharCode(0x1f)}-${String.fromCharCode(0x7f)}-${String.fromCharCode(0x85)}-${String.fromCharCode(0x9f)}.png`,
      '\t\r\n lesson.txt \t\r\n',
      '\u1680\u2000\u200a\u2028\u2029\u202f\u205f\u3000\ufefflesson.png\ufeff\u3000',
      '\u00a0\u2003\ufeff',
      'a'.repeat(255),
      'a'.repeat(256),
      'e\u0301'.repeat(127),
      '\ud83d\ude00'.repeat(255),
      '\ud83d\ude00'.repeat(256),
    ];

    for (const value of matrix) {
      let javascript: { valid: boolean; normalized: string | null };
      try {
        javascript = {
          valid: true,
          normalized: legacyClassifier.sanitizeLegacyName(value),
        };
      } catch {
        javascript = { valid: false, normalized: null };
      }
      const [row] = await prisma.$queryRaw<
        Array<{ normalized: string; valid: boolean }>
      >(
        Prisma.sql`
          SELECT
            normalized,
            char_length(normalized) BETWEEN 1 AND 255 AS "valid"
          FROM (
            SELECT "normalize_learning_media_original_name"(${value})
              AS normalized
          ) candidate
        `,
      );
      expect(row?.valid).toBe(javascript.valid);
      if (javascript.valid) {
        expect(row?.normalized).toBe(javascript.normalized);
      }
    }
  });

  it('rolls back File and session finalization when the completion audit fails', async () => {
    const intent = await createUploadedText(Buffer.from('audit rollback\n'));
    const failingUnitOfWork = withFinalizeInput((input) => ({
      ...input,
      actorId: randomUUID(),
    }));

    await expect(
      inScope(() =>
        createRealCompleteUseCase(failingUnitOfWork, realStorage).execute(
          intent.id,
        ),
      ),
    ).rejects.toMatchObject({
      code: 'learning.media.upload_conflict',
      details: { reasonCode: 'finalization_failed', retryable: true },
    });
    await expectRetryableFinalizationResidue(intent.id);
  });

  it('rolls back File creation when the READY session transition violates its CHECK', async () => {
    const intent = await createUploadedText(Buffer.from('session rollback\n'));
    const failingUnitOfWork = withFinalizeInput((input) => ({
      ...input,
      finalCleanupEligibleAt: input.completedAt,
    }));

    await expect(
      inScope(() =>
        createRealCompleteUseCase(failingUnitOfWork, realStorage).execute(
          intent.id,
        ),
      ),
    ).rejects.toMatchObject({
      code: 'learning.media.upload_conflict',
      details: { reasonCode: 'finalization_failed', retryable: true },
    });
    await expectRetryableFinalizationResidue(intent.id);
  });

  it.each([UserType.SCHOOL_USER, UserType.TEACHER, UserType.STUDENT])(
    'allows current management to verify referenced LEGACY media uploaded by %s',
    async (historicalUserType) => {
      const legacy = await createLegacySession(historicalUserType);
      const complete = new VerifyLegacyLearningMediaUseCase(
        unitOfWork,
        verifier,
      );

      const result = await inScope(() => complete.execute(legacy.sessionId));

      expect(result).toMatchObject({
        fileId: legacy.fileId,
        status: FileUploadSessionStatus.READY,
        mimeType: 'video/mp4',
      });
      const file = await prisma.file.findUniqueOrThrow({
        where: { id: legacy.fileId },
      });
      expect(file.uploaderId).toBe(legacy.historicalUploaderId);
      const audit = await prisma.auditLog.findFirstOrThrow({
        where: {
          action: 'learning.media.upload.complete',
          resourceId: legacy.sessionId,
        },
      });
      expect(audit.actorId).toBe(ids.actorId);
    },
  );

  it('retains a failed LEGACY File and excludes it from object cleanup', async () => {
    const legacy = await createLegacySession();
    const failingVerifier = {
      verifyExistingFinal: jest
        .fn()
        .mockRejectedValue(
          new MediaVerificationError('unsupported_video_codec'),
        ),
    } as unknown as MediaVerifierService;
    const complete = new VerifyLegacyLearningMediaUseCase(
      unitOfWork,
      failingVerifier,
    );

    await expect(
      inScope(() => complete.execute(legacy.sessionId)),
    ).rejects.toMatchObject({
      code: 'learning.media.verification_failed',
      details: { reasonCode: 'unsupported_video_codec' },
    });

    const session = await prisma.fileUploadSession.findUniqueOrThrow({
      where: { id: legacy.sessionId },
    });
    expect(session.status).toBe(FileUploadSessionStatus.FAILED);
    expect(session.stagingCleanupEligibleAt).toBeNull();
    expect(session.stagingObjectDeletedAt).toBeNull();
    expect(session.finalCleanupEligibleAt).toBeNull();
    expect(session.finalObjectDeletedAt).toBeNull();
    expect(
      (await prisma.file.findUniqueOrThrow({ where: { id: legacy.fileId } }))
        .deletedAt,
    ).toBeNull();
    expect(
      await prisma.auditLog.count({
        where: {
          action: 'learning.media.upload.verification_failed',
          resourceId: legacy.sessionId,
          outcome: 'FAILURE',
        },
      }),
    ).toBe(1);
  });

  it.each([
    LessonContentPublicationStatus.DRAFT,
    LessonContentPublicationStatus.ARCHIVED,
  ])(
    'prevents final cleanup while a live %s Lesson Content reference exists',
    async (publicationStatus) => {
      const data = await buildLifecycleShape(
        FileUploadSessionStatus.READY,
        'text/plain',
        true,
      );
      const completedAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
      const createdAt = new Date(completedAt.getTime() - 60_000);
      data.createdAt = createdAt;
      data.expiresAt = createdAt;
      data.completedAt = completedAt;
      data.verifiedAt = completedAt;
      data.finalCleanupEligibleAt = new Date(
        completedAt.getTime() + 7 * 24 * 60 * 60 * 1000,
      );
      const ready = await prisma.fileUploadSession.create({ data });
      await prisma.lessonContentItem.create({
        data: {
          schoolId: ids.schoolId,
          curriculumId: ids.curriculumId,
          unitId: ids.unitId,
          lessonId: ids.lessonId,
          type: LessonContentItemType.FILE,
          title: `${publicationStatus} cleanup reference ${ready.id}`,
          fileId: ready.fileId!,
          publicationStatus,
          ...(publicationStatus === LessonContentPublicationStatus.ARCHIVED
            ? {
                archivedAt: new Date(),
                archivedByUserId: ids.actorId,
              }
            : {}),
          createdByUserId: ids.actorId,
        },
      });
      const cleanup = new LearningMediaCleanupService(
        {} as BullmqService,
        repository,
        realStorage,
      );

      await expect(cleanup.cleanUpload(ready.id, 'final')).resolves.toBe(false);
      expect(
        (
          await prisma.fileUploadSession.findUniqueOrThrow({
            where: { id: ready.id },
          })
        ).status,
      ).toBe(FileUploadSessionStatus.READY);
      expect(
        (await prisma.file.findUniqueOrThrow({ where: { id: ready.fileId! } }))
          .deletedAt,
      ).toBeNull();
    },
  );

  it('rejects invalid database sizes with the named CHECK constraint', async () => {
    const createdAt = new Date();
    await expect(
      prisma.fileUploadSession.create({
        data: {
          organizationId: ids.organizationId,
          schoolId: ids.schoolId,
          createdByUserId: ids.actorId,
          clientRequestId: randomUUID(),
          purpose: 'LESSON_CONTENT',
          originalName: 'invalid.mp4',
          expectedMimeType: 'video/mp4',
          expectedSizeBytes: 0n,
          stagingBucket: 'learning-media-integration',
          stagingObjectKey: `invalid/staging/${randomUUID()}`,
          finalBucket: 'learning-media-integration',
          finalObjectKey: `invalid/final/${randomUUID()}`,
          status: FileUploadSessionStatus.UPLOADING,
          createdAt,
          expiresAt: new Date(createdAt.getTime() + 7_200_000),
          latestUploadUrlExpiresAt: new Date(createdAt.getTime() + 3_600_000),
        },
      }),
    ).rejects.toThrow(/file_upload_sessions_expected_metadata_check/u);
  });

  it('accepts every lifecycle state and every MIME-specific READY shape', async () => {
    const cases: Array<{
      status: FileUploadSessionStatus;
      mimeType?: string;
      legacy?: boolean;
      recovery?: boolean;
    }> = [
      { status: FileUploadSessionStatus.CREATED },
      { status: FileUploadSessionStatus.UPLOADING },
      { status: FileUploadSessionStatus.VERIFYING },
      { status: FileUploadSessionStatus.VERIFYING, recovery: true },
      { status: FileUploadSessionStatus.FAILED },
      { status: FileUploadSessionStatus.CANCELLED },
      { status: FileUploadSessionStatus.EXPIRED },
      { status: FileUploadSessionStatus.LEGACY, legacy: true },
      { status: FileUploadSessionStatus.VERIFYING, legacy: true },
      { status: FileUploadSessionStatus.FAILED, legacy: true },
      { status: FileUploadSessionStatus.PURGED },
      ...[
        'application/pdf',
        'text/plain',
        'image/jpeg',
        'image/png',
        'audio/mpeg',
        'audio/mp4',
        'audio/webm',
        'video/mp4',
        'video/webm',
      ].map((mimeType) => ({
        status: FileUploadSessionStatus.READY,
        mimeType,
      })),
    ];

    for (const fixture of cases) {
      const data = await buildLifecycleShape(
        fixture.status,
        fixture.mimeType ?? 'video/mp4',
        fixture.legacy ?? false,
      );
      if (fixture.recovery) {
        data.failureReason = 'finalization_cleanup_pending';
        data.finalCleanupEligibleAt = new Date();
      }
      await expect(
        prisma.fileUploadSession.create({ data }),
      ).resolves.toMatchObject({
        status: fixture.status,
        expectedMimeType: fixture.mimeType ?? 'video/mp4',
      });
    }
    expect(cases).toHaveLength(20);
  });

  it('rejects malformed lifecycle, evidence, identity, and MIME-specific shapes', async () => {
    type InvalidCase = {
      name: string;
      constraint: string;
      status: FileUploadSessionStatus;
      mimeType?: string;
      legacy?: boolean;
      mutate: (data: Prisma.FileUploadSessionUncheckedCreateInput) => void;
    };
    const invalidCases: InvalidCase[] = [
      {
        name: 'invalid expected size',
        constraint: 'file_upload_sessions_expected_metadata_check',
        status: FileUploadSessionStatus.UPLOADING,
        mutate: (data) => {
          data.expectedSizeBytes = 0n;
        },
      },
      {
        name: 'actual size mismatch',
        constraint: 'file_upload_sessions_actual_size_check',
        status: FileUploadSessionStatus.READY,
        mutate: (data) => {
          data.actualSizeBytes = 2n;
        },
      },
      {
        name: 'invalid checksum',
        constraint: 'file_upload_sessions_checksum_check',
        status: FileUploadSessionStatus.READY,
        mutate: (data) => {
          data.checksumSha256 = 'not-a-checksum';
        },
      },
      {
        name: 'invalid duration',
        constraint: 'file_upload_sessions_duration_check',
        status: FileUploadSessionStatus.READY,
        mutate: (data) => {
          data.durationSeconds = 0;
        },
      },
      {
        name: 'partial dimensions',
        constraint: 'file_upload_sessions_authoritative_facts_check',
        status: FileUploadSessionStatus.READY,
        mutate: (data) => {
          data.height = null;
        },
      },
      {
        name: 'non-positive dimensions',
        constraint: 'file_upload_sessions_dimensions_check',
        status: FileUploadSessionStatus.READY,
        mutate: (data) => {
          data.width = -1;
        },
      },
      {
        name: 'untrimmed original name',
        constraint: 'file_upload_sessions_original_name_check',
        status: FileUploadSessionStatus.UPLOADING,
        mutate: (data) => {
          data.originalName = ' invalid.mp4 ';
        },
      },
      {
        name: 'staging equals final',
        constraint: 'file_upload_sessions_object_identity_check',
        status: FileUploadSessionStatus.UPLOADING,
        mutate: (data) => {
          data.finalBucket = data.stagingBucket!;
          data.finalObjectKey = data.stagingObjectKey!;
        },
      },
      {
        name: 'session expiry is not exactly two hours',
        constraint: 'file_upload_sessions_expiry_check',
        status: FileUploadSessionStatus.UPLOADING,
        mutate: (data) => {
          data.expiresAt = new Date((data.createdAt as Date).getTime() + 1);
        },
      },
      {
        name: 'staging eligibility precedes PUT expiry',
        constraint: 'file_upload_sessions_cleanup_evidence_check',
        status: FileUploadSessionStatus.FAILED,
        mutate: (data) => {
          data.stagingCleanupEligibleAt = new Date(
            (data.latestUploadUrlExpiresAt as Date).getTime() - 1,
          );
        },
      },
      {
        name: 'staging deletion without claim',
        constraint: 'file_upload_sessions_cleanup_evidence_check',
        status: FileUploadSessionStatus.FAILED,
        mutate: (data) => {
          data.stagingObjectDeletedAt = new Date();
          data.stagingCleanupClaimedAt = null;
        },
      },
      {
        name: 'staging cleanup claim precedes eligibility',
        constraint: 'file_upload_sessions_cleanup_evidence_check',
        status: FileUploadSessionStatus.FAILED,
        mutate: (data) => {
          data.stagingCleanupClaimedAt = new Date(
            (data.stagingCleanupEligibleAt as Date).getTime() - 1,
          );
        },
      },
      {
        name: 'final deletion without claim',
        constraint: 'file_upload_sessions_cleanup_evidence_check',
        status: FileUploadSessionStatus.PURGED,
        mutate: (data) => {
          data.finalCleanupClaimedAt = null;
        },
      },
      {
        name: 'authoritative MIME mismatch',
        constraint: 'file_upload_sessions_authoritative_facts_check',
        status: FileUploadSessionStatus.READY,
        mutate: (data) => {
          data.verifiedMimeType = 'video/webm';
        },
      },
      {
        name: 'CREATED has failure state',
        constraint: 'file_upload_sessions_created_check',
        status: FileUploadSessionStatus.CREATED,
        mutate: (data) => {
          data.failedAt = new Date();
        },
      },
      {
        name: 'CREATED has a PUT capability',
        constraint: 'file_upload_sessions_created_check',
        status: FileUploadSessionStatus.CREATED,
        mutate: (data) => {
          data.latestUploadUrlExpiresAt = new Date(
            (data.createdAt as Date).getTime() + 3_600_000,
          );
        },
      },
      {
        name: 'UPLOADING has terminal cleanup eligibility',
        constraint: 'file_upload_sessions_cleanup_evidence_check',
        status: FileUploadSessionStatus.UPLOADING,
        mutate: (data) => {
          data.stagingCleanupEligibleAt = data.latestUploadUrlExpiresAt;
        },
      },
      {
        name: 'UPLOADING has final cleanup state',
        constraint: 'file_upload_sessions_uploading_check',
        status: FileUploadSessionStatus.UPLOADING,
        mutate: (data) => {
          data.finalCleanupEligibleAt = new Date();
        },
      },
      {
        name: 'VERIFYING has completion timestamp',
        constraint: 'file_upload_sessions_verifying_check',
        status: FileUploadSessionStatus.VERIFYING,
        mutate: (data) => {
          data.completedAt = new Date();
        },
      },
      {
        name: 'VERIFYING has final cleanup state',
        constraint: 'file_upload_sessions_verifying_check',
        status: FileUploadSessionStatus.VERIFYING,
        mutate: (data) => {
          data.finalCleanupEligibleAt = new Date();
        },
      },
      {
        name: 'READY missing File',
        constraint: 'file_upload_sessions_ready_check',
        status: FileUploadSessionStatus.READY,
        mutate: (data) => {
          data.fileId = null;
        },
      },
      {
        name: 'READY retention not exactly seven days',
        constraint: 'file_upload_sessions_ready_check',
        status: FileUploadSessionStatus.READY,
        mutate: (data) => {
          data.finalCleanupEligibleAt = data.completedAt;
        },
      },
      {
        name: 'LEGACY has staging capability',
        constraint: 'file_upload_sessions_authoritative_facts_check',
        status: FileUploadSessionStatus.LEGACY,
        legacy: true,
        mutate: (data) => {
          data.stagingBucket = data.finalBucket;
          data.stagingObjectKey = `legacy/staging/${randomUUID()}`;
        },
      },
      {
        name: 'LEGACY has a failure reason',
        constraint: 'file_upload_sessions_legacy_check',
        status: FileUploadSessionStatus.LEGACY,
        legacy: true,
        mutate: (data) => {
          data.failureReason = 'probe_failed';
        },
      },
      {
        name: 'failed new upload lacks staging eligibility',
        constraint: 'file_upload_sessions_failed_check',
        status: FileUploadSessionStatus.FAILED,
        mutate: (data) => {
          data.stagingCleanupEligibleAt = null;
        },
      },
      {
        name: 'failed new upload has final cleanup state',
        constraint: 'file_upload_sessions_failed_check',
        status: FileUploadSessionStatus.FAILED,
        mutate: (data) => {
          data.finalCleanupEligibleAt = new Date();
        },
      },
      {
        name: 'failed LEGACY schedules cleanup',
        constraint: 'file_upload_sessions_cleanup_evidence_check',
        status: FileUploadSessionStatus.FAILED,
        legacy: true,
        mutate: (data) => {
          data.stagingCleanupEligibleAt = new Date();
        },
      },
      {
        name: 'CANCELLED lacks cancellation timestamp',
        constraint: 'file_upload_sessions_cancelled_check',
        status: FileUploadSessionStatus.CANCELLED,
        mutate: (data) => {
          data.cancelledAt = null;
        },
      },
      {
        name: 'CANCELLED has final cleanup state',
        constraint: 'file_upload_sessions_cancelled_check',
        status: FileUploadSessionStatus.CANCELLED,
        mutate: (data) => {
          data.finalCleanupEligibleAt = new Date();
        },
      },
      {
        name: 'EXPIRED lacks cleanup eligibility',
        constraint: 'file_upload_sessions_expired_check',
        status: FileUploadSessionStatus.EXPIRED,
        mutate: (data) => {
          data.stagingCleanupEligibleAt = null;
        },
      },
      {
        name: 'EXPIRED has final cleanup state',
        constraint: 'file_upload_sessions_expired_check',
        status: FileUploadSessionStatus.EXPIRED,
        mutate: (data) => {
          data.finalCleanupEligibleAt = new Date();
        },
      },
      {
        name: 'PURGED lacks final deletion evidence',
        constraint: 'file_upload_sessions_purged_check',
        status: FileUploadSessionStatus.PURGED,
        mutate: (data) => {
          data.finalObjectDeletedAt = null;
        },
      },
      {
        name: 'PURGED new upload lacks staging deletion evidence',
        constraint: 'file_upload_sessions_purged_check',
        status: FileUploadSessionStatus.PURGED,
        mutate: (data) => {
          data.stagingObjectDeletedAt = null;
        },
      },
      {
        name: 'audio READY contains dimensions',
        constraint: 'file_upload_sessions_authoritative_facts_check',
        status: FileUploadSessionStatus.READY,
        mimeType: 'audio/mpeg',
        mutate: (data) => {
          data.width = 1;
          data.height = 1;
        },
      },
      {
        name: 'image READY contains duration',
        constraint: 'file_upload_sessions_authoritative_facts_check',
        status: FileUploadSessionStatus.READY,
        mimeType: 'image/png',
        mutate: (data) => {
          data.durationSeconds = 1;
        },
      },
      {
        name: 'PDF READY contains dimensions',
        constraint: 'file_upload_sessions_authoritative_facts_check',
        status: FileUploadSessionStatus.READY,
        mimeType: 'application/pdf',
        mutate: (data) => {
          data.width = 1;
          data.height = 1;
        },
      },
    ];

    for (const fixture of invalidCases) {
      const data = await buildLifecycleShape(
        fixture.status,
        fixture.mimeType ?? 'video/mp4',
        fixture.legacy ?? false,
      );
      fixture.mutate(data);
      await expect(prisma.fileUploadSession.create({ data })).rejects.toThrow(
        new RegExp(fixture.constraint, 'u'),
      );
    }
    expect(invalidCases).toHaveLength(36);
  });

  function inScope<T>(callback: () => Promise<T>): Promise<T> {
    const context = createRequestContext('learning-media-integration');
    context.actor = { id: ids.actorId, userType: UserType.SCHOOL_USER };
    context.activeMembership = {
      membershipId: randomUUID(),
      organizationId: ids.organizationId,
      schoolId: ids.schoolId,
      roleId: randomUUID(),
      permissions: ['academics.curriculum.manage', 'files.uploads.manage'],
    };
    return runWithRequestContext(context, callback);
  }

  async function createLegacySession(historicalUserType?: UserType): Promise<{
    fileId: string;
    sessionId: string;
    historicalUploaderId: string;
  }> {
    const historicalUploader = historicalUserType
      ? await prisma.user.create({
          data: {
            email: `legacy-${historicalUserType.toLowerCase()}-${randomUUID()}@example.test`,
            firstName: 'Historical',
            lastName: 'Uploader',
            userType: historicalUserType,
            status: UserStatus.ACTIVE,
          },
        })
      : { id: ids.actorId };
    historicalUploaderIds.add(historicalUploader.id);
    const objectKey = `legacy/${randomUUID()}`;
    const file = await prisma.file.create({
      data: {
        organizationId: ids.organizationId,
        schoolId: ids.schoolId,
        uploaderId: historicalUploader.id,
        bucket: 'learning-media-integration',
        objectKey,
        originalName: 'legacy.mp4',
        mimeType: 'video/mp4',
        sizeBytes: 1024n,
      },
    });
    const createdAt = new Date('2020-01-01T00:00:00.000Z');
    const session = await prisma.fileUploadSession.create({
      data: {
        organizationId: ids.organizationId,
        schoolId: ids.schoolId,
        createdByUserId: historicalUploader.id,
        clientRequestId: randomUUID(),
        purpose: FileUploadPurpose.LESSON_CONTENT,
        originalName: 'legacy.mp4',
        expectedMimeType: 'video/mp4',
        expectedSizeBytes: 1024n,
        stagingBucket: null,
        stagingObjectKey: null,
        finalBucket: 'learning-media-integration',
        finalObjectKey: objectKey,
        status: FileUploadSessionStatus.LEGACY,
        createdAt,
        expiresAt: createdAt,
        verificationVersion: 'legacy_metadata_v1',
        fileId: file.id,
      },
    });
    await prisma.lessonContentItem.create({
      data: {
        schoolId: ids.schoolId,
        curriculumId: ids.curriculumId,
        unitId: ids.unitId,
        lessonId: ids.lessonId,
        type: LessonContentItemType.FILE,
        title: `Legacy reference ${session.id}`,
        fileId: file.id,
        createdByUserId: ids.actorId,
      },
    });
    return {
      fileId: file.id,
      sessionId: session.id,
      historicalUploaderId: historicalUploader.id,
    };
  }

  async function readStorageObject(
    bucket: string,
    objectKey: string,
  ): Promise<Buffer> {
    const chunks: Buffer[] = [];
    const stream = await realStorage.getObject({ bucket, objectKey });
    for await (const chunk of stream as AsyncIterable<Buffer | Uint8Array>) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  async function buildLifecycleShape(
    status: FileUploadSessionStatus,
    mimeType: string,
    legacy: boolean,
  ): Promise<Prisma.FileUploadSessionUncheckedCreateInput> {
    const id = randomUUID();
    const createdAt = new Date('2035-01-01T00:00:00.000Z');
    const completedAt = new Date('2035-01-01T00:10:00.000Z');
    const latestUploadUrlExpiresAt = new Date(createdAt.getTime() + 3_600_000);
    const isReady = status === FileUploadSessionStatus.READY;
    const isPurged = status === FileUploadSessionStatus.PURGED;
    const needsFile = legacy || isReady || isPurged;
    const file = needsFile
      ? await prisma.file.create({
          data: {
            organizationId: ids.organizationId,
            schoolId: ids.schoolId,
            uploaderId: ids.actorId,
            bucket: 'learning-media-lifecycle',
            objectKey: `lifecycle/final/${id}`,
            originalName: lifecycleName(mimeType),
            mimeType,
            sizeBytes: 1n,
            ...(isReady || isPurged ? { checksumSha256: 'c'.repeat(64) } : {}),
            ...(isPurged ? { deletedAt: new Date() } : {}),
          },
        })
      : null;
    const facts = lifecycleFacts(mimeType);
    const data: Prisma.FileUploadSessionUncheckedCreateInput = {
      id,
      organizationId: ids.organizationId,
      schoolId: ids.schoolId,
      createdByUserId: ids.actorId,
      clientRequestId: randomUUID(),
      purpose: FileUploadPurpose.LESSON_CONTENT,
      originalName: lifecycleName(mimeType),
      expectedMimeType: mimeType,
      expectedSizeBytes: 1n,
      stagingBucket: legacy ? null : 'learning-media-lifecycle',
      stagingObjectKey: legacy ? null : `lifecycle/staging/${id}`,
      finalBucket: 'learning-media-lifecycle',
      finalObjectKey: `lifecycle/final/${id}`,
      status,
      createdAt,
      expiresAt: legacy ? createdAt : new Date(createdAt.getTime() + 7_200_000),
      latestUploadUrlExpiresAt: legacy ? null : latestUploadUrlExpiresAt,
      fileId: file?.id ?? null,
    };
    if (status === FileUploadSessionStatus.CREATED) {
      data.latestUploadUrlExpiresAt = null;
    }
    if (status === FileUploadSessionStatus.FAILED) {
      data.failedAt = new Date(createdAt.getTime() + 1_800_000);
      data.failureReason = 'probe_failed';
      if (!legacy) {
        data.stagingCleanupEligibleAt = latestUploadUrlExpiresAt;
      } else {
        data.verificationVersion = 'legacy_metadata_v1';
      }
    } else if (status === FileUploadSessionStatus.CANCELLED) {
      data.cancelledAt = new Date(createdAt.getTime() + 1_800_000);
      data.stagingCleanupEligibleAt = latestUploadUrlExpiresAt;
    } else if (status === FileUploadSessionStatus.EXPIRED) {
      data.stagingCleanupEligibleAt = latestUploadUrlExpiresAt;
    } else if (status === FileUploadSessionStatus.LEGACY) {
      data.verificationVersion = 'legacy_metadata_v1';
    } else if (status === FileUploadSessionStatus.VERIFYING && legacy) {
      data.verificationVersion = 'legacy_metadata_v1';
    } else if (isReady || isPurged) {
      Object.assign(data, {
        completedAt,
        finalCleanupEligibleAt: new Date(
          completedAt.getTime() + 7 * 24 * 60 * 60 * 1000,
        ),
        verifiedMimeType: mimeType,
        actualSizeBytes: 1n,
        checksumSha256: 'c'.repeat(64),
        verifiedAt: completedAt,
        verificationVersion: 'ffprobe-5.1.9-debian12-learning-media-v1',
        ...facts,
      });
      if (!legacy) {
        data.stagingCleanupEligibleAt = latestUploadUrlExpiresAt;
      }
      if (isPurged) {
        const deletionAt = new Date(
          completedAt.getTime() + 8 * 24 * 60 * 60 * 1000,
        );
        data.stagingCleanupClaimedAt = deletionAt;
        data.stagingObjectDeletedAt = deletionAt;
        data.finalCleanupClaimedAt = deletionAt;
        data.finalObjectDeletedAt = deletionAt;
      }
    }
    return data;
  }

  function lifecycleFacts(mimeType: string): {
    durationSeconds: number | null;
    width: number | null;
    height: number | null;
  } {
    if (mimeType.startsWith('video/')) {
      return { durationSeconds: 1, width: 320, height: 180 };
    }
    if (mimeType.startsWith('audio/')) {
      return { durationSeconds: 1, width: null, height: null };
    }
    if (mimeType.startsWith('image/')) {
      return { durationSeconds: null, width: 64, height: 64 };
    }
    return { durationSeconds: null, width: null, height: null };
  }

  function lifecycleName(mimeType: string): string {
    const extension: Record<string, string> = {
      'application/pdf': 'pdf',
      'text/plain': 'txt',
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'audio/mpeg': 'mp3',
      'audio/mp4': 'm4a',
      'audio/webm': 'webm',
      'video/mp4': 'mp4',
      'video/webm': 'webm',
    };
    return `lifecycle.${extension[mimeType] ?? 'bin'}`;
  }

  function signedPutExpiry(value: string): Date {
    const url = new URL(value);
    const signedAt = url.searchParams.get('X-Amz-Date')!;
    const expiresInSeconds = Number(url.searchParams.get('X-Amz-Expires'));
    return new Date(
      Date.UTC(
        Number(signedAt.slice(0, 4)),
        Number(signedAt.slice(4, 6)) - 1,
        Number(signedAt.slice(6, 8)),
        Number(signedAt.slice(9, 11)),
        Number(signedAt.slice(11, 13)),
        Number(signedAt.slice(13, 15)),
      ) +
        expiresInSeconds * 1000,
    );
  }

  async function createUploadedText(body: Buffer) {
    const intent = await inScope(() =>
      new CreateLearningMediaUploadUseCase(
        unitOfWork,
        repository,
        realStorage,
      ).execute({
        clientRequestId: randomUUID(),
        originalName: 'lesson.txt',
        expectedMimeType: 'text/plain',
        expectedSizeBytes: body.byteLength.toString(),
      }),
    );
    const put = await fetch(intent.uploadUrl!, {
      method: 'PUT',
      headers: { 'content-type': 'text/plain' },
      body,
    });
    expect(put.ok).toBe(true);
    return intent;
  }

  function createRealCompleteUseCase(
    selectedUnitOfWork: LearningMediaUnitOfWork,
    selectedStorage: StorageService,
  ): CompleteLearningMediaUploadUseCase {
    return new CompleteLearningMediaUploadUseCase(
      selectedUnitOfWork,
      new MediaVerifierService(selectedStorage, config),
      selectedStorage,
    );
  }

  function storageWithFinalWriteFailure(): StorageService {
    return {
      statObject: (input: Parameters<StorageService['statObject']>[0]) =>
        realStorage.statObject(input),
      getObject: (input: Parameters<StorageService['getObject']>[0]) =>
        realStorage.getObject(input),
      saveObject: jest
        .fn()
        .mockRejectedValue(new Error('final storage unavailable')),
      deleteObjectAndConfirmAbsent: (
        input: Parameters<StorageService['deleteObjectAndConfirmAbsent']>[0],
      ) => realStorage.deleteObjectAndConfirmAbsent(input),
    } as unknown as StorageService;
  }

  function withFinalizeInput(
    transform: (
      input: LearningMediaFinalizeInput,
    ) => LearningMediaFinalizeInput,
  ): LearningMediaUnitOfWork {
    return withTransactionContext((context) => ({
      ...context,
      finalize: (input) => context.finalize(transform(input)),
    }));
  }

  function withTransactionContext(
    transform: (
      context: LearningMediaTransactionContext,
    ) => LearningMediaTransactionContext,
  ): LearningMediaUnitOfWork {
    return {
      execute: <T>(
        callback: (context: LearningMediaTransactionContext) => Promise<T>,
      ) => unitOfWork.execute((context) => callback(transform(context))),
    } as LearningMediaUnitOfWork;
  }

  async function expectRetryableFinalizationResidue(
    uploadId: string,
  ): Promise<void> {
    const session = await prisma.fileUploadSession.findUniqueOrThrow({
      where: { id: uploadId },
    });
    expect(session.status).toBe(FileUploadSessionStatus.UPLOADING);
    expect(session.fileId).toBeNull();
    expect(session.verifiedMimeType).toBeNull();
    expect(session.failureReason).toBeNull();
    expect(
      await prisma.file.count({
        where: {
          bucket: session.finalBucket,
          objectKey: session.finalObjectKey,
        },
      }),
    ).toBe(0);
    await expect(
      realStorage.objectExists({
        bucket: session.finalBucket,
        objectKey: session.finalObjectKey,
      }),
    ).resolves.toBe(false);
    await expectCompletionAuditCount(uploadId, 0);
  }

  async function expectCompletionAuditCount(
    uploadId: string,
    count: number,
  ): Promise<void> {
    expect(
      await prisma.auditLog.count({
        where: {
          resourceId: uploadId,
          action: 'learning.media.upload.complete',
        },
      }),
    ).toBe(count);
  }
});
