import { Readable } from 'node:stream';
import {
  FileVisibility,
  ImportJobStatus,
  SchoolLoginSettingsStatus,
  StudentBulkRegistrationBatchStatus,
} from '@prisma/client';
import { DomainException } from '../../../../common/exceptions/domain-exception';
import { ObjectStorageError } from '../../../../infrastructure/storage/object-storage.errors';
import { StorageService } from '../../../../infrastructure/storage/storage.service';
import { ImportJobsRepository } from '../../../files/imports/infrastructure/import-jobs.repository';
import { LoginIdentityRepository } from '../../../settings/login-identity/infrastructure/login-identity.repository';
import { ProcessStudentBulkRegistrationValidationUseCase } from '../application/process-student-bulk-registration-validation.use-case';
import { STUDENT_BULK_REGISTRATION_TEMPLATE_HEADERS } from '../domain/student-bulk-registration.constants';
import { StudentBulkRegistrationPlacementService } from '../domain/student-bulk-registration-placement.service';
import { StudentBulkRegistrationRepository } from '../infrastructure/student-bulk-registration.repository';

describe('ProcessStudentBulkRegistrationValidationUseCase', () => {
  const csv = Buffer.from(
    `${STUDENT_BULK_REGISTRATION_TEMPLATE_HEADERS.join(',')}\n` +
      'Sara,Ali,,Hassan,,,,,2012-05-20,female,Egyptian,sara.hassan,sara@example.com,+201001234567\n' +
      'Mona,Ali,,Salem,,,,,2011-03-10,female,Egyptian,mona.salem,,\n',
  );
  const now = new Date('2026-08-26T10:00:00.000Z');
  const importJob = {
    id: 'job-1',
    schoolId: 'school-1',
    uploadedFileId: 'file-1',
    type: 'students_bulk_registration',
    status: ImportJobStatus.PENDING,
    reportJson: {},
    createdById: 'actor-1',
    createdAt: now,
    updatedAt: now,
    uploadedFile: {
      id: 'file-1',
      bucket: 'private',
      objectKey: 'schools/school-1/file.csv',
      originalName: 'file.csv',
      mimeType: 'text/csv',
      sizeBytes: BigInt(csv.byteLength),
      visibility: FileVisibility.PRIVATE,
    },
  };
  const batch = {
    id: 'batch-1',
    schoolId: 'school-1',
    organizationId: 'org-1',
    sourceImportJobId: 'job-1',
    academicYearId: 'year-1',
    termId: 'term-1',
    classroomId: 'classroom-1',
    enrollmentDate: new Date('2026-09-01T00:00:00.000Z'),
  };
  const settings = {
    id: 'settings-1',
    schoolId: 'school-1',
    loginDomain: 'students.example.edu',
    usernameMinLength: 3,
    usernameMaxLength: 40,
    allowedCharacters: null,
    reservedUsernames: [],
    status: SchoolLoginSettingsStatus.ACTIVE,
    createdAt: now,
    updatedAt: now,
  };

  let importJobsRepository: { findImportJobById: jest.Mock };
  let repository: {
    claimValidation: jest.Mock;
    finalizeValidation: jest.Mock;
    failValidation: jest.Mock;
  };
  let storage: { getObject: jest.Mock };
  let loginIdentity: {
    findCurrentSettings: jest.Mock;
    findUsersByLoginEmails: jest.Mock;
  };
  let placement: { resolveForValidation: jest.Mock };
  let useCase: ProcessStudentBulkRegistrationValidationUseCase;

  beforeEach(() => {
    importJobsRepository = {
      findImportJobById: jest.fn().mockResolvedValue(importJob),
    };
    repository = {
      claimValidation: jest.fn().mockResolvedValue(batch),
      finalizeValidation: jest.fn().mockResolvedValue(undefined),
      failValidation: jest.fn().mockResolvedValue(undefined),
    };
    storage = { getObject: jest.fn().mockResolvedValue(Readable.from(csv)) };
    loginIdentity = {
      findCurrentSettings: jest.fn().mockResolvedValue(settings),
      findUsersByLoginEmails: jest.fn().mockResolvedValue([]),
    };
    placement = { resolveForValidation: jest.fn().mockResolvedValue({}) };
    useCase = new ProcessStudentBulkRegistrationValidationUseCase(
      importJobsRepository as unknown as ImportJobsRepository,
      repository as unknown as StudentBulkRegistrationRepository,
      storage as unknown as StorageService,
      loginIdentity as unknown as LoginIdentityRepository,
      placement as unknown as StudentBulkRegistrationPlacementService,
    );
  });

  it('bulk-validates once and atomically finalizes a READY batch without domain creation', async () => {
    await useCase.execute('job-1');

    expect(loginIdentity.findCurrentSettings).toHaveBeenCalledTimes(1);
    expect(loginIdentity.findUsersByLoginEmails).toHaveBeenCalledTimes(1);
    expect(loginIdentity.findUsersByLoginEmails).toHaveBeenCalledWith([
      'sara.hassan@students.example.edu',
      'mona.salem@students.example.edu',
    ]);
    expect(placement.resolveForValidation).toHaveBeenCalledTimes(1);
    expect(placement.resolveForValidation).toHaveBeenCalledWith(
      expect.objectContaining({
        academicYearId: 'year-1',
        classroomId: 'classroom-1',
      }),
      2,
    );
    const finalization = firstArgument<FinalizeValidationInput>(
      repository.finalizeValidation,
    );
    expect(finalization).toMatchObject({
      importJobId: 'job-1',
      batchId: 'batch-1',
      batchStatus: StudentBulkRegistrationBatchStatus.READY,
      validRows: 2,
      invalidRows: 0,
    });
    expect(finalization.rows.map((row) => [row.rowNumber, row.status])).toEqual(
      [
        [2, 'VALID'],
        [3, 'VALID'],
      ],
    );
    expect(repository.failValidation).not.toHaveBeenCalled();
    expect(Object.keys(repository).sort()).toEqual([
      'claimValidation',
      'failValidation',
      'finalizeValidation',
    ]);
  });

  it('completes business-invalid rows without a queue retry', async () => {
    const invalidCsv = Buffer.from(
      `${STUDENT_BULK_REGISTRATION_TEMPLATE_HEADERS.join(',')}\n` +
        'Sara,Ali,,Hassan,,,,,invalid,female,Egyptian,,not-email,not-phone\n',
    );
    storage.getObject.mockResolvedValue(Readable.from(invalidCsv));

    await useCase.execute('job-1');

    const finalization = firstArgument<FinalizeValidationInput>(
      repository.finalizeValidation,
    );
    expect(finalization).toMatchObject({
      batchStatus: StudentBulkRegistrationBatchStatus.VALIDATION_FAILED,
      validRows: 0,
      invalidRows: 1,
    });
    expect(finalization.rows).toHaveLength(1);
    expect(finalization.rows[0].status).toBe('INVALID');
    expect(repository.failValidation).not.toHaveBeenCalled();
  });

  it('finalizes a header-only CSV as VALIDATION_FAILED with zero rows', async () => {
    storage.getObject.mockResolvedValue(
      Readable.from(
        Buffer.from(
          `${STUDENT_BULK_REGISTRATION_TEMPLATE_HEADERS.join(',')}\n`,
        ),
      ),
    );

    await useCase.execute('job-1');

    const finalization = firstArgument<FinalizeValidationInput>(
      repository.finalizeValidation,
    );
    expect(finalization).toMatchObject({
      batchStatus: StudentBulkRegistrationBatchStatus.VALIDATION_FAILED,
      rows: [],
      validRows: 0,
      invalidRows: 0,
      reportJson: { errors: ['students.bulk_registration.no_data_rows'] },
    });
    expect(repository.failValidation).not.toHaveBeenCalled();
  });

  it('keeps semantically valid rows VALID when batch-wide capacity fails', async () => {
    placement.resolveForValidation.mockRejectedValue(
      new DomainException({
        code: 'student.enrollment.placement_conflict',
        message: 'Classroom capacity exceeded',
      }),
    );

    await useCase.execute('job-1');

    const finalization = firstArgument<FinalizeValidationInput>(
      repository.finalizeValidation,
    );
    expect(finalization).toMatchObject({
      batchStatus: StudentBulkRegistrationBatchStatus.VALIDATION_FAILED,
      validRows: 2,
      invalidRows: 0,
      reportJson: { errors: ['student.enrollment.placement_conflict'] },
    });
    expect(finalization.rows.every((row) => row.status === 'VALID')).toBe(true);
  });

  it('reports inactive login settings once as a batch error', async () => {
    loginIdentity.findCurrentSettings.mockResolvedValue(null);

    await useCase.execute('job-1');

    expect(loginIdentity.findCurrentSettings).toHaveBeenCalledTimes(1);
    expect(loginIdentity.findUsersByLoginEmails).not.toHaveBeenCalled();
    const finalization = firstArgument<FinalizeValidationInput>(
      repository.finalizeValidation,
    );
    expect(finalization).toMatchObject({
      batchStatus: StudentBulkRegistrationBatchStatus.VALIDATION_FAILED,
      validRows: 2,
      invalidRows: 0,
      reportJson: {
        errors: ['settings.login_identity.not_configured'],
      },
    });
  });

  it('is a no-op for already completed durable truth', async () => {
    importJobsRepository.findImportJobById.mockResolvedValue({
      ...importJob,
      status: ImportJobStatus.COMPLETED,
    });

    await useCase.execute('job-1');

    expect(repository.claimValidation).not.toHaveBeenCalled();
    expect(storage.getObject).not.toHaveBeenCalled();
  });

  it('persists a terminal FAILED result for missing File metadata', async () => {
    importJobsRepository.findImportJobById.mockResolvedValue({
      ...importJob,
      uploadedFile: null,
    });

    await useCase.execute('job-1');

    expect(
      firstArgument<FailValidationInput>(repository.failValidation),
    ).toMatchObject({
      batchStatus: StudentBulkRegistrationBatchStatus.FAILED,
      reportJson: { recovery: { classification: 'terminal' } },
    });
  });

  it('persists a terminal FAILED result for a permanently missing object', async () => {
    storage.getObject.mockRejectedValue(new ObjectStorageError('not_found'));

    await useCase.execute('job-1');

    expect(
      firstArgument<FailValidationInput>(repository.failValidation),
    ).toMatchObject({
      batchStatus: StudentBulkRegistrationBatchStatus.FAILED,
      reportJson: { recovery: { classification: 'terminal' } },
    });
  });

  it('returns the batch to UPLOADED and rethrows retryable technical failures', async () => {
    storage.getObject.mockRejectedValue(new ObjectStorageError('transient'));

    await expect(useCase.execute('job-1')).rejects.toThrow(
      'bulk_registration_validation_retryable_failure',
    );
    expect(
      firstArgument<FailValidationInput>(repository.failValidation),
    ).toMatchObject({
      batchStatus: StudentBulkRegistrationBatchStatus.UPLOADED,
      reportJson: { recovery: { classification: 'retryable' } },
    });
  });
});

type FinalizeValidationInput = Parameters<
  StudentBulkRegistrationRepository['finalizeValidation']
>[0];
type FailValidationInput = Parameters<
  StudentBulkRegistrationRepository['failValidation']
>[0];

function firstArgument<T>(mock: jest.Mock): T {
  const calls = mock.mock.calls as unknown[][];
  return calls[0][0] as T;
}
