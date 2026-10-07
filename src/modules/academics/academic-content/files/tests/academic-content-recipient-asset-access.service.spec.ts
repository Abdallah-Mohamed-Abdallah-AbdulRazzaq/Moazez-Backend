import { AcademicContentCurrentRecipientContext } from '../../domain/academic-content-current-access.policy';
import { AcademicContentRecipientReadRepository } from '../../infrastructure/academic-content-recipient-read.repository';
import { AcademicContentRecipientAssetAccessService } from '../application/academic-content-recipient-asset-access.service';
import { AcademicContentFilePolicyResolver } from '../application/academic-content-file-policy.resolver';
import { AcademicContentAuthorizedFileSigner } from '../application/academic-content-authorized-file.signer';
import { StorageService } from '../../../../../infrastructure/storage/storage.service';

describe('ACC-10D recipient asset policy orchestration', () => {
  const reads = { findCurrentRecipientAsset: jest.fn() };
  const policy = { resolve: jest.fn() };
  const storage = { createDownloadUrl: jest.fn() };
  const service = new AcademicContentRecipientAssetAccessService(
    reads as unknown as AcademicContentRecipientReadRepository,
    policy as unknown as AcademicContentFilePolicyResolver,
    new AcademicContentAuthorizedFileSigner(
      storage as unknown as StorageService,
    ),
  );
  const base = {
    schoolId: 'school',
    userId: 'actor',
    studentId: 'student',
    enrollmentId: 'enrollment',
    classroomId: 'classroom',
    academicYearId: 'year',
    termId: 'term',
  };
  const asset = {
    publicationId: 'publication',
    revisionId: 'revision',
    visibleUntil: null,
    bucket: 'private',
    objectKey: 'private/object',
    originalName: 'resource.pdf',
    mimeType: 'application/pdf',
  };
  beforeEach(() => {
    jest.resetAllMocks();
    reads.findCurrentRecipientAsset.mockResolvedValue(asset);
    policy.resolve.mockResolvedValue({
      allowStudentDownload: true,
      allowGuardianDownload: true,
      allowInlinePreview: true,
    });
    storage.createDownloadUrl.mockResolvedValue({
      url: 'https://capability.invalid/private',
    });
  });
  it.each(['STUDENT', 'PARENT'] as const)(
    '%s download uses only its own current recipient flag',
    async (actorKind) => {
      const context: AcademicContentCurrentRecipientContext =
        actorKind === 'STUDENT'
          ? { ...base, actorKind }
          : { ...base, actorKind, guardianIds: ['guardian'] };
      policy.resolve.mockResolvedValue({
        allowStudentDownload: actorKind === 'STUDENT',
        allowGuardianDownload: actorKind === 'PARENT',
        allowInlinePreview: true,
      });
      await expect(
        service.access(context, 'content', 'file', 'download'),
      ).resolves.toEqual({ url: 'https://capability.invalid/private' });
      expect(reads.findCurrentRecipientAsset).toHaveBeenCalledWith(
        context,
        'content',
        'file',
        expect.any(Date),
      );
      expect(
        reads.findCurrentRecipientAsset.mock.invocationCallOrder[0],
      ).toBeLessThan(policy.resolve.mock.invocationCallOrder[0]);
      policy.resolve.mockResolvedValue({
        allowStudentDownload: actorKind !== 'STUDENT',
        allowGuardianDownload: actorKind !== 'PARENT',
        allowInlinePreview: true,
      });
      storage.createDownloadUrl.mockClear();
      await expect(
        service.access(context, 'content', 'file', 'download'),
      ).rejects.toMatchObject({
        code: 'academic_content.file.download_unavailable',
        httpStatus: 403,
      });
      expect(storage.createDownloadUrl).not.toHaveBeenCalled();
      await expect(
        service.access(context, 'content', 'file', 'preview'),
      ).resolves.toEqual({ url: 'https://capability.invalid/private' });
    },
  );
  it('does not read policy or sign when canonical asset authorization denies', async () => {
    reads.findCurrentRecipientAsset.mockResolvedValue(null);
    await expect(
      service.access(
        { ...base, actorKind: 'STUDENT' },
        'content',
        'file',
        'download',
      ),
    ).rejects.toMatchObject({ code: 'not_found', httpStatus: 404 });
    expect(policy.resolve).not.toHaveBeenCalled();
    expect(storage.createDownloadUrl).not.toHaveBeenCalled();
  });
  it('validates mode before lookup', async () => {
    await expect(
      service.access(
        { ...base, actorKind: 'STUDENT' },
        'content',
        'file',
        'invalid' as 'preview',
      ),
    ).rejects.toMatchObject({ code: 'validation.failed', httpStatus: 400 });
    expect(reads.findCurrentRecipientAsset).not.toHaveBeenCalled();
  });
  it('uses fresh signer time after delayed policy resolution', async () => {
    jest.useFakeTimers();
    const now = new Date('2026-10-07T12:00:00.000Z');
    jest.setSystemTime(now);
    reads.findCurrentRecipientAsset.mockResolvedValue({
      ...asset,
      visibleUntil: new Date(now.getTime() + 90_000),
    });
    policy.resolve.mockImplementation(() => {
      jest.setSystemTime(new Date(now.getTime() + 89_500));
      return Promise.resolve({
        allowStudentDownload: true,
        allowInlinePreview: true,
      });
    });
    try {
      await expect(
        service.access(
          { ...base, actorKind: 'STUDENT' },
          'content',
          'file',
          'download',
        ),
      ).rejects.toMatchObject({ code: 'not_found' });
      expect(storage.createDownloadUrl).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
});
