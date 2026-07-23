import { FileVisibility, UserType } from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
} from '../../../../common/context/request-context';
import { StorageService } from '../../../../infrastructure/storage/storage.service';
import { GetFileDownloadUrlUseCase } from '../application/get-file-download-url.use-case';
import { FilesRepository } from '../infrastructure/files.repository';

describe('GetFileDownloadUrlUseCase', () => {
  let filesRepository: jest.Mocked<Pick<FilesRepository, 'findScopedFileById'>>;
  let storageService: jest.Mocked<Pick<StorageService, 'createDownloadUrl'>>;
  let useCase: GetFileDownloadUrlUseCase;

  beforeEach(() => {
    filesRepository = {
      findScopedFileById: jest.fn(),
    };
    storageService = {
      createDownloadUrl: jest.fn(),
    };
    useCase = new GetFileDownloadUrlUseCase(
      filesRepository as unknown as FilesRepository,
      storageService as unknown as StorageService,
    );
  });

  async function runInFilesScope<T>(fn: () => Promise<T>): Promise<T> {
    const context = createRequestContext('files-download-test');
    context.actor = {
      id: 'actor-1',
      userType: UserType.SCHOOL_USER,
    };
    context.activeMembership = {
      membershipId: 'membership-1',
      organizationId: 'organization-1',
      schoolId: 'school-1',
      roleId: 'role-1',
      permissions: ['files.downloads.view'],
    };

    return runWithRequestContext(context, fn);
  }

  it('returns a details-free not-found error and never calls storage', async () => {
    filesRepository.findScopedFileById.mockResolvedValue(null);

    await expect(
      runInFilesScope(() => useCase.execute('missing-file-id')),
    ).rejects.toMatchObject({
      code: 'files.not_found',
      httpStatus: 404,
      details: undefined,
    });
    expect(storageService.createDownloadUrl).not.toHaveBeenCalled();
  });

  it('keeps the 300-second attachment signing input and original filename', async () => {
    filesRepository.findScopedFileById.mockResolvedValue({
      id: 'file-1',
      organizationId: 'organization-1',
      schoolId: 'school-1',
      uploaderId: 'actor-1',
      bucket: 'private-bucket',
      objectKey: 'private-object-key',
      originalName: 'worksheet.pdf',
      mimeType: 'application/pdf',
      sizeBytes: BigInt(128),
      checksumSha256: null,
      visibility: FileVisibility.PRIVATE,
      createdAt: new Date('2026-07-21T00:00:00.000Z'),
      updatedAt: new Date('2026-07-21T00:00:00.000Z'),
      deletedAt: null,
    });
    storageService.createDownloadUrl.mockResolvedValue({
      url: 'https://storage.invalid/signed-download',
      expiresAt: new Date('2026-07-21T00:05:00.000Z'),
    });

    await expect(
      runInFilesScope(() => useCase.execute('file-1')),
    ).resolves.toBe('https://storage.invalid/signed-download');
    expect(storageService.createDownloadUrl).toHaveBeenCalledWith({
      bucket: 'private-bucket',
      objectKey: 'private-object-key',
      expiresInSeconds: 300,
      disposition: 'attachment',
      downloadFileName: 'worksheet.pdf',
    });
  });
});
