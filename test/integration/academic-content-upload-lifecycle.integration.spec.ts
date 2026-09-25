import { randomUUID } from 'node:crypto';
import {
  AcademicContentAudienceType,
  AcademicContentType,
  FileUploadPurpose,
  FileUploadSessionStatus,
  FileVisibility,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../src/common/context/request-context';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { ObjectStorageError } from '../../src/infrastructure/storage/object-storage.errors';
import type { ObjectStoragePort } from '../../src/infrastructure/storage/object-storage.port';
import type { SignedUrlService } from '../../src/infrastructure/storage/signed-url.service';
import { StorageService } from '../../src/infrastructure/storage/storage.service';
import { AcademicContentFilePolicyResolver } from '../../src/modules/academics/academic-content/files/application/academic-content-file-policy.resolver';
import { AcademicContentFileVerifier } from '../../src/modules/academics/academic-content/files/application/academic-content-file-verifier';
import {
  CancelAcademicContentUploadUseCase,
  CompleteAcademicContentUploadUseCase,
  CreateAcademicContentUploadUseCase,
  UnlinkAcademicContentAssetUseCase,
} from '../../src/modules/academics/academic-content/files/application/academic-content-upload.use-cases';
import { ACADEMIC_CONTENT_VERIFICATION_VERSION } from '../../src/modules/academics/academic-content/files/domain/academic-content-file.constants';
import { AcademicContentCleanupWorker } from '../../src/modules/academics/academic-content/files/infrastructure/academic-content-cleanup.worker';
import { AcademicContentFileRepository } from '../../src/modules/academics/academic-content/files/infrastructure/academic-content-file.repository';
import type { BullmqService } from '../../src/infrastructure/queue/bullmq.service';

const databaseUrl =
  process.env.DATABASE_URL ??
  (process.env.RUN_ACC_3C_LIFECYCLE_INTEGRATION === '1' &&
  process.env.PRD3_G03_DATABASE_PORT
    ? `postgresql://g03_fixture:g03_fixture@127.0.0.1:${process.env.PRD3_G03_DATABASE_PORT}/g03_fixture?schema=public`
    : null);
const describeEvidence = databaseUrl ? describe : describe.skip;
const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n', 'utf8');

describeEvidence('ACC-3C real PostgreSQL lifecycle', () => {
  jest.setTimeout(120_000);
  const prisma = new PrismaService({
    datasources: {
      db: {
        url: databaseUrl ?? 'postgresql://unused:unused@127.0.0.1:1/unused',
      },
    },
  });
  const ids: Record<string, string> = {};
  const tag = randomUUID().slice(0, 8);
  const bucket = `acc3c-integration-${tag}`;
  const objects = new Map<string, Buffer>();
  const port = {
    getCapabilities: () => ({ resumableUpload: true, rangeRead: true }),
    createResumableUploadSession: (input: { objectKey: string }) =>
      Promise.resolve({
        sessionUrl: `https://provider.invalid/resumable/${input.objectKey}`,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000),
      }),
    statObject: (input: { objectKey: string }) => {
      const body = objects.get(input.objectKey);
      if (!body) return Promise.reject(new ObjectStorageError('not_found'));
      return Promise.resolve({
        size: body.length,
        etag: null,
        contentType: 'application/pdf',
        metadata: {},
        lastModified: null,
        generation: null,
        version: null,
      });
    },
    readObjectRange: (input: {
      objectKey: string;
      offset: number;
      length: number;
    }) => {
      const body = objects.get(input.objectKey);
      if (!body) return Promise.reject(new ObjectStorageError('not_found'));
      return Promise.resolve(
        body.subarray(input.offset, input.offset + input.length),
      );
    },
    objectExists: (input: { objectKey: string }) =>
      Promise.resolve(objects.has(input.objectKey)),
    deleteObject: (input: { objectKey: string }) => {
      objects.delete(input.objectKey);
      return Promise.resolve();
    },
  } as unknown as ObjectStoragePort;
  const storage = new StorageService(port, {
    resolveBucket: () => bucket,
  } as unknown as SignedUrlService);
  const repository = new AcademicContentFileRepository(prisma);
  const create = new CreateAcademicContentUploadUseCase(
    repository,
    new AcademicContentFilePolicyResolver(repository),
    storage,
  );
  const verifier = new AcademicContentFileVerifier(storage);
  const complete = new CompleteAcademicContentUploadUseCase(
    repository,
    verifier,
  );
  const cancel = new CancelAcademicContentUploadUseCase(repository);
  const unlink = new UnlinkAcademicContentAssetUseCase(repository);
  const cleanup = new AcademicContentCleanupWorker(
    {} as BullmqService,
    repository,
    storage,
  );

  async function asManager<T>(action: () => Promise<T>): Promise<T> {
    return runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: ids.user, userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: randomUUID(),
        organizationId: ids.organization,
        schoolId: ids.school,
        roleId: randomUUID(),
        permissions: ['academics.academic_content.manage'],
      });
      return action();
    });
  }

  async function createIntent() {
    return asManager(() =>
      create.execute({
        contentId: ids.content,
        clientRequestId: randomUUID(),
        originalName: 'resource.pdf',
        expectedMimeType: 'application/pdf',
        expectedSizeBytes: String(pdf.length),
      }),
    );
  }

  beforeAll(async () => {
    await prisma.$connect();
    ids.organization = (
      await prisma.organization.create({
        data: { name: `ACC3C ${tag}`, slug: `acc3c-${tag}` },
      })
    ).id;
    ids.school = (
      await prisma.school.create({
        data: {
          organizationId: ids.organization,
          name: `ACC3C ${tag}`,
          slug: `acc3c-${tag}`,
        },
      })
    ).id;
    ids.user = (
      await prisma.user.create({
        data: {
          email: `acc3c-${tag}@example.test`,
          firstName: 'ACC3C',
          lastName: 'Manager',
          userType: UserType.SCHOOL_USER,
        },
      })
    ).id;
    ids.year = (
      await prisma.academicYear.create({
        data: {
          schoolId: ids.school,
          nameAr: `سنة ${tag}`,
          nameEn: `Year ${tag}`,
          startDate: new Date(Date.now() - 30 * 86_400_000),
          endDate: new Date(Date.now() + 365 * 86_400_000),
        },
      })
    ).id;
    ids.term = (
      await prisma.term.create({
        data: {
          schoolId: ids.school,
          academicYearId: ids.year,
          nameAr: `فصل ${tag}`,
          nameEn: `Term ${tag}`,
          startDate: new Date(Date.now() - 30 * 86_400_000),
          endDate: new Date(Date.now() + 365 * 86_400_000),
          isActive: true,
        },
      })
    ).id;
    ids.content = (
      await prisma.academicContent.create({
        data: {
          schoolId: ids.school,
          academicYearId: ids.year,
          termId: ids.term,
          type: AcademicContentType.GENERAL_RESOURCE,
          audience: AcademicContentAudienceType.STUDENTS,
          title: 'Resource',
          createdByUserId: ids.user,
        },
      })
    ).id;
  });

  afterAll(async () => {
    try {
      if (!ids.school) return;
      await prisma.academicContentAsset.deleteMany({
        where: { schoolId: ids.school },
      });
      await prisma.fileUploadSession.deleteMany({
        where: { schoolId: ids.school },
      });
      await prisma.auditLog.deleteMany({ where: { schoolId: ids.school } });
      await prisma.academicContent.deleteMany({
        where: { schoolId: ids.school },
      });
      await prisma.file.deleteMany({ where: { schoolId: ids.school } });
      await prisma.term.deleteMany({ where: { schoolId: ids.school } });
      await prisma.academicYear.deleteMany({
        where: { schoolId: ids.school },
      });
      await prisma.school.delete({ where: { id: ids.school } });
      await prisma.user.delete({ where: { id: ids.user } });
      await prisma.organization.delete({ where: { id: ids.organization } });
    } finally {
      await prisma.$disconnect();
    }
  });

  it('enforces real transitions, late-capability deadlines, and cleanup evidence', async () => {
    const readyIntent = await createIntent();
    const uploading = await prisma.fileUploadSession.findUniqueOrThrow({
      where: { id: readyIntent.uploadId },
    });
    expect(uploading.status).toBe(FileUploadSessionStatus.UPLOADING);
    expect(uploading.latestUploadUrlExpiresAt).toEqual(
      readyIntent.capabilityExpiresAt,
    );
    expect(Object.keys(uploading)).not.toContain('sessionUrl');
    expect(uploading.purpose).toBe(FileUploadPurpose.ACADEMIC_CONTENT);
    objects.set(uploading.finalObjectKey, pdf);
    const actualVerifier = new AcademicContentFileVerifier(storage);
    jest.spyOn(verifier, 'verify').mockImplementation(async (session) => {
      if (session.id === readyIntent.uploadId) {
        const verifying = await prisma.fileUploadSession.findUniqueOrThrow({
          where: { id: session.id },
        });
        expect(verifying.status).toBe(FileUploadSessionStatus.VERIFYING);
      }
      return actualVerifier.verify(session);
    });
    const finalized = await asManager(() =>
      complete.execute({
        contentId: ids.content,
        uploadId: readyIntent.uploadId,
      }),
    );
    const ready = await prisma.fileUploadSession.findUniqueOrThrow({
      where: { id: readyIntent.uploadId },
    });
    expect(ready.status).toBe(FileUploadSessionStatus.READY);
    expect(ready.fileId).toBe(finalized.file.id);
    expect(ready.checksumSha256).toBeNull();
    expect(ready.verificationVersion).toBe(
      ACADEMIC_CONTENT_VERIFICATION_VERSION,
    );
    expect(ready.finalCleanupEligibleAt).toBeInstanceOf(Date);
    expect(ready.finalCleanupEligibleAt!.getTime()).toBeGreaterThanOrEqual(
      ready.completedAt!.getTime(),
    );
    expect(finalized.file.visibility).toBe(FileVisibility.PRIVATE);
    expect(finalized.asset.fileId).toBe(finalized.file.id);

    const cancelledIntent = await createIntent();
    const cancelled = await asManager(() =>
      cancel.execute({
        contentId: ids.content,
        uploadId: cancelledIntent.uploadId,
      }),
    );
    expect(cancelled.status).toBe(FileUploadSessionStatus.CANCELLED);
    expect(cancelled.finalCleanupEligibleAt).toEqual(
      cancelledIntent.capabilityExpiresAt,
    );
    const beforeCancelledCapabilityExpiry = new Date(
      cancelledIntent.capabilityExpiresAt.getTime() - 1,
    );
    expect(
      (
        await repository.cleanupCandidates(
          beforeCancelledCapabilityExpiry,
          beforeCancelledCapabilityExpiry,
        )
      ).some((row) => row.id === cancelledIntent.uploadId),
    ).toBe(false);
    expect(
      (
        await repository.cleanupCandidates(
          cancelledIntent.capabilityExpiresAt,
          cancelledIntent.capabilityExpiresAt,
        )
      ).some((row) => row.id === cancelledIntent.uploadId),
    ).toBe(true);

    const expiredIntent = await createIntent();
    const afterApplicationExpiry = new Date(Date.now() + 25 * 60 * 60 * 1_000);
    await repository.expireAbandoned(afterApplicationExpiry);
    const expired = await prisma.fileUploadSession.findUniqueOrThrow({
      where: { id: expiredIntent.uploadId },
    });
    expect(expired.status).toBe(FileUploadSessionStatus.EXPIRED);
    expect(expired.finalCleanupEligibleAt).toEqual(
      expiredIntent.capabilityExpiresAt,
    );
    expect(
      (
        await repository.cleanupCandidates(
          afterApplicationExpiry,
          afterApplicationExpiry,
        )
      ).some((row) => row.id === expiredIntent.uploadId),
    ).toBe(false);

    const createdAt = new Date(Date.now() - 25 * 60 * 60 * 1_000);
    const createdId = randomUUID();
    await prisma.fileUploadSession.create({
      data: {
        id: createdId,
        organizationId: ids.organization,
        schoolId: ids.school,
        createdByUserId: ids.user,
        clientRequestId: randomUUID(),
        purpose: FileUploadPurpose.ACADEMIC_CONTENT,
        purposeContextId: ids.content,
        originalName: 'resource.pdf',
        expectedMimeType: 'application/pdf',
        expectedSizeBytes: BigInt(pdf.length),
        finalBucket: bucket,
        finalObjectKey: `academic-content/${ids.school}/objects/${createdId}`,
        status: FileUploadSessionStatus.CREATED,
        createdAt,
        expiresAt: new Date(createdAt.getTime() + 24 * 60 * 60 * 1_000),
      },
    });
    const discoveryNow = new Date();
    await repository.expireAbandoned(discoveryNow);
    const createdExpired = await prisma.fileUploadSession.findUniqueOrThrow({
      where: { id: createdId },
    });
    expect(createdExpired.status).toBe(FileUploadSessionStatus.EXPIRED);
    expect(createdExpired.finalCleanupEligibleAt).toEqual(discoveryNow);

    const malformedUploadingId = randomUUID();
    await prisma.fileUploadSession.create({
      data: {
        id: malformedUploadingId,
        organizationId: ids.organization,
        schoolId: ids.school,
        createdByUserId: ids.user,
        clientRequestId: randomUUID(),
        purpose: FileUploadPurpose.ACADEMIC_CONTENT,
        purposeContextId: ids.content,
        originalName: 'resource.pdf',
        expectedMimeType: 'application/pdf',
        expectedSizeBytes: BigInt(pdf.length),
        finalBucket: bucket,
        finalObjectKey: `academic-content/${ids.school}/objects/${malformedUploadingId}`,
        status: FileUploadSessionStatus.UPLOADING,
        createdAt,
        expiresAt: new Date(createdAt.getTime() + 24 * 60 * 60 * 1_000),
      },
    });
    await repository.expireAbandoned(discoveryNow);
    const malformedExpired = await prisma.fileUploadSession.findUniqueOrThrow({
      where: { id: malformedUploadingId },
    });
    expect(malformedExpired.status).toBe(FileUploadSessionStatus.EXPIRED);
    expect(malformedExpired.finalCleanupEligibleAt).toEqual(
      new Date(discoveryNow.getTime() + 7 * 24 * 60 * 60 * 1_000),
    );

    const missingIntent = await createIntent();
    await expect(
      asManager(() =>
        complete.execute({
          contentId: ids.content,
          uploadId: missingIntent.uploadId,
        }),
      ),
    ).rejects.toMatchObject({ code: 'academic_content.file.object_missing' });
    const missing = await prisma.fileUploadSession.findUniqueOrThrow({
      where: { id: missingIntent.uploadId },
    });
    expect(missing.status).toBe(FileUploadSessionStatus.FAILED);
    expect(missing.finalCleanupEligibleAt).toEqual(
      missingIntent.capabilityExpiresAt,
    );

    const failedIntent = await createIntent();
    const failedSession = await prisma.fileUploadSession.findUniqueOrThrow({
      where: { id: failedIntent.uploadId },
    });
    objects.set(failedSession.finalObjectKey, Buffer.alloc(pdf.length, 0));
    await expect(
      asManager(() =>
        complete.execute({
          contentId: ids.content,
          uploadId: failedIntent.uploadId,
        }),
      ),
    ).rejects.toMatchObject({
      code: 'academic_content.file.mime_signature_mismatch',
    });
    const failed = await prisma.fileUploadSession.findUniqueOrThrow({
      where: { id: failedIntent.uploadId },
    });
    expect(failed.status).toBe(FileUploadSessionStatus.FAILED);
    expect(failed.finalCleanupEligibleAt!.getTime()).toBeLessThan(
      failedIntent.capabilityExpiresAt.getTime(),
    );
    await cleanup.cleanUpload(failed.id);
    const cleanedFailed = await prisma.fileUploadSession.findUniqueOrThrow({
      where: { id: failed.id },
    });
    expect(cleanedFailed.finalCleanupClaimedAt).toBeInstanceOf(Date);
    expect(cleanedFailed.finalObjectDeletedAt).toBeInstanceOf(Date);
    expect(objects.has(failedSession.finalObjectKey)).toBe(false);

    await asManager(() =>
      unlink.execute({ contentId: ids.content, assetId: finalized.asset.id }),
    );
    const orphan = await prisma.fileUploadSession.findUniqueOrThrow({
      where: { id: readyIntent.uploadId },
    });
    expect(orphan.finalCleanupEligibleAt!.getTime()).toBeGreaterThan(
      Date.now(),
    );
    // Advance only the persisted deadline to exercise the DB transition
    // without waiting seven wall-clock days or weakening the production policy.
    await prisma.fileUploadSession.update({
      where: { id: readyIntent.uploadId },
      data: { finalCleanupEligibleAt: new Date() },
    });
    await cleanup.cleanUpload(readyIntent.uploadId);
    const purged = await prisma.fileUploadSession.findUniqueOrThrow({
      where: { id: readyIntent.uploadId },
    });
    const deletedFile = await prisma.file.findUniqueOrThrow({
      where: { id: finalized.file.id },
    });
    expect(purged.status).toBe(FileUploadSessionStatus.PURGED);
    expect(purged.finalCleanupClaimedAt).toBeInstanceOf(Date);
    expect(purged.finalObjectDeletedAt).toBeInstanceOf(Date);
    expect(deletedFile.deletedAt).toBeInstanceOf(Date);
    expect(objects.has(uploading.finalObjectKey)).toBe(false);

    process.stdout.write(
      'ACC_3C_LIFECYCLE_EVIDENCE_JSON={"createdToUploading":1,"uploadingToVerifying":1,"verifyingToReady":1,"readyToPurged":1,"terminalCleanupEvidence":1}\n',
    );
  });

  it('rejects a real READY replay after content soft-delete without exposing File or Asset', async () => {
    const intent = await createIntent();
    const session = await prisma.fileUploadSession.findUniqueOrThrow({
      where: { id: intent.uploadId },
    });
    objects.set(session.finalObjectKey, pdf);
    const command = { contentId: ids.content, uploadId: intent.uploadId };
    const finalized = await asManager(() => complete.execute(command));
    expect(await asManager(() => complete.execute(command))).toEqual(finalized);

    await prisma.academicContent.update({
      where: { id: ids.content },
      data: { deletedAt: new Date() },
    });
    try {
      const rejection: unknown = await asManager(() =>
        complete.execute(command),
      ).then(
        () => null,
        (error: unknown) => error,
      );
      expect(rejection).toMatchObject({
        code: 'academic_content.file.ready_relationship_invalid',
      });
      expect(rejection).not.toHaveProperty('file');
      expect(rejection).not.toHaveProperty('asset');
      const unchanged = await prisma.fileUploadSession.findUniqueOrThrow({
        where: { id: intent.uploadId },
      });
      expect(unchanged.status).toBe(FileUploadSessionStatus.READY);
      expect(unchanged.fileId).toBe(finalized.file.id);
    } finally {
      await prisma.academicContent.update({
        where: { id: ids.content },
        data: { deletedAt: null },
      });
    }
  });
});
