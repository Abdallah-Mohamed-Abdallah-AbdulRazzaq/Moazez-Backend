import {
  BehaviorPointLedgerEntryType,
  BehaviorRecordStatus,
  BehaviorRecordType,
  BehaviorSeverity,
  StudentEnrollmentStatus,
  StudentStatus,
  UserType,
} from '@prisma/client';
import {
  presentBehaviorReviewApproval,
  presentBehaviorReviewQueueList,
  presentBehaviorReviewRecord,
} from '../presenters/behavior-review.presenter';

const NOW = new Date('2026-04-30T12:00:00.000Z');

describe('Behavior review presenter', () => {
  it('maps enums to lowercase and never exposes schoolId', () => {
    const result = presentBehaviorReviewRecord(record());

    expect(result).toMatchObject({
      id: 'record-1',
      type: 'positive',
      severity: 'high',
      status: 'approved',
      summaries: {
        student: {
          id: 'student-1',
          displayName: 'Alya Hassan',
          status: 'active',
        },
        category: {
          id: 'category-1',
          type: 'positive',
          defaultSeverity: 'high',
        },
        reviewedBy: {
          id: 'user-1',
          userType: 'school_user',
        },
      },
      behaviorPointLedgerEntries: [
        {
          id: 'ledger-1',
          entryType: 'award',
          amount: 5,
          actorId: 'user-1',
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain('schoolId');
    expect(result).not.toHaveProperty('deletedAt');
  });

  it('returns null consistently for absent optional summaries and dates', () => {
    const result = presentBehaviorReviewRecord(
      record({
        termId: null,
        enrollmentId: null,
        categoryId: null,
        reviewedById: null,
        reviewedAt: null,
        term: null,
        enrollment: null,
        category: null,
        reviewedBy: null,
        pointLedgerEntries: [],
      }),
    );

    expect(result).toMatchObject({
      termId: null,
      enrollmentId: null,
      categoryId: null,
      reviewedById: null,
      reviewedAt: null,
      summaries: {
        term: null,
        enrollment: null,
        category: null,
        reviewedBy: null,
      },
      behaviorPointLedgerEntries: [],
    });
  });

  it('presents queue summary and pagination metadata', () => {
    const result = presentBehaviorReviewQueueList({
      items: [record()],
      total: 1,
      limit: 25,
      offset: 0,
      summary: {
        total: 1,
        submitted: 0,
        approved: 1,
        rejected: 0,
        cancelled: 0,
        positive: 1,
        negative: 0,
      },
    });

    expect(result).toMatchObject({
      total: 1,
      limit: 25,
      offset: 0,
      summary: {
        approved: 1,
        positive: 1,
      },
      items: [{ id: 'record-1', status: 'approved' }],
    });
  });

  it('includes behavior point ledger summary in approval responses', () => {
    const result = presentBehaviorReviewApproval({
      record: record(),
      ledger: ledger(),
    });

    expect(result).toMatchObject({
      record: {
        id: 'record-1',
        status: 'approved',
      },
      behaviorPointLedger: {
        id: 'ledger-1',
        entryType: 'award',
        amount: 5,
        occurredAt: NOW.toISOString(),
        actorId: 'user-1',
      },
    });
    expect(JSON.stringify(result)).not.toContain('schoolId');
  });

  function record(overrides?: Record<string, unknown>) {
    return {
      id: 'record-1',
      schoolId: 'school-1',
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
      noteEn: 'Helped a classmate',
      noteAr: null,
      points: 5,
      occurredAt: NOW,
      createdById: 'user-1',
      submittedById: 'user-1',
      submittedAt: NOW,
      reviewedById: 'user-1',
      reviewedAt: NOW,
      cancelledById: null,
      cancelledAt: null,
      reviewNoteEn: 'Approved',
      reviewNoteAr: null,
      cancellationReasonEn: null,
      cancellationReasonAr: null,
      metadata: { visible: true },
      createdAt: NOW,
      updatedAt: NOW,
      deletedAt: null,
      academicYear: {
        id: 'year-1',
        nameEn: '2026/2027',
        nameAr: '2026/2027 AR',
        startDate: NOW,
        endDate: NOW,
        isActive: true,
      },
      term: {
        id: 'term-1',
        academicYearId: 'year-1',
        nameEn: 'Term 1',
        nameAr: 'Term 1 AR',
        startDate: NOW,
        endDate: NOW,
        isActive: true,
      },
      student: {
        id: 'student-1',
        firstName: 'Alya',
        lastName: 'Hassan',
        status: StudentStatus.ACTIVE,
      },
      enrollment: {
        id: 'enrollment-1',
        studentId: 'student-1',
        academicYearId: 'year-1',
        termId: 'term-1',
        classroomId: 'classroom-1',
        status: StudentEnrollmentStatus.ACTIVE,
        classroom: {
          id: 'classroom-1',
          nameEn: 'Classroom 1',
          nameAr: 'Classroom 1 AR',
          section: {
            id: 'section-1',
            nameEn: 'Section A',
            nameAr: 'Section A AR',
            grade: {
              id: 'grade-1',
              nameEn: 'Grade 1',
              nameAr: 'Grade 1 AR',
            },
          },
        },
      },
      category: {
        id: 'category-1',
        code: 'HELPFUL_ACT',
        nameEn: 'Helpful act',
        nameAr: null,
        type: BehaviorRecordType.POSITIVE,
        defaultSeverity: BehaviorSeverity.HIGH,
        defaultPoints: 5,
        isActive: true,
        deletedAt: null,
      },
      createdBy: user(),
      submittedBy: user(),
      reviewedBy: user(),
      pointLedgerEntries: [ledger()],
      ...overrides,
    } as never;
  }

  function ledger(overrides?: Record<string, unknown>) {
    return {
      id: 'ledger-1',
      schoolId: 'school-1',
      academicYearId: 'year-1',
      termId: 'term-1',
      studentId: 'student-1',
      enrollmentId: 'enrollment-1',
      recordId: 'record-1',
      categoryId: 'category-1',
      entryType: BehaviorPointLedgerEntryType.AWARD,
      amount: 5,
      reasonEn: 'Approved behavior record',
      reasonAr: null,
      actorId: 'user-1',
      occurredAt: NOW,
      metadata: { source: 'behavior_record_approval' },
      createdAt: NOW,
      updatedAt: NOW,
      ...overrides,
    } as never;
  }

  function user() {
    return {
      id: 'user-1',
      firstName: 'Admin',
      lastName: 'User',
      email: 'admin@example.com',
      userType: UserType.SCHOOL_USER,
    };
  }
});
