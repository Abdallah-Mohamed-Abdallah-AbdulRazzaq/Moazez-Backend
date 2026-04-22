import { FileVisibility } from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
} from '../../../../common/context/request-context';
import { StorageService } from '../../../../infrastructure/storage/storage.service';
import { FILES_UPLOAD_MAX_SIZE_BYTES } from '../domain/file-upload.constraints';
import { UploadFileUseCase } from '../application/upload-file.use-case';
import { RegisterFileMetadataUseCase } from '../application/register-file-metadata.use-case';
import { UploadedMultipartFile } from '../domain/uploaded-file';

describe('UploadFileUseCase', () => {
  let storageService: jest.Mocked<Pick<StorageService, 'saveObject' | 'deleteObject'>>;
  let registerFileMetadataUseCase: jest.Mocked<
    Pick<RegisterFileMetadataUseCase, 'execute'>
  >;
  let useCase: UploadFileUseCase;

  beforeEach(() => {
    storageService = {
      saveObject: jest.fn(),
      deleteObject: jest.fn(),
    };
    registerFileMetadataUseCase = {
      execute: jest.fn(),
    };

    useCase = new UploadFileUseCase(
      storageService as unknown as StorageService,
      registerFileMetadataUseCase as unknown as RegisterFileMetadataUseCase,
    );
  });

  async function runInFilesScope<T>(fn: () => Promise<T>): Promise<T> {
    const context = createRequestContext('files-upload-test');
    context.actor = {
      id: 'actor-1',
      userType: 'SCHOOL_USER',
    };
    context.activeMembership = {
      membershipId: 'membership-1',
      organizationId: 'org-1',
      schoolId: 'school-1',
      roleId: 'role-1',
      permissions: ['files.uploads.manage'],
    };

    return runWithRequestContext(context, fn);
  }

  it('uploads a valid file and returns metadata without storage internals', async () => {
    storageService.saveObject.mockResolvedValue({
      bucket: 'moazez-dev',
      etag: 'etag-1',
    });
    registerFileMetadataUseCase.execute.mockResolvedValue({
      id: 'file-1',
      originalName: 'phase-2.txt',
      mimeType: 'text/plain',
      sizeBytes: '12',
      visibility: FileVisibility.PRIVATE,
      createdAt: '2026-04-20T10:00:00.000Z',
    });

    const file: UploadedMultipartFile = {
      originalname: 'phase-2.txt',
      mimetype: 'text/plain',
      size: 12,
      buffer: Buffer.from('phase 2 body'),
    };

    const response = await runInFilesScope(() => useCase.execute(file));

    expect(response).toEqual({
      id: 'file-1',
      originalName: 'phase-2.txt',
      mimeType: 'text/plain',
      sizeBytes: '12',
      visibility: FileVisibility.PRIVATE,
      createdAt: '2026-04-20T10:00:00.000Z',
    });
    expect(storageService.saveObject).toHaveBeenCalledWith(
      expect.objectContaining({
        body: file.buffer,
        contentType: 'text/plain',
        visibility: FileVisibility.PRIVATE,
        objectKey: expect.stringMatching(/^schools\/school-1\/files\//),
      }),
    );
    expect(registerFileMetadataUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        schoolId: 'school-1',
        uploaderId: 'actor-1',
        bucket: 'moazez-dev',
        originalName: 'phase-2.txt',
        mimeType: 'text/plain',
        sizeBytes: BigInt(12),
        visibility: FileVisibility.PRIVATE,
        checksumSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
  });

  it('rejects unsupported mime types with files.upload.mime_not_allowed', async () => {
    const file: UploadedMultipartFile = {
      originalname: 'malware.exe',
      mimetype: 'application/x-msdownload',
      size: 24,
      buffer: Buffer.from('not-allowed'),
    };

    await expect(runInFilesScope(() => useCase.execute(file))).rejects.toMatchObject({
      code: 'files.upload.mime_not_allowed',
      httpStatus: 415,
    });
    expect(storageService.saveObject).not.toHaveBeenCalled();
    expect(registerFileMetadataUseCase.execute).not.toHaveBeenCalled();
  });

  it('rejects oversized files with files.upload.size_exceeded', async () => {
    const file: UploadedMultipartFile = {
      originalname: 'too-large.txt',
      mimetype: 'text/plain',
      size: FILES_UPLOAD_MAX_SIZE_BYTES + 1,
      buffer: Buffer.alloc(FILES_UPLOAD_MAX_SIZE_BYTES + 1, 65),
    };

    await expect(runInFilesScope(() => useCase.execute(file))).rejects.toMatchObject({
      code: 'files.upload.size_exceeded',
      httpStatus: 413,
    });
    expect(storageService.saveObject).not.toHaveBeenCalled();
    expect(registerFileMetadataUseCase.execute).not.toHaveBeenCalled();
  });
});
