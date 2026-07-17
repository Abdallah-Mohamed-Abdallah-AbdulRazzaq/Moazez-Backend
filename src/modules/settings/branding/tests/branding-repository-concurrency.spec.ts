import { AuditOutcome, FileVisibility, Prisma, UserType } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { BullmqService } from '../../../../infrastructure/queue/bullmq.service';
import { StorageService } from '../../../../infrastructure/storage/storage.service';
import { BrandingLogoCleanupQueueService } from '../application/branding-logo-cleanup-queue.service';
import {
  BrandingRepository,
  StoredBrandingLogoMetadata,
} from '../infrastructure/branding.repository';

const SCHOOL_ID = '11111111-1111-4111-8111-111111111111';
const ORGANIZATION_ID = '22222222-2222-4222-8222-222222222222';
const PRIVATE_BUCKET = 'private-bucket';
const OTHER_SCHOOL_ID = '33333333-3333-4333-8333-333333333333';

const INELIGIBLE_LINKED_FILE_CASES = [
  {
    name: 'PUBLIC File',
    overrides: { visibility: FileVisibility.PUBLIC },
  },
  { name: 'wrong bucket', overrides: { bucket: 'unrelated-bucket' } },
  {
    name: 'wrong object-key prefix',
    overrides: { objectKey: `schools/${SCHOOL_ID}/files/unrelated.png` },
  },
  {
    name: 'wrong school prefix',
    overrides: {
      objectKey: `schools/${OTHER_SCHOOL_ID}/branding/logos/44444444-4444-4444-8444-444444444444.png`,
    },
  },
  {
    name: 'wrong object-key shape',
    overrides: {
      objectKey: `schools/${SCHOOL_ID}/branding/logos/not-a-managed-uuid.png`,
    },
  },
  { name: 'unsupported MIME', overrides: { mimeType: 'image/gif' } },
  { name: 'zero size', overrides: { sizeBytes: 0n } },
  { name: 'oversized file', overrides: { sizeBytes: 5_242_881n } },
  {
    name: 'deleted File',
    overrides: { deletedAt: new Date('2026-01-01T00:00:00.000Z') },
  },
  {
    name: 'organization mismatch',
    overrides: { organizationId: '55555555-5555-4555-8555-555555555555' },
  },
] as const;

