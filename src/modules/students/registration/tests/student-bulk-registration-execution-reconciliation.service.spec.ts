import {
  ImportJobStatus,
  OrganizationStatus,
  SchoolStatus,
  StudentBulkRegistrationBatchStatus,
  StudentBulkRegistrationRowStatus,
  UserType,
} from '@prisma/client';
import { BullmqService } from '../../../../infrastructure/queue/bullmq.service';
import {
  STUDENT_BULK_REGISTRATION_EXECUTION_RECOVERY_WINDOW_EXPIRED_CODE,
  STUDENT_BULK_REGISTRATION_EXECUTION_RECOVERY_WINDOW_MS,
  STUDENT_BULK_REGISTRATION_EXECUTION_TENANT_INELIGIBLE_CODE,
} from '../domain/student-bulk-registration.constants';
import { StudentBulkRegistrationExecutionReconciliationService } from '../application/student-bulk-registration-execution-reconciliation.service';
import {
  StudentBulkRegistrationExecutionRepository,
  type StudentBulkRegistrationExecutionRecoveryCandidate,
} from '../infrastructure/student-bulk-registration-execution.repository';

const NOW = new Date('2026-08-26T12:00:00.000Z');

describe('StudentBulkRegistrationExecutionReconciliationService', () => {
  let repository: {
    listExecutionRecoveryCandidates: jest.Mock;
    terminalizeRemainingValidRows: jest.Mock;
    finalizeExecution: jest.Mock;
  };
  let bullmq: { ensureJobFromPersistedTruth: jest.Mock };
  let service: StudentBulkRegistrationExecutionReconciliationService;

  beforeEach(() => {
    repository = {
      listExecutionRecoveryCandidates: jest.fn().mockResolvedValue([]),
      terminalizeRemainingValidRows: jest.fn().mockResolvedValue(2),
      finalizeExecution: jest
        .fn()
        .mockResolvedValue({ terminal: true, status: 'FAILED' }),
    };
    bullmq = {
      ensureJobFromPersistedTruth: jest.fn().mockResolvedValue('created'),
    };
    service = new StudentBulkRegistrationExecutionReconciliationService(
      repository as unknown as StudentBulkRegistrationExecutionRepository,
      bullmq as unknown as BullmqService,
    );
  });

  it.each([
    ['created', 'job_created'],
    ['replaced', 'job_replaced'],
    ['preserved', 'job_preserved'],
    ['replacement_contended', 'job_replacement_contended'],
  ] as const)(
    'uses persisted truth and maps a %s deterministic job result',
    async (ensureResult, expectedOutcome) => {
      bullmq.ensureJobFromPersistedTruth.mockResolvedValue(ensureResult);
      await expect(
        service.reconcileCandidate(candidateFixture(), NOW),
      ).resolves.toBe(expectedOutcome);
      expect(bullmq.ensureJobFromPersistedTruth).toHaveBeenCalledWith(
        'files-imports',
        'execute-student-bulk-registration',
        { batchId: 'batch-1' },
        {
          jobId: 'student-bulk-registration-execution-batch-1',
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
        },
      );
      expect(repository.terminalizeRemainingValidRows).not.toHaveBeenCalled();
      expect(repository.finalizeExecution).not.toHaveBeenCalled();
    },
  );

  it('finalizes from persisted rows without enqueue when no VALID work remains', async () => {
    const candidate = candidateFixture({
      createdRows: 1,
      failedRows: 1,
      rowCounts: rowCounts({ VALID: 0, CREATED: 1, FAILED: 1 }),
    });
    await expect(service.reconcileCandidate(candidate, NOW)).resolves.toBe(
      'finalized',
    );
    expect(repository.finalizeExecution).toHaveBeenCalledWith({
      batchId: 'batch-1',
      schoolId: 'school-1',
    });
    expect(bullmq.ensureJobFromPersistedTruth).not.toHaveBeenCalled();
  });

  it('terminalizes only remaining VALID work from startedAt when the 24-hour window expires', async () => {
    const candidate = candidateFixture({
      startedAt: new Date(
        NOW.getTime() - STUDENT_BULK_REGISTRATION_EXECUTION_RECOVERY_WINDOW_MS,
      ),
    });
    await expect(service.reconcileCandidate(candidate, NOW)).resolves.toBe(
      'terminalized_window_expired',
    );
    expect(repository.terminalizeRemainingValidRows).toHaveBeenCalledWith({
      batchId: 'batch-1',
      schoolId: 'school-1',
      reasonCode:
        STUDENT_BULK_REGISTRATION_EXECUTION_RECOVERY_WINDOW_EXPIRED_CODE,
    });
    expect(repository.finalizeExecution).toHaveBeenCalledTimes(1);
    expect(bullmq.ensureJobFromPersistedTruth).not.toHaveBeenCalled();
  });

  it.each([
    { schoolStatus: SchoolStatus.SUSPENDED },
    { schoolDeletedAt: new Date('2026-08-26T10:00:00.000Z') },
    { organizationStatus: OrganizationStatus.SUSPENDED },
    { organizationDeletedAt: new Date('2026-08-26T10:00:00.000Z') },
  ])('terminalizes remaining work for an ineligible tenant', async (state) => {
    const candidate = candidateFixture({
      school: {
        ...candidateFixture().school,
        status: state.schoolStatus ?? SchoolStatus.ACTIVE,
        deletedAt: state.schoolDeletedAt ?? null,
        organization: {
          ...candidateFixture().school.organization,
          status: state.organizationStatus ?? OrganizationStatus.ACTIVE,
          deletedAt: state.organizationDeletedAt ?? null,
        },
      },
    });
    await expect(service.reconcileCandidate(candidate, NOW)).resolves.toBe(
      'terminalized_tenant_ineligible',
    );
    expect(repository.terminalizeRemainingValidRows).toHaveBeenCalledWith(
      expect.objectContaining({
        reasonCode: STUDENT_BULK_REGISTRATION_EXECUTION_TENANT_INELIGIBLE_CODE,
      }),
    );
    expect(bullmq.ensureJobFromPersistedTruth).not.toHaveBeenCalled();
  });

  it.each([
    ['missing startedAt', { startedAt: null }],
    ['completed timestamp', { completedAt: NOW }],
    ['empty batch', { totalRows: 0, validRows: 0, rowCounts: rowCounts() }],
    ['pending row', { rowCounts: rowCounts({ VALID: 1, PENDING: 1 }) }],
    ['invalid row', { rowCounts: rowCounts({ VALID: 1, INVALID: 1 }) }],
    [
      'persisted processing row',
      { rowCounts: rowCounts({ VALID: 1, PROCESSING: 1 }) },
    ],
    [
      'counter mismatch',
      { createdRows: 1, rowCounts: rowCounts({ VALID: 2 }) },
    ],
    ['row school mismatch', { rowSchoolMismatch: true }],
    [
      'broken import relation',
      {
        sourceImportJob: {
          ...candidateFixture().sourceImportJob,
          schoolId: 'school-2',
        },
      },
    ],
    [
      'malformed metadata',
      {
        sourceImportJob: {
          ...candidateFixture().sourceImportJob,
          reportJson: { bulkRegistrationExecution: { requestedById: 'bad' } },
        },
      },
    ],
  ] as const)('blocks %s without mutation or enqueue', async (_name, patch) => {
    await expect(
      service.reconcileCandidate(candidateFixture(patch), NOW),
    ).resolves.toBe('blocked_invariant');
    expect(repository.terminalizeRemainingValidRows).not.toHaveBeenCalled();
    expect(repository.finalizeExecution).not.toHaveBeenCalled();
    expect(bullmq.ensureJobFromPersistedTruth).not.toHaveBeenCalled();
  });

  it('continues after a corrupted candidate and reports the next recoverable batch', async () => {
    repository.listExecutionRecoveryCandidates.mockResolvedValue([
      candidateFixture({ startedAt: null }),
      candidateFixture({ id: 'batch-2' }),
    ]);
    await expect(service.reconcile(NOW)).resolves.toEqual({
      scanned: 2,
      blockedInvariant: 1,
      finalized: 0,
      terminalized: 0,
      restored: 1,
      preserved: 0,
    });
    expect(bullmq.ensureJobFromPersistedTruth).toHaveBeenCalledTimes(1);
    expect(bullmq.ensureJobFromPersistedTruth).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      { batchId: 'batch-2' },
      expect.any(Object),
    );
  });

  it('pages 100 candidates with stable createdAt/id cursor and remains idempotent on a repeated pulse', async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) =>
      candidateFixture({
        id: `batch-${String(index).padStart(3, '0')}`,
        createdAt: new Date('2026-08-26T10:00:00.000Z'),
      }),
    );
    repository.listExecutionRecoveryCandidates
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    bullmq.ensureJobFromPersistedTruth.mockResolvedValue('preserved');

    await expect(service.reconcile(NOW)).resolves.toMatchObject({
      scanned: 100,
      preserved: 100,
    });
    expect(repository.listExecutionRecoveryCandidates).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        cursor: {
          createdAt: new Date('2026-08-26T10:00:00.000Z'),
          id: 'batch-099',
        },
        limit: 100,
      }),
    );
    await expect(service.reconcile(NOW)).resolves.toMatchObject({
      scanned: 0,
      restored: 0,
      terminalized: 0,
    });
    expect(repository.terminalizeRemainingValidRows).not.toHaveBeenCalled();
  });

  it('rethrows sanitized Redis outage without mutating open persisted work', async () => {
    bullmq.ensureJobFromPersistedTruth.mockRejectedValue(
      new Error('queue_redis_unavailable'),
    );
    await expect(
      service.reconcileCandidate(candidateFixture(), NOW),
    ).rejects.toThrow('queue_redis_unavailable');
    expect(repository.terminalizeRemainingValidRows).not.toHaveBeenCalled();
    expect(repository.finalizeExecution).not.toHaveBeenCalled();
  });
});

