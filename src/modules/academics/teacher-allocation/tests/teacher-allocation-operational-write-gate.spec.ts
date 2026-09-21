import type { Prisma } from '@prisma/client';
import { TeacherAllocationOperationalWriteGateError } from '../application/teacher-allocation-operational-write-gate';
import { PrismaTeacherAllocationOperationalWriteGate } from '../infrastructure/prisma-teacher-allocation-operational-write-gate';

const SCHOOL_ID = '10000000-0000-0000-0000-000000000001';
const ALLOCATION_A = '20000000-0000-0000-0000-000000000001';
const ALLOCATION_B = '20000000-0000-0000-0000-000000000002';
const TEACHER_A = '30000000-0000-0000-0000-000000000001';

describe('PrismaTeacherAllocationOperationalWriteGate', () => {
  it('uses the supplied transaction and normalizes multi-row locks ascending', async () => {
    const queryRaw = jest
      .fn<Promise<unknown>, [Prisma.Sql]>()
      .mockResolvedValueOnce([{ locked: null }])
      .mockResolvedValueOnce([{ locked: null }])
      .mockResolvedValueOnce([
        allocationRow(ALLOCATION_A),
        allocationRow(ALLOCATION_B),
      ])
      .mockResolvedValueOnce([{ id: ALLOCATION_A }, { id: ALLOCATION_B }]);
    const transaction = {
      $queryRaw: queryRaw,
    } as unknown as Prisma.TransactionClient;
    const gate = new PrismaTeacherAllocationOperationalWriteGate();

    const allocations = await gate.lock(transaction, {
      schoolId: SCHOOL_ID,
      allocationIds: [ALLOCATION_B, ALLOCATION_A, ALLOCATION_B],
      expectedTeacherUserId: TEACHER_A,
    });

    expect(allocations.map((allocation) => allocation.id)).toEqual([
      ALLOCATION_A,
      ALLOCATION_B,
    ]);
    expect(queryRaw).toHaveBeenCalledTimes(4);
    const advisoryQueries = queryRaw.mock.calls
      .slice(0, 2)
      .map(([query]) => query);
    expect(advisoryQueries[0].sql).toContain('pg_advisory_xact_lock');
    expect(advisoryQueries.map((query) => query.values)).toEqual([
      [SCHOOL_ID, ALLOCATION_A],
      [SCHOOL_ID, ALLOCATION_B],
    ]);
    const query = queryRaw.mock.calls[2][0];
    expect(query.sql).toContain('ORDER BY "id" ASC');
    expect(query.sql).toContain('FOR SHARE');
    expect(query.sql).toContain('"school_id" =');
    expect(query.values).toEqual([SCHOOL_ID, ALLOCATION_A, ALLOCATION_B]);
    const fence = queryRaw.mock.calls[3][0];
    expect(fence.sql).toContain('SET "teacher_user_id" = "teacher_user_id"');
    expect(fence.values).toEqual([SCHOOL_ID, ALLOCATION_A, ALLOCATION_B]);
  });

  it('rejects a tenant-scoped miss without exposing the missing row', async () => {
    const gate = new PrismaTeacherAllocationOperationalWriteGate();
    const transaction = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ locked: null }])
        .mockResolvedValueOnce([{ locked: null }])
        .mockResolvedValueOnce([allocationRow(ALLOCATION_A)]),
    } as unknown as Prisma.TransactionClient;

    await expect(
      gate.lock(transaction, {
        schoolId: SCHOOL_ID,
        allocationIds: [ALLOCATION_A, ALLOCATION_B],
      }),
    ).rejects.toMatchObject<TeacherAllocationOperationalWriteGateError>({
      reason: 'ALLOCATION_NOT_FOUND',
    });
  });

  it('rejects a stale expected teacher after the lock is acquired', async () => {
    const gate = new PrismaTeacherAllocationOperationalWriteGate();
    const transaction = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ locked: null }])
        .mockResolvedValueOnce([allocationRow(ALLOCATION_A, 'teacher-b')]),
    } as unknown as Prisma.TransactionClient;

    await expect(
      gate.lock(transaction, {
        schoolId: SCHOOL_ID,
        allocationIds: [ALLOCATION_A],
        expectedTeacherUserId: TEACHER_A,
      }),
    ).rejects.toMatchObject<TeacherAllocationOperationalWriteGateError>({
      reason: 'OWNER_CHANGED',
    });
  });
});

function allocationRow(id: string, teacherUserId = TEACHER_A) {
  return {
    id,
    school_id: SCHOOL_ID,
    teacher_user_id: teacherUserId,
    subject_id: 'subject-1',
    classroom_id: 'classroom-1',
    term_id: 'term-1',
  };
}
