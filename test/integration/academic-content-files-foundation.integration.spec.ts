import { randomUUID } from 'node:crypto';
import {
  AcademicContentAudienceType,
  AcademicContentType,
  FileUploadPurpose,
  FileUploadSessionStatus,
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
