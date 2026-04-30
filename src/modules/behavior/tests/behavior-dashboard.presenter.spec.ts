import {
  BehaviorPointLedgerEntryType,
  BehaviorRecordStatus,
  BehaviorRecordType,
  BehaviorSeverity,
  StudentEnrollmentStatus,
  StudentStatus,
} from '@prisma/client';
import {
  presentBehaviorOverview,
  presentClassroomBehaviorSummary,
  presentStudentBehaviorSummary,
} from '../presenters/behavior-dashboard.presenter';

const NOW = new Date('2026-04-30T12:00:00.000Z');

describe('Behavior dashboard presenter', () => {
  it('maps enums to lowercase and never exposes schoolId, XP, or Rewards fields', () => {
    const result = presentBehaviorOverview({
      scope: scope(),
      dataset: overviewDataset(),
      includeRecentActivity: true,
      includeTopCategories: true,
    });

    expect(result).toMatchObject({
      records: {
        total: 2,
        approved: 1,
        submitted: 1,
        positive: 1,
        negative: 1,
      },
      severity: {
        low: 1,
        high: 1,
      },
      recentActivity: expect.arrayContaining([
        expect.objectContaining({
          id: 'record-approved',
          status: 'approved',
          type: 'positive',
          severity: 'high',
        }),
      ]),
      categories: {
        topCategories: [
          {
            categoryId: 'category-1',
            type: 'positive',
          },
        ],
      },
    });
    const json = JSON.stringify(result);
    expect(json).not.toContain('schoolId');
    expect(json).not.toContain('XpLedger');
    expect(json).not.toContain('xpLedger');
    expect(json).not.toContain('RewardCatalogItem');
    expect(json).not.toContain('RewardRedemption');
  });

  it('presents student summary with category breakdown, timeline, ledger, and null unavailable fields', () => {
    const result = presentStudentBehaviorSummary({
      scope: scope({ classroomId: null }),
      dataset: {
        ...overviewDataset(),
        student: student(),
      },
      includeTimeline: true,
      includeCategoryBreakdown: true,
      includeLedger: true,
    });

    expect(result).toMatchObject({
      student: {
        id: 'student-1',
        firstName: 'Alya',
        lastName: 'Hassan',
        nameAr: null,
        code: null,
        admissionNo: null,
      },
      points: {
        totalPoints: 4,
        positivePoints: 7,
        negativePoints: -3,
        awardEntries: 1,
        penaltyEntries: 1,
      },
      categoryBreakdown: [
        {
          categoryId: 'category-1',
          records: {
            total: 2,
            approved: 1,
            submitted: 1,
          },
          points: { totalPoints: 4 },
        },
      ],
      timeline: [{ id: 'record-approved' }, { id: 'record-submitted' }],
      ledger: [
        {
          id: 'ledger-award',
          entryType: 'award',
          recordId: 'record-approved',
          actorId: 'user-1',
        },
        {
          id: 'ledger-penalty',
          entryType: 'penalty',
          recordId: 'record-submitted',
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain('schoolId');
  });

  it('presents classroom summary with active student rows and academic structure', () => {
    const result = presentClassroomBehaviorSummary({
      scope: scope({ studentId: null }),
      dataset: {
        ...overviewDataset(),
        classroom: classroom(),
        activeEnrollments: [enrollment()],
      },
      includeStudents: true,
      includeCategoryBreakdown: true,
      includeRecentActivity: true,
    });

    expect(result).toMatchObject({
      classroom: {
        id: 'classroom-1',
        name: 'Classroom 1',
        nameAr: 'Classroom 1 AR',
        code: null,
        stage: { id: 'stage-1' },
        grade: { id: 'grade-1' },
        section: { id: 'section-1' },
      },
      students: {
        totalEnrolledStudents: 1,
        studentsWithBehaviorRecords: 1,
        studentsWithPoints: 1,
      },
      points: {
        totalPoints: 4,
        averagePointsPerStudent: 4,
      },
      studentSummaries: [
        {
          student: {
            id: 'student-1',
            nameAr: null,
            code: null,
            admissionNo: null,
          },
          records: { total: 2 },
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain('schoolId');
  });

  it('honors include flags by returning empty optional arrays', () => {
    const overview = presentBehaviorOverview({
      scope: scope(),
      dataset: overviewDataset(),
      includeRecentActivity: false,
      includeTopCategories: false,
    });
    expect(overview.recentActivity).toEqual([]);
    expect(overview.categories.topCategories).toEqual([]);

    const studentSummary = presentStudentBehaviorSummary({
      scope: scope(),
      dataset: { ...overviewDataset(), student: student() },
      includeTimeline: false,
      includeCategoryBreakdown: false,
      includeLedger: false,
    });
    expect(studentSummary.timeline).toEqual([]);
    expect(studentSummary.categoryBreakdown).toEqual([]);
    expect(studentSummary.ledger).toEqual([]);
  });

  function scope(overrides?: Record<string, unknown>) {
    return {
      academicYearId: 'year-1',
      termId: 'term-1',
      studentId: 'student-1',
      classroomId: 'classroom-1',
      occurredFrom: new Date('2026-04-01T00:00:00.000Z'),
      occurredTo: new Date('2026-04-30T23:59:59.000Z'),
      ...overrides,
    };
  }

  function overviewDataset() {
    return {
      records: [
        record({
          id: 'record-approved',
          type: BehaviorRecordType.POSITIVE,
          severity: BehaviorSeverity.HIGH,
          status: BehaviorRecordStatus.APPROVED,
          points: 7,
          reviewedAt: NOW,
          occurredAt: new Date('2026-04-30T12:00:00.000Z'),
        }),
        record({
          id: 'record-submitted',
          type: BehaviorRecordType.NEGATIVE,
          severity: BehaviorSeverity.LOW,
          status: BehaviorRecordStatus.SUBMITTED,
          points: -3,
          occurredAt: new Date('2026-04-29T12:00:00.000Z'),
        }),
      ],
      ledgerEntries: [
        ledger({
          id: 'ledger-award',
          recordId: 'record-approved',
          entryType: BehaviorPointLedgerEntryType.AWARD,
          amount: 7,
        }),
        ledger({
          id: 'ledger-penalty',
          recordId: 'record-submitted',
          entryType: BehaviorPointLedgerEntryType.PENALTY,
          amount: -3,
        }),
      ],
      categories: [category()],
      scopedStudents: [student()],
    };
  }

  function student(overrides?: Record<string, unknown>) {
    return {
      id: 'student-1',
      firstName: 'Alya',
      lastName: 'Hassan',
      status: StudentStatus.ACTIVE,
      ...overrides,
    };
  }

  function classroom(overrides?: Record<string, unknown>) {
    return {
      id: 'classroom-1',
      nameEn: 'Classroom 1',
      nameAr: 'Classroom 1 AR',
      sectionId: 'section-1',
      section: {
        id: 'section-1',
        nameEn: 'Section A',
        nameAr: 'Section A AR',
        gradeId: 'grade-1',
        grade: {
          id: 'grade-1',
          nameEn: 'Grade 1',
          nameAr: 'Grade 1 AR',
          stageId: 'stage-1',
          stage: {
            id: 'stage-1',
            nameEn: 'Stage 1',
            nameAr: 'Stage 1 AR',
          },
        },
      },
      ...overrides,
    };
  }

  function enrollment(overrides?: Record<string, unknown>) {
    return {
      id: 'enrollment-1',
      studentId: 'student-1',
      academicYearId: 'year-1',
      termId: 'term-1',
      classroomId: 'classroom-1',
      status: StudentEnrollmentStatus.ACTIVE,
      enrolledAt: NOW,
      student: student(),
      ...overrides,
    };
  }

  function category(overrides?: Record<string, unknown>) {
    return {
      id: 'category-1',
      code: 'HELPFUL_ACT',
      nameEn: 'Helpful act',
      nameAr: null,
      type: BehaviorRecordType.POSITIVE,
      defaultSeverity: BehaviorSeverity.HIGH,
      defaultPoints: 7,
      isActive: true,
      ...overrides,
    };
  }

  function record(overrides?: Record<string, unknown>) {
    return {
      id: 'record-1',
      academicYearId: 'year-1',
      termId: 'term-1',
      studentId: 'student-1',
      enrollmentId: 'enrollment-1',
      categoryId: 'category-1',
      type: BehaviorRecordType.POSITIVE,
      severity: BehaviorSeverity.HIGH,
      status: BehaviorRecordStatus.APPROVED,
      titleEn: 'Helpful act',
      titleAr: null,
      noteEn: null,
      noteAr: null,
      points: 7,
      occurredAt: NOW,
      submittedAt: NOW,
      reviewedAt: NOW,
      cancelledAt: null,
      createdAt: NOW,
      updatedAt: NOW,
      student: student(),
      enrollment: {
        id: 'enrollment-1',
        classroomId: 'classroom-1',
        classroom: classroom(),
      },
      category: category(),
      schoolId: 'school-1',
      xpLedger: [{ id: 'xp-1' }],
      rewardCatalogItem: { id: 'reward-1' },
      ...overrides,
    } as never;
  }

  function ledger(overrides?: Record<string, unknown>) {
    return {
      id: 'ledger-1',
      academicYearId: 'year-1',
      termId: 'term-1',
      studentId: 'student-1',
      enrollmentId: 'enrollment-1',
      recordId: 'record-1',
      categoryId: 'category-1',
      entryType: BehaviorPointLedgerEntryType.AWARD,
      amount: 7,
      actorId: 'user-1',
      occurredAt: NOW,
      createdAt: NOW,
      student: student(),
      category: category(),
      record: {
        id: 'record-1',
        type: BehaviorRecordType.POSITIVE,
        severity: BehaviorSeverity.HIGH,
        status: BehaviorRecordStatus.APPROVED,
        occurredAt: NOW,
        createdAt: NOW,
      },
      schoolId: 'school-1',
      ...overrides,
    } as never;
  }
});
