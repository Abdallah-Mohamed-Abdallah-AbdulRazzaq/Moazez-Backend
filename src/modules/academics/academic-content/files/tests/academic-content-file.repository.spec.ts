import {
  FileUploadPurpose,
  FileUploadSessionStatus,
  Prisma,
} from '@prisma/client';
import { AcademicContentFileRepository } from '../infrastructure/academic-content-file.repository';

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

  it('expires only ACC CREATED/UPLOADING with provider-safe cleanup deadlines', async () => {
    await expect(repository.expireAbandoned(now)).resolves.toBe(2);
    const [parts, ...values] = executeRaw.mock.calls[0] as [
      TemplateStringsArray,
      ...Date[],
    ];
    const sql = parts.join('?');
    expect(sql).toMatch(/purpose = 'ACADEMIC_CONTENT'/u);
    expect(sql).toMatch(/status IN \([\s\S]*'CREATED'[\s\S]*'UPLOADING'/u);
    expect(sql).toMatch(/WHEN status = 'CREATED'[\s\S]*THEN \?/u);
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
                  is: { academicContentAssets: { none: { deletedAt: null } } };
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
