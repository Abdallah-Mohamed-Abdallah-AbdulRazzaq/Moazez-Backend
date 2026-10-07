import { randomUUID } from 'node:crypto';
import { FileVisibility, type File } from '@prisma/client';
import { StorageService } from '../../../../../infrastructure/storage/storage.service';
import { AcademicContentRepository } from '../../infrastructure/academic-content.repository';
import { AcademicContentFileRepository } from '../infrastructure/academic-content-file.repository';
import { AcademicContentFilePolicyResolver } from '../application/academic-content-file-policy.resolver';
import { AcademicContentAssetAccessOperations } from '../application/academic-content-asset-access.operations';
import { AcademicContentAuthorizedFileSigner } from '../application/academic-content-authorized-file.signer';

describe('ACC-9C authorized asset signing', () => {
  const scope = { schoolId: randomUUID(), teacherUserId: randomUUID() };
  const contentId = randomUUID(),
    assetId = randomUUID(),
    revisionId = randomUUID();
  const contents = { findAllocationReaderDetail: jest.fn() };
  const files = {
    findCurrentAssetFile: jest.fn(),
    findRevisionAssetFile: jest.fn(),
  };
  const policy = { resolve: jest.fn() };
  const storage = { createDownloadUrl: jest.fn() };
  const operations = new AcademicContentAssetAccessOperations(
    contents as unknown as AcademicContentRepository,
    files as unknown as AcademicContentFileRepository,
    policy as unknown as AcademicContentFilePolicyResolver,
    new AcademicContentAuthorizedFileSigner(
      storage as unknown as StorageService,
    ),
  );
  const file = {
    id: randomUUID(),
    schoolId: scope.schoolId,
    deletedAt: null,
    bucket: 'private-fixture',
    objectKey: 'private/object',
    visibility: FileVisibility.PRIVATE,
    originalName: 'resource.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 100n,
  } as File;
  beforeEach(() => {
    jest.resetAllMocks();
    contents.findAllocationReaderDetail.mockResolvedValue({ id: contentId });
    files.findCurrentAssetFile.mockResolvedValue(file);
    files.findRevisionAssetFile.mockResolvedValue(file);
    policy.resolve.mockResolvedValue({
      allowInlinePreview: true,
      allowStudentDownload: false,
      allowGuardianDownload: false,
    });
    storage.createDownloadUrl.mockResolvedValue({
      url: 'https://capability.invalid/private',
    });
  });

  it.each([
    ['resource.pdf', 'application/pdf'],
    ['image.png', 'image/png'],
    ['video.mp4', 'video/mp4'],
    ['audio.mp3', 'audio/mpeg'],
  ])(
    'previews registry-supported %s with exact MIME, inline disposition and 300s TTL',
    async (originalName, mimeType) => {
      files.findCurrentAssetFile.mockResolvedValue({
        ...file,
        originalName,
        mimeType,
      });
      expect(
        await operations.current(scope, contentId, assetId, 'preview'),
      ).toEqual({ url: 'https://capability.invalid/private' });
      expect(storage.createDownloadUrl).toHaveBeenCalledWith({
        bucket: file.bucket,
        objectKey: file.objectKey,
        expiresInSeconds: 300,
        disposition: 'inline',
        contentType: mimeType,
        downloadFileName: originalName,
      });
    },
  );
  it('requires effective School preview policy', async () => {
    policy.resolve.mockResolvedValue({ allowInlinePreview: false });
    await expect(
      operations.current(scope, contentId, assetId, 'preview'),
    ).rejects.toMatchObject({
      code: 'academic_content.file.preview_unavailable',
    });
    expect(storage.createDownloadUrl).not.toHaveBeenCalled();
  });
  it.each([
    [
      'document.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
    ['archive.zip', 'application/zip'],
    ['mismatch.png', 'application/pdf'],
  ])('denies inline preview for %s', async (originalName, mimeType) => {
    files.findCurrentAssetFile.mockResolvedValue({
      ...file,
      originalName,
      mimeType,
    });
    await expect(
      operations.current(scope, contentId, assetId, 'preview'),
    ).rejects.toMatchObject({
      code: 'academic_content.file.preview_unavailable',
    });
    expect(storage.createDownloadUrl).not.toHaveBeenCalled();
  });
  it.each(['current', 'revision'] as const)(
    'allows %s downloads independently of Student/Guardian flags',
    async (kind) => {
      await (kind === 'current'
        ? operations.current(scope, contentId, assetId, 'download')
        : operations.revision(
            scope,
            contentId,
            revisionId,
            file.id,
            'download',
          ));
      expect(storage.createDownloadUrl).toHaveBeenCalledWith({
        bucket: file.bucket,
        objectKey: file.objectKey,
        expiresInSeconds: 300,
        disposition: 'attachment',
        contentType: file.mimeType,
        downloadFileName: file.originalName,
      });
      expect(policy.resolve).not.toHaveBeenCalled();
    },
  );
  it.each(['current', 'revision'] as const)(
    '%s access fails before resolving files when current parent is not readable',
    async (kind) => {
      contents.findAllocationReaderDetail.mockResolvedValue(null);
      await expect(
        kind === 'current'
          ? operations.current(scope, contentId, assetId, 'download')
          : operations.revision(
              scope,
              contentId,
              revisionId,
              file.id,
              'download',
            ),
      ).rejects.toThrow('Academic content not found');
      expect(files.findCurrentAssetFile).not.toHaveBeenCalled();
      expect(files.findRevisionAssetFile).not.toHaveBeenCalled();
      expect(storage.createDownloadUrl).not.toHaveBeenCalled();
    },
  );
  it.each([
    null,
    { ...file, schoolId: randomUUID() },
    { ...file, deletedAt: new Date() },
    { ...file, sizeBytes: 0n },
  ])('rejects missing, foreign or inactive File', async (invalid) => {
    files.findCurrentAssetFile.mockResolvedValue(invalid);
    await expect(
      operations.current(scope, contentId, assetId, 'download'),
    ).rejects.toThrow('Academic asset not found');
    expect(storage.createDownloadUrl).not.toHaveBeenCalled();
  });
  it('requires the exact content/revision/file relation and returns only the redirect capability', async () => {
    expect(
      await operations.revision(
        scope,
        contentId,
        revisionId,
        file.id,
        'download',
      ),
    ).toEqual({ url: 'https://capability.invalid/private' });
    expect(files.findRevisionAssetFile).toHaveBeenCalledWith({
      schoolId: scope.schoolId,
      contentId,
      revisionId,
      fileId: file.id,
    });
  });
  it('rejects invalid mode before any resource lookup or signing', async () => {
    await expect(
      operations.current(scope, contentId, assetId, 'invalid' as 'preview'),
    ).rejects.toThrow('Invalid asset access mode');
    expect(contents.findAllocationReaderDetail).not.toHaveBeenCalled();
    expect(storage.createDownloadUrl).not.toHaveBeenCalled();
  });
});
