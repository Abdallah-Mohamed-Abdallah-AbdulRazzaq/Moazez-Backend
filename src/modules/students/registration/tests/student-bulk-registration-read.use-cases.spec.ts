import {
  ImportJobStatus,
  StudentBulkRegistrationBatchStatus,
  StudentBulkRegistrationRowStatus,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
} from '../../../../common/context/request-context';
import { GetStudentBulkRegistrationBatchUseCase } from '../application/get-student-bulk-registration-batch.use-case';
import { ListStudentBulkRegistrationRowsUseCase } from '../application/list-student-bulk-registration-rows.use-case';
import { StudentBulkRegistrationRepository } from '../infrastructure/student-bulk-registration.repository';

describe('student bulk registration read use cases', () => {
  const createdAt = new Date('2026-08-26T10:00:00.000Z');
  const batch = {
    id: 'batch-1',
    schoolId: 'school-1',
    organizationId: 'org-1',
    sourceImportJobId: 'job-1',
    academicYearId: 'year-1',
    termId: null,
    classroomId: 'classroom-1',
    enrollmentDate: new Date('2026-09-01T00:00:00.000Z'),
    templateVersion: 1,
    status: StudentBulkRegistrationBatchStatus.VALIDATION_FAILED,
    totalRows: 1,
    validRows: 0,
    invalidRows: 1,
    createdRows: 0,
    failedRows: 0,
    createdById: 'actor-1',
    createdAt,
    updatedAt: createdAt,
    validatedAt: createdAt,
    startedAt: null,
    completedAt: null,
    sourceImportJob: {
      status: ImportJobStatus.COMPLETED,
      reportJson: {
        errors: ['students.bulk_registration.header_invalid'],
      },
    },
  };

  it('returns batch-level validation visibility without storage metadata', async () => {
    const repository = { findBatchById: jest.fn().mockResolvedValue(batch) };
    const useCase = new GetStudentBulkRegistrationBatchUseCase(
      repository as unknown as StudentBulkRegistrationRepository,
    );
    const result = await inScope(() => useCase.execute('batch-1'));
    expect(result).toMatchObject({
      id: 'batch-1',
      validatedAt: createdAt.toISOString(),
      validationErrors: ['students.bulk_registration.header_invalid'],
      counters: { totalRows: 1, validRows: 0, invalidRows: 1 },
    });
    expect(result).not.toHaveProperty('sourceImportJob');
    expect(result).not.toHaveProperty('bucket');
  });

  it('returns paginated, status-filtered rows in repository order with typed JSON', async () => {
    const repository = {
      listRows: jest.fn().mockResolvedValue({
        batchFound: true,
        total: 1,
        items: [
          {
            id: 'row-1',
            schoolId: 'school-1',
            batchId: 'batch-1',
            rowNumber: 2,
            normalizedDataJson: normalizedData(),
            rowHash: 'a'.repeat(64),
            status: StudentBulkRegistrationRowStatus.INVALID,
            errorsJson: [
              {
                code: 'iam.user.username_invalid',
                field: 'username',
                reason: 'username_required',
              },
            ],
            studentId: null,
            userId: null,
            enrollmentId: null,
            createdAt,
            updatedAt: createdAt,
          },
        ],
      }),
    };
    const useCase = new ListStudentBulkRegistrationRowsUseCase(
      repository as unknown as StudentBulkRegistrationRepository,
    );
    const result = await inScope(() =>
      useCase.execute('batch-1', {
        page: 2,
        limit: 50,
        status: StudentBulkRegistrationRowStatus.INVALID,
      }),
    );
    expect(repository.listRows).toHaveBeenCalledWith({
      batchId: 'batch-1',
      page: 2,
      limit: 50,
      status: StudentBulkRegistrationRowStatus.INVALID,
    });
    expect(result).toEqual({
      items: [
        {
          id: 'row-1',
          rowNumber: 2,
          status: StudentBulkRegistrationRowStatus.INVALID,
          normalizedData: normalizedData(),
          errors: [
            {
              code: 'iam.user.username_invalid',
              field: 'username',
              reason: 'username_required',
            },
          ],
          studentId: null,
          userId: null,
          enrollmentId: null,
        },
      ],
      total: 1,
      page: 2,
      limit: 50,
    });
  });

  it('treats an inaccessible foreign-school batch as not found', async () => {
    const repository = { findBatchById: jest.fn().mockResolvedValue(null) };
    const useCase = new GetStudentBulkRegistrationBatchUseCase(
      repository as unknown as StudentBulkRegistrationRepository,
    );
    await expect(
      inScope(() => useCase.execute('foreign')),
    ).rejects.toMatchObject({ code: 'not_found' });
  });
});

function normalizedData() {
  return {
    firstNameEn: 'Sara',
    fatherNameEn: null,
    grandfatherNameEn: null,
    familyNameEn: 'Hassan',
    firstNameAr: null,
    fatherNameAr: null,
    grandfatherNameAr: null,
    familyNameAr: null,
    dateOfBirth: null,
    gender: null,
    nationality: null,
    username: '',
    contactEmail: null,
    studentPhone: null,
  };
}

function inScope<T>(fn: () => Promise<T>): Promise<T> {
  const context = createRequestContext('bulk-read-test');
  context.actor = { id: 'actor-1', userType: UserType.SCHOOL_USER };
  context.activeMembership = {
    membershipId: 'membership-1',
    organizationId: 'org-1',
    schoolId: 'school-1',
    roleId: 'role-1',
    permissions: ['students.records.manage', 'students.enrollments.manage'],
  };
  return runWithRequestContext(context, fn);
}
