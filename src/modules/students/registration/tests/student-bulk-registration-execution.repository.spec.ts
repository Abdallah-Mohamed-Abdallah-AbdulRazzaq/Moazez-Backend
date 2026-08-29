import {
  ImportJobStatus,
  Prisma,
  StudentBulkRegistrationBatchStatus,
  StudentBulkRegistrationRowStatus,
  UserType,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import {
  STUDENT_BULK_REGISTRATION_TRANSACTION_MAX_ATTEMPTS,
  StudentBulkRegistrationExecutionRepository,
  type StudentBulkRegistrationExecutionBatch,
} from '../infrastructure/student-bulk-registration-execution.repository';

const IDS = {
  batch: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  importJob: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  school: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  organization: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  actor: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  role: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
} as const;

describe('StudentBulkRegistrationExecutionRepository', () => {
  it('creates passwordless User, Membership, Student, Enrollment, audits, row state, and counter in one Serializable transaction', async () => {
    const tx = transactionFixture();
    const transaction = jest.fn(
      (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    );
    const repository = new StudentBulkRegistrationExecutionRepository({
      $transaction: transaction,
    } as unknown as PrismaService);

    await expect(
      repository.provisionRow({
        batchId: IDS.batch,
        schoolId: IDS.school,
        rowId: 'row-1',
      }),
    ).resolves.toMatchObject({
      kind: 'created',
      rowId: 'row-1',
      studentId: 'student-1',
      userId: 'user-1',
      enrollmentId: 'enrollment-1',
    });

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(transaction.mock.calls[0][1]).toEqual({
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
    expect(tx.user.create).toHaveBeenCalledWith({
      data: objectContaining({
        email: 'student.one@students.example.edu',
        username: 'student.one',
        contactEmail: 'contact@example.com',
        userType: UserType.STUDENT,
        status: 'ACTIVE',
        passwordHash: null,
        mustChangePassword: false,
        passwordProvisionedAt: null,
        passwordChangedAt: null,
        credentialVersion: 0,
      }),
      select: { id: true },
    });
    expect(tx.membership.create).toHaveBeenCalledWith({
      data: objectContaining({
        userId: 'user-1',
        organizationId: IDS.organization,
        schoolId: IDS.school,
        roleId: IDS.role,
        userType: UserType.STUDENT,
        status: 'ACTIVE',
      }),
      select: { id: true },
    });
    expect(tx.student.create).toHaveBeenCalledWith({
      data: objectContaining({
        organizationId: IDS.organization,
        schoolId: IDS.school,
        userId: 'user-1',
        applicationId: null,
        status: 'ACTIVE',
      }),
      select: { id: true },
    });
    expect(tx.enrollment.create).toHaveBeenCalledWith({
      data: objectContaining({
        schoolId: IDS.school,
        studentId: 'student-1',
        status: 'ACTIVE',
        endedAt: null,
        exitReason: null,
      }),
      select: { id: true },
    });
    expect(tx.auditLog.create).toHaveBeenCalledTimes(2);
    expect(tx.studentBulkRegistrationRow.updateMany).toHaveBeenLastCalledWith({
      where: objectContaining({
        id: 'row-1',
        batchId: IDS.batch,
        schoolId: IDS.school,
        status: StudentBulkRegistrationRowStatus.PROCESSING,
      }),
      data: objectContaining({
        status: StudentBulkRegistrationRowStatus.CREATED,
        studentId: 'student-1',
        userId: 'user-1',
        enrollmentId: 'enrollment-1',
      }),
    });
    expect(tx.studentBulkRegistrationBatch.updateMany).toHaveBeenCalledWith({
      where: objectContaining({
        id: IDS.batch,
        schoolId: IDS.school,
        status: StudentBulkRegistrationBatchStatus.EXECUTING,
      }),
      data: { createdRows: { increment: 1 } },
    });
  });

  it.each([
    'user',
    'membership',
    'student',
    'enrollment',
    'audit',
    'row-created',
    'created-counter',
  ] as const)(
    'surfaces a %s failure from the single provisioning transaction',
    async (failurePoint) => {
      const tx = transactionFixture();
      const failure = new Error(`${failurePoint}_failed`);
      if (failurePoint === 'user') tx.user.create.mockRejectedValue(failure);
      if (failurePoint === 'membership') {
        tx.membership.create.mockRejectedValue(failure);
      }
      if (failurePoint === 'student') {
        tx.student.create.mockRejectedValue(failure);
      }
      if (failurePoint === 'enrollment') {
        tx.enrollment.create.mockRejectedValue(failure);
      }
      if (failurePoint === 'audit') {
        tx.auditLog.create.mockRejectedValue(failure);
      }
      if (failurePoint === 'row-created') {
        tx.studentBulkRegistrationRow.updateMany
          .mockReset()
          .mockResolvedValueOnce({ count: 1 })
          .mockResolvedValueOnce({ count: 0 });
      }
      if (failurePoint === 'created-counter') {
        tx.studentBulkRegistrationBatch.updateMany.mockResolvedValue({
          count: 0,
        });
      }
      const transaction = jest.fn(
        (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      );
      const repository = new StudentBulkRegistrationExecutionRepository({
        $transaction: transaction,
      } as unknown as PrismaService);

      await expect(
        repository.provisionRow({
          batchId: IDS.batch,
          schoolId: IDS.school,
          rowId: 'row-1',
        }),
      ).rejects.toBeDefined();
      expect(transaction).toHaveBeenCalledTimes(1);
      expect(transaction.mock.calls[0][1]).toEqual({
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    },
  );

  it.each([
    ['inactive school', { schoolStatus: 'SUSPENDED' }],
    ['deleted school', { schoolDeletedAt: new Date() }],
    ['inactive organization', { organizationStatus: 'SUSPENDED' }],
    ['deleted organization', { organizationDeletedAt: new Date() }],
  ])(
    'rejects provisioning for an %s inside the Serializable transaction',
    async (_label, state) => {
      const eligibility = state as {
        schoolStatus?: string;
        schoolDeletedAt?: Date;
        organizationStatus?: string;
        organizationDeletedAt?: Date;
      };
      const tx = transactionFixture();
      tx.school.findUnique.mockResolvedValue({
        id: IDS.school,
        organizationId: IDS.organization,
        status: eligibility.schoolStatus ?? 'ACTIVE',
        deletedAt: eligibility.schoolDeletedAt ?? null,
        organization: {
          id: IDS.organization,
          status: eligibility.organizationStatus ?? 'ACTIVE',
          deletedAt: eligibility.organizationDeletedAt ?? null,
        },
      });
      const repository = new StudentBulkRegistrationExecutionRepository({
        $transaction: (callback: (client: typeof tx) => Promise<unknown>) =>
          callback(tx),
      } as unknown as PrismaService);

      await expect(
        repository.provisionRow({
          batchId: IDS.batch,
          schoolId: IDS.school,
          rowId: 'row-1',
        }),
      ).rejects.toMatchObject({
        code: 'students.bulk_registration.execution_tenant_ineligible',
      });
      expect(tx.user.create).not.toHaveBeenCalled();
      expect(tx.membership.create).not.toHaveBeenCalled();
      expect(tx.student.create).not.toHaveBeenCalled();
      expect(tx.enrollment.create).not.toHaveBeenCalled();
    },
  );

  it('fails closed on tenant identity mismatch inside provisioning', async () => {
    const tx = transactionFixture();
    tx.school.findUnique.mockResolvedValue({
      id: IDS.school,
      organizationId: 'other-organization',
      status: 'ACTIVE',
      deletedAt: null,
      organization: {
        id: 'other-organization',
        status: 'ACTIVE',
        deletedAt: null,
      },
    });
    const repository = new StudentBulkRegistrationExecutionRepository({
      $transaction: (callback: (client: typeof tx) => Promise<unknown>) =>
        callback(tx),
    } as unknown as PrismaService);
    await expect(
      repository.provisionRow({
        batchId: IDS.batch,
        schoolId: IDS.school,
        rowId: 'row-1',
      }),
    ).rejects.toMatchObject({
      code: 'students.bulk_registration.execution_invariant_invalid',
    });
    expect(tx.user.create).not.toHaveBeenCalled();
  });

  it('retries only P2034 up to the bounded attempt count', async () => {
    const conflict = Object.assign(new Error('serialization conflict'), {
      code: 'P2034',
    });
    const transaction = jest.fn().mockRejectedValue(conflict);
    const repository = new StudentBulkRegistrationExecutionRepository({
      $transaction: transaction,
    } as unknown as PrismaService);

    await expect(
      repository.provisionRow({
        batchId: IDS.batch,
        schoolId: IDS.school,
        rowId: 'row-1',
      }),
    ).rejects.toBe(conflict);
    expect(transaction).toHaveBeenCalledTimes(
      STUDENT_BULK_REGISTRATION_TRANSACTION_MAX_ATTEMPTS,
    );

    transaction.mockClear().mockRejectedValue(new Error('network failure'));
    await expect(
      repository.provisionRow({
        batchId: IDS.batch,
        schoolId: IDS.school,
        rowId: 'row-1',
      }),
    ).rejects.toThrow('network failure');
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('maps only the User email P2002 race to the canonical login collision', async () => {
    const transaction = jest.fn().mockRejectedValue({
      code: 'P2002',
      meta: { modelName: 'User', target: ['email'] },
    });
    const repository = new StudentBulkRegistrationExecutionRepository({
      $transaction: transaction,
    } as unknown as PrismaService);
    await expect(
      repository.provisionRow({
        batchId: IDS.batch,
        schoolId: IDS.school,
        rowId: 'row-1',
      }),
    ).rejects.toMatchObject({ code: 'iam.user.login_email_taken' });
  });

  it.each([
    ['login-email collision', 'iam.user.login_email_taken'],
    ['classroom capacity exhaustion', 'students.enrollment.placement_conflict'],
    [
      'school seat-limit exhaustion',
      'platform.entitlement.student_seat_limit_exceeded',
    ],
    [
      'corrupted normalized row data',
      'students.bulk_registration.row_data_invalid',
    ],
  ] as const)(
    'leaves no partial business records for %s',
    async (failurePoint, expectedCode) => {
      const tx = transactionFixture();
      if (failurePoint === 'login-email collision') {
        tx.user.findFirst.mockResolvedValue({ id: 'existing-user' });
      }
      if (failurePoint === 'classroom capacity exhaustion') {
        tx.classroom.findFirst.mockResolvedValue({
          id: 'classroom-1',
          capacity: 0,
        });
      }
      if (failurePoint === 'school seat-limit exhaustion') {
        tx.schoolEntitlement.findFirst.mockResolvedValue({
          studentSeatLimit: 0,
        });
      }
      if (failurePoint === 'corrupted normalized row data') {
        tx.studentBulkRegistrationRow.findFirstOrThrow.mockResolvedValue({
          id: 'row-1',
          normalizedDataJson: { malformed: true },
        });
      }
      const repository = new StudentBulkRegistrationExecutionRepository({
        $transaction: (callback: (client: typeof tx) => Promise<unknown>) =>
          callback(tx),
      } as unknown as PrismaService);

      await expect(
        repository.provisionRow({
          batchId: IDS.batch,
          schoolId: IDS.school,
          rowId: 'row-1',
        }),
      ).rejects.toMatchObject({ code: expectedCode });
      expect(tx.user.create).not.toHaveBeenCalled();
      expect(tx.membership.create).not.toHaveBeenCalled();
      expect(tx.student.create).not.toHaveBeenCalled();
      expect(tx.enrollment.create).not.toHaveBeenCalled();
      expect(tx.auditLog.create).not.toHaveBeenCalled();
      expect(tx.studentBulkRegistrationBatch.updateMany).not.toHaveBeenCalled();
    },
  );

  it.each([
    StudentBulkRegistrationRowStatus.CREATED,
    StudentBulkRegistrationRowStatus.FAILED,
  ])('ignores an already terminal %s row', async () => {
    const tx = transactionFixture();
    tx.studentBulkRegistrationRow.updateMany.mockResolvedValueOnce({
      count: 0,
    });
    const repository = new StudentBulkRegistrationExecutionRepository({
      $transaction: (callback: (client: typeof tx) => Promise<unknown>) =>
        callback(tx),
    } as unknown as PrismaService);

    await expect(
      repository.provisionRow({
        batchId: IDS.batch,
        schoolId: IDS.school,
        rowId: 'row-1',
      }),
    ).resolves.toEqual({ kind: 'not_required', rowId: 'row-1' });
    expect(tx.user.create).not.toHaveBeenCalled();
    expect(tx.studentBulkRegistrationBatch.updateMany).not.toHaveBeenCalled();
  });

  it('creates one set of business records when the same row is delivered twice', async () => {
    const tx = transactionFixture();
    tx.studentBulkRegistrationRow.updateMany
      .mockReset()
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    const repository = new StudentBulkRegistrationExecutionRepository({
      $transaction: (callback: (client: typeof tx) => Promise<unknown>) =>
        callback(tx),
    } as unknown as PrismaService);
    const input = {
      batchId: IDS.batch,
      schoolId: IDS.school,
      rowId: 'row-1',
    };

    await expect(repository.provisionRow(input)).resolves.toMatchObject({
      kind: 'created',
    });
    await expect(repository.provisionRow(input)).resolves.toEqual({
      kind: 'not_required',
      rowId: 'row-1',
    });
    expect(tx.user.create).toHaveBeenCalledTimes(1);
    expect(tx.membership.create).toHaveBeenCalledTimes(1);
    expect(tx.student.create).toHaveBeenCalledTimes(1);
    expect(tx.enrollment.create).toHaveBeenCalledTimes(1);
    expect(tx.auditLog.create).toHaveBeenCalledTimes(2);
    expect(tx.studentBulkRegistrationBatch.updateMany).toHaveBeenCalledTimes(1);
  });

  it('claims READY, report metadata, and confirmation audit atomically', async () => {
    const tx = {
      studentBulkRegistrationBatch: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      importJob: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      auditLog: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) },
    };
    const transaction = jest.fn(
      (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    );
    const repository = new StudentBulkRegistrationExecutionRepository({
      $transaction: transaction,
    } as unknown as PrismaService);
    const startedAt = new Date('2026-08-26T10:00:00.000Z');
    await expect(
      repository.claimExecution({
        batchId: IDS.batch,
        schoolId: IDS.school,
        organizationId: IDS.organization,
        sourceImportJobId: IDS.importJob,
        reportJson: { bulkRegistrationExecution: executionMetadata() },
        actorId: IDS.actor,
        actorUserType: UserType.SCHOOL_USER,
        validRows: 2,
        academicYearId: 'year-1',
        classroomId: 'classroom-1',
        startedAt,
      }),
    ).resolves.toBe(true);
    expect(tx.studentBulkRegistrationBatch.updateMany).toHaveBeenCalledWith({
      where: objectContaining({
        status: StudentBulkRegistrationBatchStatus.READY,
      }),
      data: {
        status: StudentBulkRegistrationBatchStatus.EXECUTING,
        startedAt,
        completedAt: null,
      },
    });
    expect(tx.importJob.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: objectContaining({
        action: 'students.bulk_registration.confirm',
        outcome: 'SUCCESS',
      }),
    });
  });

  it('increments failedRows only when VALID -> FAILED wins', async () => {
    const rowUpdate = jest.fn().mockResolvedValue({ count: 1 });
    const batchUpdate = jest.fn().mockResolvedValue({ count: 1 });
    const tx = {
      studentBulkRegistrationRow: { updateMany: rowUpdate },
      studentBulkRegistrationBatch: { updateMany: batchUpdate },
    };
    const repository = new StudentBulkRegistrationExecutionRepository({
      $transaction: (callback: (client: typeof tx) => Promise<unknown>) =>
        callback(tx),
    } as unknown as PrismaService);
    await expect(
      repository.markRowFailed({
        batchId: IDS.batch,
        schoolId: IDS.school,
        rowId: 'row-1',
        error: { code: 'iam.user.login_email_taken', field: 'username' },
      }),
    ).resolves.toBe(true);
    expect(batchUpdate).toHaveBeenCalledWith({
      where: objectContaining({
        status: StudentBulkRegistrationBatchStatus.EXECUTING,
      }),
      data: { failedRows: { increment: 1 } },
    });

    rowUpdate.mockResolvedValue({ count: 0 });
    batchUpdate.mockClear();
    await expect(
      repository.markRowFailed({
        batchId: IDS.batch,
        schoolId: IDS.school,
        rowId: 'row-1',
        error: { code: 'iam.user.login_email_taken', field: 'username' },
      }),
    ).resolves.toBe(false);
    expect(batchUpdate).not.toHaveBeenCalled();
  });

  it.each([
    [2, 0, StudentBulkRegistrationBatchStatus.COMPLETED],
    [1, 1, StudentBulkRegistrationBatchStatus.EXECUTION_PARTIAL_FAILED],
    [0, 2, StudentBulkRegistrationBatchStatus.FAILED],
  ] as const)(
    'finalizes persisted created=%i failed=%i as %s',
    async (createdRows, failedRows, status) => {
      const tx = finalizationTransactionFixture({ createdRows, failedRows });
      const repository = new StudentBulkRegistrationExecutionRepository({
        $transaction: (callback: (client: typeof tx) => Promise<unknown>) =>
          callback(tx),
      } as unknown as PrismaService);
      await expect(
        repository.finalizeExecution({
          batchId: IDS.batch,
          schoolId: IDS.school,
        }),
      ).resolves.toMatchObject({
        terminal: true,
        status,
        createdRows,
        failedRows,
      });
      expect(tx.studentBulkRegistrationBatch.updateMany).toHaveBeenCalledWith({
        where: objectContaining({
          status: StudentBulkRegistrationBatchStatus.EXECUTING,
        }),
        data: objectContaining({
          status,
          createdRows,
          failedRows,
          completedAt: expect.any(Date) as unknown,
        }),
      });
      expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
    },
  );

  it('terminalizes only VALID rows, increments the exact count, and audits without row data', async () => {
    const tx = {
      studentBulkRegistrationBatch: {
        findFirst: jest.fn().mockResolvedValue(batchFixture()),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      studentBulkRegistrationRow: {
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      auditLog: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) },
    };
    const transaction = jest.fn(
      (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    );
    const repository = new StudentBulkRegistrationExecutionRepository({
      $transaction: transaction,
    } as unknown as PrismaService);

    await expect(
      repository.terminalizeRemainingValidRows({
        batchId: IDS.batch,
        schoolId: IDS.school,
        reasonCode:
          'students.bulk_registration.execution_recovery_window_expired',
      }),
    ).resolves.toBe(2);
    expect(transaction.mock.calls[0][1]).toEqual({
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
    expect(tx.studentBulkRegistrationRow.updateMany).toHaveBeenCalledWith({
      where: {
        batchId: IDS.batch,
        schoolId: IDS.school,
        status: StudentBulkRegistrationRowStatus.VALID,
      },
      data: {
        status: StudentBulkRegistrationRowStatus.FAILED,
        errorsJson: [
          {
            code: 'students.bulk_registration.execution_recovery_window_expired',
            field: null,
          },
        ],
      },
    });
    expect(tx.studentBulkRegistrationBatch.updateMany).toHaveBeenCalledWith({
      where: objectContaining({
        status: StudentBulkRegistrationBatchStatus.EXECUTING,
      }),
      data: { failedRows: { increment: 2 } },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: objectContaining({
        actorId: IDS.actor,
        action: 'students.bulk_registration.execution_recovery_terminalize',
        after: {
          reasonCode:
            'students.bulk_registration.execution_recovery_window_expired',
          terminalizedRows: 2,
        },
      }),
    });
    expect(JSON.stringify(tx.auditLog.create.mock.calls)).not.toContain(
      'student.one',
    );
  });

  it('does not double-increment or duplicate the audit when terminalization has no VALID rows left', async () => {
    const tx = {
      studentBulkRegistrationBatch: {
        findFirst: jest.fn().mockResolvedValue(batchFixture()),
        updateMany: jest.fn(),
      },
      studentBulkRegistrationRow: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      auditLog: { create: jest.fn() },
    };
    const repository = new StudentBulkRegistrationExecutionRepository({
      $transaction: (callback: (client: typeof tx) => Promise<unknown>) =>
        callback(tx),
    } as unknown as PrismaService);
    await expect(
      repository.terminalizeRemainingValidRows({
        batchId: IDS.batch,
        schoolId: IDS.school,
        reasonCode:
          'students.bulk_registration.execution_recovery_window_expired',
      }),
    ).resolves.toBe(0);
    expect(tx.studentBulkRegistrationBatch.updateMany).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('lists recovery candidates with stable paging and one bulk row-status aggregation', async () => {
    const batch = {
      ...batchFixture(),
      createdAt: new Date('2026-08-26T09:00:00.000Z'),
      school: {
        id: IDS.school,
        organizationId: IDS.organization,
        status: 'ACTIVE',
        deletedAt: null,
        organization: {
          id: IDS.organization,
          status: 'ACTIVE',
          deletedAt: null,
        },
      },
    };
    const findMany = jest.fn().mockResolvedValue([batch]);
    const groupBy = jest.fn().mockResolvedValue([
      {
        batchId: IDS.batch,
        schoolId: IDS.school,
        status: StudentBulkRegistrationRowStatus.VALID,
        _count: { _all: 2 },
      },
    ]);
    const repository = new StudentBulkRegistrationExecutionRepository({
      studentBulkRegistrationBatch: { findMany },
      studentBulkRegistrationRow: { groupBy },
    } as unknown as PrismaService);
    const cursor = {
      createdAt: new Date('2026-08-26T08:00:00.000Z'),
      id: 'previous-batch',
    };

    await expect(
      repository.listExecutionRecoveryCandidates({
        createdBefore: new Date('2026-08-26T12:00:00.000Z'),
        cursor,
        limit: 100,
      }),
    ).resolves.toMatchObject([
      {
        id: IDS.batch,
        rowCounts: { VALID: 2 },
        rowSchoolMismatch: false,
      },
    ]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: 100,
      }),
    );
    expect(groupBy).toHaveBeenCalledTimes(1);
    expect(groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ['batchId', 'schoolId', 'status'],
        where: { batchId: { in: [IDS.batch] } },
      }),
    );
  });
});

function transactionFixture() {
  return {
    studentBulkRegistrationBatch: {
      findFirst: jest.fn().mockResolvedValue(batchFixture()),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    studentBulkRegistrationRow: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findFirstOrThrow: jest.fn().mockResolvedValue({
        id: 'row-1',
        normalizedDataJson: normalizedData(),
      }),
    },
    school: {
      findUnique: jest.fn().mockResolvedValue({
        id: IDS.school,
        organizationId: IDS.organization,
        status: 'ACTIVE',
        deletedAt: null,
        organization: {
          id: IDS.organization,
          status: 'ACTIVE',
          deletedAt: null,
        },
      }),
    },
    academicYear: {
      findFirst: jest.fn().mockResolvedValue({ id: 'year-1', isActive: true }),
    },
    term: { findFirst: jest.fn() },
    role: { findFirst: jest.fn().mockResolvedValue({ id: IDS.role }) },
    user: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'user-1' }),
    },
    schoolEntitlement: { findFirst: jest.fn().mockResolvedValue(null) },
    classroom: {
      findFirst: jest
        .fn()
        .mockResolvedValue({ id: 'classroom-1', capacity: 10 }),
    },
    enrollment: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue({ id: 'enrollment-1' }),
    },
    membership: {
      create: jest.fn().mockResolvedValue({ id: 'membership-1' }),
    },
    student: {
      create: jest.fn().mockResolvedValue({ id: 'student-1' }),
    },
    auditLog: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) },
  };
}

function finalizationTransactionFixture(input: {
  createdRows: number;
  failedRows: number;
}) {
  return {
    studentBulkRegistrationBatch: {
      findFirst: jest.fn().mockResolvedValue(batchFixture()),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    studentBulkRegistrationRow: {
      count: jest
        .fn()
        .mockImplementation(
          ({
            where,
          }: {
            where: { status: StudentBulkRegistrationRowStatus };
          }) => {
            switch (where.status) {
              case StudentBulkRegistrationRowStatus.CREATED:
                return input.createdRows;
              case StudentBulkRegistrationRowStatus.FAILED:
                return input.failedRows;
              default:
                return 0;
            }
          },
        ),
    },
    auditLog: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) },
  };
}

function objectContaining(value: Record<string, unknown>): unknown {
  return expect.objectContaining(value) as unknown;
}

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
      reportJson: { bulkRegistrationExecution: executionMetadata() },
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

function normalizedData() {
  return {
    firstNameEn: 'Student',
    fatherNameEn: null,
    grandfatherNameEn: null,
    familyNameEn: 'One',
    firstNameAr: null,
    fatherNameAr: null,
    grandfatherNameAr: null,
    familyNameAr: null,
    dateOfBirth: '2012-05-20',
    gender: 'female',
    nationality: 'Egyptian',
    username: 'student.one',
    contactEmail: 'CONTACT@example.com',
    studentPhone: '+201001234567',
  };
}
