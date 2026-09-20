import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { TeacherAllocationReassignmentReadRepository } from '../infrastructure/teacher-allocation-reassignment-read.repository';

describe('TeacherAllocationReassignmentReadRepository', () => {
  it('loads every impact source in one read-only RepeatableRead transaction', async () => {
    const allocation = {
      id: '10000000-0000-4000-8000-000000000001',
      schoolId: '10000000-0000-4000-8000-000000000002',
      teacherUserId: '10000000-0000-4000-8000-000000000003',
      subjectId: '10000000-0000-4000-8000-000000000004',
      classroomId: '10000000-0000-4000-8000-000000000005',
      termId: '10000000-0000-4000-8000-000000000006',
      term: {
        academicYearId: '10000000-0000-4000-8000-000000000007',
      },
    };
    const tx = {
      teacherSubjectAllocation: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(allocation)
          .mockResolvedValueOnce(null),
      },
      user: { findFirst: jest.fn().mockResolvedValue(null) },
      timetableEntry: { findMany: jest.fn().mockResolvedValue([]) },
      lessonPlan: { findMany: jest.fn().mockResolvedValue([]) },
      homeworkAssignment: { findMany: jest.fn().mockResolvedValue([]) },
      reinforcementTask: { findMany: jest.fn().mockResolvedValue([]) },
      communicationAnnouncement: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const transaction = jest.fn(
      async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    );
    const repository = new TeacherAllocationReassignmentReadRepository({
      $transaction: transaction,
    } as unknown as PrismaService);

    const result = await repository.loadSnapshot({
      schoolId: allocation.schoolId,
      allocationId: allocation.id,
      newTeacherUserId: '10000000-0000-4000-8000-000000000008',
    });

    expect(result).toMatchObject({
      allocation,
      target: null,
      duplicateTargetAllocationId: null,
      timetableEntries: [],
      lessonPlans: [],
      homeworkAssignments: [],
      reinforcementTasks: [],
      announcements: [],
    });
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      maxWait: 5_000,
      timeout: 30_000,
    });
    expect(tx.teacherSubjectAllocation.findFirst).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { id: allocation.id, schoolId: allocation.schoolId },
      }),
    );
    for (const reader of [
      tx.timetableEntry.findMany,
      tx.lessonPlan.findMany,
      tx.homeworkAssignment.findMany,
      tx.reinforcementTask.findMany,
      tx.communicationAnnouncement.findMany,
    ]) {
      expect(reader).toHaveBeenCalledTimes(1);
    }
    expect(Object.keys(tx)).not.toEqual(
      expect.arrayContaining(['auditLog', 'create', 'update', 'delete']),
    );
  });
});