describe('BrandingRepository serialized lifecycle', () => {
  it('retries P2034 conflicts at Serializable isolation and succeeds within the bound', async () => {
    const state = createSerializedPrisma();
    state.prisma.$transaction
      .mockRejectedValueOnce(transactionConflict())
      .mockRejectedValueOnce(transactionConflict());
    const repository = new BrandingRepository(
      state.prisma as unknown as PrismaService,
    );

    await expect(
      repository.replaceManagedLogo({
        scope: actorScope(),
        file: storedLogo('retry.png'),
        expectedPrivateBucket: PRIVATE_BUCKET,
      }),
    ).resolves.toMatchObject({ previousFile: null });

    expect(state.prisma.$transaction).toHaveBeenCalledTimes(3);
    for (const call of state.prisma.$transaction.mock.calls) {
      expect(call[1]).toEqual({
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    }
    expect(activeFiles(state)).toHaveLength(1);
  });

  it('stops after the bounded retry count when every transaction conflicts', async () => {
    const prisma = {
      $transaction: jest.fn().mockRejectedValue(transactionConflict()),
    } as unknown as PrismaService;
    const repository = new BrandingRepository(prisma);

    await expect(
      repository.replaceManagedLogo({
        scope: actorScope(),
        file: storedLogo('exhausted.png'),
        expectedPrivateBucket: PRIVATE_BUCKET,
      }),
    ).rejects.toMatchObject({ code: 'P2034' });
    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
  });

  it('serializes upload versus upload with exactly one linked active file and one cleanup candidate', async () => {
    const state = createSerializedPrisma();
    const repository = new BrandingRepository(
      state.prisma as unknown as PrismaService,
    );

    const results = await Promise.all([
      repository.replaceManagedLogo({
        scope: actorScope(),
        file: storedLogo('first.png'),
        expectedPrivateBucket: PRIVATE_BUCKET,
      }),
      repository.replaceManagedLogo({
        scope: actorScope(),
        file: storedLogo('second.png'),
        expectedPrivateBucket: PRIVATE_BUCKET,
      }),
    ]);

    const active = activeFiles(state);
    expect(active).toHaveLength(1);
    expect(state.profile.logoFileId).toBe(active[0]?.id);
    expect(
      active.filter((file) => file.id !== state.profile.logoFileId),
    ).toHaveLength(0);
    expect(results.flatMap((result) => result.previousFile ?? [])).toHaveLength(
      1,
    );
    expect(
      [...state.files.values()].filter((file) => file.deletedAt),
    ).toHaveLength(1);
  });

  it('serializes upload versus delete without an ambiguous active or unlinked file', async () => {
    const state = createSerializedPrisma();
    const repository = new BrandingRepository(
      state.prisma as unknown as PrismaService,
    );

    const [uploadResult, deleteResult] = await Promise.all([
      repository.replaceManagedLogo({
        scope: actorScope(),
        file: storedLogo('race.png'),
        expectedPrivateBucket: PRIVATE_BUCKET,
      }),
      repository.deleteManagedLogo(actorScope(), PRIVATE_BUCKET),
    ]);

    const active = activeFiles(state);
    expect(active).toHaveLength(state.profile.logoFileId ? 1 : 0);
    expect(
      active.filter((file) => file.id !== state.profile.logoFileId),
    ).toHaveLength(0);
    const deletedFiles = [...state.files.values()].filter(
      (file) => file.deletedAt !== null,
    );
    expect(
      [uploadResult.previousFile, deleteResult.previousFile].filter(Boolean),
    ).toHaveLength(deletedFiles.length);
  });

  it.each(INELIGIBLE_LINKED_FILE_CASES)(
    'preserves an ineligible linked $name during replacement and deletion',
    async ({ overrides }) => {
      const replacementState = createSerializedPrisma();
      const replacementHistoric = replacementState.insertFile(overrides);
      const replacementDeletedAt = replacementHistoric.deletedAt;
      replacementState.profile.logoFileId = replacementHistoric.id;
      replacementState.profile.logoUrl =
        'https://cdn.school-domain.com/legacy.png';
      const replacementRepository = new BrandingRepository(
        replacementState.prisma as unknown as PrismaService,
      );

      const replacementResult = await replacementRepository.replaceManagedLogo({
        scope: actorScope(),
        file: storedLogo('new.png'),
        expectedPrivateBucket: PRIVATE_BUCKET,
      });

      expect(replacementState.profile.logoFileId).not.toBe(
        replacementHistoric.id,
      );
      expect(replacementHistoric.deletedAt).toBe(replacementDeletedAt);
      expect(replacementResult.previousFile).toBeNull();
      expect(replacementState.audits).toContainEqual(
        expect.objectContaining({
          action: 'branding.logo.upload',
          resourceType: 'school_branding_logo',
          resourceId: 'profile-1',
          outcome: AuditOutcome.SUCCESS,
          actorId: 'actor-1',
          userType: UserType.SCHOOL_USER,
          organizationId: ORGANIZATION_ID,
          schoolId: SCHOOL_ID,
          after: {
            changed: true,
            detectedMime: 'image/png',
            byteSize: 68,
            priorManagedValueExisted: true,
            priorLegacyValueExisted: true,
            replacement: false,
          },
        }),
      );
      expectAuditHasNoFileStorageMetadata(
        replacementState.audits,
        replacementHistoric,
      );

      const deletionState = createSerializedPrisma();
      const deletionHistoric = deletionState.insertFile(overrides);
      const deletionDeletedAt = deletionHistoric.deletedAt;
      deletionState.profile.logoFileId = deletionHistoric.id;
      deletionState.profile.logoUrl =
        'https://cdn.school-domain.com/legacy.png';
      const deletionRepository = new BrandingRepository(
        deletionState.prisma as unknown as PrismaService,
      );

      const deletionResult = await deletionRepository.deleteManagedLogo(
        actorScope(),
        PRIVATE_BUCKET,
      );

      expect(deletionState.profile.logoFileId).toBeNull();
      expect(deletionState.profile.logoUrl).toBeNull();
      expect(deletionHistoric.deletedAt).toBe(deletionDeletedAt);
      expect(deletionResult).toEqual({ changed: true, previousFile: null });
      expect(deletionState.audits).toContainEqual(
        expect.objectContaining({
          action: 'branding.logo.delete',
          resourceType: 'school_branding_logo',
          after: {
            changed: true,
            priorManagedValueExisted: true,
            priorLegacyValueExisted: true,
            replacement: false,
          },
        }),
      );
      expectAuditHasNoFileStorageMetadata(
        deletionState.audits,
        deletionHistoric,
      );

      const cleanup = createCleanupDispatchHarness();
      await cleanup.service.cleanupAfterCommit(replacementResult.previousFile);
      await cleanup.service.cleanupAfterCommit(deletionResult.previousFile);
      expect(cleanup.storage.deleteObject).not.toHaveBeenCalled();
      expect(cleanup.bullmq.addJob).not.toHaveBeenCalled();
    },
  );

  it('soft-deletes and returns only a fully eligible managed logo for cleanup', async () => {
    const replacementState = createSerializedPrisma();
    const replacementHistoric = replacementState.insertFile();
    replacementState.profile.logoFileId = replacementHistoric.id;
    const replacementRepository = new BrandingRepository(
      replacementState.prisma as unknown as PrismaService,
    );

    const replacementResult = await replacementRepository.replaceManagedLogo({
      scope: actorScope(),
      file: storedLogo('eligible-replacement.png'),
      expectedPrivateBucket: PRIVATE_BUCKET,
    });

    expect(replacementHistoric.deletedAt).toBeInstanceOf(Date);
    expect(replacementResult.previousFile?.id).toBe(replacementHistoric.id);
    expect(replacementState.audits.at(-1)).toMatchObject({
      action: 'branding.logo.replace',
      after: { replacement: true },
    });
    const replacementCleanup = createCleanupDispatchHarness();
    await replacementCleanup.service.cleanupAfterCommit(
      replacementResult.previousFile,
    );
    expect(replacementCleanup.storage.deleteObject).toHaveBeenCalledTimes(1);

    const deletionState = createSerializedPrisma();
    const deletionHistoric = deletionState.insertFile();
    deletionState.profile.logoFileId = deletionHistoric.id;
    const deletionRepository = new BrandingRepository(
      deletionState.prisma as unknown as PrismaService,
    );

    const deletionResult = await deletionRepository.deleteManagedLogo(
      actorScope(),
      PRIVATE_BUCKET,
    );

    expect(deletionState.profile.logoFileId).toBeNull();
    expect(deletionHistoric.deletedAt).toBeInstanceOf(Date);
    expect(deletionResult.previousFile?.id).toBe(deletionHistoric.id);
    expect(deletionState.audits.at(-1)).toMatchObject({
      action: 'branding.logo.delete',
      after: { detectedMime: 'image/png', byteSize: 68 },
    });
  });

  it('records exact sanitized failure evidence best-effort', async () => {
    const auditLog = { create: jest.fn().mockResolvedValue({}) };
    const prisma = {
      schoolProfile: {
        findUnique: jest.fn().mockResolvedValue({ id: 'profile-1' }),
      },
      auditLog,
    } as unknown as PrismaService;
    const repository = new BrandingRepository(prisma);

    await repository.recordLogoFailure({
      scope: actorScope(),
      action: 'branding.logo.upload.validation_failed',
      failureKind: 'validation_failure',
    });

    expect(auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: 'actor-1',
        userType: UserType.SCHOOL_USER,
        organizationId: ORGANIZATION_ID,
        schoolId: SCHOOL_ID,
        module: 'settings',
        action: 'branding.logo.upload.validation_failed',
        resourceType: 'school_branding_logo',
        resourceId: 'profile-1',
        outcome: AuditOutcome.FAILURE,
        after: { changed: false, failureKind: 'validation_failure' },
      },
    });

    auditLog.create.mockRejectedValueOnce(new Error('audit unavailable'));
    await expect(
      repository.recordLogoFailure({
        scope: actorScope(),
        action: 'branding.logo.upload.storage_write_failed',
        failureKind: 'storage_write_failure',
      }),
    ).resolves.toBeUndefined();
  });
});

