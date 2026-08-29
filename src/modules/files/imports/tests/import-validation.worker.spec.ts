import { ImportJobStatus, UserType } from '@prisma/client';
import type { Job } from 'bullmq';
import { BullmqService } from '../../../../infrastructure/queue/bullmq.service';
import { ProcessStudentBulkRegistrationValidationUseCase } from '../../../students/registration/application/process-student-bulk-registration-validation.use-case';
import { ProcessStudentBulkRegistrationExecutionUseCase } from '../../../students/registration/application/process-student-bulk-registration-execution.use-case';
import { StudentBulkRegistrationExecutionReconciliationService } from '../../../students/registration/application/student-bulk-registration-execution-reconciliation.service';
import { ImportValidationReconciliationService } from '../application/import-validation-reconciliation.service';
import { ProcessImportValidationUseCase } from '../application/process-import-validation.use-case';
import type { FilesImportQueueJobData } from '../domain/import-job.types';
import { ImportJobsRepository } from '../infrastructure/import-jobs.repository';
import { ImportValidationWorker } from '../infrastructure/import-validation.worker';
import { ProcessStudentCredentialBatchUseCase } from '../../../students/credentials/application/process-student-credential-batch.use-case';
import { StudentCredentialBatchReconciliationService } from '../../../students/credentials/application/student-credential-batch-reconciliation.service';
import { StudentCredentialSecretArtifactCleanupService } from '../../../students/credentials/application/student-credential-secret-artifact-cleanup.service';

describe('ImportValidationWorker persisted type routing', () => {
  let processor: (job: Job<FilesImportQueueJobData>) => Promise<void>;
  let generic: { execute: jest.Mock };
  let bulk: { execute: jest.Mock };
  let execution: { execute: jest.Mock };
  let repository: { findRecoveryContextById: jest.Mock };
  let reconciliation: { reconcile: jest.Mock; reconcileCandidate: jest.Mock };
  let executionReconciliation: { reconcile: jest.Mock };
  let credentialExecution: { execute: jest.Mock };
  let credentialReconciliation: { reconcile: jest.Mock };
  let credentialArtifactCleanup: { reconcile: jest.Mock };

  beforeEach(() => {
    generic = { execute: jest.fn().mockResolvedValue(undefined) };
    bulk = { execute: jest.fn().mockResolvedValue(undefined) };
    execution = { execute: jest.fn().mockResolvedValue(undefined) };
    repository = {
      findRecoveryContextById: jest.fn().mockResolvedValue(persistedJob()),
    };
    reconciliation = {
      reconcile: jest.fn().mockResolvedValue(undefined),
      reconcileCandidate: jest.fn().mockResolvedValue(undefined),
    };
    executionReconciliation = {
      reconcile: jest.fn().mockResolvedValue(undefined),
    };
    credentialExecution = { execute: jest.fn().mockResolvedValue(undefined) };
    credentialReconciliation = {
      reconcile: jest.fn().mockResolvedValue(undefined),
    };
    credentialArtifactCleanup = {
      reconcile: jest.fn().mockResolvedValue(undefined),
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
      executionReconciliation as unknown as StudentBulkRegistrationExecutionReconciliationService,
      repository as unknown as ImportJobsRepository,
      bulk as unknown as ProcessStudentBulkRegistrationValidationUseCase,
      execution as unknown as ProcessStudentBulkRegistrationExecutionUseCase,
      credentialExecution as unknown as ProcessStudentCredentialBatchUseCase,
      credentialReconciliation as unknown as StudentCredentialBatchReconciliationService,
      credentialArtifactCleanup as unknown as StudentCredentialSecretArtifactCleanupService,
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
      } as FilesImportQueueJobData),
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

  it('routes reconciliation before inspecting payload data', async () => {
    await processor({
      id: 'reconcile',
      name: 'files.imports.reconcile',
      data: {},
    } as Job<FilesImportQueueJobData>);
    expect(reconciliation.reconcile).toHaveBeenCalledTimes(1);
    expect(executionReconciliation.reconcile).toHaveBeenCalledTimes(1);
    expect(credentialReconciliation.reconcile).toHaveBeenCalledTimes(1);
    expect(credentialArtifactCleanup.reconcile).toHaveBeenCalledTimes(1);
    expect(reconciliation.reconcile.mock.invocationCallOrder[0]).toBeLessThan(
      executionReconciliation.reconcile.mock.invocationCallOrder[0],
    );
    expect(
      executionReconciliation.reconcile.mock.invocationCallOrder[0],
    ).toBeLessThan(
      credentialReconciliation.reconcile.mock.invocationCallOrder[0],
    );
    expect(
      credentialReconciliation.reconcile.mock.invocationCallOrder[0],
    ).toBeLessThan(
      credentialArtifactCleanup.reconcile.mock.invocationCallOrder[0],
    );
    expect(repository.findRecoveryContextById).not.toHaveBeenCalled();
  });

  it('routes credential batch execution by the exact job name and minimal payload', async () => {
    await processor({
      id: 'credential-execution-1',
      name: 'execute-student-credential-batch',
      data: { batchId: 'credential-batch-1' },
    } as Job<FilesImportQueueJobData>);

    expect(credentialExecution.execute).toHaveBeenCalledWith(
      'credential-batch-1',
    );
    expect(repository.findRecoveryContextById).not.toHaveBeenCalled();
  });

  it('rejects credential execution payload tenant injection', async () => {
    await expect(
      processor({
        id: 'credential-execution-1',
        name: 'execute-student-credential-batch',
        data: { batchId: 'credential-batch-1', schoolId: 'attacker-school' },
      } as unknown as Job<FilesImportQueueJobData>),
    ).rejects.toThrow('student_credential_execution_payload_invalid');
    expect(credentialExecution.execute).not.toHaveBeenCalled();
  });

  it('routes execution by job name using only batchId', async () => {
    await processor({
      id: 'execution-1',
      name: 'execute-student-bulk-registration',
      data: { batchId: 'batch-1' },
    } as Job<FilesImportQueueJobData>);
    expect(execution.execute).toHaveBeenCalledWith('batch-1');
    expect(repository.findRecoveryContextById).not.toHaveBeenCalled();
    expect(generic.execute).not.toHaveBeenCalled();
    expect(bulk.execute).not.toHaveBeenCalled();
  });

  it.each([
    ['schoolId', 'school-2'],
    ['organizationId', 'organization-2'],
    ['actorId', 'actor-2'],
    ['roleId', 'role-2'],
    ['loginDomain', 'attacker.example.test'],
  ])(
    'rejects execution payload attempts to inject %s',
    async (field, value) => {
      await expect(
        processor({
          id: 'execution-1',
          name: 'execute-student-bulk-registration',
          data: { batchId: 'batch-1', [field]: value },
        } as unknown as Job<FilesImportQueueJobData>),
      ).rejects.toThrow('bulk_registration_execution_payload_invalid');
      expect(execution.execute).not.toHaveBeenCalled();
    },
  );

  it('fails closed for unknown queue job names', async () => {
    await expect(
      processor({
        id: 'unknown',
        name: 'unknown',
        data: { importJobId: 'job-1' },
      } as Job<FilesImportQueueJobData>),
    ).rejects.toThrow('files_import_job_unknown');
  });
});

function validationJob(
  data: FilesImportQueueJobData = { importJobId: 'job-1' },
): Job<FilesImportQueueJobData> {
  return {
    id: 'job-1',
    name: 'validate-import',
    data,
  } as Job<FilesImportQueueJobData>;
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
