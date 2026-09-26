import { randomUUID } from 'node:crypto';
import {
  AcademicContentAudienceType as Audience,
  AcademicContentStatus as Status,
  AcademicContentTargetScopeType as TargetScope,
  AcademicContentType as ContentType,
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
import { BullmqService } from '../../src/infrastructure/queue/bullmq.service';
import { StorageService } from '../../src/infrastructure/storage/storage.service';
import { AcademicContentLifecycleUseCases } from '../../src/modules/academics/academic-content/application/academic-content-lifecycle.use-cases';
import {
  CaptureAcademicContentRevisionUseCase,
  GetAcademicContentRevisionUseCase,
  ListAcademicContentRevisionsUseCase,
} from '../../src/modules/academics/academic-content/application/academic-content-revision.use-cases';
import {
  ReplaceAcademicContentLinksUseCase,
  ReplaceAcademicContentTagsUseCase,
} from '../../src/modules/academics/academic-content/application/replace-academic-content-links-tags.use-cases';
import { UnlinkAcademicContentAssetUseCase } from '../../src/modules/academics/academic-content/files/application/academic-content-upload.use-cases';
import { AcademicContentCleanupWorker } from '../../src/modules/academics/academic-content/files/infrastructure/academic-content-cleanup.worker';
import { AcademicContentFileRepository } from '../../src/modules/academics/academic-content/files/infrastructure/academic-content-file.repository';
import { AcademicContentLinksTagsRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-links-tags.repository';
import { AcademicContentRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content.repository';
import { AcademicContentRevisionRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-revision.repository';
import { AcademicContentTargetRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-target.repository';
import {
  presentAcademicContentDetail,
  presentAcademicContentRevisionDetail,
} from '../../src/modules/academics/academic-content/presenters/academic-content.presenter';

const databaseUrl = process.env.DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase('ACC-4C PostgreSQL snapshot and retention boundary', () => {
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
  const replacements = new AcademicContentLinksTagsRepository(prisma);
  const replaceLinks = new ReplaceAcademicContentLinksUseCase(replacements);
  const replaceTags = new ReplaceAcademicContentTagsUseCase(replacements);
  const revisions = new AcademicContentRevisionRepository(prisma);
  const targets = new AcademicContentTargetRepository(prisma);
  const capture = new CaptureAcademicContentRevisionUseCase(revisions);
  const list = new ListAcademicContentRevisionsUseCase(revisions);
  const detail = new GetAcademicContentRevisionUseCase(revisions);
  const files = new AcademicContentFileRepository(prisma);
  const unlink = new UnlinkAcademicContentAssetUseCase(files);
  const ids: Record<string, string> = {};
  const tag = randomUUID().slice(0, 8);
  // The term and every injected command time are derived from one controlled clock.
  const controlledNow = new Date();

  function asActor<T>(
    action: () => Promise<T>,
    options: {
      schoolId?: string;
      organizationId?: string;
      userType?: UserType;
      permissions?: string[];
    } = {},
  ): Promise<T> {
    return runWithRequestContext(createRequestContext(), () => {
      setActor({
        id: ids.user,
        userType: options.userType ?? UserType.SCHOOL_USER,
      });
      setActiveMembership({
        membershipId: randomUUID(),
        schoolId: options.schoolId ?? ids.school,
        organizationId: options.organizationId ?? ids.organization,
        roleId: randomUUID(),
        permissions: options.permissions ?? [
          'academics.academic_content.view',
          'academics.academic_content.manage',
        ],
      });
      return Promise.resolve().then(action);
    });
  }

  function trusted(
    contentId: string,
    schoolId = ids.school,
    organizationId = ids.organization,
  ) {
    return { contentId, schoolId, organizationId, actorId: ids.user };
  }

  async function createContent(title = 'Resource') {
    return contents.create({
      schoolId: ids.school,
      organizationId: ids.organization,
      academicYearId: ids.year,
      termId: ids.term,
      type: ContentType.GENERAL_RESOURCE,
      audience: Audience.STUDENTS,
      title,
      description: 'Initial description',
      status: Status.DRAFT,
      createdByUserId: ids.user,
    });
  }

  beforeAll(async () => {
    await prisma.$connect();
    ids.organization = (
      await prisma.organization.create({
        data: { name: `ACC4C ${tag}`, slug: `acc4c-${tag}` },
      })
    ).id;
    ids.otherOrganization = (
      await prisma.organization.create({
        data: { name: `ACC4C Other ${tag}`, slug: `acc4c-other-${tag}` },
      })
    ).id;
    ids.school = (
      await prisma.school.create({
        data: {
          organizationId: ids.organization,
          name: `ACC4C ${tag}`,
          slug: `acc4c-${tag}`,
        },
      })
    ).id;
    ids.otherSchool = (
      await prisma.school.create({
        data: {
          organizationId: ids.otherOrganization,
          name: `ACC4C Other ${tag}`,
          slug: `acc4c-other-${tag}`,
        },
      })
    ).id;
    ids.user = (
      await prisma.user.create({
        data: {
          email: `acc4c-${tag}@example.test`,
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
          startDate: new Date(controlledNow.getTime() - 30 * 86_400_000),
          endDate: new Date(controlledNow.getTime() + 365 * 86_400_000),
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
          startDate: new Date(controlledNow.getTime() - 30 * 86_400_000),
          endDate: new Date(controlledNow.getTime() + 365 * 86_400_000),
          isActive: true,
        },
      })
    ).id;
  });

  afterAll(async () => {
    if (ids.school) {
      await prisma.academicContentRevisionTarget.deleteMany({
        where: { schoolId: ids.school },
      });
      await prisma.academicContentRevisionAsset.deleteMany({
        where: { schoolId: ids.school },
      });
      await prisma.academicContentRevisionLink.deleteMany({
        where: { schoolId: ids.school },
      });
      await prisma.academicContentRevisionTag.deleteMany({
        where: { schoolId: ids.school },
      });
      await prisma.academicContentRevision.deleteMany({
        where: { schoolId: ids.school },
      });
      await prisma.academicContentLink.deleteMany({
        where: { schoolId: ids.school },
      });
      await prisma.academicContentTag.deleteMany({
        where: { schoolId: ids.school },
      });
      await prisma.academicContentTarget.deleteMany({
        where: { schoolId: ids.school },
      });
      await prisma.academicContentAsset.deleteMany({
        where: { schoolId: ids.school },
      });
      await prisma.fileUploadSession.deleteMany({
        where: { schoolId: ids.school },
      });
      await prisma.file.deleteMany({ where: { schoolId: ids.school } });
      await prisma.auditLog.deleteMany({ where: { schoolId: ids.school } });
      await prisma.academicContent.deleteMany({
        where: { schoolId: ids.school },
      });
      await prisma.term.deleteMany({ where: { schoolId: ids.school } });
      await prisma.academicYear.deleteMany({ where: { schoolId: ids.school } });
      await prisma.school.deleteMany({
        where: { id: { in: [ids.school, ids.otherSchool] } },
      });
      await prisma.user.deleteMany({ where: { id: ids.user } });
      await prisma.organization.deleteMany({
        where: { id: { in: [ids.organization, ids.otherOrganization] } },
      });
    }
    await prisma.$disconnect();
  });

  it('replaces ordered sets, audits effective changes, validates scope, and snapshots immutable truth', async () => {
    const content = await createContent();
    const file = await prisma.file.create({
      data: {
        organizationId: ids.organization,
        schoolId: ids.school,
        uploaderId: ids.user,
        bucket: 'acc4c-test',
        objectKey: `acc4c/${randomUUID()}`,
        originalName: 'resource.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 10_000_000_000n,
        visibility: FileVisibility.PRIVATE,
      },
    });
    const asset = await prisma.academicContentAsset.create({
      data: {
        schoolId: ids.school,
        academicContentId: content.id,
        fileId: file.id,
        createdByUserId: ids.user,
        sortOrder: 7,
      },
    });
    await prisma.academicContentTarget.create({
      data: {
        schoolId: ids.school,
        academicContentId: content.id,
        scopeType: TargetScope.SCHOOL,
        identityFingerprint: 'school',
        createdByUserId: ids.user,
      },
    });
    const linkInput = [
      { label: 'First', url: 'https://example.test/one' },
      { label: 'Second', url: 'http://example.test/two' },
    ];
    const tagInput = [
      { value: '  Ａｌｇｅｂｒａ  ' },
      { value: ' Science   Lab ' },
    ];
    const links = await asActor(() =>
      replaceLinks.execute(content.id, linkInput, controlledNow),
    );
    const tags = await asActor(() =>
      replaceTags.execute(content.id, tagInput, controlledNow),
    );
    expect(links.map((item) => item.sortOrder)).toEqual([0, 1]);
    expect(tags.map((item) => item.displayValue)).toEqual([
      'Algebra',
      'Science Lab',
    ]);
    expect(tags.map((item) => item.normalizedValue)).toEqual([
      'algebra',
      'science lab',
    ]);
    const sameLinks = await asActor(() =>
      replaceLinks.execute(content.id, linkInput, controlledNow),
    );
    const sameTags = await asActor(() =>
      replaceTags.execute(content.id, tagInput, controlledNow),
    );
    expect(sameLinks.map((item) => item.id)).toEqual(
      links.map((item) => item.id),
    );
    expect(sameTags.map((item) => item.id)).toEqual(
      tags.map((item) => item.id),
    );
    for (const action of ['links', 'tags']) {
      expect(
        await prisma.auditLog.count({
          where: {
            schoolId: ids.school,
            resourceId: content.id,
            action: `academics.academic_content.${action}.replace`,
          },
        }),
      ).toBe(1);
    }
    const linkAudit = await prisma.auditLog.findFirstOrThrow({
      where: {
        resourceId: content.id,
        action: 'academics.academic_content.links.replace',
      },
    });
    expect(linkAudit.before).toEqual([]);
    expect(linkAudit.after).toEqual([
      { label: 'First', url: linkInput[0].url, sortOrder: 0 },
      { label: 'Second', url: linkInput[1].url, sortOrder: 1 },
    ]);
    const tagAudit = await prisma.auditLog.findFirstOrThrow({
      where: {
        resourceId: content.id,
        action: 'academics.academic_content.tags.replace',
      },
    });
    expect(tagAudit.before).toEqual([]);
    expect(tagAudit.after).toEqual([
      { displayValue: 'Algebra', normalizedValue: 'algebra', sortOrder: 0 },
      {
        displayValue: 'Science Lab',
        normalizedValue: 'science lab',
        sortOrder: 1,
      },
    ]);
    await expect(
      asActor(() =>
        replaceLinks.execute(
          content.id,
          [{ label: 'x', url: 'javascript:alert(1)' }],
          controlledNow,
        ),
      ),
    ).rejects.toThrow();
    await expect(
      asActor(() =>
        replaceTags.execute(
          content.id,
          [{ value: 'Math' }, { value: 'ｍａｔｈ' }],
          controlledNow,
        ),
      ),
    ).rejects.toThrow();
    await expect(
      asActor(() => replaceLinks.execute(content.id, [], controlledNow), {
        schoolId: ids.otherSchool,
        organizationId: ids.otherOrganization,
      }),
    ).rejects.toMatchObject({ httpStatus: 404 });
    await expect(
      asActor(() => replaceTags.execute(content.id, [], controlledNow), {
        permissions: ['academics.academic_content.view'],
      }),
    ).rejects.toMatchObject({ httpStatus: 403 });
    const current = await contents.findManagementDetail(content.id, ids.school);
    expect(current).not.toBeNull();
    const safeCurrent = presentAcademicContentDetail(current!);
    expect(safeCurrent.assets[0]).toMatchObject({
      fileId: file.id,
      sortOrder: 7,
      sizeBytes: '10000000000',
    });
    expect(safeCurrent.links.map((item) => item.sortOrder)).toEqual([0, 1]);
    expect(JSON.stringify(safeCurrent)).not.toMatch(
      /normalizedValue|schoolId|bucket|objectKey/,
    );

    const first = await capture.execute(trusted(content.id), controlledNow);
    expect(first).toMatchObject({
      revisionNumber: 1,
      snapshotContractVersion: 1,
      title: 'Resource',
    });
    expect(first.targets).toHaveLength(1);
    expect(first.assets[0]).toMatchObject({ fileId: file.id, sortOrder: 7 });
    expect(first.links.map((item) => item.url)).toEqual(
      linkInput.map((item) => item.url),
    );
    expect(first.tags.map((item) => item.normalizedValue)).toEqual([
      'algebra',
      'science lab',
    ]);
    const concurrent = await Promise.all([
      capture.execute(trusted(content.id), controlledNow),
      capture.execute(trusted(content.id), controlledNow),
    ]);
    expect(concurrent.map((item) => item.revisionNumber).sort()).toEqual([
      2, 3,
    ]);
    expect(
      await prisma.academicContentRevision.count({
        where: { schoolId: ids.school, academicContentId: content.id },
      }),
    ).toBe(3);
    await expect(
      capture.execute(
        { ...trusted(content.id), organizationId: randomUUID() },
        controlledNow,
      ),
    ).rejects.toThrow();
    expect(
      await prisma.academicContentRevision.count({
        where: { schoolId: ids.school, academicContentId: content.id },
      }),
    ).toBe(3);
    await targets.replace({ content, targets: [], actorId: ids.user });
    expect(
      await prisma.academicContentTarget.count({
        where: { academicContentId: content.id },
      }),
    ).toBe(0);
    await asActor(() =>
      lifecycle.update(content.id, { title: 'Changed' }, controlledNow),
    );
    await asActor(() =>
      replaceLinks.execute(
        content.id,
        [{ label: 'New', url: 'https://example.test/new' }],
        controlledNow,
      ),
    );
    await asActor(() =>
      replaceTags.execute(content.id, [{ value: 'History' }], controlledNow),
    );
    const old = await asActor(() => detail.execute(content.id, first.id));
    expect(old.title).toBe('Resource');
    expect(old.targets).toHaveLength(1);
    expect(old.links.map((item) => item.url)).toEqual(
      linkInput.map((item) => item.url),
    );
    expect(old.tags.map((item) => item.displayValue)).toEqual([
      'Algebra',
      'Science Lab',
    ]);
    expect(presentAcademicContentRevisionDetail(old).assets[0].sizeBytes).toBe(
      '10000000000',
    );
    expect(
      await prisma.academicContentRevision.count({
        where: { schoolId: ids.school, academicContentId: content.id },
      }),
    ).toBe(3);
    expect(
      JSON.stringify(presentAcademicContentRevisionDetail(old)),
    ).not.toMatch(/bucket|objectKey|normalizedValue|schoolId|createdByUserId/);
    const history = await asActor(() =>
      list.execute(content.id, { page: 1, limit: 2 }),
    );
    expect(history).toMatchObject({ total: 3, page: 1, limit: 2 });
    expect(history.items.map((item) => item.revisionNumber)).toEqual([3, 2]);
    await expect(
      asActor(() => detail.execute(content.id, first.id), {
        schoolId: ids.otherSchool,
        organizationId: ids.otherOrganization,
      }),
    ).rejects.toMatchObject({ httpStatus: 404 });
    await expect(
      capture.execute(
        trusted(content.id, ids.otherSchool, ids.otherOrganization),
        controlledNow,
      ),
    ).rejects.toMatchObject({ httpStatus: 404 });
    await expect(
      asActor(() => list.execute(content.id, {}), {
        userType: UserType.TEACHER,
      }),
    ).rejects.toMatchObject({ httpStatus: 403 });
    await expect(
      asActor(() => lifecycle.delete(content.id, controlledNow)),
    ).rejects.toMatchObject({ code: 'academic_content.revision_history' });
    expect(
      (
        await prisma.academicContent.findUniqueOrThrow({
          where: { id: content.id },
        })
      ).deletedAt,
    ).toBeNull();

    const completedAt = new Date(controlledNow.getTime() - 10 * 86_400_000);
    const upload = await prisma.fileUploadSession.create({
      data: {
        organizationId: ids.organization,
        schoolId: ids.school,
        createdByUserId: ids.user,
        clientRequestId: randomUUID(),
        purpose: FileUploadPurpose.ACADEMIC_CONTENT,
        purposeContextId: content.id,
        originalName: 'resource.pdf',
        expectedMimeType: 'application/pdf',
        expectedSizeBytes: file.sizeBytes,
        finalBucket: 'acc4c-test',
        finalObjectKey: `acc4c/${randomUUID()}`,
        status: FileUploadSessionStatus.READY,
        expiresAt: new Date(controlledNow.getTime() + 86_400_000),
        fileId: file.id,
        completedAt,
        verifiedMimeType: 'application/pdf',
        actualSizeBytes: file.sizeBytes,
        verifiedAt: completedAt,
        verificationVersion: 'academic-content-bounded-v1',
        finalCleanupEligibleAt: new Date(
          completedAt.getTime() + 7 * 86_400_000,
        ),
      },
    });
    await asActor(() =>
      unlink.execute({ contentId: content.id, assetId: asset.id }),
    );
    expect(
      await files.withTransaction((tx) =>
        tx.countAcademicContentFileReferences(file.id, ids.school),
      ),
    ).toBe(3);
    const candidates = await files.cleanupCandidates(
      controlledNow,
      new Date(controlledNow.getTime() - 86_400_000),
    );
    expect(candidates.map((item) => item.id)).not.toContain(upload.id);
    const deleteObject = jest.fn().mockResolvedValue(undefined);
    const worker = new AcademicContentCleanupWorker(
      {} as BullmqService,
      files,
      {
        deleteObjectAndConfirmAbsent: deleteObject,
      } as unknown as StorageService,
    );
    await worker.cleanUpload(upload.id, controlledNow);
    expect(deleteObject).not.toHaveBeenCalled();
    expect(
      (await prisma.file.findUniqueOrThrow({ where: { id: file.id } }))
        .deletedAt,
    ).toBeNull();
    expect(
      (
        await prisma.fileUploadSession.findUniqueOrThrow({
          where: { id: upload.id },
        })
      ).status,
    ).toBe(FileUploadSessionStatus.READY);
    const nextFile = await prisma.file.create({
      data: {
        organizationId: ids.organization,
        schoolId: ids.school,
        uploaderId: ids.user,
        bucket: 'acc4c-test',
        objectKey: `acc4c/${randomUUID()}`,
        originalName: 'next.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 12n,
        visibility: FileVisibility.PRIVATE,
      },
    });
    const nextAsset = await files.withTransaction(async (tx) => {
      await tx.lockMutableContent(content.id, ids.school, controlledNow);
      return tx.createAsset({
        schoolId: ids.school,
        academicContentId: content.id,
        fileId: nextFile.id,
        createdByUserId: ids.user,
      });
    });
    expect(nextAsset.sortOrder).toBe(0);
    expect(
      (
        await prisma.academicContentRevisionAsset.findFirstOrThrow({
          where: { revisionId: first.id },
        })
      ).fileId,
    ).toBe(file.id);
  });

  it('serializes archive with link and tag replacement and denies post-archive mutation', async () => {
    for (const kind of ['links', 'tags'] as const) {
      const content = await createContent(`Race ${kind}`);
      const replacement =
        kind === 'links'
          ? () =>
              replaceLinks.execute(
                content.id,
                [{ label: 'Race', url: 'https://example.test/race' }],
                controlledNow,
              )
          : () =>
              replaceTags.execute(
                content.id,
                [{ value: 'Race' }],
                controlledNow,
              );
      const outcome = await Promise.allSettled([
        asActor(() => lifecycle.archive(content.id, controlledNow)),
        asActor(replacement),
      ]);
      expect(outcome[0].status).toBe('fulfilled');
      const after = await prisma.academicContent.findUniqueOrThrow({
        where: { id: content.id },
      });
      expect(after.status).toBe(Status.ARCHIVED);
      if (outcome[1].status === 'rejected') {
        const count =
          kind === 'links'
            ? await prisma.academicContentLink.count({
                where: { academicContentId: content.id },
              })
            : await prisma.academicContentTag.count({
                where: { academicContentId: content.id },
              });
        expect(count).toBe(0);
      } else {
        const audit = await prisma.auditLog.findFirstOrThrow({
          where: {
            resourceId: content.id,
            action: `academics.academic_content.${kind}.replace`,
          },
        });
        const archiveAudit = await prisma.auditLog.findFirstOrThrow({
          where: {
            resourceId: content.id,
            action: 'academics.academic_content.archive',
          },
        });
        expect(audit.createdAt.getTime()).toBeLessThanOrEqual(
          archiveAudit.createdAt.getTime(),
        );
      }
      await expect(asActor(replacement)).rejects.toMatchObject({
        code: 'academic_content.status.read_only',
      });
      await expect(
        asActor(() => lifecycle.delete(content.id, controlledNow)),
      ).rejects.toMatchObject({ code: 'academic_content.status.read_only' });
    }
  });

  it('rejects link and tag replacement for a historically closed draft', async () => {
    const closedTerm = await prisma.term.create({
      data: {
        schoolId: ids.school,
        academicYearId: ids.year,
        nameAr: `مغلق ${tag}`,
        nameEn: `Closed ${tag}`,
        startDate: new Date(controlledNow.getTime() - 30 * 86_400_000),
        endDate: new Date(controlledNow.getTime() - 86_400_000),
        isActive: true,
      },
    });
    const content = await contents.create({
      schoolId: ids.school,
      organizationId: ids.organization,
      academicYearId: ids.year,
      termId: closedTerm.id,
      type: ContentType.GENERAL_RESOURCE,
      audience: Audience.STUDENTS,
      title: 'Closed draft',
      description: null,
      status: Status.DRAFT,
      createdByUserId: ids.user,
    });
    await expect(
      asActor(() =>
        replaceLinks.execute(
          content.id,
          [{ label: 'L', url: 'https://example.test' }],
          controlledNow,
        ),
      ),
    ).rejects.toMatchObject({ code: 'academic_content.term.closed' });
    await expect(
      asActor(() =>
        replaceTags.execute(content.id, [{ value: 'Tag' }], controlledNow),
      ),
    ).rejects.toMatchObject({ code: 'academic_content.term.closed' });
    expect(
      await prisma.academicContentLink.count({
        where: { academicContentId: content.id },
      }),
    ).toBe(0);
    expect(
      await prisma.academicContentTag.count({
        where: { academicContentId: content.id },
      }),
    ).toBe(0);
  });

  it('allows deleting a draft without revision history', async () => {
    const content = await createContent('No history');
    await asActor(() => lifecycle.delete(content.id, controlledNow));
    expect(
      (
        await prisma.academicContent.findUniqueOrThrow({
          where: { id: content.id },
        })
      ).deletedAt,
    ).not.toBeNull();
  });
});
