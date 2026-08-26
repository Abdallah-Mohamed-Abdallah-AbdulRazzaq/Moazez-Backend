import {
  ImportJobStatus,
  StudentBulkRegistrationBatchStatus,
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
});
