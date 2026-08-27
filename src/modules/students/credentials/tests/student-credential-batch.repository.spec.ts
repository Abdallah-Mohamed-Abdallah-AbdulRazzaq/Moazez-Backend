/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await, @typescript-eslint/unbound-method -- focused Prisma transaction mocks intentionally expose generated delegate call tuples. */
import {
  MembershipStatus,
  OrganizationStatus,
  SchoolStatus,
  StudentCredentialAudienceMode,
  StudentCredentialRowStatus,
  StudentStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { StudentCredentialBatchRepository } from '../infrastructure/student-credential-batch.repository';

describe('StudentCredentialBatchRepository row atomicity', () => {
  it('creates tenant-owned rows through the batch composite relation without an invalid nested school field', async () => {
    const tx = {
      studentCredentialBatch: {
        create: jest.fn().mockResolvedValue({ id: 'batch-1' }),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: jest.fn(async (callback) => callback(tx)),
    } as unknown as PrismaService;
    const repository = new StudentCredentialBatchRepository(prisma);

    await repository.createBatch({
      scope: {
        schoolId: 'school-1',
        organizationId: 'organization-1',
        actorId: 'actor-1',
        userType: UserType.SCHOOL_USER,
      },
      selection: {
        audienceMode: StudentCredentialAudienceMode.SELECTED_STUDENTS,
        sourceRegistrationBatchId: null,
        academicYearId: null,
        stageId: null,
        gradeId: null,
        sectionId: null,
        classroomId: null,
        studentIds: ['student-1'],
      },
      credentialMode: 'UNIQUE_GENERATED',
      targets: [
        {
          studentId: 'student-1',
          userId: 'user-1',
          credentialVersion: 3,
        },
      ],
    });

    expect(tx.studentCredentialBatch.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          schoolId: 'school-1',
          rows: {
            createMany: {
              data: [
                expect.not.objectContaining({
                  schoolId: expect.anything(),
                }),
              ],
            },
          },
        }),
      }),
    );
  });

  it('changes password, revokes sessions, records the row, increments the batch, and audits in one SERIALIZABLE transaction', async () => {
    const tx = transactionFixture();
    const prisma = {
      $transaction: jest.fn(async (callback, options) => {
        expect(options).toEqual({ isolationLevel: 'Serializable' });
        return callback(tx);
      }),
    } as unknown as PrismaService;
    const repository = new StudentCredentialBatchRepository(prisma);

    await expect(repository.applyCredentialRow(rowInput())).resolves.toEqual({
      kind: 'generated',
      credentialVersionAfter: 4,
    });

    expect(tx.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ credentialVersion: 3 }),
        data: expect.objectContaining({
          passwordHash: 'argon-hash',
          mustChangePassword: true,
          credentialVersion: { increment: 1 },
        }),
      }),
    );
    expect(tx.session.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1', revokedAt: null },
      }),
    );
    expect(tx.studentCredentialRow.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: StudentCredentialRowStatus.GENERATED,
          credentialVersionAfter: 4,
        }),
      }),
    );
    expect(tx.studentCredentialRow.updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: { status: StudentCredentialRowStatus.PROCESSING },
      }),
    );
    expect(tx.studentCredentialBatch.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { generatedRows: { increment: 1 } } }),
    );
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(tx.auditLog.create.mock.calls)).not.toContain(
      'temporaryPassword',
    );
    expect(JSON.stringify(tx.auditLog.create.mock.calls)).not.toContain(
      'argon-hash',
    );
    expect(JSON.stringify(tx.auditLog.create.mock.calls)).not.toContain(
      'studentId',
    );
    expect(JSON.stringify(tx.auditLog.create.mock.calls)).not.toContain(
      'userId',
    );
  });

  it('re-evaluates tenant/user state and skips drift without changing credentials', async () => {
    const tx = transactionFixture();
    tx.user.findUnique.mockResolvedValue(null);
    const prisma = {
      $transaction: jest.fn(async (callback) => callback(tx)),
    } as unknown as PrismaService;
    const repository = new StudentCredentialBatchRepository(prisma);

    await expect(repository.applyCredentialRow(rowInput())).resolves.toEqual({
      kind: 'skipped',
      reasonCode: 'students.credentials.target_ineligible',
    });
    expect(tx.user.updateMany).not.toHaveBeenCalled();
    expect(tx.session.updateMany).not.toHaveBeenCalled();
    expect(tx.studentCredentialRow.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: StudentCredentialRowStatus.SKIPPED,
        }),
      }),
    );
    expect(tx.studentCredentialBatch.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { skippedRows: { increment: 1 } } }),
    );
  });

  it('propagates any in-transaction audit failure so Prisma rolls back the complete row mutation', async () => {
    const tx = transactionFixture();
    tx.auditLog.create.mockRejectedValue(new Error('audit_unavailable'));
    const prisma = {
      $transaction: jest.fn(async (callback) => callback(tx)),
    } as unknown as PrismaService;
    const repository = new StudentCredentialBatchRepository(prisma);

    await expect(repository.applyCredentialRow(rowInput())).rejects.toThrow(
      'audit_unavailable',
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('retries only bounded SERIALIZABLE P2034 conflicts', async () => {
    const tx = transactionFixture();
    const prisma = {
      $transaction: jest
        .fn()
        .mockRejectedValueOnce({ code: 'P2034' })
        .mockRejectedValueOnce({ code: 'P2034' })
        .mockImplementation(async (callback) => callback(tx)),
    } as unknown as PrismaService;
    const repository = new StudentCredentialBatchRepository(prisma);

    await expect(repository.applyCredentialRow(rowInput())).resolves.toEqual({
      kind: 'generated',
      credentialVersionAfter: 4,
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
  });
});

function rowInput() {
  return {
    batchId: 'batch-1',
    schoolId: 'school-1',
    rowId: 'row-1',
    artifactFileId: 'file-1',
    artifactVersion: 1,
    artifactEntry: {
      rowId: 'row-1',
      studentId: 'student-1',
      userId: 'user-1',
    },
    passwordHash: 'argon-hash',
    generatedAt: new Date('2026-08-27T10:00:00Z'),
  };
}

function transactionFixture() {
  return {
    studentCredentialBatch: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'batch-1',
        schoolId: 'school-1',
        organizationId: 'organization-1',
        audienceMode: StudentCredentialAudienceMode.SELECTED_STUDENTS,
        createdById: 'actor-1',
        createdBy: { userType: UserType.SCHOOL_USER },
        secretArtifactExpiresAt: new Date('2026-08-28T10:00:00Z'),
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
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue({}),
    },
    studentCredentialRow: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'row-1',
        schoolId: 'school-1',
        batchId: 'batch-1',
        studentId: 'student-1',
        userId: 'user-1',
        status: StudentCredentialRowStatus.PENDING,
        credentialVersionBefore: 3,
        credentialVersionAfter: null,
        generatedAt: null,
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    student: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'student-1',
        status: StudentStatus.ACTIVE,
      }),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'user-1',
        userType: UserType.STUDENT,
        status: UserStatus.ACTIVE,
        deletedAt: null,
        credentialVersion: 3,
        passwordHash: null,
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    membership: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'membership-1',
        status: MembershipStatus.ACTIVE,
      }),
    },
    session: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  };
}
