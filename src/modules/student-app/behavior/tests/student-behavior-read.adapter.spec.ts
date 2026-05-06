import {
  AttendanceSessionStatus,
  BehaviorPointLedgerEntryType,
  BehaviorRecordStatus,
  BehaviorRecordType,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type { StudentAppContext } from '../../shared/student-app.types';
import { StudentBehaviorReadAdapter } from '../infrastructure/student-behavior-read.adapter';

describe('StudentBehaviorReadAdapter', () => {
  it('lists approved records for the current student through prisma.scoped', async () => {
    const {
      adapter,
      scopedBehaviorRecordMocks,
      scopedBehaviorPointLedgerMocks,
      scopedAttendanceEntryMocks,
    } = createAdapter();
    scopedBehaviorRecordMocks.findMany.mockResolvedValue([]);
    scopedBehaviorRecordMocks.count.mockResolvedValue(0);
    scopedBehaviorRecordMocks.groupBy.mockResolvedValue([]);
    scopedBehaviorPointLedgerMocks.aggregate.mockResolvedValue({
      _sum: { amount: 0 },
    });
    scopedAttendanceEntryMocks.groupBy.mockResolvedValue([]);

    await adapter.listVisibleBehaviorRecords({
      context: contextFixture(),
      query: { type: 'positive' },
    });

    const query = scopedBehaviorRecordMocks.findMany.mock.calls[0][0];
    expect(query.where).toMatchObject({
      studentId: 'student-1',
      academicYearId: 'year-1',
      status: BehaviorRecordStatus.APPROVED,
      type: BehaviorRecordType.POSITIVE,
      OR: [{ termId: 'term-1' }, { termId: null }],
    });
    expect(query.where).not.toHaveProperty('schoolId');
    expect(scopedBehaviorRecordMocks.count).toHaveBeenCalledWith({
      where: query.where,
    });
  });

  it('keeps behavior points separate from XP and reads attendance from submitted sessions', async () => {
    const {
      adapter,
      scopedBehaviorRecordMocks,
      scopedBehaviorPointLedgerMocks,
      scopedAttendanceEntryMocks,
      scopedXpLedgerMocks,
    } = createAdapter();
    scopedBehaviorRecordMocks.groupBy.mockResolvedValue([
      {
        type: BehaviorRecordType.POSITIVE,
        _count: { _all: 1 },
        _sum: { points: 5 },
      },
      {
        type: BehaviorRecordType.NEGATIVE,
        _count: { _all: 1 },
        _sum: { points: -2 },
      },
    ]);
    scopedBehaviorPointLedgerMocks.aggregate.mockResolvedValue({
      _sum: { amount: 3 },
    });
    scopedAttendanceEntryMocks.groupBy.mockResolvedValue([]);

    const result = await adapter.getBehaviorSummary({
      context: contextFixture(),
    });

    expect(result).toMatchObject({
      positivePoints: 5,
      negativePoints: -2,
      totalBehaviorPoints: 3,
    });
    expect(
      scopedBehaviorPointLedgerMocks.aggregate.mock.calls[0][0].where,
    ).toMatchObject({
      studentId: 'student-1',
      entryType: {
        in: [
          BehaviorPointLedgerEntryType.AWARD,
          BehaviorPointLedgerEntryType.PENALTY,
          BehaviorPointLedgerEntryType.REVERSAL,
        ],
      },
    });
    expect(
      scopedAttendanceEntryMocks.groupBy.mock.calls[0][0].where,
    ).toMatchObject({
      studentId: 'student-1',
      enrollmentId: 'enrollment-1',
      session: {
        academicYearId: 'year-1',
        termId: 'term-1',
        status: AttendanceSessionStatus.SUBMITTED,
        deletedAt: null,
      },
    });
    expect(scopedXpLedgerMocks.aggregate).not.toHaveBeenCalled();
  });

  it('reads behavior detail by current student ownership and performs no mutations', async () => {
    const {
      adapter,
      scopedBehaviorRecordMocks,
      mutationMocks,
      platformBypass,
    } = createAdapter();
    scopedBehaviorRecordMocks.findFirst.mockResolvedValue(null);

    await adapter.findVisibleBehaviorRecord({
      context: contextFixture(),
      recordId: 'record-1',
    });

    expect(
      scopedBehaviorRecordMocks.findFirst.mock.calls[0][0].where,
    ).toMatchObject({
      id: 'record-1',
      studentId: 'student-1',
      status: BehaviorRecordStatus.APPROVED,
    });
    for (const mutation of Object.values(mutationMocks)) {
      expect(mutation).not.toHaveBeenCalled();
    }
    expect(platformBypass).not.toHaveBeenCalled();
  });
});

function contextFixture(): StudentAppContext {
  return {
    studentUserId: 'student-user-1',
    studentId: 'student-1',
    schoolId: 'school-1',
    organizationId: 'org-1',
    membershipId: 'membership-1',
    roleId: 'role-1',
    permissions: ['students.records.view'],
    enrollmentId: 'enrollment-1',
    classroomId: 'classroom-1',
    academicYearId: 'year-1',
    requestedAcademicYearId: 'year-1',
    requestedTermId: 'term-1',
    termId: 'term-1',
  };
}

function modelMocks(): {
  findFirst: jest.Mock;
  findMany: jest.Mock;
  count: jest.Mock;
  groupBy: jest.Mock;
  aggregate: jest.Mock;
  create: jest.Mock;
  update: jest.Mock;
  updateMany: jest.Mock;
  delete: jest.Mock;
  deleteMany: jest.Mock;
} {
  return {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    groupBy: jest.fn(),
    aggregate: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  };
}

function createAdapter(): {
  adapter: StudentBehaviorReadAdapter;
  scopedBehaviorRecordMocks: ReturnType<typeof modelMocks>;
  scopedBehaviorPointLedgerMocks: ReturnType<typeof modelMocks>;
  scopedAttendanceEntryMocks: ReturnType<typeof modelMocks>;
  scopedXpLedgerMocks: ReturnType<typeof modelMocks>;
  mutationMocks: Record<string, jest.Mock>;
  platformBypass: jest.Mock;
} {
  const scopedBehaviorRecordMocks = modelMocks();
  const scopedBehaviorPointLedgerMocks = modelMocks();
  const scopedAttendanceEntryMocks = modelMocks();
  const scopedXpLedgerMocks = modelMocks();
  const platformBypass = jest.fn();
  const prisma = {
    platformBypass,
    scoped: {
      behaviorRecord: scopedBehaviorRecordMocks,
      behaviorPointLedger: scopedBehaviorPointLedgerMocks,
      attendanceEntry: scopedAttendanceEntryMocks,
      xpLedger: scopedXpLedgerMocks,
    },
  } as unknown as PrismaService;

  return {
    adapter: new StudentBehaviorReadAdapter(prisma),
    scopedBehaviorRecordMocks,
    scopedBehaviorPointLedgerMocks,
    scopedAttendanceEntryMocks,
    scopedXpLedgerMocks,
    mutationMocks: {
      behaviorRecordCreate: scopedBehaviorRecordMocks.create,
      behaviorRecordUpdate: scopedBehaviorRecordMocks.update,
      behaviorRecordDelete: scopedBehaviorRecordMocks.delete,
      behaviorPointLedgerCreate: scopedBehaviorPointLedgerMocks.create,
      behaviorPointLedgerUpdate: scopedBehaviorPointLedgerMocks.update,
      behaviorPointLedgerDelete: scopedBehaviorPointLedgerMocks.delete,
    },
    platformBypass,
  };
}