function candidateFixture(
  patch: Partial<StudentBulkRegistrationExecutionRecoveryCandidate> = {},
): StudentBulkRegistrationExecutionRecoveryCandidate {
  return {
    id: 'batch-1',
    schoolId: 'school-1',
    organizationId: 'organization-1',
    sourceImportJobId: 'import-job-1',
    status: StudentBulkRegistrationBatchStatus.EXECUTING,
    totalRows: 2,
    validRows: 2,
    invalidRows: 0,
    createdRows: 0,
    failedRows: 0,
    createdAt: new Date('2026-08-26T10:00:00.000Z'),
    startedAt: new Date('2026-08-26T10:00:00.000Z'),
    completedAt: null,
    rowCounts: rowCounts({ VALID: 2 }),
    rowSchoolMismatch: false,
    school: {
      id: 'school-1',
      organizationId: 'organization-1',
      status: SchoolStatus.ACTIVE,
      deletedAt: null,
      organization: {
        id: 'organization-1',
        status: OrganizationStatus.ACTIVE,
        deletedAt: null,
      },
    },
    sourceImportJob: {
      id: 'import-job-1',
      schoolId: 'school-1',
      type: 'students_bulk_registration',
      status: ImportJobStatus.COMPLETED,
      reportJson: {
        bulkRegistrationExecution: {
          requestedById: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
          requestedByUserType: UserType.SCHOOL_USER,
          requestedAt: '2026-08-26T10:00:00.000Z',
          loginDomain: 'students.example.edu',
          studentRoleId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
        },
      },
    },
    ...patch,
  };
}

function rowCounts(
  patch: Partial<
    Record<keyof typeof StudentBulkRegistrationRowStatus, number>
  > = {},
) {
  return {
    PENDING: 0,
    VALID: 0,
    INVALID: 0,
    PROCESSING: 0,
    CREATED: 0,
    FAILED: 0,
    ...patch,
  };
}
