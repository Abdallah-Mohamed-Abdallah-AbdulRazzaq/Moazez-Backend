import { FileUploadPurpose, FileUploadSessionStatus } from '@prisma/client';
import { AcademicContentFileRepository } from '../infrastructure/academic-content-file.repository';

describe('ACC cleanup repository purpose isolation', () => {
  const updateMany = jest.fn().mockResolvedValue({ count: 2 });
  const findMany = jest.fn().mockResolvedValue([]);
  const repository = new AcademicContentFileRepository({
    fileUploadSession: { updateMany, findMany },
  } as never);
  const now = new Date('2026-09-24T00:00:00Z');
  const staleBefore = new Date('2026-09-23T23:45:00Z');

  beforeEach(() => jest.clearAllMocks());

  it('expires only ACC CREATED/UPLOADING sessions', async () => {
    await expect(repository.expireAbandoned(now)).resolves.toBe(2);
    const input = (
      updateMany.mock.calls as unknown as Array<
        [
          {
            where: {
              purpose: string;
              status: { in: string[] };
              expiresAt: { lte: Date };
            };
            data: { status: string; finalCleanupEligibleAt: Date };
          },
        ]
      >
    )[0][0];
    expect(input.where.purpose).toBe(FileUploadPurpose.ACADEMIC_CONTENT);
    expect(input.where.status.in).toEqual([
      FileUploadSessionStatus.CREATED,
      FileUploadSessionStatus.UPLOADING,
    ]);
    expect(input.data.status).toBe(FileUploadSessionStatus.EXPIRED);
    expect(input.data.finalCleanupEligibleAt).toEqual(now);
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
