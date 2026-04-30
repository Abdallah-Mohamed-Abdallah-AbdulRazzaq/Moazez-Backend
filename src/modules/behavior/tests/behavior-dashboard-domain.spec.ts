import {
  BehaviorPointLedgerEntryType,
  BehaviorRecordStatus,
  BehaviorRecordType,
  BehaviorSeverity,
} from '@prisma/client';
import {
  assertValidBehaviorDashboardDateRange,
  buildTopBehaviorCategories,
  calculateApprovalRate,
  calculateAveragePointsPerStudent,
  calculateRejectionRate,
  sortRecentBehaviorActivity,
  summarizeBehaviorPoints,
  summarizeBehaviorRecordStatuses,
  summarizeBehaviorRecordTypes,
  summarizeBehaviorReview,
  summarizeBehaviorSeverity,
} from '../domain/behavior-dashboard-domain';

const NOW = new Date('2026-04-30T12:00:00.000Z');

describe('behavior dashboard domain', () => {
  it('summarizes draft/submitted/approved/rejected/cancelled statuses', () => {
    expect(
      summarizeBehaviorRecordStatuses([
        { status: BehaviorRecordStatus.DRAFT },
        { status: BehaviorRecordStatus.SUBMITTED },
        { status: BehaviorRecordStatus.APPROVED },
        { status: BehaviorRecordStatus.REJECTED },
        { status: BehaviorRecordStatus.CANCELLED },
        { status: 'approved' },
      ]),
    ).toEqual({
      total: 6,
      draft: 1,
      submitted: 1,
      approved: 2,
      rejected: 1,
      cancelled: 1,
    });
  });

  it('summarizes positive and negative types', () => {
    expect(
      summarizeBehaviorRecordTypes([
        { type: BehaviorRecordType.POSITIVE },
        { type: BehaviorRecordType.NEGATIVE },
        { type: 'positive' },
      ]),
    ).toEqual({ positive: 2, negative: 1 });
  });

  it('summarizes low/medium/high/critical severity', () => {
    expect(
      summarizeBehaviorSeverity([
        { severity: BehaviorSeverity.LOW },
        { severity: BehaviorSeverity.MEDIUM },
        { severity: BehaviorSeverity.HIGH },
        { severity: BehaviorSeverity.CRITICAL },
        { severity: 'critical' },
      ]),
    ).toEqual({ low: 1, medium: 1, high: 1, critical: 2 });
  });

  it('calculates pending review, reviewed, approval rate, and rejection rate', () => {
    const review = summarizeBehaviorReview([
      { status: BehaviorRecordStatus.SUBMITTED },
      { status: BehaviorRecordStatus.APPROVED },
      { status: BehaviorRecordStatus.APPROVED },
      { status: BehaviorRecordStatus.REJECTED },
    ]);

    expect(review).toEqual({
      pendingReview: 1,
      reviewed: 3,
      approvalRate: 0.6667,
      rejectionRate: 0.3333,
    });
    expect(calculateApprovalRate(0, 0)).toBe(0);
    expect(calculateRejectionRate(0, 0)).toBe(0);
  });

  it('summarizes AWARD and PENALTY points without flipping penalty signs', () => {
    const summary = summarizeBehaviorPoints([
      ledger({
        id: 'ledger-a',
        studentId: 'student-a',
        entryType: BehaviorPointLedgerEntryType.AWARD,
        amount: 10,
      }),
      ledger({
        id: 'ledger-b',
        studentId: 'student-b',
        entryType: BehaviorPointLedgerEntryType.PENALTY,
        amount: -3,
      }),
      ledger({
        id: 'ledger-c',
        studentId: 'student-a',
        entryType: BehaviorPointLedgerEntryType.REVERSAL,
        amount: -10,
      }),
    ]);

    expect(summary).toEqual({
      totalPoints: 7,
      positivePoints: 10,
      negativePoints: -3,
      awardEntries: 1,
      penaltyEntries: 1,
      studentsWithPoints: 2,
      averagePointsPerStudent: 3.5,
    });
  });

  it('returns zero average points for zero students', () => {
    expect(calculateAveragePointsPerStudent(10, 0)).toBe(0);
  });

  it('sorts top categories by records, approved records, absolute points, then name/id', () => {
    const rows = buildTopBehaviorCategories({
      categories: [
        category({ id: 'category-a', code: 'A', nameEn: 'Alpha' }),
        category({ id: 'category-b', code: 'B', nameEn: 'Beta' }),
        category({ id: 'category-c', code: 'C', nameEn: 'Cedar' }),
      ],
      records: [
        record({ id: 'record-a1', categoryId: 'category-a' }),
        record({ id: 'record-a2', categoryId: 'category-a' }),
        record({
          id: 'record-b1',
          categoryId: 'category-b',
          status: BehaviorRecordStatus.APPROVED,
        }),
        record({
          id: 'record-b2',
          categoryId: 'category-b',
          status: BehaviorRecordStatus.APPROVED,
        }),
        record({ id: 'record-c1', categoryId: 'category-c' }),
      ],
      ledgerEntries: [
        ledger({ id: 'ledger-a', categoryId: 'category-a', amount: 50 }),
        ledger({ id: 'ledger-b', categoryId: 'category-b', amount: 5 }),
        ledger({ id: 'ledger-c', categoryId: 'category-c', amount: 100 }),
      ],
    });

    expect(rows.map((row) => row.categoryId)).toEqual([
      'category-b',
      'category-a',
      'category-c',
    ]);
  });

  it('sorts recent behavior activity by occurredAt, createdAt, then id', () => {
    const rows = sortRecentBehaviorActivity([
      activity({
        id: 'record-c',
        occurredAt: new Date('2026-04-30T10:00:00.000Z'),
        createdAt: new Date('2026-04-30T10:02:00.000Z'),
      }),
      activity({
        id: 'record-a',
        occurredAt: new Date('2026-04-30T11:00:00.000Z'),
        createdAt: new Date('2026-04-30T11:01:00.000Z'),
      }),
      activity({
        id: 'record-b',
        occurredAt: new Date('2026-04-30T11:00:00.000Z'),
        createdAt: new Date('2026-04-30T11:01:00.000Z'),
      }),
    ]);

    expect(rows.map((row) => row.id)).toEqual([
      'record-a',
      'record-b',
      'record-c',
    ]);
  });

  it('rejects invalid date ranges', () => {
    expect(() =>
      assertValidBehaviorDashboardDateRange({
        occurredFrom: new Date('2026-04-30T00:00:00.000Z'),
        occurredTo: new Date('2026-04-29T00:00:00.000Z'),
      }),
    ).toThrow('Behavior dashboard date range');
  });

  function record(overrides?: Record<string, unknown>) {
    return {
      id: 'record-1',
      studentId: 'student-1',
      categoryId: 'category-a',
      type: BehaviorRecordType.POSITIVE,
      severity: BehaviorSeverity.LOW,
      status: BehaviorRecordStatus.SUBMITTED,
      points: 1,
      occurredAt: NOW,
      createdAt: NOW,
      ...overrides,
    };
  }

  function ledger(overrides?: Record<string, unknown>) {
    return {
      id: 'ledger-1',
      studentId: 'student-1',
      recordId: 'record-1',
      categoryId: 'category-a',
      entryType: BehaviorPointLedgerEntryType.AWARD,
      amount: 1,
      occurredAt: NOW,
      ...overrides,
    };
  }

  function category(overrides?: Record<string, unknown>) {
    return {
      id: 'category-a',
      code: 'A',
      nameEn: 'Alpha',
      nameAr: null,
      type: BehaviorRecordType.POSITIVE,
      isActive: true,
      ...overrides,
    };
  }

  function activity(overrides?: Record<string, unknown>) {
    return {
      id: 'record-1',
      occurredAt: NOW,
      createdAt: NOW,
      ...overrides,
    };
  }
});