function createSerializedPrisma() {
  let sequence = 0;
  let transactionTail = Promise.resolve();
  const profile = {
    id: 'profile-1',
    logoFileId: null as string | null,
    logoUrl: null as string | null,
  };
  const files = new Map<string, ReturnType<typeof fileRecord>>();
  const audits: Array<Record<string, unknown>> = [];

  const transaction = {
    school: {
      findFirst: jest.fn().mockResolvedValue({ id: SCHOOL_ID }),
    },
    schoolProfile: {
      findUnique: jest.fn(async () => ({
        id: profile.id,
        logoUrl: profile.logoUrl,
        logoFile: profile.logoFileId
          ? (files.get(profile.logoFileId) ?? null)
          : null,
      })),
      upsert: jest.fn(async (args: { update: { logoFileId: string } }) => {
        profile.logoFileId = args.update.logoFileId;
        return { ...profile, schoolId: SCHOOL_ID };
      }),
      update: jest.fn(
        async (args: { data: { logoFileId: null; logoUrl: null } }) => {
          profile.logoFileId = args.data.logoFileId;
          profile.logoUrl = args.data.logoUrl;
          return { ...profile, schoolId: SCHOOL_ID };
        },
      ),
    },
    file: {
      create: jest.fn(async (args: { data: Record<string, unknown> }) => {
        sequence += 1;
        const created = fileRecord({
          ...args.data,
          id: `file-${sequence}`,
          deletedAt: null,
        });
        files.set(created.id, created);
        return created;
      }),
      updateMany: jest.fn(
        async (args: {
          where: { id: string; deletedAt: null };
          data: { deletedAt: Date };
        }) => {
          const file = files.get(args.where.id);
          if (!file || file.deletedAt !== null) return { count: 0 };
          file.deletedAt = args.data.deletedAt;
          return { count: 1 };
        },
      ),
    },
    auditLog: {
      create: jest.fn(async (args: { data: Record<string, unknown> }) => {
        audits.push(args.data);
        return args.data;
      }),
    },
  };

  const prisma = {
    $transaction: jest.fn(
      (
        operation: (tx: typeof transaction) => Promise<unknown>,
        _options: unknown,
      ) => {
        const result = transactionTail.then(() => operation(transaction));
        transactionTail = result.then(
          () => undefined,
          () => undefined,
        );
        return result;
      },
    ),
  };

  return {
    prisma: prisma as typeof prisma & { $transaction: jest.Mock },
    profile,
    files,
    audits,
    insertFile(overrides: Record<string, unknown> = {}) {
      sequence += 1;
      const file = fileRecord({ id: `file-${sequence}`, ...overrides });
      files.set(file.id, file);
      return file;
    },
  };
}

