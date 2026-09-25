import { randomUUID } from 'node:crypto';
import {
  AcademicContentAudienceType as Audience,
  AcademicContentStatus as Status,
  AcademicContentTargetScopeType as Scope,
  AcademicContentType as ContentType,
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
import { AcademicContentLifecycleUseCases } from '../../src/modules/academics/academic-content/application/academic-content-lifecycle.use-cases';
import {
  CancelAcademicContentUploadUseCase,
  CompleteAcademicContentUploadUseCase,
  CreateAcademicContentUploadUseCase,
  UnlinkAcademicContentAssetUseCase,
} from '../../src/modules/academics/academic-content/files/application/academic-content-upload.use-cases';
import { AcademicContentFileRepository } from '../../src/modules/academics/academic-content/files/infrastructure/academic-content-file.repository';
import { AcademicContentRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content.repository';
import { AcademicContentTargetRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-target.repository';
import { normalizeAcademicContentTargets } from '../../src/modules/academics/academic-content/domain/academic-content-target.policy';

const databaseUrl = process.env.DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase('ACC-4A real PostgreSQL lifecycle and aggregate races', () => {
  jest.setTimeout(120_000);
  const prisma = new PrismaService({
    datasources: {
      db: {
        url: databaseUrl ?? 'postgresql://unused:unused@127.0.0.1:1/unused',
      },
    },
  });
  const contents = new AcademicContentRepository(prisma);
  const lifecycle = new AcademicContentLifecycleUseCases(contents);
  const targets = new AcademicContentTargetRepository(prisma);
  const files = new AcademicContentFileRepository(prisma);
  const unlink = new UnlinkAcademicContentAssetUseCase(files);
  const cancel = new CancelAcademicContentUploadUseCase(files);
  const ids: Record<string, string> = {};
  const tag = randomUUID().slice(0, 8);

  function asManager<T>(action: () => Promise<T>): Promise<T> {
    return runWithRequestContext(createRequestContext(), () => {
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

  async function createContent() {
    return contents.create({
      schoolId: ids.school,
      organizationId: ids.organization,
      academicYearId: ids.year,
      termId: ids.term,
      type: ContentType.GENERAL_RESOURCE,
      audience: Audience.STUDENTS,
      title: 'Resource',
      description: null,
      status: Status.DRAFT,
      createdByUserId: ids.user,
    });
  }

  beforeAll(async () => {
    await prisma.$connect();
    ids.organization = (
      await prisma.organization.create({
        data: { name: `ACC4A ${tag}`, slug: `acc4a-${tag}` },
      })
    ).id;
    ids.school = (
      await prisma.school.create({
        data: {
          organizationId: ids.organization,
          name: `ACC4A ${tag}`,
          slug: `acc4a-${tag}`,
        },
      })
    ).id;
    ids.user = (
      await prisma.user.create({
        data: {
          email: `acc4a-${tag}@example.test`,
          firstName: 'ACC',
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
  });

  afterAll(async () => {
    if (ids.school) {
      await prisma.academicContentAsset.deleteMany({
        where: { schoolId: ids.school },
      });
      await prisma.fileUploadSession.deleteMany({
        where: { schoolId: ids.school },
      });
      await prisma.file.deleteMany({ where: { schoolId: ids.school } });
      await prisma.academicContentTarget.deleteMany({
        where: { schoolId: ids.school },
      });
      await prisma.auditLog.deleteMany({ where: { schoolId: ids.school } });
      await prisma.academicContent.deleteMany({
        where: { schoolId: ids.school },
      });
      await prisma.term.deleteMany({ where: { schoolId: ids.school } });
      await prisma.academicYear.deleteMany({ where: { schoolId: ids.school } });
      await prisma.school.delete({ where: { id: ids.school } });
      await prisma.user.delete({ where: { id: ids.user } });
      await prisma.organization.delete({ where: { id: ids.organization } });
    }
    await prisma.$disconnect();
  });

  it('enforces the archive CHECK and atomic lifecycle audit', async () => {
    const content = await createContent();
    expect(content.status).toBe(Status.DRAFT);
    await targets.replace({
      content,
      targets: normalizeAcademicContentTargets(
        ContentType.GENERAL_RESOURCE,
        UserType.SCHOOL_USER,
        [{ scopeType: Scope.SCHOOL }],
      ),
      actorId: ids.user,
    });
    const file = await prisma.file.create({
      data: {
        organizationId: ids.organization,
        schoolId: ids.school,
        uploaderId: ids.user,
        bucket: 'acc4a-test',
        objectKey: `acc4a/${randomUUID()}`,
        originalName: 'resource.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 12n,
        visibility: FileVisibility.PRIVATE,
      },
    });
    await prisma.academicContentAsset.create({
      data: {
        schoolId: ids.school,
        academicContentId: content.id,
        fileId: file.id,
        createdByUserId: ids.user,
      },
    });
    await expect(
      prisma.academicContent.update({
        where: { id: content.id },
        data: { status: Status.ARCHIVED },
      }),
    ).rejects.toThrow();
    const archived = await asManager(() => lifecycle.archive(content.id));
    expect(archived.status).toBe(Status.ARCHIVED);
    expect(archived.archivedAt).toBeInstanceOf(Date);
    expect(archived.deletedAt).toBeNull();
    expect(
      await prisma.academicContentTarget.count({
        where: { academicContentId: content.id },
      }),
    ).toBe(1);
    expect(
      await prisma.academicContentAsset.count({
        where: { academicContentId: content.id, deletedAt: null },
      }),
    ).toBe(1);
    await expect(
      asManager(() => lifecycle.update(content.id, { title: 'Blocked' })),
    ).rejects.toMatchObject({ code: 'academic_content.status.read_only' });
    await expect(
      asManager(() => lifecycle.delete(content.id)),
    ).rejects.toMatchObject({ code: 'academic_content.status.read_only' });
    await expect(
      prisma.academicContent.update({
        where: { id: content.id },
        data: { status: Status.DRAFT },
      }),
    ).rejects.toThrow();
    await expect(
      asManager(() => lifecycle.archive(content.id)),
    ).rejects.toMatchObject({ code: 'academic_content.status.read_only' });
    const restored = await asManager(() => lifecycle.restore(content.id));
    expect(restored.status).toBe(Status.DRAFT);
    expect(restored.archivedAt).toBeNull();
    const updated = await asManager(() =>
      lifecycle.update(content.id, {
        title: '  Revised  ',
        audience: Audience.GUARDIANS,
      }),
    );
    expect(updated.title).toBe('Revised');
    expect(updated.updatedByUserId).toBe(ids.user);
    const deleted = await asManager(() => lifecycle.delete(content.id));
    expect(deleted.deletedAt).toBeInstanceOf(Date);
    const audit = await prisma.auditLog.findMany({
      where: { resourceType: 'academic_content', resourceId: content.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(audit.map((row) => row.action)).toEqual([
      'academics.academic_content.create',
      'academics.academic_content.archive',
      'academics.academic_content.restore',
      'academics.academic_content.update',
      'academics.academic_content.delete',
    ]);
  });

  it('serializes archive and target replacement, then blocks post-archive replacement', async () => {
    const content = await createContent();
    const replacement = normalizeAcademicContentTargets(
      ContentType.GENERAL_RESOURCE,
      UserType.SCHOOL_USER,
      [{ scopeType: Scope.SCHOOL }],
    );
    const results = await Promise.allSettled([
      asManager(() => lifecycle.archive(content.id)),
      targets.replace({ content, targets: replacement, actorId: ids.user }),
    ]);
    expect(results[0].status).toBe('fulfilled');
    const stored = await prisma.academicContent.findUniqueOrThrow({
      where: { id: content.id },
    });
    expect(stored.status).toBe(Status.ARCHIVED);
    if (results[1].status === 'rejected')
      expect(
        await prisma.academicContentTarget.count({
          where: { academicContentId: content.id },
        }),
      ).toBe(0);
    await expect(
      targets.replace({ content, targets: replacement, actorId: ids.user }),
    ).rejects.toMatchObject({ code: 'academic_content.status.read_only' });
  });

  it('archives during upload verification and creates no File or Asset', async () => {
    const content = await createContent();
    const uploadId = randomUUID();
    const session = (
      await files.createOrFindRequest({
        id: uploadId,
        organizationId: ids.organization,
        schoolId: ids.school,
        createdByUserId: ids.user,
        clientRequestId: randomUUID(),
        purposeContextId: content.id,
        originalName: 'resource.pdf',
        expectedMimeType: 'application/pdf',
        expectedSizeBytes: 12n,
        finalBucket: 'acc4a-test',
        finalObjectKey: `academic-content/${ids.school}/objects/${uploadId}`,
        expiresAt: new Date(Date.now() + 86_400_000),
      })
    ).session;
    await files.persistCapabilityExpiry(
      {
        uploadId,
        contentId: content.id,
        schoolId: ids.school,
        actorId: ids.user,
      },
      new Date(Date.now() + 86_400_000),
    );
    let signalVerification!: () => void;
    let releaseVerification!: () => void;
    const verifying = new Promise<void>((resolve) => {
      signalVerification = resolve;
    });
    const release = new Promise<void>((resolve) => {
      releaseVerification = resolve;
    });
    const verifier = {
      verify: async () => {
        signalVerification();
        await release;
        return { mimeType: 'application/pdf', sizeBytes: 12n };
      },
    };
    const complete = new CompleteAcademicContentUploadUseCase(
      files,
      verifier as never,
    );
    const beforeFiles = await prisma.file.count({
      where: { schoolId: ids.school },
    });
    const beforeAssets = await prisma.academicContentAsset.count({
      where: { schoolId: ids.school },
    });
    const finishing = asManager(() =>
      complete.execute({ contentId: content.id, uploadId }),
    );
    await verifying;
    await asManager(() => lifecycle.archive(content.id));
    releaseVerification();
    await expect(finishing).rejects.toMatchObject({
      code: 'academic_content.status.read_only',
    });
    expect(await prisma.file.count({ where: { schoolId: ids.school } })).toBe(
      beforeFiles,
    );
    expect(
      await prisma.academicContentAsset.count({
        where: { schoolId: ids.school },
      }),
    ).toBe(beforeAssets);
    const failed = await prisma.fileUploadSession.findUniqueOrThrow({
      where: { id: session.id },
    });
    expect(failed.status).toBe('FAILED');
    expect(failed.finalCleanupEligibleAt).toBeInstanceOf(Date);
  });

  it('permits unfinished upload cancellation after archive and idempotent READY replay', async () => {
    const content = await createContent();
    const makeSession = async () => {
      const uploadId = randomUUID();
      await files.createOrFindRequest({
        id: uploadId,
        organizationId: ids.organization,
        schoolId: ids.school,
        createdByUserId: ids.user,
        clientRequestId: randomUUID(),
        purposeContextId: content.id,
        originalName: 'resource.pdf',
        expectedMimeType: 'application/pdf',
        expectedSizeBytes: 12n,
        finalBucket: 'acc4a-test',
        finalObjectKey: `academic-content/${ids.school}/objects/${uploadId}`,
        expiresAt: new Date(Date.now() + 86_400_000),
      });
      await files.persistCapabilityExpiry(
        {
          uploadId,
          contentId: content.id,
          schoolId: ids.school,
          actorId: ids.user,
        },
        new Date(Date.now() + 86_400_000),
      );
      return uploadId;
    };
    const readyUploadId = await makeSession();
    const cancelUploadId = await makeSession();
    const verifier = {
      verify: jest
        .fn()
        .mockResolvedValue({ mimeType: 'application/pdf', sizeBytes: 12n }),
    };
    const complete = new CompleteAcademicContentUploadUseCase(
      files,
      verifier as never,
    );
    const command = { contentId: content.id, uploadId: readyUploadId };
    const ready = await asManager(() => complete.execute(command));
    await asManager(() => lifecycle.archive(content.id));
    const replay = await asManager(() => complete.execute(command));
    expect(replay.file.id).toBe(ready.file.id);
    expect(replay.asset.id).toBe(ready.asset.id);
    expect(verifier.verify).toHaveBeenCalledTimes(1);
    expect(
      await prisma.academicContentAsset.count({
        where: { academicContentId: content.id, deletedAt: null },
      }),
    ).toBe(1);
    const cancelled = await asManager(() =>
      cancel.execute({ contentId: content.id, uploadId: cancelUploadId }),
    );
    expect(cancelled.status).toBe('CANCELLED');
  });

  it('serializes archive and asset unlink, preserving archived assets after archive', async () => {
    const content = await createContent();
    const file = await prisma.file.create({
      data: {
        organizationId: ids.organization,
        schoolId: ids.school,
        uploaderId: ids.user,
        bucket: 'acc4a-test',
        objectKey: `acc4a/${randomUUID()}`,
        originalName: 'resource.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 12n,
        visibility: FileVisibility.PRIVATE,
      },
    });
    const asset = await prisma.academicContentAsset.create({
      data: {
        schoolId: ids.school,
        academicContentId: content.id,
        fileId: file.id,
        createdByUserId: ids.user,
      },
    });
    const results = await Promise.allSettled([
      asManager(() => lifecycle.archive(content.id)),
      asManager(() =>
        unlink.execute({ contentId: content.id, assetId: asset.id }),
      ),
    ]);
    expect(results[0].status).toBe('fulfilled');
    expect(
      (
        await prisma.academicContent.findUniqueOrThrow({
          where: { id: content.id },
        })
      ).status,
    ).toBe(Status.ARCHIVED);
    const stored = await prisma.academicContentAsset.findUniqueOrThrow({
      where: { id: asset.id },
    });
    if (results[1].status === 'rejected') expect(stored.deletedAt).toBeNull();
    await expect(
      asManager(() =>
        unlink.execute({ contentId: content.id, assetId: asset.id }),
      ),
    ).rejects.toMatchObject({ code: 'academic_content.status.read_only' });
  });

  it('allows restrictive archive after term closure but blocks ordinary authoring and restore', async () => {
    const archivedCandidate = await createContent();
    const draftCandidate = await createContent();
    const oldEnd = (
      await prisma.term.findUniqueOrThrow({ where: { id: ids.term } })
    ).endDate;
    await prisma.term.update({
      where: { id: ids.term },
      data: { endDate: new Date(Date.now() - 86_400_000), isActive: true },
    });
    try {
      expect(
        (await asManager(() => lifecycle.archive(archivedCandidate.id))).status,
      ).toBe(Status.ARCHIVED);
      await expect(
        asManager(() => lifecycle.restore(archivedCandidate.id)),
      ).rejects.toMatchObject({ code: 'academic_content.term.closed' });
      await expect(
        asManager(() =>
          lifecycle.update(draftCandidate.id, { title: 'Revised' }),
        ),
      ).rejects.toMatchObject({ code: 'academic_content.term.closed' });
      await expect(
        asManager(() => lifecycle.delete(draftCandidate.id)),
      ).rejects.toMatchObject({ code: 'academic_content.term.closed' });
      await expect(
        targets.replace({
          content: draftCandidate,
          targets: [],
          actorId: ids.user,
        }),
      ).rejects.toMatchObject({ code: 'academic_content.term.closed' });
      const file = await prisma.file.create({
        data: {
          organizationId: ids.organization,
          schoolId: ids.school,
          uploaderId: ids.user,
          bucket: 'acc4a-test',
          objectKey: `acc4a/${randomUUID()}`,
          originalName: 'resource.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 12n,
          visibility: FileVisibility.PRIVATE,
        },
      });
      const asset = await prisma.academicContentAsset.create({
        data: {
          schoolId: ids.school,
          academicContentId: draftCandidate.id,
          fileId: file.id,
          createdByUserId: ids.user,
        },
      });
      await expect(
        asManager(() =>
          unlink.execute({ contentId: draftCandidate.id, assetId: asset.id }),
        ),
      ).rejects.toMatchObject({ code: 'academic_content.term.closed' });
      expect(
        (
          await prisma.academicContentAsset.findUniqueOrThrow({
            where: { id: asset.id },
          })
        ).deletedAt,
      ).toBeNull();
      const provider = { createResumableUploadSession: jest.fn() };
      const createUpload = new CreateAcademicContentUploadUseCase(
        files,
        {} as never,
        provider as never,
      );
      await expect(
        asManager(() =>
          createUpload.execute({
            contentId: draftCandidate.id,
            clientRequestId: randomUUID(),
            originalName: 'resource.pdf',
            expectedMimeType: 'application/pdf',
            expectedSizeBytes: '12',
          }),
        ),
      ).rejects.toMatchObject({ code: 'academic_content.term.closed' });
      expect(provider.createResumableUploadSession).not.toHaveBeenCalled();
    } finally {
      await prisma.term.update({
        where: { id: ids.term },
        data: { endDate: oldEnd },
      });
    }
  });
});
