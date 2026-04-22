import { FileVisibility, ImportJobStatus } from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
} from '../../../../common/context/request-context';
import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';
import { BullmqService } from '../../../../infrastructure/queue/bullmq.service';
import { StorageService } from '../../../../infrastructure/storage/storage.service';
import { RegisterFileMetadataUseCase } from '../../uploads/application/register-file-metadata.use-case';
import { FilesUploadMimeNotAllowedException } from '../../uploads/domain/file-upload.exceptions';
import { UploadedMultipartFile } from '../../uploads/domain/uploaded-file';
import { FilesRepository } from '../../uploads/infrastructure/files.repository';
import { CreateImportJobUseCase } from '../application/create-import-job.use-case';
import { ImportJobsRepository } from '../infrastructure/import-jobs.repository';

describe('CreateImportJobUseCase', () => {
  let storageService: jest.Mocked<Pick<StorageService, 'saveObject' | 'deleteObject'>>;
  let registerFileMetadataUseCase: jest.Mocked<
    Pick<RegisterFileMetadataUseCase, 'execute'>
  >;
  let filesRepository: jest.Mocked<Pick<FilesRepository, 'softDeleteFile'>>;
  let importJobsRepository: jest.Mocked<
    Pick<ImportJobsRepository, 'createImportJob' | 'updateImportJob'>
  >;
  let bullmqService: jest.Mocked<Pick<BullmqService, 'addJob'>>;
  let useCase: CreateImportJobUseCase;

  beforeEach(() => {
    storageService = {
      saveObject: jest.fn(),
      deleteObject: jest.fn(),
    };
    registerFileMetadataUseCase = {
      execute: jest.fn(),
    };
    filesRepository = {
      softDeleteFile: jest.fn(),
    };
    importJobsRepository = {
      createImportJob: jest.fn(),
      updateImportJob: jest.fn(),
    };
    bullmqService = {
      addJob: jest.fn(),
    };

    useCase = new CreateImportJobUseCase(
      storageService as unknown as StorageService,
      registerFileMetadataUseCase as unknown as RegisterFileMetadataUseCase,
      filesRepository as unknown as FilesRepository,
      importJobsRepository as unknown as ImportJobsRepository,
      bullmqService as unknown as BullmqService,
    );
  });

  async function runInImportsScope<T>(fn: () => Promise<T>): Promise<T> {
    const context = createRequestContext('imports-test');
    context.actor = {
      id: 'actor-1',
      userType: 'SCHOOL_USER',
    };
    context.activeMembership = {
      membershipId: 'membership-1',
      organizationId: 'org-1',
      schoolId: 'school-1',
      roleId: 'role-1',
      permissions: ['files.imports.manage'],
    };

    return runWithRequestContext(context, fn);
  }

  function buildCsvFile(): UploadedMultipartFile {
    return {
      originalname: 'students-basic.csv',
      mimetype: 'text/csv',
      size: Buffer.byteLength('id,name\n1,Alice\n'),
      buffer: Buffer.from('id,name\n1,Alice\n'),
    };
  }

  it('creates an import job, stores the file externally, and enqueues validation', async () => {
    storageService.saveObject.mockResolvedValue({
      bucket: 'moazez-private',
      etag: 'etag-1',
    });
    registerFileMetadataUseCase.execute.mockResolvedValue({
      id: 'file-1',
      originalName: 'students-basic.csv',
      mimeType: 'text/csv',
      sizeBytes: String(Buffer.byteLength('id,name\n1,Alice\n')),
      visibility: FileVisibility.PRIVATE,
      createdAt: '2026-04-21T08:00:00.000Z',
    });
    importJobsRepository.createImportJob.mockResolvedValue({
      id: 'job-1',
      schoolId: 'school-1',
      uploadedFileId: 'file-1',
      type: 'students_basic',
      status: ImportJobStatus.PENDING,
      reportJson: {
        status: ImportJobStatus.PENDING,
      },
      createdById: 'actor-1',
      createdAt: new Date('2026-04-21T08:00:00.000Z'),
      updatedAt: new Date('2026-04-21T08:00:00.000Z'),
      uploadedFile: {
        id: 'file-1',
        bucket: 'moazez-private',
        objectKey: 'schools/school-1/files/import.csv',
        originalName: 'students-basic.csv',
        mimeType: 'text/csv',
        sizeBytes: BigInt(Buffer.byteLength('id,name\n1,Alice\n')),
        visibility: FileVisibility.PRIVATE,
      },
    });
    bullmqService.addJob.mockResolvedValue({ id: 'job-1' } as never);

    const response = await runInImportsScope(() =>
      useCase.execute({ type: 'students_basic', file: undefined }, buildCsvFile()),
    );

    expect(response).toEqual({
      id: 'job-1',
      uploadedFileId: 'file-1',
      type: 'students_basic',
      status: ImportJobStatus.PENDING,
      reportAvailable: true,
      createdAt: '2026-04-21T08:00:00.000Z',
      updatedAt: '2026-04-21T08:00:00.000Z',
    });
    expect(storageService.saveObject).toHaveBeenCalledWith(
      expect.objectContaining({
        visibility: FileVisibility.PRIVATE,
        contentType: 'text/csv',
      }),
    );
    expect(importJobsRepository.createImportJob).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: 'school-1',
        uploadedFileId: 'file-1',
        type: 'students_basic',
        createdById: 'actor-1',
        status: ImportJobStatus.PENDING,
      }),
    );
    expect(bullmqService.addJob).toHaveBeenCalledWith(
      'files-imports',
      'validate-import',
      { importJobId: 'job-1' },
      { jobId: 'job-1' },
    );
  });

  it('rejects unsupported import types', async () => {
    await expect(
      runInImportsScope(() =>
        useCase.execute({ type: 'admissions_full', file: undefined }, buildCsvFile()),
      ),
    ).rejects.toBeInstanceOf(ValidationDomainException);

    expect(storageService.saveObject).not.toHaveBeenCalled();
    expect(importJobsRepository.createImportJob).not.toHaveBeenCalled();
  });

  it('rejects unsupported import file mime types', async () => {
    await expect(
      runInImportsScope(() =>
        useCase.execute(
          { type: 'students_basic', file: undefined },
          {
            originalname: 'students-basic.pdf',
            mimetype: 'application/pdf',
            size: 128,
            buffer: Buffer.from('pdf-body'),
          },
        ),
      ),
    ).rejects.toBeInstanceOf(FilesUploadMimeNotAllowedException);

    expect(storageService.saveObject).not.toHaveBeenCalled();
  });
});
