import {
  ImportJobStatus,
  StudentBulkRegistrationBatchStatus,
  UserType,
} from '@prisma/client';
import { getRequestContext } from '../../../../common/context/request-context';
import { DomainException } from '../../../../common/exceptions/domain-exception';
import { ProcessStudentBulkRegistrationExecutionUseCase } from '../application/process-student-bulk-registration-execution.use-case';
import type { StudentBulkRegistrationExecutionBatch } from '../infrastructure/student-bulk-registration-execution.repository';
import { StudentBulkRegistrationExecutionRepository } from '../infrastructure/student-bulk-registration-execution.repository';

const IDS = {
  batch: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  importJob: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  school: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  organization: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  actor: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  role: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
} as const;

describe('ProcessStudentBulkRegistrationExecutionUseCase', () => {
  let repository: {
    findExecutionBatchById: jest.Mock;
    listValidRowIds: jest.Mock;
    provisionRow: jest.Mock;
    markRowFailed: jest.Mock;
    finalizeExecution: jest.Mock;
  };
  let useCase: ProcessStudentBulkRegistrationExecutionUseCase;

  beforeEach(() => {
    repository = {
      findExecutionBatchById: jest.fn().mockResolvedValue(batchFixture()),
      listValidRowIds: jest.fn().mockResolvedValue(['row-1', 'row-2']),
      provisionRow: jest.fn().mockImplementation(() => {
        expect(getRequestContext()).toMatchObject({
          actor: { id: IDS.actor, userType: UserType.SCHOOL_USER },
          activeMembership: {
            schoolId: IDS.school,
            organizationId: IDS.organization,
          },
        });
        return Promise.resolve({ kind: 'created' });
      }),
      markRowFailed: jest.fn().mockResolvedValue(true),
      finalizeExecution: jest.fn().mockResolvedValue({ terminal: true }),
    };
    useCase = new ProcessStudentBulkRegistrationExecutionUseCase(
      repository as unknown as StudentBulkRegistrationExecutionRepository,
    );
  });

  it('derives tenant and actor context from persisted Batch truth and finalizes', async () => {
    await useCase.execute(IDS.batch);
    expect(repository.listValidRowIds).toHaveBeenCalledWith({
      batchId: IDS.batch,
      schoolId: IDS.school,
    });
    expect(repository.provisionRow).toHaveBeenCalledTimes(2);
    expect(repository.provisionRow).toHaveBeenNthCalledWith(1, {
      batchId: IDS.batch,
      schoolId: IDS.school,
      rowId: 'row-1',
    });
    expect(repository.finalizeExecution).toHaveBeenCalledWith({
      batchId: IDS.batch,
      schoolId: IDS.school,
    });
  });

  it.each([
    ['iam.user.login_email_taken', 'username'],
    ['students.enrollment.placement_conflict', null],
    ['platform.entitlement.student_seat_limit_exceeded', null],
    ['students.bulk_registration.row_data_invalid', null],
    ['students.account.student_role_missing', null],
    ['students.bulk_registration.execution_placement_invalid', null],
  ] as const)(
    'marks known business failure %s per row and continues',
    async (code, field) => {
      repository.provisionRow
        .mockRejectedValueOnce(
          new DomainException({ code, message: 'business failure' }),
        )
        .mockResolvedValueOnce({ kind: 'created' });
      await useCase.execute(IDS.batch);
      expect(repository.markRowFailed).toHaveBeenCalledWith({
        batchId: IDS.batch,
        schoolId: IDS.school,
        rowId: 'row-1',
        error: { code, field },
      });
      expect(repository.provisionRow).toHaveBeenCalledTimes(2);
      expect(repository.finalizeExecution).toHaveBeenCalledTimes(1);
    },
  );

  it('leaves a technical failure retryable and rethrows without finalization', async () => {
    repository.provisionRow.mockRejectedValue({ code: 'P2034' });
    await expect(useCase.execute(IDS.batch)).rejects.toMatchObject({
      code: 'P2034',
    });
    expect(repository.markRowFailed).not.toHaveBeenCalled();
    expect(repository.finalizeExecution).not.toHaveBeenCalled();
  });

  it('is a no-op for missing and terminal batches', async () => {
    repository.findExecutionBatchById.mockResolvedValue(null);
    await useCase.execute(IDS.batch);
    repository.findExecutionBatchById.mockResolvedValue({
      ...batchFixture(),
      status: StudentBulkRegistrationBatchStatus.COMPLETED,
    });
    await useCase.execute(IDS.batch);
    expect(repository.listValidRowIds).not.toHaveBeenCalled();
  });

  it('fails closed on malformed or cross-tenant persisted metadata', async () => {
    const batch = batchFixture();
    repository.findExecutionBatchById.mockResolvedValue({
      ...batch,
      sourceImportJob: { ...batch.sourceImportJob, schoolId: 'other-school' },
    });
    await expect(useCase.execute(IDS.batch)).rejects.toMatchObject({
      code: 'students.bulk_registration.execution_invariant_invalid',
    });
    expect(repository.listValidRowIds).not.toHaveBeenCalled();
  });

  it('allows duplicate delivery to finalize durable truth when no VALID rows remain', async () => {
    repository.listValidRowIds.mockResolvedValue([]);
    await useCase.execute(IDS.batch);
    expect(repository.provisionRow).not.toHaveBeenCalled();
    expect(repository.finalizeExecution).toHaveBeenCalledTimes(1);
  });
});

function batchFixture(): StudentBulkRegistrationExecutionBatch {
  return {
    id: IDS.batch,
    schoolId: IDS.school,
    organizationId: IDS.organization,
    sourceImportJobId: IDS.importJob,
    academicYearId: 'year-1',
    termId: null,
    classroomId: 'classroom-1',
    enrollmentDate: new Date('2026-09-01T00:00:00.000Z'),
    status: StudentBulkRegistrationBatchStatus.EXECUTING,
    totalRows: 2,
    validRows: 2,
    invalidRows: 0,
    createdRows: 0,
    failedRows: 0,
    startedAt: new Date('2026-08-26T10:00:00.000Z'),
    completedAt: null,
    school: { organizationId: IDS.organization },
    sourceImportJob: {
      id: IDS.importJob,
      schoolId: IDS.school,
      type: 'students_bulk_registration',
      status: ImportJobStatus.COMPLETED,
      reportJson: {
        bulkRegistrationExecution: {
          requestedById: IDS.actor,
          requestedByUserType: UserType.SCHOOL_USER,
          requestedAt: '2026-08-26T10:00:00.000Z',
          loginDomain: 'students.example.edu',
          studentRoleId: IDS.role,
        },
      },
    },
  };
}
