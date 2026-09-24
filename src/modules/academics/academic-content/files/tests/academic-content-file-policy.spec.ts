import type { AcademicContentFilePolicy } from '@prisma/client';
import { AcademicContentFilePolicyResolver } from '../application/academic-content-file-policy.resolver';

describe('ACC effective file policy', () => {
  const findUnique = jest.fn().mockResolvedValue(null);
  const resolver = new AcademicContentFilePolicyResolver({
    findPolicy: async (
      schoolId: string,
    ): Promise<AcademicContentFilePolicy | null> =>
      (await findUnique({
        where: { schoolId },
      })) as AcademicContentFilePolicy | null,
  } as never);

  beforeEach(() => {
    jest.clearAllMocks();
    findUnique.mockResolvedValue(null);
  });

  it('uses 512 MiB defaults without creating a policy row', async () => {
    const policy = await resolver.resolve('school');
    expect(findUnique).toHaveBeenCalledWith({ where: { schoolId: 'school' } });
    expect(policy).toEqual({
      attachmentsEnabled: true,
      maximumFileSizeBytes: 536870912n,
      documentsEnabled: true,
      imagesEnabled: true,
      videosEnabled: true,
      audioEnabled: true,
      archivesEnabled: false,
      otherFilesEnabled: false,
      allowStudentDownload: true,
      allowGuardianDownload: true,
      allowInlinePreview: true,
    });
    expect(resolver.categoryEnabled(policy, 'ARCHIVE')).toBe(false);
    expect(resolver.categoryEnabled(policy, 'OTHER')).toBe(false);
    for (const category of ['DOCUMENT', 'IMAGE', 'VIDEO', 'AUDIO'] as const)
      expect(resolver.categoryEnabled(policy, category)).toBe(true);
  });

  it('caps even an inconsistent stored maximum at the 10 GiB platform ceiling', async () => {
    findUnique.mockResolvedValueOnce({
      maximumFileSizeBytes: 20n * 1024n * 1024n * 1024n,
      attachmentsEnabled: true,
      documentsEnabled: false,
      archivesEnabled: true,
    });
    const policy = await resolver.resolve('school');
    expect(policy.maximumFileSizeBytes).toBe(10737418240n);
    expect(resolver.categoryEnabled(policy, 'DOCUMENT')).toBe(false);
    expect(resolver.categoryEnabled(policy, 'ARCHIVE')).toBe(true);
  });
});
