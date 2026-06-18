import {
  AttendanceSessionStatus,
  AttendanceStatus,
  BehaviorPointLedgerEntryType,
  BehaviorRecordStatus,
  BehaviorRecordType,
  BehaviorSeverity,
} from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DisciplineDerivedRepository } from '../infrastructure/discipline-derived.repository';

describe('DisciplineDerivedRepository', () => {
  it('combines submitted attendance incidents and approved behavior records only', async () => {
    const {
      repository,
      scopedAttendanceEntryMocks,
      scopedBehaviorRecordMocks,
      scopedBehaviorPointLedgerMocks,
    } = createRepository();
    scopedAttendanceEntryMocks.findMany.mockResolvedValue([
      attendanceRecord({
        id: 'attendance-absent',
        status: AttendanceStatus.ABSENT,
        date: '2026-03-04T00:00:00.000Z',
      }),
      attendanceRecord({
        id: 'attendance-late',
        status: AttendanceStatus.LATE,
        lateMinutes: 9,
        date: '2026-03-03T00:00:00.000Z',
      }),
      attendanceRecord({
        id: 'attendance-early',
        status: AttendanceStatus.EARLY_LEAVE,
        earlyLeaveMinutes: 20,
        date: '2026-03-02T00:00:00.000Z',
      }),
      attendanceRecord({
        id: 'attendance-excused',
        status: AttendanceStatus.EXCUSED,
        excuseReason: 'Approved excuse',
        date: '2026-03-01T00:00:00.000Z',
      }),
    ]);
    scopedBehaviorRecordMocks.findMany.mockResolvedValue([
      behaviorRecord({
        id: 'behavior-positive',
        type: BehaviorRecordType.POSITIVE,
        points: 5,
        occurredAt: '2026-02-28T08:00:00.000Z',
      }),
      behaviorRecord({
        id: 'behavior-negative',
        type: BehaviorRecordType.NEGATIVE,
        severity: BehaviorSeverity.HIGH,
        points: -2,
        occurredAt: '2026-02-27T08:00:00.000Z',
      }),
    ]);
    scopedBehaviorPointLedgerMocks.groupBy.mockResolvedValue([
      { recordId: 'behavior-positive', _sum: { amount: 5 } },
      { recordId: 'behavior-negative', _sum: { amount: -2 } },
    ]);

    const result = await repository.listTimeline({
      scope: scopeFixture(),
      query: {
        page: 1,
        limit: 10,
        fromDate: '2026-02-01',
        toDate: '2026-03-31',
      },
    });

    expect(result.items.map((item) => item.id)).toEqual([
      'attendance:attendance-absent',
      'attendance:attendance-late',
      'attendance:attendance-early',
      'attendance:attendance-excused',
      'behavior:behavior-positive',
      'behavior:behavior-negative',
    ]);
    expect(result.summary).toMatchObject({
      attendanceIncidentCount: 4,
      absenceCount: 1,
      lateCount: 1,
      earlyLeaveCount: 1,
      excusedCount: 1,
      positiveCount: 1,
      negativeCount: 1,
      behaviorPoints: 3,
      totalIncidents: 6,
    });

    expect(scopedAttendanceEntryMocks.findMany.mock.calls[0][0].where).toMatchObject({
      studentId: 'student-1',
      enrollmentId: 'enrollment-1',
      status: {
        in: [
          AttendanceStatus.ABSENT,
          AttendanceStatus.LATE,
          AttendanceStatus.EARLY_LEAVE,
          AttendanceStatus.EXCUSED,
        ],
      },
      session: {
        academicYearId: 'year-1',
        termId: 'term-1',
        status: AttendanceSessionStatus.SUBMITTED,
        deletedAt: null,
      },
    });
    expect(scopedBehaviorRecordMocks.findMany.mock.calls[0][0].where).toMatchObject({
      studentId: 'student-1',
      enrollmentId: 'enrollment-1',
      academicYearId: 'year-1',
      status: BehaviorRecordStatus.APPROVED,
      deletedAt: null,
      type: { in: [BehaviorRecordType.POSITIVE, BehaviorRecordType.NEGATIVE] },
    });
    expect(scopedBehaviorPointLedgerMocks.groupBy.mock.calls[0][0].where).toMatchObject({
      studentId: 'student-1',
      enrollmentId: 'enrollment-1',
      entryType: {
        in: [
          BehaviorPointLedgerEntryType.AWARD,
          BehaviorPointLedgerEntryType.PENALTY,
          BehaviorPointLedgerEntryType.REVERSAL,
        ],
      },
      record: {
        status: BehaviorRecordStatus.APPROVED,
        deletedAt: null,
      },
    });
  });

  it('filters by source and item type without querying unrelated sources', async () => {
    const {
      repository,
      scopedAttendanceEntryMocks,
      scopedBehaviorRecordMocks,
      scopedBehaviorPointLedgerMocks,
    } = createRepository();
    scopedAttendanceEntryMocks.findMany.mockResolvedValue([
      attendanceRecord({
        id: 'attendance-late',
        status: AttendanceStatus.LATE,
        lateMinutes: 7,
      }),
    ]);

    const result = await repository.listTimeline({
      scope: scopeFixture(),
      query: { sourceType: 'attendance', itemType: 'lateness' },
    });

    expect(result.items).toEqual([
      expect.objectContaining({
        id: 'attendance:attendance-late',
        itemType: 'lateness',
        attendance: expect.objectContaining({
          status: 'late',
          lateMinutes: 7,
        }),
      }),
    ]);
    expect(scopedAttendanceEntryMocks.findMany.mock.calls[0][0].where.status).toEqual({
      in: [AttendanceStatus.LATE],
    });
    expect(scopedBehaviorRecordMocks.findMany).not.toHaveBeenCalled();
    expect(scopedBehaviorPointLedgerMocks.groupBy).not.toHaveBeenCalled();
  });

  it('selects only app-safe fields and performs no writes', async () => {
    const {
      repository,
      scopedAttendanceEntryMocks,
      scopedBehaviorRecordMocks,
      scopedBehaviorPointLedgerMocks,
      mutationMocks,
      platformBypass,
    } = createRepository();
    scopedAttendanceEntryMocks.findMany.mockResolvedValue([]);
    scopedBehaviorRecordMocks.findMany.mockResolvedValue([]);

    await repository.getSummary({ scope: scopeFixture() });

    expect(scopedAttendanceEntryMocks.findMany.mock.calls[0][0].select).not.toHaveProperty(
      'schoolId',
    );
    expect(scopedAttendanceEntryMocks.findMany.mock.calls[0][0].select).not.toHaveProperty(
      'markedById',
    );
    expect(scopedBehaviorRecordMocks.findMany.mock.calls[0][0].select).not.toHaveProperty(
      'reviewedById',
    );
    expect(scopedBehaviorRecordMocks.findMany.mock.calls[0][0].select).not.toHaveProperty(
      'metadata',
    );
    for (const mutation of Object.values(mutationMocks)) {
      expect(mutation).not.toHaveBeenCalled();
    }
    expect(scopedBehaviorPointLedgerMocks.groupBy).not.toHaveBeenCalled();
    expect(platformBypass).not.toHaveBeenCalled();
  });
});

