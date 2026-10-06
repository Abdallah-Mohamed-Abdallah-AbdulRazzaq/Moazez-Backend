import {
  FileUploadPurpose,
  FileUploadSessionStatus,
  Prisma,
} from '@prisma/client';
import { AcademicContentFileRepository } from '../infrastructure/academic-content-file.repository';

describe('ACC resource-specific final write predicates', () => {
  const schoolId = '11111111-1111-4111-8111-111111111111';
  const contentId = '22222222-2222-4222-8222-222222222222';
  const resourceId = '33333333-3333-4333-8333-333333333333';
  const updateUpload = jest.fn().mockResolvedValue(undefined);
  const updateAsset = jest.fn().mockResolvedValue(undefined);
  const tx = {
    fileUploadSession: { update: updateUpload },
    academicContentAsset: { update: updateAsset },
  };
  const repository = new AcademicContentFileRepository({
    $transaction: (callback: (client: typeof tx) => unknown) => callback(tx),
  } as never);

  beforeEach(() => jest.clearAllMocks());

  it('retains exact upload, School, ACC purpose and parent in the final update', async () => {
    const data = { status: FileUploadSessionStatus.VERIFYING };
    await repository.withTransaction((context) =>
      context.updateUpload({ uploadId: resourceId, schoolId, contentId }, data),
    );
    expect(updateUpload).toHaveBeenCalledTimes(1);
    expect(updateUpload).toHaveBeenCalledWith({
      where: {
        id: resourceId,
        schoolId,
        purpose: FileUploadPurpose.ACADEMIC_CONTENT,
        purposeContextId: contentId,
      },
      data,
    });
  });

  it('retains exact Asset, School and parent while preserving soft deletion', async () => {
    const deletedAt = new Date('2026-10-06T00:00:00Z');
    await repository.withTransaction((context) =>
      context.softDeleteAsset(
        { assetId: resourceId, schoolId, contentId },
        deletedAt,
      ),
    );
    expect(updateAsset).toHaveBeenCalledTimes(1);
    expect(updateAsset).toHaveBeenCalledWith({
      where: { id: resourceId, schoolId, academicContentId: contentId },
      data: { deletedAt },
    });
  });
});

describe('ACC READY relationship boundary', () => {
  const schoolId = '11111111-1111-4111-8111-111111111111';
  const contentId = '22222222-2222-4222-8222-222222222222';
  const fileId = '33333333-3333-4333-8333-333333333333';
  const session = { schoolId, purposeContextId: contentId, fileId };

  async function readyLink(rows: {
    content?: { id: string; schoolId: string; deletedAt: Date | null };
    file?: { id: string; schoolId: string; deletedAt: Date | null };
    asset?: {
      schoolId: string;
      academicContentId: string;
      fileId: string;
      deletedAt: Date | null;
    };
  }) {
    const find = <T extends { deletedAt: Date | null }>(
      row: T | undefined,
      where: Record<string, unknown>,
    ) =>
      Promise.resolve(
        row &&
          Object.entries(where).every(
            ([key, value]) => row[key as keyof T] === value,
          )
          ? row
          : null,
      );
    const tx = {
      academicContent: {
        findFirst: jest.fn(({ where }: { where: Record<string, unknown> }) =>
          find(rows.content, where),
        ),
      },
      file: {
        findFirst: jest.fn(({ where }: { where: Record<string, unknown> }) =>
          find(rows.file, where),
        ),
      },
      academicContentAsset: {
        findFirst: jest.fn(({ where }: { where: Record<string, unknown> }) =>
          find(rows.asset, where),
        ),
      },
    };
    const repository = new AcademicContentFileRepository({
      $transaction: (callback: (client: typeof tx) => unknown) => callback(tx),
    } as never);
    const result = await repository.withTransaction((context) =>
      context.readyLink(session as never),
    );
    return { result, tx };
  }

  const active = {
    content: { id: contentId, schoolId, deletedAt: null },
    file: { id: fileId, schoolId, deletedAt: null },
    asset: { schoolId, academicContentId: contentId, fileId, deletedAt: null },
  };

  it('returns metadata only for active content, File, and Asset in one school and relationship', async () => {
    const { result, tx } = await readyLink(active);
    expect(result).toEqual({ file: active.file, asset: active.asset });
    expect(tx.academicContent.findFirst).toHaveBeenCalledWith({
      where: { id: contentId, schoolId, deletedAt: null },
      select: { id: true },
    });
    expect(tx.file.findFirst).toHaveBeenCalledWith({
      where: { id: fileId, schoolId, deletedAt: null },
    });
    expect(tx.academicContentAsset.findFirst).toHaveBeenCalledWith({
      where: {
        academicContentId: contentId,
        fileId,
        schoolId,
        deletedAt: null,
      },
    });
  });

  it.each([
    [
      'content soft-delete',
      { content: { ...active.content, deletedAt: new Date() } },
    ],
    ['File soft-delete', { file: { ...active.file, deletedAt: new Date() } }],
    [
      'Asset soft-delete',
      { asset: { ...active.asset, deletedAt: new Date() } },
    ],
    [
      'foreign content school',
      { content: { ...active.content, schoolId: 'foreign' } },
    ],
    ['foreign File school', { file: { ...active.file, schoolId: 'foreign' } }],
    [
      'foreign Asset school',
      { asset: { ...active.asset, schoolId: 'foreign' } },
    ],
    [
      'wrong content relationship',
      { asset: { ...active.asset, academicContentId: 'other' } },
    ],
    [
      'wrong File relationship',
      { asset: { ...active.asset, fileId: 'other' } },
    ],
  ])('does not expose metadata for %s', async (_case, changed) => {
    const { result } = await readyLink({ ...active, ...changed });
    expect(result).toBeNull();
  });
});

