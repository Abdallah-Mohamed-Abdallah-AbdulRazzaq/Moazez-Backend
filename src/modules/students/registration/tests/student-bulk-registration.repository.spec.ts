import {
  ImportJobStatus,
  StudentBulkRegistrationBatchStatus,
  StudentBulkRegistrationRowStatus,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { StudentBulkRegistrationRepository } from '../infrastructure/student-bulk-registration.repository';

describe('StudentBulkRegistrationRepository', () => {
  it('creates the fixed pending ImportJob and uploaded Batch in one transaction', async () => {
    const importJobCreate = jest.fn().mockResolvedValue({ id: 'import-job-1' });
    const batch = { id: 'batch-1' };
    const batchCreate = jest.fn().mockResolvedValue(batch);
    type TransactionClient = {
      importJob: { create: typeof importJobCreate };
      studentBulkRegistrationBatch: { create: typeof batchCreate };
    };
    const transaction = jest.fn(
      (callback: (tx: TransactionClient) => Promise<unknown>) =>
        callback({
          importJob: { create: importJobCreate },
          studentBulkRegistrationBatch: { create: batchCreate },
        }),
    );
    const repository = new StudentBulkRegistrationRepository({
      $transaction: transaction,
    } as unknown as PrismaService);
    const enrollmentDate = new Date('2026-09-01T00:00:00.000Z');
    const reportJson = { status: 'PENDING' };

    await expect(
      repository.createIntake({
        schoolId: 'school-1',
        organizationId: 'org-1',
        uploadedFileId: 'file-1',
        createdById: 'actor-1',
        reportJson,
        academicYearId: 'year-1',
        termId: null,
        classroomId: 'classroom-1',
        enrollmentDate,
      }),
    ).resolves.toBe(batch);

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(importJobCreate).toHaveBeenCalledWith({
      data: {
        schoolId: 'school-1',
        uploadedFileId: 'file-1',
        type: 'students_bulk_registration',
        status: ImportJobStatus.PENDING,
        reportJson,
        createdById: 'actor-1',
      },
      select: { id: true },
    });
    expect(batchCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          schoolId: 'school-1',
          organizationId: 'org-1',
          sourceImportJobId: 'import-job-1',
          academicYearId: 'year-1',
          termId: null,
          classroomId: 'classroom-1',
          enrollmentDate,
          templateVersion: 1,
          status: StudentBulkRegistrationBatchStatus.UPLOADED,
          totalRows: 0,
          validRows: 0,
          invalidRows: 0,
          createdRows: 0,
          failedRows: 0,
          createdById: 'actor-1',
        },
      }),
    );
  });

  it('replaces rows, counters, final status, and ImportJob report in one transaction', async () => {
    const deleteMany = jest.fn().mockResolvedValue({ count: 0 });
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const importJobUpdate = jest.fn().mockResolvedValue({ id: 'job-1' });
    const tx = {
      studentBulkRegistrationRow: { deleteMany, createMany },
      studentBulkRegistrationBatch: { updateMany },
      importJob: { update: importJobUpdate },
    };
    const transaction = jest.fn(
      (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    );
    const repository = new StudentBulkRegistrationRepository({
      $transaction: transaction,
    } as unknown as PrismaService);
    const reportJson = { status: ImportJobStatus.COMPLETED, errors: [] };

    await repository.finalizeValidation({
      importJobId: 'job-1',
      schoolId: 'school-1',
      batchId: 'batch-1',
      batchStatus: StudentBulkRegistrationBatchStatus.READY,
      rows: [
        {
          rowNumber: 2,
          normalizedDataJson: { username: 'sara' },
          rowHash: 'a'.repeat(64),
          status: StudentBulkRegistrationRowStatus.VALID,
          errorsJson: null,
        },
      ],
      validRows: 1,
      invalidRows: 0,
      reportJson,
      validatedAt: new Date('2026-08-26T10:00:00.000Z'),
    });

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(deleteMany).toHaveBeenCalledWith({
      where: { batchId: 'batch-1', schoolId: 'school-1' },
    });
    expect(createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          schoolId: 'school-1',
          batchId: 'batch-1',
          rowNumber: 2,
          status: StudentBulkRegistrationRowStatus.VALID,
        }),
      ],
    });
    const updateCalls = updateMany.mock.calls as unknown[][];
    const update = updateCalls[0][0] as {
      data: {
        status: StudentBulkRegistrationBatchStatus;
        totalRows: number;
        validRows: number;
        invalidRows: number;
      };
    };
    expect(update.data).toMatchObject({
      status: StudentBulkRegistrationBatchStatus.READY,
      totalRows: 1,
      validRows: 1,
      invalidRows: 0,
    });
    expect(importJobUpdate).toHaveBeenCalledWith({
      where: { id: 'job-1' },
      data: { status: ImportJobStatus.COMPLETED, reportJson },
    });
  });

  it('fails inside the transaction before completing the ImportJob when finalization conflicts', async () => {
    const importJobUpdate = jest.fn();
    const tx = {
      studentBulkRegistrationRow: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      studentBulkRegistrationBatch: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      importJob: { update: importJobUpdate },
    };
    const transaction = jest.fn(
      (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    );
    const repository = new StudentBulkRegistrationRepository({
      $transaction: transaction,
    } as unknown as PrismaService);

    await expect(
      repository.finalizeValidation({
        importJobId: 'job-1',
        schoolId: 'school-1',
        batchId: 'batch-1',
        batchStatus: StudentBulkRegistrationBatchStatus.READY,
        rows: [
          {
            rowNumber: 2,
            normalizedDataJson: { username: 'sara' },
            rowHash: 'a'.repeat(64),
            status: StudentBulkRegistrationRowStatus.VALID,
            errorsJson: null,
          },
        ],
        validRows: 1,
        invalidRows: 0,
        reportJson: { status: ImportJobStatus.COMPLETED },
        validatedAt: new Date('2026-08-26T10:00:00.000Z'),
      }),
    ).rejects.toThrow('bulk_registration_validation_finalize_conflict');
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(importJobUpdate).not.toHaveBeenCalled();
  });
});
