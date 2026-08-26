import { ImportJobStatus, UserType } from '@prisma/client';
import type { Job } from 'bullmq';
import { BullmqService } from '../../../../infrastructure/queue/bullmq.service';
import { ProcessStudentBulkRegistrationValidationUseCase } from '../../../students/registration/application/process-student-bulk-registration-validation.use-case';
import { ImportValidationReconciliationService } from '../application/import-validation-reconciliation.service';
import { ProcessImportValidationUseCase } from '../application/process-import-validation.use-case';
import type { ImportValidationJobData } from '../domain/import-job.types';
import { ImportJobsRepository } from '../infrastructure/import-jobs.repository';
import { ImportValidationWorker } from '../infrastructure/import-validation.worker';

describe('ImportValidationWorker persisted type routing', () => {
  let processor: (job: Job<ImportValidationJobData>) => Promise<void>;
  let generic: { execute: jest.Mock };
  let bulk: { execute: jest.Mock };
  let repository: { findRecoveryContextById: jest.Mock };
  let reconciliation: { reconcile: jest.Mock; reconcileCandidate: jest.Mock };

  beforeEach(() => {
    generic = { execute: jest.fn().mockResolvedValue(undefined) };
    bulk = { execute: jest.fn().mockResolvedValue(undefined) };
    repository = {
      findRecoveryContextById: jest.fn().mockResolvedValue(persistedJob()),
    };
    reconciliation = {
      reconcile: jest.fn().mockResolvedValue(undefined),
      reconcileCandidate: jest.fn().mockResolvedValue(undefined),
    };
    const bullmq = {
      createWorker: jest.fn((_queue: string, handler: typeof processor) => {
        processor = handler;
        return {};
      }),
    };
    new ImportValidationWorker(
      bullmq as unknown as BullmqService,
      generic as unknown as ProcessImportValidationUseCase,
      reconciliation as unknown as ImportValidationReconciliationService,
      repository as unknown as ImportJobsRepository,
      bulk as unknown as ProcessStudentBulkRegistrationValidationUseCase,
    ).onModuleInit();
  });

  it('preserves students_basic processing', async () => {
    await processor(validationJob());
    expect(generic.execute).toHaveBeenCalledWith('job-1');
    expect(bulk.execute).not.toHaveBeenCalled();
  });

  it('routes the internal bulk type to the new processor', async () => {
    repository.findRecoveryContextById.mockResolvedValue(
      persistedJob('students_bulk_registration'),
    );
    await processor(validationJob());
    expect(bulk.execute).toHaveBeenCalledWith('job-1');
    expect(generic.execute).not.toHaveBeenCalled();
  });

  it('uses persisted type even when the payload tries to add a type', async () => {
    repository.findRecoveryContextById.mockResolvedValue(
      persistedJob('students_bulk_registration'),
    );
    await processor(
      validationJob({
        importJobId: 'job-1',
        type: 'students_basic',
      } as ImportValidationJobData),
    );
    expect(bulk.execute).toHaveBeenCalledTimes(1);
    expect(generic.execute).not.toHaveBeenCalled();
  });

  it('fails closed for an unknown persisted type', async () => {
    repository.findRecoveryContextById.mockResolvedValue(
      persistedJob('unknown_type'),
    );
    await expect(processor(validationJob())).rejects.toThrow(
      'files_import_persisted_type_unknown',
    );
    expect(generic.execute).not.toHaveBeenCalled();
    expect(bulk.execute).not.toHaveBeenCalled();
  });
});

function validationJob(
  data: ImportValidationJobData = { importJobId: 'job-1' },
): Job<ImportValidationJobData> {
  return {
    id: 'job-1',
    name: 'validate-import',
    data,
  } as Job<ImportValidationJobData>;
}

function persistedJob(type = 'students_basic') {
  return {
    id: 'job-1',
    schoolId: 'school-1',
    organizationId: 'org-1',
    uploadedFileId: 'file-1',
    type,
    status: ImportJobStatus.PENDING,
    reportJson: null,
    createdById: 'actor-1',
    actorUserType: UserType.SCHOOL_USER,
    createdAt: new Date(),
    updatedAt: new Date(),
    uploadedFile: null,
    ineligibilityCode: null,
  };
}
