import { randomUUID } from 'node:crypto';
import {
  AcademicContentAudienceType,
  AcademicContentType,
  FileUploadPurpose,
  FileUploadSessionStatus,
  Prisma,
  PrismaClient,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../src/common/context/request-context';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { AcademicContentFileRepository } from '../../src/modules/academics/academic-content/files/infrastructure/academic-content-file.repository';
import { AcademicContentCleanupWorker } from '../../src/modules/academics/academic-content/files/infrastructure/academic-content-cleanup.worker';

describe('ACC-3A purpose-safe Files database foundation', () => {
  const prisma = new PrismaService();
  const scoped = prisma.scoped as unknown as PrismaClient;
  const ids: Record<string, string> = {};
  const tag = randomUUID().slice(0, 8);
  const gib10 = 10_737_418_240n;

  beforeAll(async () => {
    await prisma.$connect();
    for (const suffix of ['a', 'b']) {
      ids[`org${suffix}`] = (
        await prisma.organization.create({
          data: {
            name: `ACC3A ${tag} ${suffix}`,
            slug: `acc3a-${tag}-${suffix}`,
          },
        })
      ).id;
      ids[`school${suffix}`] = (
        await prisma.school.create({
          data: {
            organizationId: ids[`org${suffix}`],
            name: `ACC3A ${tag} ${suffix}`,
            slug: `acc3a-${tag}-${suffix}`,
          },
        })
      ).id;
      ids[`user${suffix}`] = (
        await prisma.user.create({
          data: {
            email: `acc3a-${tag}-${suffix}@example.test`,
            firstName: 'ACC3A',
            lastName: suffix,
            userType: UserType.SCHOOL_USER,
          },
        })
      ).id;
      ids[`year${suffix}`] = (
        await prisma.academicYear.create({
          data: {
            schoolId: ids[`school${suffix}`],
            nameAr: `سنة ${tag} ${suffix}`,
            nameEn: `Year ${tag} ${suffix}`,
            startDate: new Date('2026-09-01'),
            endDate: new Date('2027-06-30'),
          },
        })
      ).id;
      ids[`term${suffix}`] = (
        await prisma.term.create({
          data: {
            schoolId: ids[`school${suffix}`],
            academicYearId: ids[`year${suffix}`],
            nameAr: `فصل ${tag} ${suffix}`,
            nameEn: `Term ${tag} ${suffix}`,
            startDate: new Date('2026-09-01'),
            endDate: new Date('2026-12-31'),
          },
        })
      ).id;
      ids[`content${suffix}`] = (
        await prisma.academicContent.create({
          data: {
            schoolId: ids[`school${suffix}`],
            academicYearId: ids[`year${suffix}`],
            termId: ids[`term${suffix}`],
            type: AcademicContentType.GENERAL_RESOURCE,
            audience: AcademicContentAudienceType.STUDENTS,
            title: 'Resource',
            createdByUserId: ids[`user${suffix}`],
          },
        })
      ).id;
      ids[`file${suffix}`] = (
        await prisma.file.create({
          data: {
            organizationId: ids[`org${suffix}`],
            schoolId: ids[`school${suffix}`],
            uploaderId: ids[`user${suffix}`],
            bucket: 'acc3a-test',
            objectKey: `acc3a/${tag}/${suffix}/${randomUUID()}`,
            originalName: 'resource.pdf',
            mimeType: 'application/pdf',
            sizeBytes: 1024n,
          },
        })
      ).id;
    }
  });

  afterAll(async () => {
    try {
      const schoolIds = [ids.schoola, ids.schoolb].filter(Boolean);
      if (schoolIds.length) {
        await prisma.academicContentAsset.deleteMany({
          where: { schoolId: { in: schoolIds } },
        });
        await prisma.academicContentFilePolicy.deleteMany({
          where: { schoolId: { in: schoolIds } },
        });
        await prisma.fileUploadSession.deleteMany({
          where: { schoolId: { in: schoolIds } },
        });
        await prisma.academicContent.deleteMany({
          where: { schoolId: { in: schoolIds } },
        });
        await prisma.file.deleteMany({
          where: { schoolId: { in: schoolIds } },
        });
        await prisma.term.deleteMany({
          where: { schoolId: { in: schoolIds } },
        });
        await prisma.academicYear.deleteMany({
          where: { schoolId: { in: schoolIds } },
        });
        await prisma.school.deleteMany({ where: { id: { in: schoolIds } } });
      }
      const userIds = [ids.usera, ids.userb].filter(Boolean);
      if (userIds.length)
        await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      const orgIds = [ids.orga, ids.orgb].filter(Boolean);
      if (orgIds.length)
        await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
    } finally {
      await prisma.$disconnect();
    }
  });

  function asSchool<T>(
    schoolId: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    return runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: ids.usera, userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: randomUUID(),
        organizationId: ids.orga,
        schoolId,
        roleId: randomUUID(),
        permissions: [],
      });
      return await operation();
    });
  }

  it('enforces same-school asset FKs, active uniqueness, relinking, scope, and soft deletion', async () => {
    const data = {
      schoolId: ids.schoola,
      academicContentId: ids.contenta,
      fileId: ids.filea,
      createdByUserId: ids.usera,
      sortOrder: 0,
    };
    const first = await prisma.academicContentAsset.create({ data });
    await expect(
      prisma.academicContentAsset.create({ data }),
    ).rejects.toMatchObject({
      code: 'P2002',
    });
    await expect(
      prisma.academicContentAsset.create({
        data: { ...data, fileId: ids.fileb },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(
      prisma.academicContentAsset.create({
        data: { ...data, academicContentId: ids.contentb },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    expect(
      await asSchool(ids.schoola, () => scoped.academicContentAsset.count()),
    ).toBe(1);
    expect(
      await asSchool(ids.schoolb, () => scoped.academicContentAsset.count()),
    ).toBe(0);
    await prisma.academicContentAsset.update({
      where: { id: first.id },
      data: { deletedAt: new Date() },
    });
    expect(
      await asSchool(ids.schoola, () => scoped.academicContentAsset.count()),
    ).toBe(0);
    const relinked = await prisma.academicContentAsset.create({ data });
    expect(relinked.id).not.toBe(first.id);
    expect(await prisma.academicContentAsset.count({ where: data })).toBe(2);
  });

  it('keeps policy optional, one-per-school, scoped, and BIGINT-bounded', async () => {
    const data = {
      schoolId: ids.schoola,
      attachmentsEnabled: true,
      maximumFileSizeBytes: gib10,
      documentsEnabled: true,
      imagesEnabled: true,
      videosEnabled: true,
      audioEnabled: true,
      archivesEnabled: true,
      otherFilesEnabled: false,
      allowStudentDownload: true,
      allowGuardianDownload: false,
      allowInlinePreview: true,
    };
    expect(await prisma.academicContentFilePolicy.count()).toBe(0);
    const policy = await prisma.academicContentFilePolicy.create({ data });
    expect(policy.maximumFileSizeBytes).toBe(gib10);
    await expect(
      prisma.academicContentFilePolicy.create({ data }),
    ).rejects.toMatchObject({
      code: 'P2002',
    });
    expect(
      await asSchool(ids.schoola, () =>
        scoped.academicContentFilePolicy.count(),
      ),
    ).toBe(1);
    expect(
      await asSchool(ids.schoolb, () =>
        scoped.academicContentFilePolicy.count(),
      ),
    ).toBe(0);
    expect(
      await prisma.academicContentFilePolicy.count({
        where: { schoolId: ids.schoolb },
      }),
    ).toBe(0);
    for (const maximumFileSizeBytes of [0n, -1n, gib10 + 1n]) {
      await expect(
        prisma.academicContentFilePolicy.create({
          data: { ...data, schoolId: ids.schoolb, maximumFileSizeBytes },
        }),
      ).rejects.toThrow(/violates check constraint/);
    }
  });

  function accSession(expectedSizeBytes: bigint) {
    const createdAt = new Date('2026-09-23T00:00:00.000Z');
    return {
      organizationId: ids.orga,
      schoolId: ids.schoola,
      createdByUserId: ids.usera,
      clientRequestId: randomUUID(),
      purpose: FileUploadPurpose.ACADEMIC_CONTENT,
      purposeContextId: ids.contenta,
      originalName: 'resource.zip',
      expectedMimeType: 'application/zip',
      expectedSizeBytes,
      finalBucket: 'acc3a-test',
      finalObjectKey: `acc3a/${tag}/session/${randomUUID()}`,
      status: FileUploadSessionStatus.CREATED,
      createdAt,
      expiresAt: new Date(createdAt.getTime() + 60 * 60 * 1000),
    };
  }

  function terminalSession(suffix: 'a' | 'b', claimedAt: Date | null) {
    const now = claimedAt ?? new Date();
    return {
      ...accSession(1024n),
      organizationId: ids[`org${suffix}`],
      schoolId: ids[`school${suffix}`],
      createdByUserId: ids[`user${suffix}`],
      purposeContextId: ids[`content${suffix}`],
      status: FileUploadSessionStatus.FAILED,
      failedAt: now,
      failureReason: 'cleanup-test',
      finalCleanupEligibleAt: now,
      finalCleanupClaimedAt: claimedAt,
    };
  }

  it('retains tenant, parent Content and exact claim identity at the terminal release write', async () => {
    const repository = new AcademicContentFileRepository(prisma);
    const claimedAt = new Date();
    const upload = await prisma.fileUploadSession.create({
      data: terminalSession('a', claimedAt),
    });
    const foreign = await prisma.fileUploadSession.create({
      data: terminalSession('b', claimedAt),
    });
    const identity = {
      uploadId: upload.id,
      schoolId: ids.schoola,
      contentId: ids.contenta,
      claimedAt,
    };
    for (const wrongIdentity of [
      { ...identity, schoolId: ids.schoolb },
      { ...identity, contentId: ids.contentb },
      { ...identity, claimedAt: new Date(claimedAt.getTime() - 1) },
      { ...identity, uploadId: foreign.id },
    ]) {
      await repository.releaseTerminalCleanupClaim(wrongIdentity);
      expect(
        await prisma.fileUploadSession.findUniqueOrThrow({
          where: { id: upload.id },
        }),
      ).toEqual(upload);
      expect(
        await prisma.fileUploadSession.findUniqueOrThrow({
          where: { id: foreign.id },
        }),
      ).toEqual(foreign);
    }
    await repository.releaseTerminalCleanupClaim(identity);
    expect(
      await prisma.fileUploadSession.findUniqueOrThrow({
        where: { id: upload.id },
      }),
    ).toMatchObject({
      finalCleanupClaimedAt: null,
      finalObjectDeletedAt: null,
    });
    expect(
      await prisma.fileUploadSession.findUniqueOrThrow({
        where: { id: foreign.id },
      }),
    ).toEqual(foreign);
  });

  it('preserves a newer worker claim and completed deletion evidence during stale release', async () => {
    const repository = new AcademicContentFileRepository(prisma);
    const oldClaim = new Date(Date.now() - 20 * 60_000);
    const newerClaim = new Date();
    const upload = await prisma.fileUploadSession.create({
      data: terminalSession('a', newerClaim),
    });
    const identity = {
      uploadId: upload.id,
      schoolId: ids.schoola,
      contentId: ids.contenta,
      claimedAt: oldClaim,
    };
    await repository.releaseTerminalCleanupClaim(identity);
    expect(
      await prisma.fileUploadSession.findUniqueOrThrow({
        where: { id: upload.id },
      }),
    ).toEqual(upload);
    const deleted = await prisma.fileUploadSession.update({
      where: { id: upload.id },
      data: { finalObjectDeletedAt: new Date() },
    });
    await repository.releaseTerminalCleanupClaim({
      ...identity,
      claimedAt: newerClaim,
    });
    expect(
      await prisma.fileUploadSession.findUniqueOrThrow({
        where: { id: upload.id },
      }),
    ).toEqual(deleted);
  });

  it('releases a failed provider deletion claim and retries the same session without mutating another School', async () => {
    const repository = new AcademicContentFileRepository(prisma);
    const upload = await prisma.fileUploadSession.create({
      data: terminalSession('a', null),
    });
    const foreign = await prisma.fileUploadSession.create({
      data: terminalSession('b', null),
    });
    const failure = new Error('provider deletion failed');
    const storage = {
      deleteObjectAndConfirmAbsent: jest
        .fn()
        .mockRejectedValueOnce(failure)
        .mockResolvedValueOnce(undefined),
    };
    const worker = new AcademicContentCleanupWorker(
      {} as never,
      repository,
      storage as never,
    );
    const now = new Date();
    await expect(worker.cleanUpload(upload.id, now)).rejects.toBe(failure);
    const released = await prisma.fileUploadSession.findUniqueOrThrow({
      where: { id: upload.id },
    });
    expect(released).toMatchObject({
      schoolId: upload.schoolId,
      purposeContextId: upload.purposeContextId,
      status: FileUploadSessionStatus.FAILED,
      finalCleanupClaimedAt: null,
      finalObjectDeletedAt: null,
    });
    const retryAt = new Date(now.getTime() + 1);
    await worker.cleanUpload(upload.id, retryAt);
    const cleaned = await prisma.fileUploadSession.findUniqueOrThrow({
      where: { id: upload.id },
    });
    expect(cleaned).toMatchObject({
      schoolId: upload.schoolId,
      purposeContextId: upload.purposeContextId,
      status: FileUploadSessionStatus.FAILED,
      finalCleanupClaimedAt: retryAt,
    });
    expect(cleaned.finalObjectDeletedAt).toBeInstanceOf(Date);
    expect(storage.deleteObjectAndConfirmAbsent).toHaveBeenCalledTimes(2);
    expect(storage.deleteObjectAndConfirmAbsent).toHaveBeenNthCalledWith(1, {
      bucket: upload.finalBucket,
      objectKey: upload.finalObjectKey,
    });
    expect(storage.deleteObjectAndConfirmAbsent).toHaveBeenNthCalledWith(2, {
      bucket: upload.finalBucket,
      objectKey: upload.finalObjectKey,
    });
    expect(
      await prisma.fileUploadSession.findUniqueOrThrow({
        where: { id: foreign.id },
      }),
    ).toEqual(foreign);
  });

  it('enforces School, parent Content and ACC purpose at the actual upload and asset final predicates', async () => {
    const uploadSelectors: Prisma.FileUploadSessionWhereUniqueInput[] = [];
    const assetSelectors: Prisma.AcademicContentAssetWhereUniqueInput[] = [];
    const client = prisma.$extends({
      query: {
        fileUploadSession: {
          async update({ args, query }) {
            uploadSelectors.push(args.where);
            return query(args);
          },
        },
        academicContentAsset: {
          async update({ args, query }) {
            assetSelectors.push(args.where);
            return query(args);
          },
        },
      },
    }) as unknown as PrismaService;
    const repository = new AcademicContentFileRepository(client);
    const upload = await prisma.fileUploadSession.create({
      data: accSession(1024n),
    });
    const file = await prisma.file.create({
      data: {
        organizationId: ids.orga,
        schoolId: ids.schoola,
        uploaderId: ids.usera,
        bucket: 'acc3a-test',
        objectKey: `acc6f/${tag}/${randomUUID()}`,
        originalName: 'resource.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024n,
      },
    });
    const asset = await prisma.academicContentAsset.create({
      data: {
        schoolId: ids.schoola,
        academicContentId: ids.contenta,
        fileId: file.id,
        createdByUserId: ids.usera,
        sortOrder: 0,
      },
    });
    const otherContent = await prisma.academicContent.create({
      data: {
        schoolId: ids.schoola,
        academicYearId: ids.yeara,
        termId: ids.terma,
        type: AcademicContentType.GENERAL_RESOURCE,
        audience: AcademicContentAudienceType.STUDENTS,
        title: 'Other parent',
        createdByUserId: ids.usera,
      },
    });
    const otherUpload = await prisma.fileUploadSession.create({
      data: { ...accSession(1024n), purposeContextId: otherContent.id },
    });
    const otherAsset = await prisma.academicContentAsset.create({
      data: {
        schoolId: ids.schoola,
        academicContentId: otherContent.id,
        fileId: file.id,
        createdByUserId: ids.usera,
        sortOrder: 0,
      },
    });
    const uploadIdentity = {
      uploadId: upload.id,
      schoolId: ids.schoola,
      contentId: ids.contenta,
    };
    const assetIdentity = {
      assetId: asset.id,
      schoolId: ids.schoola,
      contentId: ids.contenta,
    };
    const deletedAt = new Date();
    const changes = {
      status: FileUploadSessionStatus.CANCELLED,
      cancelledAt: deletedAt,
      finalCleanupEligibleAt: deletedAt,
    };
    for (const identity of [
      { ...uploadIdentity, schoolId: ids.schoolb },
      { ...uploadIdentity, contentId: otherContent.id },
      { ...uploadIdentity, uploadId: otherUpload.id },
    ]) {
      await expect(
        repository.withTransaction((tx) => tx.updateUpload(identity, changes)),
      ).rejects.toMatchObject({ code: 'P2025' });
      expect(uploadSelectors.at(-1)).toEqual({
        id: identity.uploadId,
        schoolId: identity.schoolId,
        purpose: FileUploadPurpose.ACADEMIC_CONTENT,
        purposeContextId: identity.contentId,
      });
    }
    for (const identity of [
      { ...assetIdentity, schoolId: ids.schoolb },
      { ...assetIdentity, contentId: otherContent.id },
      { ...assetIdentity, assetId: otherAsset.id },
    ]) {
      await expect(
        repository.withTransaction((tx) =>
          tx.softDeleteAsset(identity, deletedAt),
        ),
      ).rejects.toMatchObject({ code: 'P2025' });
      expect(assetSelectors.at(-1)).toEqual({
        id: identity.assetId,
        schoolId: identity.schoolId,
        academicContentId: identity.contentId,
      });
    }
    expect(
      await prisma.fileUploadSession.findUniqueOrThrow({
        where: { id: upload.id },
      }),
    ).toEqual(upload);
    expect(
      await prisma.academicContentAsset.findUniqueOrThrow({
        where: { id: asset.id },
      }),
    ).toEqual(asset);
    const otherPurpose = await prisma.fileUploadSession.create({
      data: lessonSession(),
    });
    await expect(
      repository.withTransaction((tx) =>
        tx.updateUpload(
          { ...uploadIdentity, uploadId: otherPurpose.id },
          changes,
        ),
      ),
    ).rejects.toMatchObject({ code: 'P2025' });
    await expect(
      repository.withTransaction((tx) =>
        tx.updateUpload(uploadIdentity, changes),
      ),
    ).resolves.toMatchObject({ finalCleanupEligibleAt: deletedAt });
    await expect(
      repository.withTransaction((tx) =>
        tx.softDeleteAsset(assetIdentity, deletedAt),
      ),
    ).resolves.toMatchObject({ deletedAt });
    expect(uploadSelectors.at(-1)).toEqual({
      id: upload.id,
      schoolId: ids.schoola,
      purpose: FileUploadPurpose.ACADEMIC_CONTENT,
      purposeContextId: ids.contenta,
    });
    expect(assetSelectors.at(-1)).toEqual({
      id: asset.id,
      schoolId: ids.schoola,
      academicContentId: ids.contenta,
    });
    expect(
      await prisma.fileUploadSession.findUniqueOrThrow({
        where: { id: otherUpload.id },
      }),
    ).toEqual(otherUpload);
    expect(
      await prisma.fileUploadSession.findUniqueOrThrow({
        where: { id: otherPurpose.id },
      }),
    ).toEqual(otherPurpose);
    expect(
      await prisma.academicContentAsset.findUniqueOrThrow({
        where: { id: otherAsset.id },
      }),
    ).toEqual(otherAsset);
  });

  it('binds ACC purpose context, supports large direct-final upload metadata, and caps at 10 GiB', async () => {
    await expect(
      prisma.fileUploadSession.create({
        data: { ...accSession(300n * 1024n * 1024n), purposeContextId: null },
      }),
    ).rejects.toThrow(/violates check constraint/);
    await expect(
      prisma.fileUploadSession.create({ data: accSession(gib10 + 1n) }),
    ).rejects.toThrow(/violates check constraint/);
    const large = await prisma.fileUploadSession.create({
      data: accSession(300n * 1024n * 1024n),
    });
    expect(large.stagingObjectKey).toBeNull();
    expect(large.expectedSizeBytes).toBe(300n * 1024n * 1024n);
    const atLimit = await prisma.fileUploadSession.create({
      data: accSession(gib10),
    });
    expect(atLimit.expectedSizeBytes).toBe(gib10);
  });

  it('allows ACC READY without SHA-256 or ffprobe while rejecting cross-purpose states', async () => {
    const metadata = accSession(1024n);
    const readyData = {
      ...metadata,
      expectedMimeType: 'application/pdf',
      finalObjectKey: `acc3a/${tag}/a/${ids.filea}`,
      status: FileUploadSessionStatus.READY,
      fileId: ids.filea,
      completedAt: new Date('2026-09-23T00:30:00.000Z'),
      verifiedMimeType: 'application/pdf',
      actualSizeBytes: 1024n,
      verifiedAt: new Date('2026-09-23T00:30:00.000Z'),
      verificationVersion: 'academic-content-bounded-v1',
    };
    await expect(
      prisma.fileUploadSession.create({
        data: { ...readyData, verificationVersion: null },
      }),
    ).rejects.toThrow(/violates check constraint/);
    const ready = await prisma.fileUploadSession.create({
      data: readyData,
    });
    expect(ready.checksumSha256).toBeNull();
    expect(ready.durationSeconds).toBeNull();
    await expect(
      prisma.fileUploadSession.create({
        data: {
          ...accSession(1024n),
          verificationVersion: 'ffprobe-5.1.9-debian12-learning-media-v1',
        },
      }),
    ).rejects.toThrow(/violates check constraint/);
    await expect(
      prisma.fileUploadSession.create({
        data: { ...lessonSession(), purposeContextId: ids.contenta },
      }),
    ).rejects.toThrow(/violates check constraint/);
  });

  function lessonSession() {
    const createdAt = new Date('2026-09-23T00:00:00.000Z');
    return {
      organizationId: ids.orga,
      schoolId: ids.schoola,
      createdByUserId: ids.usera,
      clientRequestId: randomUUID(),
      purpose: FileUploadPurpose.LESSON_CONTENT,
      originalName: 'lesson.mp4',
      expectedMimeType: 'video/mp4',
      expectedSizeBytes: 1024n,
      stagingBucket: 'acc3a-test',
      stagingObjectKey: `lesson/${tag}/staging/${randomUUID()}`,
      finalBucket: 'acc3a-test',
      finalObjectKey: `lesson/${tag}/final/${randomUUID()}`,
      status: FileUploadSessionStatus.CREATED,
      createdAt,
      expiresAt: new Date(createdAt.getTime() + 2 * 60 * 60 * 1000),
    };
  }

  it('preserves representative Learning Media database rejections', async () => {
    const invalid = [
      { expectedMimeType: 'application/zip' },
      { expectedMimeType: 'application/pdf', expectedSizeBytes: 10_485_761n },
      { expectedSizeBytes: 209_715_201n },
      { checksumSha256: 'invalid' },
      { status: FileUploadSessionStatus.READY },
      { status: FileUploadSessionStatus.UPLOADING },
    ];
    for (const changes of invalid) {
      await expect(
        prisma.fileUploadSession.create({
          data: { ...lessonSession(), ...changes },
        }),
      ).rejects.toThrow(/violates check constraint/);
    }
    const completedAt = new Date('2026-09-23T00:30:00.000Z');
    const legacyFile = await prisma.file.create({
      data: {
        organizationId: ids.orga,
        schoolId: ids.schoola,
        uploaderId: ids.usera,
        bucket: 'acc3a-test',
        objectKey: `acc3a/${tag}/lesson/${randomUUID()}`,
        originalName: 'lesson.mp4',
        mimeType: 'video/mp4',
        sizeBytes: 1024n,
      },
    });
    const readyData = {
      ...lessonSession(),
      status: FileUploadSessionStatus.READY,
      latestUploadUrlExpiresAt: new Date('2026-09-23T00:15:00.000Z'),
      fileId: legacyFile.id,
      completedAt,
      stagingCleanupEligibleAt: completedAt,
      finalCleanupEligibleAt: new Date(
        completedAt.getTime() + 7 * 24 * 60 * 60 * 1000,
      ),
      verifiedMimeType: 'video/mp4',
      actualSizeBytes: 1024n,
      checksumSha256: 'a'.repeat(64),
      durationSeconds: 1,
      width: 320,
      height: 180,
      verifiedAt: completedAt,
      verificationVersion: 'ffprobe-5.1.9-debian12-learning-media-v1',
    };
    await expect(
      prisma.fileUploadSession.create({
        data: { ...readyData, checksumSha256: null },
      }),
    ).rejects.toThrow(/violates check constraint/);
    await expect(
      prisma.fileUploadSession.create({
        data: {
          ...readyData,
          verificationVersion: 'academic-content-bounded-v1',
        },
      }),
    ).rejects.toThrow(/violates check constraint/);
    const validReady = await prisma.fileUploadSession.create({
      data: readyData,
    });
    expect(validReady.status).toBe(FileUploadSessionStatus.READY);
  });
});
