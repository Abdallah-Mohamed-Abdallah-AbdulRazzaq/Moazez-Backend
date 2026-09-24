import {
  FileUploadPurpose,
  FileUploadSessionStatus,
  Prisma,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
} from '../../../../../common/context/request-context';
import { AcademicContentFileRejection } from '../application/academic-content-file-verifier';
import {
  CancelAcademicContentUploadUseCase,
  CompleteAcademicContentUploadUseCase,
  CreateAcademicContentUploadUseCase,
} from '../application/academic-content-upload.use-cases';

const schoolId = '11111111-1111-4111-8111-111111111111';
const actorId = '22222222-2222-4222-8222-222222222222';
const contentId = '33333333-3333-4333-8333-333333333333';
const uploadId = '44444444-4444-4444-8444-444444444444';
const requestId = '55555555-5555-4555-8555-555555555555';
const capabilityExpiresAt = new Date('2030-09-24T00:00:00.000Z');

function withManager<T>(
  run: () => T,
  userType = UserType.SCHOOL_USER,
  permissions = ['academics.academic_content.manage'],
): T {
  const context = createRequestContext();
  context.actor = { id: actorId, userType };
  context.activeMembership = {
    membershipId: 'm',
    schoolId,
    organizationId: '66666666-6666-4666-8666-666666666666',
    roleId: 'r',
    permissions,
  };
  return runWithRequestContext(context, run);
}

