import { randomUUID } from 'node:crypto';
import {
  AcademicContentAudienceType,
  AcademicContentStatus,
  AcademicContentType,
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
import type { BullmqService } from '../../src/infrastructure/queue/bullmq.service';
import { AcademicContentFilePolicyResolver } from '../../src/modules/academics/academic-content/files/application/academic-content-file-policy.resolver';
import { AcademicContentFileVerifier } from '../../src/modules/academics/academic-content/files/application/academic-content-file-verifier';
import {
  CompleteAcademicContentUploadUseCase,
  CreateAcademicContentUploadUseCase,
  UnlinkAcademicContentAssetUseCase,
} from '../../src/modules/academics/academic-content/files/application/academic-content-upload.use-cases';
import { AcademicContentCleanupWorker } from '../../src/modules/academics/academic-content/files/infrastructure/academic-content-cleanup.worker';
import { AcademicContentFileRepository } from '../../src/modules/academics/academic-content/files/infrastructure/academic-content-file.repository';
import { AttachmentsRepository } from '../../src/modules/files/attachments/infrastructure/attachments.repository';
import { hasRetainedFileReferences } from '../../src/modules/files/shared/infrastructure/file-lifetime.repository';

function barrier() {
  let release = () => {};
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

describe('G13 shared File lifetime integrity on PostgreSQL', () => {
  jest.setTimeout(120_000);
  const prisma = new PrismaService();
  const ids: Record<string, string> = {};
  const tag = randomUUID().slice(0, 8);
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n');
  const objects = new Map<string, Buffer>();
  let beforeDelete: (() => Promise<void>) | undefined;
  const deleteObject = jest.fn(async (input: { objectKey: string }) => {
    if (beforeDelete) await beforeDelete();
    objects.delete(input.objectKey);
  });
  const storage = new StorageService(
    {
      getCapabilities: () => ({ resumableUpload: true, rangeRead: true }),
      createResumableUploadSession: (input: { objectKey: string }) =>
        Promise.resolve({
          sessionUrl: `https://provider.invalid/resumable/${input.objectKey}`,
          expiresAt: new Date(Date.now() + 7 * 86_400_000),
        }),
      statObject: (input: { objectKey: string }) => {
        const body = objects.get(input.objectKey);
        return body
          ? Promise.resolve({
              size: body.length,
              contentType: 'application/pdf',
              metadata: {},
              etag: null,
              lastModified: null,
              generation: null,
              version: null,
            })
          : Promise.reject(new ObjectStorageError('not_found'));
      },
      readObjectRange: (input: {
        objectKey: string;
        offset: number;
        length: number;
      }) => {
        const body = objects.get(input.objectKey);
        return body
          ? Promise.resolve(
              body.subarray(input.offset, input.offset + input.length),
            )
          : Promise.reject(new ObjectStorageError('not_found'));
      },
      objectExists: (input: { objectKey: string }) =>
        Promise.resolve(objects.has(input.objectKey)),
      deleteObject,
    } as unknown as ObjectStoragePort,
    {
      resolveBucket: () => `acc9fr4-${tag}`,
    } as unknown as SignedUrlService,
  );
  const repository = new AcademicContentFileRepository(prisma);
  const create = new CreateAcademicContentUploadUseCase(
    repository,
    new AcademicContentFilePolicyResolver(repository),
    storage,
  );
  const complete = new CompleteAcademicContentUploadUseCase(
    repository,
    new AcademicContentFileVerifier(storage),
  );
  const unlink = new UnlinkAcademicContentAssetUseCase(repository);
  const cleanup = new AcademicContentCleanupWorker(
    {} as BullmqService,
    repository,
    storage,
  );
  const attachments = new AttachmentsRepository(prisma);

  function asManager<T>(action: () => Promise<T>) {
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

  async function readyFile(keepAsset = false) {
    const intent = await asManager(() =>
      create.execute({
        contentId: ids.content,
        clientRequestId: randomUUID(),
        originalName: 'resource.pdf',
        expectedMimeType: 'application/pdf',
        expectedSizeBytes: String(pdf.length),
      }),
    );
    const uploading = await prisma.fileUploadSession.findUniqueOrThrow({
      where: { id: intent.uploadId },
    });
    objects.set(uploading.finalObjectKey, pdf);
    const result = await asManager(() =>
      complete.execute({ contentId: ids.content, uploadId: intent.uploadId }),
    );
    if (!keepAsset)
      await asManager(() =>
        unlink.execute({ contentId: ids.content, assetId: result.asset.id }),
      );
    // Advance only this fixture's persisted deadline, as in the accepted ACC
    // lifecycle test; cleanup records its claim/deletion using the real clock.
    await prisma.fileUploadSession.update({
      where: { id: intent.uploadId },
      data: { finalCleanupEligibleAt: new Date() },
    });
    return { uploadId: intent.uploadId, ...result };
  }

  function attachmentData(fileId: string, schoolId = ids.school) {
    return {
      fileId,
      schoolId,
      resourceType: 'student',
      resourceId: ids.student,
      createdById: ids.user,
    };
  }

  async function expectRetained(upload: Awaited<ReturnType<typeof readyFile>>) {
    await cleanup.cleanUpload(upload.uploadId);
    expect(deleteObject).not.toHaveBeenCalled();
    expect(objects.has(upload.file.objectKey)).toBe(true);
    expect(
      (await prisma.file.findUniqueOrThrow({ where: { id: upload.file.id } }))
        .deletedAt,
    ).toBeNull();
    expect(
      (
        await prisma.fileUploadSession.findUniqueOrThrow({
          where: { id: upload.uploadId },
        })
      ).status,
    ).toBe('READY');
  }

  async function waitingAtLock(pid: number, query: string, blocker?: number) {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const rows = await prisma.$queryRaw<
        Array<{ query: string; blockers: number[] }>
      >`
        SELECT activity.query, pg_catalog.pg_blocking_pids(activity.pid) AS blockers
        FROM pg_catalog.pg_stat_activity activity
        WHERE activity.pid = ${pid} AND activity.wait_event_type = 'Lock'
          AND EXISTS (SELECT 1 FROM pg_catalog.pg_locks locks WHERE locks.pid = activity.pid AND NOT locks.granted)`;
      if (
        rows.length &&
        rows[0].query.includes(query) &&
        rows[0].blockers.length
      ) {
        if (blocker !== undefined) expect(rows[0].blockers).toContain(blocker);
        return rows[0].blockers;
      }
    }
    throw new Error('Expected PostgreSQL lock dependency was not observed');
  }

  beforeAll(async () => {
    await prisma.$connect();
    ids.organization = (
      await prisma.organization.create({
        data: { name: `R4 ${tag}`, slug: `r4-${tag}` },
      })
    ).id;
    for (const suffix of ['school', 'otherSchool'])
      ids[suffix] = (
        await prisma.school.create({
          data: {
            organizationId: ids.organization,
            name: `R4 ${suffix} ${tag}`,
            slug: `r4-${suffix.toLowerCase()}-${tag}`,
          },
        })
      ).id;
    ids.user = (
      await prisma.user.create({
        data: {
          email: `r4-${tag}@example.test`,
          firstName: 'R4',
          lastName: 'Manager',
          userType: UserType.SCHOOL_USER,
        },
      })
    ).id;
    ids.year = (
      await prisma.academicYear.create({
        data: {
          schoolId: ids.school,
          nameAr: 'R4',
          nameEn: 'R4',
          startDate: new Date('2026-01-01'),
          endDate: new Date('2027-12-31'),
        },
      })
    ).id;
    ids.term = (
      await prisma.term.create({
        data: {
          schoolId: ids.school,
          academicYearId: ids.year,
          nameAr: 'R4',
          nameEn: 'R4',
          startDate: new Date('2026-01-01'),
          endDate: new Date('2027-12-31'),
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
          title: 'R4',
          createdByUserId: ids.user,
        },
      })
    ).id;
    ids.student = (
      await prisma.student.create({
        data: {
          schoolId: ids.school,
          organizationId: ids.organization,
          firstName: 'R4',
          lastName: 'Student',
        },
      })
    ).id;
  });

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    beforeDelete = undefined;
  });

  afterAll(async () => {
    try {
      if (!ids.school) return;
      const schools = [ids.school, ids.otherSchool].filter(Boolean);
      await prisma.attachment.deleteMany({
        where: { schoolId: { in: schools } },
      });
      await prisma.studentDocument.deleteMany({
        where: { schoolId: ids.school },
      });
      await prisma.student.deleteMany({ where: { schoolId: ids.school } });
      await prisma.academicContentRevisionAsset.deleteMany({
        where: { schoolId: ids.school },
      });
      await prisma.academicContentAsset.deleteMany({
        where: { schoolId: ids.school },
      });
      await prisma.fileUploadSession.deleteMany({
        where: { schoolId: ids.school },
      });
      await prisma.auditLog.deleteMany({ where: { schoolId: ids.school } });
      await prisma.academicContentRevision.deleteMany({
        where: { schoolId: ids.school },
      });
      await prisma.academicContent.deleteMany({
        where: { schoolId: ids.school },
      });
      await prisma.file.deleteMany({ where: { schoolId: ids.school } });
      await prisma.term.deleteMany({ where: { schoolId: ids.school } });
      await prisma.academicYear.deleteMany({ where: { schoolId: ids.school } });
      await prisma.school.deleteMany({
        where: { id: { in: schools } },
      });
      if (ids.user) await prisma.user.delete({ where: { id: ids.user } });
      if (ids.organization)
        await prisma.organization.delete({ where: { id: ids.organization } });
    } finally {
      await prisma.$disconnect();
    }
  });

  it('covers all 22 physical File FK columns with exact BEFORE INSERT/UPDATE triggers', async () => {
    const columns = await prisma.$queryRaw<
      Array<{
        table: string;
        column: string;
        attribute: number;
        trigger: string | null;
        type: number | null;
        updateColumns: string | null;
        args: string | null;
        enabled: string | null;
      }>
    >`
      SELECT child.relname AS "table", child_column.attname AS "column", child_column.attnum::int AS attribute,
        trigger_row.tgname AS trigger, trigger_row.tgtype::int AS type, trigger_row.tgattr::text AS "updateColumns",
        pg_catalog.encode(trigger_row.tgargs, 'escape') AS args, trigger_row.tgenabled::text AS enabled
      FROM pg_catalog.pg_constraint constraint_row
      JOIN pg_catalog.pg_class parent ON parent.oid = constraint_row.confrelid
      JOIN pg_catalog.pg_namespace parent_namespace ON parent_namespace.oid = parent.relnamespace
      JOIN pg_catalog.pg_class child ON child.oid = constraint_row.conrelid
      CROSS JOIN LATERAL unnest(constraint_row.conkey, constraint_row.confkey) keys(child_number, parent_number)
      JOIN pg_catalog.pg_attribute child_column ON child_column.attrelid = child.oid AND child_column.attnum = keys.child_number
      JOIN pg_catalog.pg_attribute parent_column ON parent_column.attrelid = parent.oid AND parent_column.attnum = keys.parent_number
      LEFT JOIN pg_catalog.pg_trigger trigger_row ON trigger_row.tgrelid = child.oid AND NOT trigger_row.tgisinternal
        AND trigger_row.tgfoid = 'public.enforce_live_file_reference()'::regprocedure
      WHERE constraint_row.contype = 'f' AND parent_namespace.nspname = 'public' AND parent.relname = 'files' AND parent_column.attname = 'id'
      ORDER BY child.relname, child_column.attname`;
    expect(columns).toHaveLength(22);
    expect(
      new Set(columns.map((row) => `${row.table}.${row.column}`)).size,
    ).toBe(22);
    for (const row of columns) {
      // PostgreSQL catalog identifiers are limited to 63 bytes (ASCII here).
      expect(row.trigger).toBe(
        `file_live_ref_${row.table}_${row.column}`.slice(0, 63),
      );
      expect(row.type).toBe(1 | 2 | 4 | 16);
      expect(row.updateColumns).toBe(String(row.attribute));
      expect(row.args).toBe(`${row.column}\\000`);
      expect(row.enabled).toBe('O');
    }
    const functions = await prisma.$queryRaw<
      Array<{ definer: boolean; owner: string; config: string[] }>
    >`
      SELECT proc.prosecdef AS definer, role.rolname AS owner, proc.proconfig AS config
      FROM pg_catalog.pg_proc proc JOIN pg_catalog.pg_namespace namespace ON namespace.oid = proc.pronamespace
      JOIN pg_catalog.pg_roles role ON role.oid = proc.proowner
      WHERE namespace.nspname = 'public' AND proc.proname = 'enforce_live_file_reference'`;
    expect(functions).toHaveLength(1);
    expect(functions[0].definer).toBe(false);
    expect(functions[0].config).toContain('search_path=pg_catalog');
    const [total] = await prisma.$queryRaw<Array<{ count: number }>>`
      SELECT count(*)::int AS count FROM pg_catalog.pg_trigger
      WHERE tgfoid = 'public.enforce_live_file_reference()'::regprocedure AND NOT tgisinternal`;
    expect(total.count).toBe(22);
  });

  it('retains an existing generic Attachment to an ACC-created READY File', async () => {
    const upload = await readyFile();
    await attachments.createAttachment(attachmentData(upload.file.id));
    await expectRetained(upload);
  });

  it('retains a direct StudentDocument File relation', async () => {
    const upload = await readyFile();
    await prisma.studentDocument.create({
      data: {
        schoolId: ids.school,
        studentId: ids.student,
        fileId: upload.file.id,
        documentType: 'G13',
      },
    });
    await expectRetained(upload);
  });

  it('retains historical revisions while preserving current-asset unlink', async () => {
    const upload = await readyFile();
    const revision = await prisma.academicContentRevision.create({
      data: {
        schoolId: ids.school,
        academicContentId: ids.content,
        revisionNumber: 1,
        snapshotContractVersion: 2,
        academicYearId: ids.year,
        termId: ids.term,
        type: AcademicContentType.GENERAL_RESOURCE,
        audience: AcademicContentAudienceType.STUDENTS,
        title: 'R4 history',
        sourceStatus: AcademicContentStatus.DRAFT,
        capturedByUserId: ids.user,
      },
    });
    await prisma.academicContentRevisionAsset.create({
      data: {
        schoolId: ids.school,
        revisionId: revision.id,
        fileId: upload.file.id,
        sortOrder: 0,
      },
    });
    expect(
      (
        await prisma.academicContentAsset.findUniqueOrThrow({
          where: { id: upload.asset.id },
        })
      ).deletedAt,
    ).not.toBeNull();
    await expectRetained(upload);
  });

  it('retains active ACC assets and unexpected cross-School physical references', async () => {
    const active = await readyFile(true);
    await expectRetained(active);
    const corrupt = await readyFile();
    await attachments.createAttachment(
      attachmentData(corrupt.file.id, ids.otherSchool),
    );
    await asManager(async () => {
      expect(
        await repository.withTransaction((tx) =>
          tx.hasRetainedFileReferences(corrupt.file.id),
        ),
      ).toBe(true);
    });
    await expectRetained(corrupt);
  });

  it('purges a true orphan despite its upload provenance and soft-deleted current asset', async () => {
    const upload = await readyFile();
    expect(
      await prisma.$transaction((tx) =>
        hasRetainedFileReferences(tx, upload.file.id),
      ),
    ).toBe(false);
    await cleanup.cleanUpload(upload.uploadId);
    expect(deleteObject).toHaveBeenCalledTimes(1);
    expect(objects.has(upload.file.objectKey)).toBe(false);
    expect(
      (await prisma.file.findUniqueOrThrow({ where: { id: upload.file.id } }))
        .deletedAt,
    ).not.toBeNull();
    expect(
      (
        await prisma.fileUploadSession.findUniqueOrThrow({
          where: { id: upload.uploadId },
        })
      ).status,
    ).toBe('PURGED');
  });

  it('cleanup first commits retirement before storage wait and immediately rejects a stale real Attachment linker', async () => {
    const upload = await readyFile();
    const preread = await prisma.file.findFirst({
      where: { id: upload.file.id, deletedAt: null },
    });
    expect(preread).not.toBeNull();
    const deletionEntered = barrier(),
      allowDeletion = barrier();
    beforeDelete = async () => {
      deletionEntered.release();
      await allowDeletion.promise;
    };
    const cleaning = cleanup.cleanUpload(upload.uploadId);
    await deletionEntered.promise;
    try {
      expect(
        (await prisma.file.findUniqueOrThrow({ where: { id: upload.file.id } }))
          .deletedAt,
      ).not.toBeNull();
      expect(
        await prisma.fileUploadSession.findUniqueOrThrow({
          where: { id: upload.uploadId },
        }),
      ).toMatchObject({
        status: 'READY',
        finalCleanupClaimedAt: null,
        finalObjectDeletedAt: null,
      });
      // A database lock timeout bounds the stale-link attempt while the
      // provider barrier is still held. It must fail on the committed fence.
      await expect(
        prisma.$transaction(
          async (tx) => {
            await tx.$executeRaw`SET LOCAL lock_timeout = '1000ms'`;
            return new AttachmentsRepository(tx as never).createAttachment(
              attachmentData(upload.file.id),
            );
          },
          { timeout: 10_000 },
        ),
      ).rejects.toMatchObject({ code: 'P2003' });
      expect(
        await prisma.attachment.count({ where: { fileId: upload.file.id } }),
      ).toBe(0);
      expect(objects.has(upload.file.objectKey)).toBe(true);
      allowDeletion.release();
      await cleaning;
      expect(
        await prisma.attachment.count({ where: { fileId: upload.file.id } }),
      ).toBe(0);
      expect(
        (await prisma.file.findUniqueOrThrow({ where: { id: upload.file.id } }))
          .deletedAt,
      ).not.toBeNull();
      expect(
        (
          await prisma.fileUploadSession.findUniqueOrThrow({
            where: { id: upload.uploadId },
          })
        ).status,
      ).toBe('PURGED');
      expect(objects.has(upload.file.objectKey)).toBe(false);
    } finally {
      allowDeletion.release();
      await Promise.allSettled([cleaning]);
    }
  });

  it('rediscovers a retired READY File after storage failure and retries to PURGED', async () => {
    const upload = await readyFile();
    beforeDelete = () => Promise.reject(new Error('provider deletion failed'));
    await expect(cleanup.cleanUpload(upload.uploadId)).rejects.toThrow(
      'provider deletion failed',
    );
    const retired = await prisma.file.findUniqueOrThrow({
      where: { id: upload.file.id },
    });
    expect(retired.deletedAt).not.toBeNull();
    expect(objects.has(upload.file.objectKey)).toBe(true);
    expect(
      await prisma.fileUploadSession.findUniqueOrThrow({
        where: { id: upload.uploadId },
      }),
    ).toMatchObject({
      status: 'READY',
      finalCleanupClaimedAt: null,
      finalObjectDeletedAt: null,
    });
    expect(
      await repository.cleanupCandidates(
        new Date(),
        new Date(Date.now() - 900_000),
      ),
    ).toContainEqual({ id: upload.uploadId });
    beforeDelete = undefined;
    await cleanup.cleanUpload(upload.uploadId);
    expect(deleteObject).toHaveBeenCalledTimes(2);
    expect(objects.has(upload.file.objectKey)).toBe(false);
    expect(
      await prisma.fileUploadSession.findUniqueOrThrow({
        where: { id: upload.uploadId },
      }),
    ).toMatchObject({
      status: 'PURGED',
      finalCleanupClaimedAt: retired.deletedAt,
      finalObjectDeletedAt: expect.any(Date) as unknown,
    });
    expect(
      (await prisma.file.findUniqueOrThrow({ where: { id: upload.file.id } }))
        .deletedAt,
    ).toEqual(retired.deletedAt);
  });

  it('rolls back finalization after successful delete, preserves retirement and safely retries an absent object', async () => {
    const upload = await readyFile();
    const confirmAbsent = jest.spyOn(storage, 'deleteObjectAndConfirmAbsent');
    let failFinalization = true;
    const failingClient = prisma.$extends({
      query: {
        fileUploadSession: {
          async updateMany({ args, query }) {
            const result = await query(args);
            if (failFinalization && args.data.status === 'PURGED') {
              failFinalization = false;
              throw new Error('controlled finalization failure');
            }
            return result;
          },
        },
      },
    });
    const retryingCleanup = new AcademicContentCleanupWorker(
      {} as BullmqService,
      new AcademicContentFileRepository(failingClient as never),
      storage,
    );
    await expect(retryingCleanup.cleanUpload(upload.uploadId)).rejects.toThrow(
      'controlled finalization failure',
    );
    expect(objects.has(upload.file.objectKey)).toBe(false);
    const retired = await prisma.file.findUniqueOrThrow({
      where: { id: upload.file.id },
    });
    expect(retired.deletedAt).not.toBeNull();
    expect(
      await prisma.fileUploadSession.findUniqueOrThrow({
        where: { id: upload.uploadId },
      }),
    ).toMatchObject({
      status: 'READY',
      finalCleanupClaimedAt: null,
      finalObjectDeletedAt: null,
    });
    expect(
      await repository.cleanupCandidates(
        new Date(),
        new Date(Date.now() - 900_000),
      ),
    ).toContainEqual({ id: upload.uploadId });
    await retryingCleanup.cleanUpload(upload.uploadId);
    expect(confirmAbsent).toHaveBeenCalledTimes(2);
    // The existing Storage abstraction skips provider deletion on the retry
    // when its first existence check already confirms absence.
    expect(deleteObject).toHaveBeenCalledTimes(1);
    expect(
      await prisma.fileUploadSession.findUniqueOrThrow({
        where: { id: upload.uploadId },
      }),
    ).toMatchObject({
      status: 'PURGED',
      finalCleanupClaimedAt: retired.deletedAt,
      finalObjectDeletedAt: expect.any(Date) as unknown,
    });
    expect(
      (await prisma.file.findUniqueOrThrow({ where: { id: upload.file.id } }))
        .deletedAt,
    ).toEqual(retired.deletedAt);
  });

  it('linker first blocks real cleanup at File and retains the committed child without storage deletion', async () => {
    const upload = await readyFile();
    const linked = barrier(),
      allowCommit = barrier();
    let linkerPid = 0;
    const linking = prisma.$transaction(
      async (tx) => {
        const [backend] = await tx.$queryRaw<
          Array<{ pid: number }>
        >`SELECT pg_catalog.pg_backend_pid() AS pid`;
        linkerPid = backend.pid;
        await new AttachmentsRepository(tx as never).createAttachment(
          attachmentData(upload.file.id),
        );
        linked.release();
        await allowCommit.promise;
      },
      { timeout: 30_000 },
    );
    await linked.promise;
    const cleaning = cleanup.cleanUpload(upload.uploadId);
    try {
      const deadline = Date.now() + 10_000;
      let cleanupPid = 0;
      while (!cleanupPid && Date.now() < deadline) {
        const rows = await prisma.$queryRaw<Array<{ pid: number }>>`
          SELECT pid FROM pg_catalog.pg_stat_activity
          WHERE wait_event_type = 'Lock' AND query LIKE '%FROM files WHERE id%FOR UPDATE%'
            AND ${linkerPid} = ANY(pg_catalog.pg_blocking_pids(pid))`;
        cleanupPid = rows[0]?.pid ?? 0;
      }
      expect(cleanupPid).not.toBe(0);
      await waitingAtLock(cleanupPid, 'FROM files WHERE id', linkerPid);
      expect(deleteObject).not.toHaveBeenCalled();
      allowCommit.release();
      await linking;
      await cleaning;
      expect(
        await prisma.attachment.count({ where: { fileId: upload.file.id } }),
      ).toBe(1);
      await expectRetained(upload);
    } finally {
      allowCommit.release();
      await Promise.allSettled([linking, cleaning]);
    }
  });

  it('allows normal required, nullable, ACC Asset and upload-session READY File writes', async () => {
    const upload = await readyFile(true);
    await attachments.createAttachment(attachmentData(upload.file.id));
    await prisma.student.update({
      where: { id: ids.student },
      data: { avatarFileId: upload.file.id },
    });
    await prisma.student.update({
      where: { id: ids.student },
      data: { avatarFileId: null },
    });
    expect(
      (
        await prisma.fileUploadSession.findUniqueOrThrow({
          where: { id: upload.uploadId },
        })
      ).fileId,
    ).toBe(upload.file.id);
    expect(
      (
        await prisma.academicContentAsset.findUniqueOrThrow({
          where: { id: upload.asset.id },
        })
      ).fileId,
    ).toBe(upload.file.id);
  });

  it('rejects inserts and changed nullable/required references to a soft-deleted File', async () => {
    const deleted = await readyFile();
    await cleanup.cleanUpload(deleted.uploadId);
    await expect(
      attachments.createAttachment(attachmentData(deleted.file.id)),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(
      prisma.student.update({
        where: { id: ids.student },
        data: { avatarFileId: deleted.file.id },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    const live = await readyFile();
    const attachment = await attachments.createAttachment(
      attachmentData(live.file.id),
    );
    await expect(
      prisma.attachment.update({
        where: { id: attachment.id },
        data: { fileId: deleted.file.id },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    expect(
      await prisma.attachment.count({ where: { fileId: deleted.file.id } }),
    ).toBe(0);
    expect(
      (await prisma.student.findUniqueOrThrow({ where: { id: ids.student } }))
        .avatarFileId,
    ).toBeNull();
    expect(
      (
        await prisma.attachment.findUniqueOrThrow({
          where: { id: attachment.id },
        })
      ).fileId,
    ).toBe(live.file.id);
  });
});
