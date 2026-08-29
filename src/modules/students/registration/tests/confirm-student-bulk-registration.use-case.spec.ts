import {
  ImportJobStatus,
  SchoolLoginSettingsStatus,
  StudentBulkRegistrationBatchStatus,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
} from '../../../../common/context/request-context';
import { BullmqService } from '../../../../infrastructure/queue/bullmq.service';
import { LoginIdentityRepository } from '../../../settings/login-identity/infrastructure/login-identity.repository';
import { UsersRepository } from '../../../settings/users/infrastructure/users.repository';
import { ConfirmStudentBulkRegistrationUseCase } from '../application/confirm-student-bulk-registration.use-case';
import { StudentBulkRegistrationPlacementService } from '../domain/student-bulk-registration-placement.service';
import { StudentBulkRegistrationExecutionRepository } from '../infrastructure/student-bulk-registration-execution.repository';
import type { StudentBulkRegistrationBatchRecord } from '../infrastructure/student-bulk-registration.repository';
import { StudentBulkRegistrationRepository } from '../infrastructure/student-bulk-registration.repository';

const IDS = {
  batch: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  importJob: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  school: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  organization: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  actor: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  role: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
} as const;

describe('ConfirmStudentBulkRegistrationUseCase', () => {
  let repository: {
    findBatchById: jest.Mock;
    countRowsByStatus: jest.Mock;
  };
  let executionRepository: { claimExecution: jest.Mock };
  let placement: { resolveForValidation: jest.Mock };
  let loginIdentity: { findCurrentSettings: jest.Mock };
  let users: { findAssignableRoleByKey: jest.Mock };
  let bullmq: { ensureJobFromPersistedTruth: jest.Mock };
  let useCase: ConfirmStudentBulkRegistrationUseCase;
  let ready: StudentBulkRegistrationBatchRecord;

  beforeEach(() => {
    ready = batchFixture();
    repository = {
      findBatchById: jest
        .fn()
        .mockResolvedValueOnce(ready)
        .mockResolvedValue({
          ...ready,
          status: StudentBulkRegistrationBatchStatus.EXECUTING,
          startedAt: new Date('2026-08-26T12:00:00.000Z'),
          sourceImportJob: {
            ...ready.sourceImportJob,
            reportJson: {
              ...(ready.sourceImportJob.reportJson as object),
              bulkRegistrationExecution: executionMetadata(),
            },
          },
        }),
      countRowsByStatus: jest.fn().mockResolvedValue(validRowCounts()),
    };
    executionRepository = {
      claimExecution: jest.fn().mockResolvedValue(true),
    };
    placement = { resolveForValidation: jest.fn().mockResolvedValue({}) };
    loginIdentity = {
      findCurrentSettings: jest.fn().mockResolvedValue({
        status: SchoolLoginSettingsStatus.ACTIVE,
        loginDomain: 'students.example.edu',
      }),
    };
    users = {
      findAssignableRoleByKey: jest.fn().mockResolvedValue({
        id: IDS.role,
        key: 'student',
      }),
    };
    bullmq = {
      ensureJobFromPersistedTruth: jest.fn().mockResolvedValue('created'),
    };
    useCase = new ConfirmStudentBulkRegistrationUseCase(
      repository as unknown as StudentBulkRegistrationRepository,
      executionRepository as unknown as StudentBulkRegistrationExecutionRepository,
      placement as unknown as StudentBulkRegistrationPlacementService,
      loginIdentity as unknown as LoginIdentityRepository,
      users as unknown as UsersRepository,
      bullmq as unknown as BullmqService,
    );
  });

  it('atomically claims READY, freezes secret-free metadata, and enqueues after durable truth', async () => {
    const result = await executeInScope(useCase);

    expect(placement.resolveForValidation).toHaveBeenCalledWith(
      {
        academicYearId: 'year-1',
        termId: undefined,
        classroomId: 'classroom-1',
        enrollmentDate: '2026-09-01',
      },
      2,
    );
    expect(users.findAssignableRoleByKey).toHaveBeenCalledWith(
      IDS.school,
      'student',
    );
    const claim = firstArgument<Record<string, unknown>>(
      executionRepository.claimExecution,
    );
    expect(claim).toMatchObject({
      batchId: IDS.batch,
      schoolId: IDS.school,
      organizationId: IDS.organization,
      sourceImportJobId: IDS.importJob,
      actorId: IDS.actor,
      actorUserType: UserType.SCHOOL_USER,
      validRows: 2,
    });
    const serialized = JSON.stringify(claim.reportJson);
    expect(serialized).toContain('bulkRegistrationExecution');
    expect(serialized).toContain('students.example.edu');
    expect(serialized).toContain(IDS.role);
    expect(serialized).not.toMatch(/password|credential|token/iu);
    expect(bullmq.ensureJobFromPersistedTruth).toHaveBeenCalledWith(
      'files-imports',
      'execute-student-bulk-registration',
      { batchId: IDS.batch },
      {
        jobId: `student-bulk-registration-execution-${IDS.batch}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      },
    );
    expect(result.status).toBe(StudentBulkRegistrationBatchStatus.EXECUTING);
    expect(result.startedAt).not.toBeNull();
    expect(result.completedAt).toBeNull();
    expect(
      executionRepository.claimExecution.mock.invocationCallOrder[0],
    ).toBeLessThan(
      bullmq.ensureJobFromPersistedTruth.mock.invocationCallOrder[0],
    );
  });

  it('fails closed when READY counters disagree with persisted row states', async () => {
    repository.countRowsByStatus.mockResolvedValue({
      ...validRowCounts(),
      VALID: 1,
      INVALID: 1,
    });
    await expect(executeInScope(useCase)).rejects.toMatchObject({
      code: 'students.bulk_registration.execution_invariant_invalid',
    });
    expect(executionRepository.claimExecution).not.toHaveBeenCalled();
    expect(bullmq.ensureJobFromPersistedTruth).not.toHaveBeenCalled();
  });

  it.each([
    StudentBulkRegistrationBatchStatus.UPLOADED,
    StudentBulkRegistrationBatchStatus.VALIDATING,
    StudentBulkRegistrationBatchStatus.VALIDATION_FAILED,
    StudentBulkRegistrationBatchStatus.EXECUTION_PARTIAL_FAILED,
    StudentBulkRegistrationBatchStatus.FAILED,
  ])('rejects non-confirmable status %s without enqueueing', async (status) => {
    repository.findBatchById
      .mockReset()
      .mockResolvedValue({ ...ready, status });
    await expect(executeInScope(useCase)).rejects.toMatchObject({
      code: 'students.bulk_registration.confirm_conflict',
    });
    expect(bullmq.ensureJobFromPersistedTruth).not.toHaveBeenCalled();
  });

  it('requires active login settings and an assignable student role', async () => {
    loginIdentity.findCurrentSettings.mockResolvedValue({
      status: SchoolLoginSettingsStatus.DISABLED,
      loginDomain: 'students.example.edu',
    });
    await expect(executeInScope(useCase)).rejects.toMatchObject({
      code: 'settings.login_identity.not_configured',
    });

    loginIdentity.findCurrentSettings.mockResolvedValue({
      status: SchoolLoginSettingsStatus.ACTIVE,
      loginDomain: 'students.example.edu',
    });
    repository.findBatchById
      .mockReset()
      .mockResolvedValueOnce(ready)
      .mockResolvedValue({
        ...ready,
        status: StudentBulkRegistrationBatchStatus.EXECUTING,
      });
    users.findAssignableRoleByKey.mockResolvedValue(null);
    await expect(executeInScope(useCase)).rejects.toMatchObject({
      code: 'students.account.student_role_missing',
    });
  });

  it('re-ensures an EXECUTING batch without resetting metadata or startedAt', async () => {
    const executing = {
      ...ready,
      status: StudentBulkRegistrationBatchStatus.EXECUTING,
      startedAt: new Date('2026-08-26T10:00:00.000Z'),
      sourceImportJob: {
        ...ready.sourceImportJob,
        reportJson: {
          ...(ready.sourceImportJob.reportJson as object),
          bulkRegistrationExecution: executionMetadata(),
        },
      },
    };
    repository.findBatchById.mockReset().mockResolvedValue(executing);

    const result = await executeInScope(useCase);

    expect(result.startedAt).toBe('2026-08-26T10:00:00.000Z');
    expect(executionRepository.claimExecution).not.toHaveBeenCalled();
    expect(placement.resolveForValidation).not.toHaveBeenCalled();
    expect(loginIdentity.findCurrentSettings).not.toHaveBeenCalled();
    expect(bullmq.ensureJobFromPersistedTruth).toHaveBeenCalledTimes(1);
  });

  it('returns COMPLETED as a no-op without enqueueing', async () => {
    repository.findBatchById.mockReset().mockResolvedValue({
      ...ready,
      status: StudentBulkRegistrationBatchStatus.COMPLETED,
      completedAt: new Date('2026-08-26T13:00:00.000Z'),
    });
    await expect(executeInScope(useCase)).resolves.toMatchObject({
      status: StudentBulkRegistrationBatchStatus.COMPLETED,
      completedAt: '2026-08-26T13:00:00.000Z',
    });
    expect(bullmq.ensureJobFromPersistedTruth).not.toHaveBeenCalled();
  });

  it('preserves EXECUTING durable truth when queue ensure fails', async () => {
    bullmq.ensureJobFromPersistedTruth.mockRejectedValue(
      new Error('queue_redis_unavailable'),
    );
    await expect(executeInScope(useCase)).rejects.toThrow(
      'queue_redis_unavailable',
    );
    expect(executionRepository.claimExecution).toHaveBeenCalledTimes(1);
    expect(repository.findBatchById).toHaveBeenCalledTimes(2);
  });

  it('keeps foreign-school batches inaccessible', async () => {
    repository.findBatchById.mockReset().mockResolvedValue(null);
    await expect(executeInScope(useCase)).rejects.toMatchObject({
      code: 'not_found',
    });
    expect(executionRepository.claimExecution).not.toHaveBeenCalled();
  });
});

function executeInScope(useCase: ConfirmStudentBulkRegistrationUseCase) {
  const context = createRequestContext('confirm-test');
  context.actor = { id: IDS.actor, userType: UserType.SCHOOL_USER };
  context.activeMembership = {
    membershipId: 'membership-1',
    organizationId: IDS.organization,
    schoolId: IDS.school,
    roleId: 'role-1',
    permissions: [],
  };
  return runWithRequestContext(context, () => useCase.execute(IDS.batch));
}

function batchFixture(): StudentBulkRegistrationBatchRecord {
  return {
    id: IDS.batch,
    schoolId: IDS.school,
    organizationId: IDS.organization,
    sourceImportJobId: IDS.importJob,
    academicYearId: 'year-1',
    termId: null,
    classroomId: 'classroom-1',
    enrollmentDate: new Date('2026-09-01T00:00:00.000Z'),
    templateVersion: 1,
    status: StudentBulkRegistrationBatchStatus.READY,
    totalRows: 2,
    validRows: 2,
    invalidRows: 0,
    createdRows: 0,
    failedRows: 0,
    createdById: IDS.actor,
    createdAt: new Date('2026-08-26T08:00:00.000Z'),
    updatedAt: new Date('2026-08-26T09:00:00.000Z'),
    validatedAt: new Date('2026-08-26T09:00:00.000Z'),
    startedAt: null,
    completedAt: null,
    sourceImportJob: {
      status: ImportJobStatus.COMPLETED,
      reportJson: {
        status: ImportJobStatus.COMPLETED,
        errors: [],
        summary: { rowCount: 2, warningCount: 0, errorCount: 0 },
      },
    },
  };
}

function executionMetadata() {
  return {
    requestedById: IDS.actor,
    requestedByUserType: UserType.SCHOOL_USER,
    requestedAt: '2026-08-26T10:00:00.000Z',
    loginDomain: 'students.example.edu',
    studentRoleId: IDS.role,
  };
}

function validRowCounts() {
  return {
    PENDING: 0,
    VALID: 2,
    INVALID: 0,
    PROCESSING: 0,
    CREATED: 0,
    FAILED: 0,
  };
}

function firstArgument<T>(mock: jest.Mock): T {
  return (mock.mock.calls as unknown[][])[0][0] as T;
}
