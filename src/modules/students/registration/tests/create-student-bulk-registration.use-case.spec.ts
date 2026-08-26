import { createHash } from 'node:crypto';
import {
  FileVisibility,
  StudentBulkRegistrationBatchStatus,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
} from '../../../../common/context/request-context';
import { StorageService } from '../../../../infrastructure/storage/storage.service';
import { RegisterFileMetadataUseCase } from '../../../files/uploads/application/register-file-metadata.use-case';
import type { UploadedMultipartFile } from '../../../files/uploads/domain/uploaded-file';
import { FilesRepository } from '../../../files/uploads/infrastructure/files.repository';
import { CreateStudentBulkRegistrationUseCase } from '../application/create-student-bulk-registration.use-case';
import { StudentBulkRegistrationPlacementService } from '../domain/student-bulk-registration-placement.service';
import { StudentBulkRegistrationRepository } from '../infrastructure/student-bulk-registration.repository';

describe('CreateStudentBulkRegistrationUseCase', () => {
  const command = {
    academicYearId: '11111111-1111-4111-8111-111111111111',
    termId: '22222222-2222-4222-8222-222222222222',
    classroomId: '33333333-3333-4333-8333-333333333333',
    enrollmentDate: '2026-09-01',
  };
  const file: UploadedMultipartFile = {
    originalname: ' students.csv ',
    mimetype: ' TEXT/CSV ',
    size: 14,
    buffer: Buffer.from('not,parsed\n1,2'),
  };
  const placement = {
    scope: {
      actorId: 'actor-1',
      userType: 'SCHOOL_USER',
      organizationId: 'org-1',
      schoolId: 'school-1',
      roleId: 'role-1',
    },
    academicYear: { id: command.academicYearId },
    term: { id: command.termId },
    classroom: { id: command.classroomId },
    enrollmentDate: command.enrollmentDate,
  };
  const createdAt = new Date('2026-08-26T08:00:00.000Z');
  const batchRecord = {
    id: 'batch-1',
    schoolId: 'school-1',
    organizationId: 'org-1',
    sourceImportJobId: 'job-1',
    academicYearId: command.academicYearId,
    termId: command.termId,
    classroomId: command.classroomId,
    enrollmentDate: new Date('2026-09-01T00:00:00.000Z'),
    templateVersion: 1,
    status: StudentBulkRegistrationBatchStatus.UPLOADED,
    totalRows: 0,
    validRows: 0,
    invalidRows: 0,
    createdRows: 0,
    failedRows: 0,
    createdById: 'actor-1',
    createdAt,
    updatedAt: createdAt,
  };

  let placementService: { resolve: jest.Mock };
  let storageService: { saveObject: jest.Mock; deleteObject: jest.Mock };
  let registerFileMetadata: { execute: jest.Mock };
  let filesRepository: { softDeleteFile: jest.Mock };
  let repository: { createIntake: jest.Mock };
  let useCase: CreateStudentBulkRegistrationUseCase;

  beforeEach(() => {
    placementService = { resolve: jest.fn().mockResolvedValue(placement) };
    storageService = {
      saveObject: jest.fn().mockResolvedValue({
        bucket: 'moazez-private',
        etag: 'etag-1',
      }),
      deleteObject: jest.fn().mockResolvedValue(undefined),
    };
    registerFileMetadata = {
      execute: jest.fn().mockResolvedValue({ id: 'file-1' }),
    };
    filesRepository = {
      softDeleteFile: jest.fn().mockResolvedValue(undefined),
    };
    repository = { createIntake: jest.fn().mockResolvedValue(batchRecord) };
    useCase = new CreateStudentBulkRegistrationUseCase(
      placementService as unknown as StudentBulkRegistrationPlacementService,
      storageService as unknown as StorageService,
      registerFileMetadata as unknown as RegisterFileMetadataUseCase,
      filesRepository as unknown as FilesRepository,
      repository as unknown as StudentBulkRegistrationRepository,
    );
  });

  it('stores a private source file and creates only the pending atomic intake', async () => {
    const response = await inStudentsScope(() =>
      useCase.execute(command, file),
    );

    expect(placementService.resolve).toHaveBeenCalledWith(command);
    expect(storageService.saveObject).toHaveBeenCalledWith(
      expect.objectContaining({
        body: file.buffer,
        visibility: FileVisibility.PRIVATE,
        contentType: 'text/csv',
      }),
    );
    const saveObjectCalls = storageService.saveObject.mock.calls as Array<
      [Parameters<StorageService['saveObject']>[0]]
    >;
    const objectKey = saveObjectCalls[0][0].objectKey;
    expect(objectKey).toMatch(/^schools\/school-1\/files\/[0-9a-f-]+\.csv$/u);
    expect(registerFileMetadata.execute).toHaveBeenCalledWith({
      organizationId: 'org-1',
      schoolId: 'school-1',
      uploaderId: 'actor-1',
      bucket: 'moazez-private',
      objectKey,
      originalName: 'students.csv',
      mimeType: 'text/csv',
      sizeBytes: BigInt(file.buffer.byteLength),
      checksumSha256: createHash('sha256').update(file.buffer).digest('hex'),
      visibility: FileVisibility.PRIVATE,
    });
    expect(repository.createIntake).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: 'school-1',
        organizationId: 'org-1',
        uploadedFileId: 'file-1',
        createdById: 'actor-1',
        academicYearId: command.academicYearId,
        termId: command.termId,
        classroomId: command.classroomId,
        enrollmentDate: new Date('2026-09-01T00:00:00.000Z'),
      }),
    );
    expect(response).toEqual({
      id: 'batch-1',
      sourceImportJobId: 'job-1',
      status: 'UPLOADED',
      templateVersion: 1,
      placement: {
        academicYearId: command.academicYearId,
        termId: command.termId,
        classroomId: command.classroomId,
        enrollmentDate: '2026-09-01',
      },
      counters: {
        totalRows: 0,
        validRows: 0,
        invalidRows: 0,
        createdRows: 0,
        failedRows: 0,
      },
      createdAt: createdAt.toISOString(),
      updatedAt: createdAt.toISOString(),
    });
  });

  it('validates the upload before resolving placement or persisting anything', async () => {
    await expect(
      inStudentsScope(() => useCase.execute(command, undefined)),
    ).rejects.toMatchObject({ code: 'validation.failed' });

    expect(placementService.resolve).not.toHaveBeenCalled();
    expect(storageService.saveObject).not.toHaveBeenCalled();
    expect(repository.createIntake).not.toHaveBeenCalled();
  });

  it('leaves no database intake when object storage fails', async () => {
    const failure = new Error('storage_failed');
    storageService.saveObject.mockRejectedValue(failure);

    await expect(
      inStudentsScope(() => useCase.execute(command, file)),
    ).rejects.toBe(failure);
    expect(registerFileMetadata.execute).not.toHaveBeenCalled();
    expect(repository.createIntake).not.toHaveBeenCalled();
  });

  it('deletes the stored object when File metadata creation fails', async () => {
    const failure = new Error('metadata_failed');
    registerFileMetadata.execute.mockRejectedValue(failure);

    await expect(
      inStudentsScope(() => useCase.execute(command, file)),
    ).rejects.toBe(failure);
    expect(storageService.deleteObject).toHaveBeenCalledWith({
      bucket: 'moazez-private',
      objectKey: (
        storageService.saveObject.mock.calls as Array<
          [Parameters<StorageService['saveObject']>[0]]
        >
      )[0][0].objectKey,
    });
    expect(filesRepository.softDeleteFile).not.toHaveBeenCalled();
    expect(repository.createIntake).not.toHaveBeenCalled();
  });

  it('deletes the object and soft-deletes File metadata when the DB intake fails', async () => {
    const failure = new Error('transaction_failed');
    repository.createIntake.mockRejectedValue(failure);

    await expect(
      inStudentsScope(() => useCase.execute(command, file)),
    ).rejects.toBe(failure);
    expect(storageService.deleteObject).toHaveBeenCalledTimes(1);
    expect(filesRepository.softDeleteFile).toHaveBeenCalledWith('file-1');
  });

  it('preserves the original DB error when both cleanup attempts fail', async () => {
    const failure = new Error('transaction_failed');
    repository.createIntake.mockRejectedValue(failure);
    storageService.deleteObject.mockRejectedValue(new Error('delete_failed'));
    filesRepository.softDeleteFile.mockRejectedValue(
      new Error('soft_delete_failed'),
    );

    await expect(
      inStudentsScope(() => useCase.execute(command, file)),
    ).rejects.toBe(failure);
  });
});

function inStudentsScope<T>(fn: () => Promise<T>): Promise<T> {
  const context = createRequestContext('bulk-intake-test');
  context.actor = { id: 'actor-1', userType: 'SCHOOL_USER' };
  context.activeMembership = {
    membershipId: 'membership-1',
    organizationId: 'org-1',
    schoolId: 'school-1',
    roleId: 'role-1',
    permissions: ['students.records.manage', 'students.enrollments.manage'],
  };
  return runWithRequestContext(context, fn);
}
