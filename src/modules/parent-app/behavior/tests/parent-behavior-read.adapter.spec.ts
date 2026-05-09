import {
  AttendanceSessionStatus,
  BehaviorPointLedgerEntryType,
  BehaviorRecordStatus,
  BehaviorRecordType,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type { ParentAppAccessibleChild } from '../../shared/parent-app.types';
import { ParentBehaviorReadAdapter } from '../infrastructure/parent-behavior-read.adapter';

describe('ParentBehaviorReadAdapter', () => {
  it('reads approved behavior records for the owned child only', async () => {
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
      child: childFixture(),
      query: { type: 'positive' },
    });

    const query = scopedBehaviorRecordMocks.findMany.mock.calls[0][0];
    expect(query.where).toMatchObject({
      studentId: 'student-1',
      enrollmentId: 'enrollment-1',
      academicYearId: 'year-1',
      status: BehaviorRecordStatus.APPROVED,
      type: BehaviorRecordType.POSITIVE,
    });
    expect(query.where).not.toHaveProperty('schoolId');
  });

  it('keeps behavior point ledger separate from XP ledger', async () => {
    const {
      adapter,
      scopedBehaviorRecordMocks,
      scopedBehaviorPointLedgerMocks,
      scopedAttendanceEntryMocks,
      scopedXpLedgerMocks,
    } = createAdapter();
    scopedBehaviorRecordMocks.groupBy.mockResolvedValue([]);
    scopedBehaviorPointLedgerMocks.aggregate.mockResolvedValue({
      _sum: { amount: 0 },
    });
    scopedAttendanceEntryMocks.groupBy.mockResolvedValue([]);

    await adapter.getBehaviorSummary({ child: childFixture() });

    expect(scopedBehaviorPointLedgerMocks.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          studentId: 'student-1',
          enrollmentId: 'enrollment-1',
          entryType: {
            in: [
              BehaviorPointLedgerEntryType.AWARD,
              BehaviorPointLedgerEntryType.PENALTY,
              BehaviorPointLedgerEntryType.REVERSAL,
            ],
          },
        }),
      }),
    );
    expect(scopedXpLedgerMocks.aggregate).not.toHaveBeenCalled();
  });

  it('uses submitted attendance entries for attendance summary', async () => {
    const {
      adapter,
      scopedBehaviorRecordMocks,
      scopedBehaviorPointLedgerMocks,
      scopedAttendanceEntryMocks,
    } = createAdapter();
    scopedBehaviorRecordMocks.groupBy.mockResolvedValue([]);
    scopedBehaviorPointLedgerMocks.aggregate.mockResolvedValue({
      _sum: { amount: 0 },
    });
    scopedAttendanceEntryMocks.groupBy.mockResolvedValue([]);

    await adapter.getBehaviorSummary({ child: childFixture() });

    const attendanceWhere =
      scopedAttendanceEntryMocks.groupBy.mock.calls[0][0].where;
    expect(attendanceWhere).toMatchObject({
      studentId: 'student-1',
      enrollmentId: 'enrollment-1',
      session: {
        academicYearId: 'year-1',
        termId: 'term-1',
        status: AttendanceSessionStatus.SUBMITTED,
        deletedAt: null,
      },
    });
    expect(attendanceWhere).not.toHaveProperty('schoolId');
  });

  it('performs no mutations or platform bypass calls', async () => {
    const {
      adapter,
      scopedBehaviorRecordMocks,
      scopedBehaviorPointLedgerMocks,
      scopedAttendanceEntryMocks,
      mutationMocks,
      platformBypass,
    } = createAdapter();
    scopedBehaviorRecordMocks.findMany.mockResolvedValue([]);
    scopedBehaviorRecordMocks.count.mockResolvedValue(0);
    scopedBehaviorRecordMocks.groupBy.mockResolvedValue([]);
    scopedBehaviorPointLedgerMocks.aggregate.mockResolvedValue({
      _sum: { amount: 0 },
    });
    scopedAttendanceEntryMocks.groupBy.mockResolvedValue([]);

    await adapter.listVisibleBehaviorRecords({ child: childFixture() });

    for (const mutation of Object.values(mutationMocks)) {
      expect(mutation).not.toHaveBeenCalled();
    }
    expect(platformBypass).not.toHaveBeenCalled();
  });
});

function childFixture(): ParentAppAccessibleChild {
  return {
    studentId: 'student-1',
    enrollmentId: 'enrollment-1',
    classroomId: 'classroom-1',
    academicYearId: 'year-1',
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
  adapter: ParentBehaviorReadAdapter;
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
    adapter: new ParentBehaviorReadAdapter(prisma),
    scopedBehaviorRecordMocks,
    scopedBehaviorPointLedgerMocks,
    scopedAttendanceEntryMocks,
    scopedXpLedgerMocks,
    mutationMocks: {
      behaviorCreate: scopedBehaviorRecordMocks.create,
      behaviorUpdate: scopedBehaviorRecordMocks.update,
      behaviorDelete: scopedBehaviorRecordMocks.delete,
      ledgerCreate: scopedBehaviorPointLedgerMocks.create,
      ledgerUpdate: scopedBehaviorPointLedgerMocks.update,
      ledgerDelete: scopedBehaviorPointLedgerMocks.delete,
    },
    platformBypass,
  };
}