function scopeFixture() {
  return {
    studentId: 'student-1',
    enrollmentId: 'enrollment-1',
    academicYearId: 'year-1',
    termId: 'term-1',
  };
}

function attendanceRecord(params: {
  id: string;
  status: AttendanceStatus;
  date?: string;
  lateMinutes?: number | null;
  earlyLeaveMinutes?: number | null;
  excuseReason?: string | null;
}) {
  return {
    id: params.id,
    status: params.status,
    lateMinutes: params.lateMinutes ?? null,
    earlyLeaveMinutes: params.earlyLeaveMinutes ?? null,
    excuseReason: params.excuseReason ?? null,
    session: {
      date: new Date(params.date ?? '2026-03-01T00:00:00.000Z'),
      status: AttendanceSessionStatus.SUBMITTED,
      deletedAt: null,
      periodLabelAr: null,
      periodLabelEn: null,
    },
  };
}

function behaviorRecord(params: {
  id: string;
  type: BehaviorRecordType;
  occurredAt: string;
  points: number;
  severity?: BehaviorSeverity;
}) {
  return {
    id: params.id,
    type: params.type,
    severity: params.severity ?? BehaviorSeverity.LOW,
    titleEn:
      params.type === BehaviorRecordType.POSITIVE ? 'Helpful' : 'Disruption',
    titleAr: null,
    noteEn: 'Visible note',
    noteAr: null,
    points: params.points,
    occurredAt: new Date(params.occurredAt),
    category: {
      id: `${params.id}-category`,
      code: 'CATEGORY',
      nameEn: 'Category',
      nameAr: null,
      type: params.type,
    },
  };
}

function modelMocks(): {
  findMany: jest.Mock;
  groupBy: jest.Mock;
  create: jest.Mock;
  update: jest.Mock;
  updateMany: jest.Mock;
  delete: jest.Mock;
  deleteMany: jest.Mock;
} {
  return {
    findMany: jest.fn(),
    groupBy: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  };
}

function createRepository(): {
  repository: DisciplineDerivedRepository;
  scopedAttendanceEntryMocks: ReturnType<typeof modelMocks>;
  scopedBehaviorRecordMocks: ReturnType<typeof modelMocks>;
  scopedBehaviorPointLedgerMocks: ReturnType<typeof modelMocks>;
  mutationMocks: Record<string, jest.Mock>;
  platformBypass: jest.Mock;
} {
  const scopedAttendanceEntryMocks = modelMocks();
  const scopedBehaviorRecordMocks = modelMocks();
  const scopedBehaviorPointLedgerMocks = modelMocks();
  const platformBypass = jest.fn();
  const prisma = {
    platformBypass,
    scoped: {
      attendanceEntry: scopedAttendanceEntryMocks,
      behaviorRecord: scopedBehaviorRecordMocks,
      behaviorPointLedger: scopedBehaviorPointLedgerMocks,
    },
  } as unknown as PrismaService;

  return {
    repository: new DisciplineDerivedRepository(prisma),
    scopedAttendanceEntryMocks,
    scopedBehaviorRecordMocks,
    scopedBehaviorPointLedgerMocks,
    mutationMocks: {
      attendanceCreate: scopedAttendanceEntryMocks.create,
      attendanceUpdate: scopedAttendanceEntryMocks.update,
      attendanceDelete: scopedAttendanceEntryMocks.delete,
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
