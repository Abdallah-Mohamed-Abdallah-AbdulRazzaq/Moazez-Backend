/* eslint-disable @typescript-eslint/no-unsafe-member-access -- focused Prisma transaction mocks intentionally inspect generated call tuples. */
import { AuditOutcome, Prisma, UserType } from '@prisma/client';
import type { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { PrismaTeacherAllocationReassignmentTransactionOperations } from '../infrastructure/prisma-teacher-allocation-reassignment-transaction.operations';
import { PrismaTeacherAllocationReassignmentUnitOfWork } from '../infrastructure/prisma-teacher-allocation-reassignment.unit-of-work';
import type { TeacherAllocationReassignmentSnapshotOperations } from '../infrastructure/teacher-allocation-reassignment-read.repository';

const schoolId = '10000000-0000-4000-8000-000000000001';
const allocationId = '10000000-0000-4000-8000-000000000002';
const previousTeacherUserId = '10000000-0000-4000-8000-000000000003';
const newTeacherUserId = '10000000-0000-4000-8000-000000000004';

describe('teacher allocation reassignment transaction boundary', () => {
  it('binds every context capability to one Serializable transaction client', async () => {
    const transactionClient = { marker: 'same-client' };
    const operations = {
      lockAllocation: jest.fn().mockResolvedValue(true),
      handoffAllocation: jest.fn().mockResolvedValue(1),
      handoffTimetable: jest.fn().mockResolvedValue(2),
      handoffLessonPlans: jest.fn().mockResolvedValue(3),
      handoffHomework: jest.fn().mockResolvedValue(4),
      writeSuccessfulAudit: jest.fn().mockResolvedValue(undefined),
    };
    const snapshotOperations = {
      load: jest.fn().mockResolvedValue(null),
    };
    const prisma = {
      $transaction: jest.fn(
        async (
          callback: (transaction: typeof transactionClient) => Promise<unknown>,
        ) => callback(transactionClient),
      ),
    };
    const unitOfWork = new PrismaTeacherAllocationReassignmentUnitOfWork(
      prisma as unknown as PrismaService,
      snapshotOperations as unknown as TeacherAllocationReassignmentSnapshotOperations,
      operations as unknown as PrismaTeacherAllocationReassignmentTransactionOperations,
    );
    const handoff = {
      schoolId,
      allocationId,
      previousTeacherUserId,
      newTeacherUserId,
    };

    await unitOfWork.execute(async (context) => {
      await context.allocation.lock({ schoolId, allocationId });
      await context.snapshot.load({
        schoolId,
        allocationId,
        newTeacherUserId,
      });
      await context.timetable.handoff(handoff);
      await context.lessonPlans.handoff(handoff);
      await context.homework.handoff(handoff);
      await context.allocation.handoff(handoff);
      await context.audit.writeSuccessful({
        actorId: previousTeacherUserId,
        userType: UserType.SCHOOL_USER,
        organizationId: '10000000-0000-4000-8000-000000000005',
        schoolId,
        allocationId,
        previousTeacherUserId,
        newTeacherUserId,
        transferred: {
          timetableEntries: 2,
          lessonPlans: 3,
          homeworkAssignments: 4,
        },
      });
    });

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 5_000,
      timeout: 30_000,
    });
    for (const operation of [
      operations.lockAllocation,
      operations.handoffAllocation,
      operations.handoffTimetable,
      operations.handoffLessonPlans,
      operations.handoffHomework,
      operations.writeSuccessfulAudit,
      snapshotOperations.load,
    ]) {
      expect(operation.mock.calls[0]?.[0]).toBe(transactionClient);
    }
  });

  it('uses scoped expected-state predicates and changes only current responsibility fields', async () => {
    const transaction = buildTransaction();
    const operations =
      new PrismaTeacherAllocationReassignmentTransactionOperations();
    const handoff = {
      schoolId,
      allocationId,
      previousTeacherUserId,
      newTeacherUserId,
    };

    await expect(
      operations.lockAllocation(transaction.client, {
        schoolId,
        allocationId,
      }),
    ).resolves.toBe(true);
    await operations.handoffTimetable(transaction.client, handoff);
    await operations.handoffLessonPlans(transaction.client, handoff);
    await operations.handoffHomework(transaction.client, handoff);
    await operations.handoffAllocation(transaction.client, handoff);

    const lockQuery = transaction.$queryRaw.mock.calls[0]?.[0] as {
      strings?: string[];
      values?: unknown[];
    };
    expect(lockQuery.strings?.join('?')).toContain(
      'FROM "teacher_subject_allocations"',
    );
    expect(lockQuery.strings?.join('?')).toContain('FOR UPDATE');
    expect(lockQuery.values).toEqual([allocationId, schoolId]);

    expect(transaction.timetableEntry.updateMany).toHaveBeenCalledWith({
      where: {
        schoolId,
        teacherSubjectAllocationId: allocationId,
        teacherUserId: previousTeacherUserId,
        status: { in: ['DRAFT', 'ACTIVE'] },
      },
      data: { teacherUserId: newTeacherUserId },
    });
    expect(transaction.lessonPlan.updateMany).toHaveBeenCalledWith({
      where: {
        schoolId,
        teacherSubjectAllocationId: allocationId,
        teacherUserId: previousTeacherUserId,
        deletedAt: null,
        status: { in: ['DRAFT', 'ACTIVE'] },
      },
      data: { teacherUserId: newTeacherUserId },
    });
    expect(transaction.homeworkAssignment.updateMany).toHaveBeenCalledWith({
      where: {
        schoolId,
        teacherSubjectAllocationId: allocationId,
        teacherUserId: previousTeacherUserId,
        deletedAt: null,
        status: { in: ['DRAFT', 'PUBLISHED', 'CLOSED'] },
      },
      data: { teacherUserId: newTeacherUserId },
    });
    expect(
      transaction.teacherSubjectAllocation.updateMany,
    ).toHaveBeenCalledWith({
      where: {
        id: allocationId,
        schoolId,
        teacherUserId: previousTeacherUserId,
      },
      data: { teacherUserId: newTeacherUserId },
    });
  });

  it('writes exactly one bounded success audit inside the supplied transaction', async () => {
    const transaction = buildTransaction();
    const operations =
      new PrismaTeacherAllocationReassignmentTransactionOperations();

    await operations.writeSuccessfulAudit(transaction.client, {
      actorId: '10000000-0000-4000-8000-000000000005',
      userType: UserType.SCHOOL_USER,
      organizationId: '10000000-0000-4000-8000-000000000006',
      schoolId,
      allocationId,
      previousTeacherUserId,
      newTeacherUserId,
      reasonCode: 'teacher_replacement',
      transferred: {
        timetableEntries: 2,
        lessonPlans: 3,
        homeworkAssignments: 4,
      },
    });

    expect(transaction.auditLog.create).toHaveBeenCalledTimes(1);
    expect(transaction.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: '10000000-0000-4000-8000-000000000005',
        userType: UserType.SCHOOL_USER,
        organizationId: '10000000-0000-4000-8000-000000000006',
        schoolId,
        module: 'academics',
        action: 'academics.allocation.reassign',
        resourceType: 'teacher_subject_allocation',
        resourceId: allocationId,
        outcome: AuditOutcome.SUCCESS,
        before: { teacherUserId: previousTeacherUserId },
        after: {
          teacherUserId: newTeacherUserId,
          reasonCode: 'teacher_replacement',
          transferred: {
            timetableEntries: 2,
            lessonPlans: 3,
            homeworkAssignments: 4,
          },
          blockersVerified: { reinforcement: 0, announcements: 0 },
        },
      },
      select: { id: true },
    });
  });
});

function buildTransaction() {
  const transaction = {
    $queryRaw: jest.fn().mockResolvedValue([{ id: allocationId }]),
    timetableEntry: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
    lessonPlan: { updateMany: jest.fn().mockResolvedValue({ count: 3 }) },
    homeworkAssignment: {
      updateMany: jest.fn().mockResolvedValue({ count: 4 }),
    },
    teacherSubjectAllocation: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    auditLog: { create: jest.fn().mockResolvedValue({ id: 'audit-id' }) },
  };
  return {
    ...transaction,
    client: transaction as unknown as Prisma.TransactionClient,
  };
}