function activeFiles(state: ReturnType<typeof createSerializedPrisma>) {
  return [...state.files.values()].filter((file) => file.deletedAt === null);
}

function actorScope() {
  return {
    actorId: 'actor-1',
    userType: UserType.SCHOOL_USER,
    organizationId: ORGANIZATION_ID,
    schoolId: SCHOOL_ID,
  };
}

function storedLogo(name: string): StoredBrandingLogoMetadata {
  const suffix = Buffer.from(name).toString('hex').padEnd(12, '0').slice(0, 12);
  return {
    bucket: PRIVATE_BUCKET,
    objectKey: `schools/${SCHOOL_ID}/branding/logos/00000000-0000-4000-8000-${suffix}.png`,
    originalName: name,
    mimeType: 'image/png',
    sizeBytes: 68n,
    checksumSha256: 'a'.repeat(64),
  };
}

function fileRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'file-0',
    organizationId: ORGANIZATION_ID,
    schoolId: SCHOOL_ID,
    uploaderId: 'actor-1',
    bucket: PRIVATE_BUCKET,
    objectKey: `schools/${SCHOOL_ID}/branding/logos/66666666-6666-4666-8666-666666666666.png`,
    originalName: 'existing.png',
    mimeType: 'image/png',
    sizeBytes: 68n,
    checksumSha256: 'b'.repeat(64),
    visibility: FileVisibility.PRIVATE,
    deletedAt: null as Date | null,
    createdAt: new Date(),
    ...overrides,
  };
}

function transactionConflict() {
  return Object.assign(new Error('serializable conflict'), { code: 'P2034' });
}

function expectAuditHasNoFileStorageMetadata(
  audits: Array<Record<string, unknown>>,
  historicFile: ReturnType<typeof fileRecord>,
): void {
  const serializedAudit = JSON.stringify(audits);
  expect(audits).not.toContainEqual(
    expect.objectContaining({ resourceId: historicFile.id }),
  );
  expect(serializedAudit).not.toContain(historicFile.bucket);
  expect(serializedAudit).not.toContain(historicFile.objectKey);
  expect(serializedAudit).not.toContain(historicFile.checksumSha256);
  expect(serializedAudit).not.toContain('"fileId"');
}

function createCleanupDispatchHarness() {
  const bullmq = {
    addJob: jest.fn().mockResolvedValue({ id: 'cleanup-job' }),
  } as unknown as BullmqService & { addJob: jest.Mock };
  const storage = {
    deleteObject: jest.fn().mockResolvedValue(undefined),
    resolveBucket: jest.fn().mockReturnValue(PRIVATE_BUCKET),
  } as unknown as StorageService & {
    deleteObject: jest.Mock;
    resolveBucket: jest.Mock;
  };

  return {
    bullmq,
    storage,
    service: new BrandingLogoCleanupQueueService(bullmq, storage),
  };
}