describe('ACC upload intent', () => {
  const existing = {
    id: uploadId,
    schoolId,
    createdByUserId: actorId,
    purpose: FileUploadPurpose.ACADEMIC_CONTENT,
    purposeContextId: contentId,
    originalName: 'lecture.pdf',
    expectedMimeType: 'application/pdf',
    expectedSizeBytes: 10n,
    finalBucket: 'private',
    finalObjectKey: `academic-content/${schoolId}/objects/${uploadId}`,
    expiresAt: new Date(Date.now() + 10000),
    status: FileUploadSessionStatus.CREATED,
  };
  const repository = {
    findContent: jest.fn().mockResolvedValue({ id: contentId }),
    create: jest.fn().mockResolvedValue(existing),
    findRequest: jest.fn().mockResolvedValue(existing),
    prisma: {
      fileUploadSession: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    },
  };
  const policy = {
    resolve: jest.fn().mockResolvedValue({
      attachmentsEnabled: true,
      maximumFileSizeBytes: 536870912n,
    }),
    categoryEnabled: jest.fn().mockReturnValue(true),
  };
  const storage = {
    getCapabilities: jest.fn().mockReturnValue({ resumableUpload: true }),
    resolveBucket: jest.fn().mockReturnValue('private'),
    createResumableUploadSession: jest.fn().mockResolvedValue({
      sessionUrl: 'https://provider.example/session',
      expiresAt: capabilityExpiresAt,
    }),
  };
  const useCase = new CreateAcademicContentUploadUseCase(
    repository as never,
    policy as never,
    storage as never,
  );
  const command = {
    contentId,
    clientRequestId: requestId,
    originalName: 'lecture.pdf',
    expectedMimeType: 'application/pdf',
    expectedSizeBytes: '10',
  };

  beforeEach(() => jest.clearAllMocks());

  it('creates one purpose-bound direct-to-private intent and returns only transient capability', async () => {
    await expect(
      withManager(() => useCase.execute(command)),
    ).resolves.toMatchObject({
      status: FileUploadSessionStatus.UPLOADING,
      uploadMode: 'resumable',
      sessionUrl: 'https://provider.example/session',
      capabilityExpiresAt,
    });
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId,
        createdByUserId: actorId,
        purpose: FileUploadPurpose.ACADEMIC_CONTENT,
        purposeContextId: contentId,
        finalBucket: 'private',
        expectedSizeBytes: 10n,
      }),
    );
    const createdInput = (
      repository.create.mock.calls as unknown as Array<
        [Record<string, unknown>]
      >
    )[0][0];
    expect(createdInput).not.toHaveProperty('stagingBucket');
    expect(createdInput).not.toHaveProperty('stagingObjectKey');
    expect(storage.createResumableUploadSession).toHaveBeenCalledTimes(1);
    expect(repository.prisma.fileUploadSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          status: FileUploadSessionStatus.UPLOADING,
          latestUploadUrlExpiresAt: capabilityExpiresAt,
        },
      }),
    );
    expect(
      JSON.stringify(repository.prisma.fileUploadSession.updateMany.mock.calls),
    ).not.toContain('provider.example/session');
  });

  it('never reissues capability on unique-key replay, and detects payload mismatch', async () => {
    repository.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('unique', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    await expect(
      withManager(() => useCase.execute(command)),
    ).rejects.toMatchObject({
      code: 'academic_content.file.upload_capability_not_reissuable',
    });
    expect(storage.createResumableUploadSession).not.toHaveBeenCalled();
    repository.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('unique', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    await expect(
      withManager(() =>
        useCase.execute({ ...command, expectedSizeBytes: '11' }),
      ),
    ).rejects.toMatchObject({
      code: 'academic_content.file.idempotency_payload_mismatch',
    });
  });

  it.each([
    { originalName: 'other.pdf' },
    { contentId: '77777777-7777-4777-8777-777777777777' },
    { expectedSizeBytes: '11' },
  ])(
    'rejects replay with changed $originalName$contentId$expectedSizeBytes',
    async (change) => {
      repository.create.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('unique', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );
      await expect(
        withManager(() => useCase.execute({ ...command, ...change })),
      ).rejects.toMatchObject({
        code: 'academic_content.file.idempotency_payload_mismatch',
      });
      expect(storage.createResumableUploadSession).not.toHaveBeenCalled();
    },
  );

  it('terminalizes a newly created session if the first capability creation fails', async () => {
    storage.createResumableUploadSession.mockRejectedValueOnce(
      new Error('secret provider detail'),
    );
    await expect(
      withManager(() => useCase.execute(command)),
    ).rejects.toMatchObject({
      code: 'academic_content.file.resumable_capability_failed',
    });
    const update = (
      repository.prisma.fileUploadSession.updateMany.mock
        .calls as unknown as Array<
        [
          {
            data: {
              status: string;
              failureReason: string;
              finalCleanupEligibleAt: Date;
            };
          },
        ]
      >
    )[0][0];
    expect(update.data.status).toBe(FileUploadSessionStatus.FAILED);
    expect(update.data.failureReason).toBe('resumable_capability_failed');
    expect(update.data.finalCleanupEligibleAt).toBeInstanceOf(Date);
  });

  it('fails closed for teachers and unavailable resumable storage', async () => {
    await expect(
      withManager(() => useCase.execute(command), UserType.TEACHER),
    ).rejects.toMatchObject({ code: 'auth.scope.missing' });
    storage.getCapabilities.mockReturnValueOnce({ resumableUpload: false });
    await expect(
      withManager(() => useCase.execute(command)),
    ).rejects.toMatchObject({
      code: 'academic_content.file.storage_resumable_upload_unavailable',
    });
  });

  it('accepts organization managers but rejects Parent and Student actors', async () => {
    await expect(
      withManager(() => useCase.execute(command), UserType.ORGANIZATION_USER),
    ).resolves.toMatchObject({ uploadMode: 'resumable' });
    await expect(
      withManager(() => useCase.execute(command), UserType.PARENT),
    ).rejects.toMatchObject({ code: 'auth.scope.missing' });
    await expect(
      withManager(() => useCase.execute(command), UserType.STUDENT),
    ).rejects.toMatchObject({ code: 'auth.scope.missing' });
  });

  it('does not create an intent for content outside the active school', async () => {
    repository.findContent.mockResolvedValueOnce(null);
    await expect(
      withManager(() => useCase.execute(command)),
    ).rejects.toMatchObject({ code: 'not_found' });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('rejects disabled uploads, disabled categories, school-size excess and malformed declarations', async () => {
    policy.resolve.mockResolvedValueOnce({
      attachmentsEnabled: false,
      maximumFileSizeBytes: 536870912n,
    });
    await expect(
      withManager(() => useCase.execute(command)),
    ).rejects.toMatchObject({ code: 'validation.failed' });
    policy.categoryEnabled.mockReturnValueOnce(false);
    await expect(
      withManager(() => useCase.execute(command)),
    ).rejects.toMatchObject({ code: 'validation.failed' });
    policy.resolve.mockResolvedValueOnce({
      attachmentsEnabled: true,
      maximumFileSizeBytes: 9n,
    });
    await expect(
      withManager(() => useCase.execute(command)),
    ).rejects.toMatchObject({ code: 'validation.failed' });
    await expect(
      withManager(() =>
        useCase.execute({ ...command, expectedSizeBytes: '0' }),
      ),
    ).rejects.toMatchObject({ code: 'validation.failed' });
    await expect(
      withManager(() =>
        useCase.execute({ ...command, expectedSizeBytes: '-1' }),
      ),
    ).rejects.toMatchObject({ code: 'validation.failed' });
    await expect(
      withManager(() =>
        useCase.execute({ ...command, expectedSizeBytes: '10737418241' }),
      ),
    ).rejects.toMatchObject({ code: 'validation.failed' });
    await expect(
      withManager(() =>
        useCase.execute({
          ...command,
          expectedMimeType: 'application/octet-stream',
        }),
      ),
    ).rejects.toMatchObject({ code: 'validation.failed' });
    await expect(
      withManager(() =>
        useCase.execute({ ...command, originalName: 'unsafe.exe' }),
      ),
    ).rejects.toMatchObject({ code: 'validation.failed' });
    await expect(
      withManager(() => useCase.execute({ ...command, originalName: '' })),
    ).rejects.toMatchObject({ code: 'validation.failed' });
    expect(repository.create).not.toHaveBeenCalled();
    expect(storage.createResumableUploadSession).not.toHaveBeenCalled();
  });
});

describe('ACC completion and cancellation', () => {
  const base = {
    id: uploadId,
    schoolId,
    createdByUserId: actorId,
    purpose: FileUploadPurpose.ACADEMIC_CONTENT,
    purposeContextId: contentId,
    status: FileUploadSessionStatus.UPLOADING,
    expiresAt: new Date(Date.now() + 100000),
    finalBucket: 'private',
    finalObjectKey: 'key',
    organizationId: 'org',
    originalName: 'x.pdf',
    expectedMimeType: 'application/pdf',
    expectedSizeBytes: 10n,
    latestUploadUrlExpiresAt: capabilityExpiresAt,
  };
  const tx = {
    fileUploadSession: { update: jest.fn().mockResolvedValue(base) },
    academicContent: {
      findFirst: jest.fn().mockResolvedValue({ id: contentId }),
    },
    file: { create: jest.fn().mockResolvedValue({ id: 'file' }) },
    academicContentAsset: {
      create: jest.fn().mockResolvedValue({ id: 'asset' }),
    },
    auditLog: { create: jest.fn() },
  };
  const repository = {
    lock: jest.fn().mockResolvedValue(base),
    readyLink: jest
      .fn()
      .mockResolvedValue({ file: { id: 'file' }, asset: { id: 'asset' } }),
    prisma: {
      $transaction: jest.fn((callback: (value: typeof tx) => unknown) =>
        callback(tx),
      ),
      fileUploadSession: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    },
  };
  const verifier = {
    verify: jest
      .fn()
      .mockResolvedValue({ mimeType: 'application/pdf', sizeBytes: 10n }),
  };
  const complete = new CompleteAcademicContentUploadUseCase(
    repository as never,
    verifier as never,
  );
  const cancel = new CancelAcademicContentUploadUseCase(repository as never);

  beforeEach(() => {
    jest.clearAllMocks();
    repository.lock.mockResolvedValue(base);
  });

  it('finalizes File, Asset, READY and audit in one transaction after verification', async () => {
    repository.lock.mockResolvedValueOnce(base).mockResolvedValueOnce({
      ...base,
      status: FileUploadSessionStatus.VERIFYING,
    });
    await expect(
      withManager(() => complete.execute({ contentId, uploadId })),
    ).resolves.toMatchObject({ file: { id: 'file' }, asset: { id: 'asset' } });
    expect(verifier.verify).toHaveBeenCalledTimes(1);
    expect(tx.file.create).toHaveBeenCalledTimes(1);
    expect(tx.academicContentAsset.create).toHaveBeenCalledTimes(1);
    const readyUpdate = (
      tx.fileUploadSession.update.mock.calls as unknown as Array<
        [
          {
            data: {
              status: string;
              verifiedMimeType: string;
              verificationVersion: string;
            };
          },
        ]
      >
    )[1][0];
    expect(readyUpdate.data).toMatchObject({
      status: FileUploadSessionStatus.READY,
      verifiedMimeType: 'application/pdf',
      verificationVersion: 'academic-content-bounded-v1',
    });
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it('returns READY relationship without re-verifying or creating duplicates', async () => {
    repository.lock.mockResolvedValueOnce({
      ...base,
      status: FileUploadSessionStatus.READY,
      fileId: 'file',
    });
    await expect(
      withManager(() => complete.execute({ contentId, uploadId })),
    ).resolves.toMatchObject({ file: { id: 'file' }, asset: { id: 'asset' } });
    expect(verifier.verify).not.toHaveBeenCalled();
    expect(tx.file.create).not.toHaveBeenCalled();
  });

  it('marks deterministic rejection FAILED but releases retryable infrastructure failure', async () => {
    verifier.verify.mockRejectedValueOnce(
      new AcademicContentFileRejection('mime_signature_mismatch'),
    );
    await expect(
      withManager(() => complete.execute({ contentId, uploadId })),
    ).rejects.toMatchObject({
      code: 'academic_content.file.mime_signature_mismatch',
    });
    const failedUpdate = (
      repository.prisma.fileUploadSession.updateMany.mock
        .calls as unknown as Array<
        [{ data: { status: string; finalCleanupEligibleAt: Date } }]
      >
    )[0][0];
    expect(failedUpdate.data.status).toBe(FileUploadSessionStatus.FAILED);
    expect(failedUpdate.data.finalCleanupEligibleAt.getTime()).toBeLessThan(
      capabilityExpiresAt.getTime(),
    );
    verifier.verify.mockRejectedValueOnce(new Error('temporary'));
    await expect(
      withManager(() => complete.execute({ contentId, uploadId })),
    ).rejects.toMatchObject({
      code: 'academic_content.file.verification_retryable',
    });
    expect(repository.prisma.fileUploadSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: FileUploadSessionStatus.UPLOADING },
      }),
    );
  });

  it('defers a missing-object rejection while the provider capability can still finalize', async () => {
    verifier.verify.mockRejectedValueOnce(
      new AcademicContentFileRejection('object_missing'),
    );
    await expect(
      withManager(() => complete.execute({ contentId, uploadId })),
    ).rejects.toMatchObject({ code: 'academic_content.file.object_missing' });
    const update = (
      repository.prisma.fileUploadSession.updateMany.mock
        .calls as unknown as Array<
        [
          {
            data: { status: string; finalCleanupEligibleAt: Date };
          },
        ]
      >
    )[0][0];
    expect(update.data).toMatchObject({
      status: FileUploadSessionStatus.FAILED,
      finalCleanupEligibleAt: capabilityExpiresAt,
    });
  });

  it('cancels only an owned CREATED/UPLOADING session, without storage deletion', async () => {
    await expect(
      withManager(() => cancel.execute({ contentId, uploadId })),
    ).resolves.toBeDefined();
    const cancelUpdate = (
      tx.fileUploadSession.update.mock.calls as unknown as Array<
        [{ data: { status: string; finalCleanupEligibleAt: Date } }]
      >
    )[0][0];
    expect(cancelUpdate.data.status).toBe(FileUploadSessionStatus.CANCELLED);
    expect(cancelUpdate.data.finalCleanupEligibleAt).toEqual(
      capabilityExpiresAt,
    );
    repository.lock.mockResolvedValueOnce({
      ...base,
      status: FileUploadSessionStatus.READY,
    });
    await expect(
      withManager(() => cancel.execute({ contentId, uploadId })),
    ).rejects.toMatchObject({
      code: 'academic_content.file.upload_not_cancellable',
    });
  });

  it('defers completion-time expiry until the issued capability expires', async () => {
    repository.lock.mockResolvedValueOnce({
      ...base,
      expiresAt: new Date('2026-09-23T00:00:00.000Z'),
    });
    await expect(
      withManager(() => complete.execute({ contentId, uploadId })),
    ).rejects.toMatchObject({ code: 'academic_content.file.upload_expired' });
    expect(tx.fileUploadSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          status: FileUploadSessionStatus.EXPIRED,
          finalCleanupEligibleAt: capabilityExpiresAt,
        },
      }),
    );
    expect(verifier.verify).not.toHaveBeenCalled();
  });

  it('uses exact school, actor, purpose and content ownership for completion and cancellation', async () => {
    repository.lock.mockResolvedValueOnce(null);
    await expect(
      withManager(() => complete.execute({ contentId, uploadId })),
    ).rejects.toMatchObject({ code: 'not_found' });
    expect(repository.lock).toHaveBeenCalledWith(tx, {
      uploadId,
      contentId,
      schoolId,
      actorId,
    });
    expect(verifier.verify).not.toHaveBeenCalled();
    repository.lock.mockResolvedValueOnce(null);
    await expect(
      withManager(() => cancel.execute({ contentId, uploadId })),
    ).rejects.toMatchObject({ code: 'not_found' });
    expect(tx.fileUploadSession.update).not.toHaveBeenCalled();
  });
});
