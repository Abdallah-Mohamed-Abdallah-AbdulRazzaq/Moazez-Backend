import type { Prisma } from '@prisma/client';
import { classifyTeacherAllocationLifecycleStateInTransaction } from '../infrastructure/teacher-allocation-lifecycle-transaction.operations';

const SCHOOL_ID = '64000000-0000-4000-8000-000000000001';
const USER_ID = '64000000-0000-4000-8000-000000000002';
const AS_OF = new Date('2026-07-19T12:00:00.000Z');

function transactionWithTerms(terms: Array<Record<string, unknown>>) {
  const findMany = jest.fn().mockResolvedValue(
    terms.map((term, index) => ({
      id: `64000000-0000-4000-8000-${String(index + 3).padStart(12, '0')}`,
      term,
    })),
  );
  const count = jest.fn().mockResolvedValue(0);
  return {
    transaction: {
      teacherSubjectAllocation: { findMany },
      timetableEntry: { count },
      lessonPlan: { count },
      homeworkAssignment: { count },
    } as unknown as Prisma.TransactionClient,
    findMany,
    count,
  };
}

function term(overrides: Record<string, unknown> = {}) {
  return {
    startDate: new Date('2026-07-01T00:00:00.000Z'),
    endDate: new Date('2026-07-31T23:59:59.999Z'),
    isActive: true,
    deletedAt: null,
    academicYear: { isActive: true, deletedAt: null },
    ...overrides,
  };
}

describe('transaction-local Teacher allocation lifecycle read', () => {
  it('uses explicit current-school and Teacher predicates with aggregate-only output', async () => {
    const fixture = transactionWithTerms([term()]);
    const result = await classifyTeacherAllocationLifecycleStateInTransaction(
      fixture.transaction,
      { schoolId: SCHOOL_ID, teacherUserId: USER_ID, asOf: AS_OF },
    );
    expect(fixture.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { schoolId: SCHOOL_ID, teacherUserId: USER_ID },
        orderBy: { id: 'asc' },
        take: 500,
        select: expect.objectContaining({ id: true, term: expect.any(Object) }),
      }),
    );
    expect(result.currentActiveCount).toBe(1);
    expect(result).not.toHaveProperty('allocationIds');
    expect(result).not.toHaveProperty('schoolId');
    expect(result).not.toHaveProperty('teacherUserId');
  });

  it('paginates deterministically and counts each allocation once', async () => {
    const page = Array.from({ length: 500 }, (_, index) => ({
      id: `65000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      term: term({
        startDate: new Date('2027-01-01T00:00:00.000Z'),
        endDate: new Date('2027-06-01T00:00:00.000Z'),
        isActive: false,
      }),
    }));
    const finalAllocation = {
      id: '65000000-0000-4000-8000-000000000500',
      term: term({
        startDate: new Date('2025-01-01T00:00:00.000Z'),
        endDate: new Date('2025-06-01T00:00:00.000Z'),
        isActive: false,
      }),
    };
    const findMany = jest
      .fn()
      .mockResolvedValueOnce(page)
      .mockResolvedValueOnce([finalAllocation]);
    const count = jest.fn().mockResolvedValue(0);
    const transaction = {
      teacherSubjectAllocation: { findMany },
      timetableEntry: { count },
      lessonPlan: { count },
      homeworkAssignment: { count },
    } as unknown as Prisma.TransactionClient;

    const result = await classifyTeacherAllocationLifecycleStateInTransaction(
      transaction,
      { schoolId: SCHOOL_ID, teacherUserId: USER_ID, asOf: AS_OF },
    );

    expect(result.futureCount).toBe(500);
    expect(result.historicalCount).toBe(1);
    expect(findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        cursor: { id: page[499].id },
        skip: 1,
        take: 500,
        orderBy: { id: 'asc' },
      }),
    );
  });

  it('counts dependencies only for non-historical allocation ids', async () => {
    const fixture = transactionWithTerms([
      term({
        startDate: new Date('2025-01-01T00:00:00.000Z'),
        endDate: new Date('2025-06-01T00:00:00.000Z'),
        isActive: false,
      }),
      term(),
    ]);
    await classifyTeacherAllocationLifecycleStateInTransaction(
      fixture.transaction,
      { schoolId: SCHOOL_ID, teacherUserId: USER_ID, asOf: AS_OF },
    );
    expect(fixture.count).toHaveBeenCalledTimes(3);
    for (const [query] of fixture.count.mock.calls) {
      expect(query.where.schoolId).toBe(SCHOOL_ID);
      expect(query.where.teacherSubjectAllocationId.in).toEqual([
        '64000000-0000-4000-8000-000000000004',
      ]);
    }
  });

  it('never exposes or invokes an allocation mutation delegate', async () => {
    const fixture = transactionWithTerms([]);
    const result = await classifyTeacherAllocationLifecycleStateInTransaction(
      fixture.transaction,
      { schoolId: SCHOOL_ID, teacherUserId: USER_ID, asOf: AS_OF },
    );
    expect(result.blockingCount).toBe(0);
    expect(fixture.findMany).toHaveBeenCalledTimes(1);
    expect(fixture.count).not.toHaveBeenCalled();
    expect(fixture.transaction.teacherSubjectAllocation).not.toHaveProperty(
      'create',
    );
    expect(fixture.transaction.teacherSubjectAllocation).not.toHaveProperty(
      'delete',
    );
  });
});