describe('ACC cleanup repository purpose isolation', () => {
  const updateMany = jest.fn().mockResolvedValue({ count: 2 });
  const executeRaw = jest.fn().mockResolvedValue(2);
  const findMany = jest.fn().mockResolvedValue([]);
  const repository = new AcademicContentFileRepository({
    $executeRaw: executeRaw,
    fileUploadSession: { updateMany, findMany },
  } as never);
  const now = new Date('2026-09-24T00:00:00Z');
  const staleBefore = new Date('2026-09-23T23:45:00Z');

  beforeEach(() => jest.clearAllMocks());

  it('releases only the exact terminal claim in its persisted School and parent Content', async () => {
    const identity = {
      uploadId: '11111111-1111-4111-8111-111111111111',
      schoolId: '22222222-2222-4222-8222-222222222222',
      contentId: '33333333-3333-4333-8333-333333333333',
      claimedAt: now,
    };
    await repository.releaseTerminalCleanupClaim(identity);
    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: identity.uploadId,
        schoolId: identity.schoolId,
        purpose: FileUploadPurpose.ACADEMIC_CONTENT,
        purposeContextId: identity.contentId,
        status: {
          in: [
            FileUploadSessionStatus.FAILED,
            FileUploadSessionStatus.CANCELLED,
            FileUploadSessionStatus.EXPIRED,
          ],
        },
        finalCleanupClaimedAt: identity.claimedAt,
        finalObjectDeletedAt: null,
      },
      data: { finalCleanupClaimedAt: null },
    });
  });

  it('expires only ACC CREATED/UPLOADING with provider-safe cleanup deadlines', async () => {
    await expect(repository.expireAbandoned(now)).resolves.toBe(2);
    const [parts, ...values] = executeRaw.mock.calls[0] as [
      TemplateStringsArray,
      ...Date[],
    ];
    const sql = parts.join('?');
    expect(sql).toMatch(/purpose = 'ACADEMIC_CONTENT'/u);
    expect(sql).toMatch(/status IN \([\s\S]*'CREATED'[\s\S]*'UPLOADING'/u);
    expect(sql).not.toMatch(/WHEN status = 'CREATED'/u);
    expect(sql).toMatch(
      /GREATEST\([\s\S]*COALESCE\(latest_upload_url_expires_at, \?\)/u,
    );
    expect(sql).toMatch(/updated_at = \?/u);
    expect(values).toContainEqual(now);
    expect(values).toContainEqual(
      new Date(now.getTime() + 7 * 24 * 60 * 60 * 1_000),
    );
  });

  it('recovers only stale ACC VERIFYING sessions without File', async () => {
    await expect(
      repository.recoverStaleVerification(staleBefore),
    ).resolves.toBe(2);
    const input = (
      updateMany.mock.calls as unknown as Array<
        [
          {
            where: {
              purpose: string;
              status: string;
              fileId: null;
              updatedAt: { lt: Date };
            };
            data: { status: string };
          },
        ]
      >
    )[0][0];
    expect(input.where).toMatchObject({
      purpose: FileUploadPurpose.ACADEMIC_CONTENT,
      status: FileUploadSessionStatus.VERIFYING,
      fileId: null,
      updatedAt: { lt: staleBefore },
    });
    expect(input.data.status).toBe(FileUploadSessionStatus.UPLOADING);
  });

  it('discovers terminal claims or READY orphans, never active READY links or another purpose', async () => {
    await repository.cleanupCandidates(now, staleBefore, 50);
    const input = (
      findMany.mock.calls as unknown as Array<
        [
          {
            where: {
              purpose: string;
              OR: Array<{
                status: unknown;
                file?: {
                  is: {
                    academicContentAssets: { none: { deletedAt: null } };
                    academicContentRevisionAssets: {
                      none: Record<string, never>;
                    };
                  };
                };
              }>;
            };
            take: number;
          },
        ]
      >
    )[0][0];
    expect(input.where.purpose).toBe(FileUploadPurpose.ACADEMIC_CONTENT);
    expect(input.where.OR).toHaveLength(2);
    expect(input.where.OR[1].status).toBe(FileUploadSessionStatus.READY);
    expect(
      input.where.OR[1].file?.is.academicContentAssets.none.deletedAt,
    ).toBeNull();
    expect(
      input.where.OR[1].file?.is.academicContentRevisionAssets.none,
    ).toEqual({});
    expect(input.take).toBe(50);
  });
});

describe('ACC intent repository idempotency boundary', () => {
  const input = {
    id: '11111111-1111-4111-8111-111111111111',
    organizationId: '22222222-2222-4222-8222-222222222222',
    schoolId: '33333333-3333-4333-8333-333333333333',
    createdByUserId: '44444444-4444-4444-8444-444444444444',
    clientRequestId: '55555555-5555-4555-8555-555555555555',
    purposeContextId: '66666666-6666-4666-8666-666666666666',
    originalName: 'lecture.pdf',
    expectedMimeType: 'application/pdf',
    expectedSizeBytes: 10n,
    finalBucket: 'private',
    finalObjectKey: 'academic-content/object',
    expiresAt: new Date('2030-01-01T00:00:00.000Z'),
  };
  const create = jest.fn();
  const findUnique = jest.fn();
  const repository = new AcademicContentFileRepository({
    fileUploadSession: { create, findUnique },
  } as never);

  beforeEach(() => jest.clearAllMocks());

  it('sets ACC purpose and CREATED state inside infrastructure', async () => {
    const session = { ...input, purpose: FileUploadPurpose.ACADEMIC_CONTENT };
    create.mockResolvedValueOnce(session);
    await expect(repository.createOrFindRequest(input)).resolves.toEqual({
      session,
      created: true,
    });
    expect(create).toHaveBeenCalledWith({
      data: {
        ...input,
        purpose: FileUploadPurpose.ACADEMIC_CONTENT,
        status: FileUploadSessionStatus.CREATED,
      },
    });
  });

  it('normalizes only a unique-key replay into an owned existing intent', async () => {
    const existing = { ...input, purpose: FileUploadPurpose.ACADEMIC_CONTENT };
    create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('unique', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    findUnique.mockResolvedValueOnce(existing);
    await expect(repository.createOrFindRequest(input)).resolves.toEqual({
      session: existing,
      created: false,
    });
    expect(findUnique).toHaveBeenCalledWith({
      where: {
        schoolId_createdByUserId_purpose_clientRequestId: {
          schoolId: input.schoolId,
          createdByUserId: input.createdByUserId,
          purpose: FileUploadPurpose.ACADEMIC_CONTENT,
          clientRequestId: input.clientRequestId,
        },
      },
    });
  });
});

describe('ACC READY orphan retirement and finalization', () => {
  const now = new Date('2026-10-07T00:00:00Z');
  const retiredAt = new Date('2026-10-06T00:00:00Z');
  const identity = {
    uploadId: '11111111-1111-4111-8111-111111111111',
    schoolId: '22222222-2222-4222-8222-222222222222',
    contentId: '33333333-3333-4333-8333-333333333333',
    fileId: '44444444-4444-4444-8444-444444444444',
    bucket: 'private',
    objectKey: 'academic-content/object',
  };
  const session = {
    id: identity.uploadId,
    schoolId: identity.schoolId,
    purpose: FileUploadPurpose.ACADEMIC_CONTENT,
    purposeContextId: identity.contentId,
    fileId: identity.fileId,
    status: FileUploadSessionStatus.READY,
    finalCleanupEligibleAt: retiredAt,
    finalObjectDeletedAt: null,
    finalBucket: identity.bucket,
    finalObjectKey: identity.objectKey,
  };
  const tx = {
    $queryRaw: jest.fn(),
    file: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    fileUploadSession: {
      findUnique: jest.fn().mockResolvedValue(session),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const transaction = jest.fn((callback: (client: typeof tx) => unknown) =>
    callback(tx),
  );
  const repository = new AcademicContentFileRepository({
    $transaction: transaction,
  } as never);
  function rawCall(index: number) {
    const [parts, ...values] = tx.$queryRaw.mock.calls[index] as [
      TemplateStringsArray,
      ...unknown[],
    ];
    return { sql: parts.join('?'), values };
  }
  function lockRows(deletedAt: Date | null = null, retained = false) {
    tx.$queryRaw
      .mockResolvedValueOnce([{ id: identity.uploadId }])
      .mockResolvedValueOnce([{ id: identity.fileId, deletedAt }])
      .mockResolvedValueOnce([{ retained }]);
  }
  beforeEach(() => {
    jest.resetAllMocks();
    transaction.mockImplementation((callback) => callback(tx));
    tx.fileUploadSession.findUnique.mockResolvedValue(session);
    tx.file.updateMany.mockResolvedValue({ count: 1 });
    tx.fileUploadSession.updateMany.mockResolvedValue({ count: 1 });
  });

  it('retires the exact School File after canonical retention inspection in a short transaction without claiming READY', async () => {
    lockRows();
    await expect(
      repository.prepareReadyOrphanCleanup(identity.uploadId, now),
    ).resolves.toEqual(identity);
    expect(rawCall(0)).toEqual({
      sql: expect.stringMatching(
        /purpose = 'ACADEMIC_CONTENT'.*FOR UPDATE/su,
      ) as unknown,
      values: [identity.uploadId],
    });
    expect(rawCall(1).sql).toMatch(
      /WHERE id = \?::uuid\s+AND school_id = \?::uuid FOR UPDATE/u,
    );
    expect(rawCall(1).values).toEqual([identity.fileId, identity.schoolId]);
    expect(rawCall(2).sql).toContain('FROM public.attachments');
    expect(tx.file.updateMany).toHaveBeenCalledWith({
      where: {
        id: identity.fileId,
        schoolId: identity.schoolId,
        deletedAt: null,
      },
      data: { deletedAt: now },
    });
    expect(tx.fileUploadSession.updateMany).not.toHaveBeenCalled();
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      maxWait: 10_000,
      timeout: 20_000,
    });
  });

  it('recognizes an already-retired File without resetting its durable retirement timestamp', async () => {
    lockRows(retiredAt);
    await expect(
      repository.prepareReadyOrphanCleanup(identity.uploadId, now),
    ).resolves.toEqual(identity);
    expect(tx.file.updateMany).not.toHaveBeenCalled();
    expect(tx.fileUploadSession.updateMany).not.toHaveBeenCalled();
  });

  it('skips retained Files before retirement or storage eligibility', async () => {
    lockRows(null, true);
    await expect(
      repository.prepareReadyOrphanCleanup(identity.uploadId, now),
    ).resolves.toBeNull();
    expect(tx.file.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    ['not READY', { status: FileUploadSessionStatus.FAILED }],
    ['no File', { fileId: null }],
    ['no deadline', { finalCleanupEligibleAt: null }],
    [
      'future deadline',
      { finalCleanupEligibleAt: new Date(now.getTime() + 1) },
    ],
    ['already finalized', { finalObjectDeletedAt: now }],
  ])('skips %s before File lock', async (_case, changed) => {
    tx.$queryRaw.mockResolvedValueOnce([{ id: identity.uploadId }]);
    tx.fileUploadSession.findUnique.mockResolvedValue({
      ...session,
      ...changed,
    });
    await expect(
      repository.prepareReadyOrphanCleanup(identity.uploadId, now),
    ).resolves.toBeNull();
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.file.updateMany).not.toHaveBeenCalled();
  });

  it('fails closed on a missing persisted ACC parent before File lock', async () => {
    tx.$queryRaw.mockResolvedValueOnce([{ id: identity.uploadId }]);
    tx.fileUploadSession.findUnique.mockResolvedValue({
      ...session,
      purposeContextId: null,
    });
    await expect(
      repository.prepareReadyOrphanCleanup(identity.uploadId, now),
    ).rejects.toThrow('academic_content_cleanup_context_missing');
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('does not retire a missing/foreign-purpose upload', async () => {
    tx.$queryRaw.mockResolvedValueOnce([]);
    await expect(
      repository.prepareReadyOrphanCleanup(identity.uploadId, now),
    ).resolves.toBeNull();
    expect(tx.fileUploadSession.findUnique).not.toHaveBeenCalled();
    expect(tx.file.updateMany).not.toHaveBeenCalled();
  });

  it('fails retirement if the exact final File write does not affect one row', async () => {
    lockRows();
    tx.file.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      repository.prepareReadyOrphanCleanup(identity.uploadId, now),
    ).rejects.toThrow('academic_content_cleanup_file_retirement_failed');
  });

  it('finalizes with exact persisted tenant/parent/File identity and the original retirement timestamp', async () => {
    lockRows(retiredAt);
    await repository.finalizeReadyOrphanCleanup(identity, now);
    const lock = rawCall(0);
    expect(lock.sql).toMatch(
      /school_id = \?::uuid[\s\S]*purpose = 'ACADEMIC_CONTENT'[\s\S]*purpose_context_id = \?::uuid[\s\S]*file_id = \?::uuid AND status = 'READY'[\s\S]*final_object_deleted_at IS NULL FOR UPDATE/u,
    );
    expect(lock.values).toEqual([
      identity.uploadId,
      identity.schoolId,
      identity.contentId,
      identity.fileId,
    ]);
    expect(rawCall(1).values).toEqual([identity.fileId, identity.schoolId]);
    expect(tx.fileUploadSession.updateMany).toHaveBeenCalledWith({
      where: {
        id: identity.uploadId,
        schoolId: identity.schoolId,
        purpose: FileUploadPurpose.ACADEMIC_CONTENT,
        purposeContextId: identity.contentId,
        fileId: identity.fileId,
        status: FileUploadSessionStatus.READY,
        finalObjectDeletedAt: null,
      },
      data: {
        status: FileUploadSessionStatus.PURGED,
        finalCleanupClaimedAt: retiredAt,
        finalObjectDeletedAt: now,
      },
    });
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      maxWait: 10_000,
      timeout: 20_000,
    });
    expect(tx.file.updateMany).not.toHaveBeenCalled();
  });

  it('does not finalize an identity/state mismatch or concurrently finalized upload', async () => {
    tx.$queryRaw.mockResolvedValueOnce([]);
    await repository.finalizeReadyOrphanCleanup(identity, now);
    expect(tx.fileUploadSession.updateMany).not.toHaveBeenCalled();
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('rejects finalization for a live File or a retained reference', async () => {
    lockRows();
    await expect(
      repository.finalizeReadyOrphanCleanup(identity, now),
    ).rejects.toThrow('academic_content_cleanup_file_not_retired');
    tx.$queryRaw.mockReset();
    lockRows(retiredAt, true);
    await expect(
      repository.finalizeReadyOrphanCleanup(identity, now),
    ).rejects.toThrow('academic_content_cleanup_asset_race');
    expect(tx.fileUploadSession.updateMany).not.toHaveBeenCalled();
  });

  it('fails closed when the final exact Upload write misses', async () => {
    lockRows(retiredAt);
    tx.fileUploadSession.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      repository.finalizeReadyOrphanCleanup(identity, now),
    ).rejects.toThrow('academic_content_cleanup_finalization_failed');
  });
});
