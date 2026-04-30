import {
  AuditOutcome,
  BehaviorPointLedgerEntryType,
  BehaviorRecordStatus,
  BehaviorRecordType,
  BehaviorSeverity,
  StudentEnrollmentStatus,
  StudentStatus,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../common/context/request-context';
import {
  ApproveBehaviorRecordUseCase,
  GetBehaviorReviewQueueItemUseCase,
  ListBehaviorReviewQueueUseCase,
  RejectBehaviorRecordUseCase,
} from '../application/behavior-review.use-cases';
import {
  BehaviorPointsDuplicateSourceException,
  BehaviorRecordNotSubmittedException,
} from '../domain/behavior-review-domain';
import {
  BehaviorCategoryInactiveException,
  BehaviorRecordAlreadyReviewedException,
  BehaviorRecordCancelledException,
  BehaviorRecordPointsInvalidException,
} from '../domain/behavior-records-domain';
import { BehaviorReviewRepository } from '../infrastructure/behavior-review.repository';

const SCHOOL_ID = 'school-1';
const ACTOR_ID = 'user-1';
const RECORD_ID = 'record-1';
const LEDGER_ID = 'ledger-1';
const YEAR_ID = 'year-1';
const TERM_ID = 'term-1';
const STUDENT_ID = 'student-1';
const ENROLLMENT_ID = 'enrollment-1';
const CATEGORY_ID = 'category-1';
const NOW = new Date('2026-04-30T12:00:00.000Z');

describe('Behavior review use cases', () => {
  async function withScope<T>(fn: () => Promise<T>): Promise<T> {
    return runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: ACTOR_ID, userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: 'membership-1',
        organizationId: 'org-1',
        schoolId: SCHOOL_ID,
        roleId: 'role-1',
        permissions: ['behavior.records.view', 'behavior.records.review'],
      });

      return fn();
    });
  }

  it('defaults review queue filters to submitted records', async () => {
    const repository = repositoryMock();

    await withScope(() =>
      new ListBehaviorReviewQueueUseCase(repository).execute({}),
    );

    expect(repository.listReviewQueue).toHaveBeenCalledWith(
      expect.objectContaining({
        status: BehaviorRecordStatus.SUBMITTED,
        includeReviewed: false,
      }),
    );
  });

  it('allows reviewed records in the queue when includeReviewed=true', async () => {
    const repository = repositoryMock();

    await withScope(() =>
      new ListBehaviorReviewQueueUseCase(repository).execute({
        includeReviewed: true,
      }),
    );

    expect(repository.listReviewQueue).toHaveBeenCalledWith(
      expect.objectContaining({
        includeReviewed: true,
      }),
    );
    expect(repository.listReviewQueue).toHaveBeenCalledWith(
      expect.not.objectContaining({ status: expect.anything() }),
    );
  });

  it('approves submitted records, writes one BehaviorPointLedger entry, updates review fields, and audits', async () => {
    const auditEntries: unknown[] = [];
    const repository = repositoryMock({ auditEntries });

    const result = await withScope(() =>
      new ApproveBehaviorRecordUseCase(repository).execute(RECORD_ID, {
        reviewNoteEn: 'Approved by counselor',
      }),
    );

    expect(repository.approveRecordWithPointLedger).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: SCHOOL_ID,
        recordId: RECORD_ID,
        recordData: expect.objectContaining({
          status: BehaviorRecordStatus.APPROVED,
          reviewedById: ACTOR_ID,
          reviewedAt: expect.any(Date),
          reviewNoteEn: 'Approved by counselor',
        }),
        ledgerData: expect.objectContaining({
          academicYearId: YEAR_ID,
          termId: TERM_ID,
          studentId: STUDENT_ID,
          enrollmentId: ENROLLMENT_ID,
          recordId: RECORD_ID,
          categoryId: CATEGORY_ID,
          entryType: BehaviorPointLedgerEntryType.AWARD,
          amount: 7,
          actorId: ACTOR_ID,
          metadata: expect.objectContaining({
            source: 'behavior_record_approval',
          }),
        }),
      }),
    );
    expect(result).toMatchObject({
      record: {
        id: RECORD_ID,
        status: 'approved',
        reviewedById: ACTOR_ID,
      },
      behaviorPointLedger: {
        id: LEDGER_ID,
        entryType: 'award',
        amount: 7,
        actorId: ACTOR_ID,
      },
    });
    expect(auditEntries).toEqual([
      expect.objectContaining({
        module: 'behavior',
        action: 'behavior.record.approve',
        resourceType: 'behavior_record',
        outcome: AuditOutcome.SUCCESS,
        after: expect.objectContaining({
          ledgerEntryId: LEDGER_ID,
          ledgerEntryType: BehaviorPointLedgerEntryType.AWARD,
          effectivePoints: 7,
          statusBefore: BehaviorRecordStatus.SUBMITTED,
          statusAfter: BehaviorRecordStatus.APPROVED,
        }),
      }),
    ]);
    expect(repository.createXpLedger).not.toHaveBeenCalled();
    expect(repository.updateRewardCatalogItem).not.toHaveBeenCalled();
    expect(repository.createRewardRedemption).not.toHaveBeenCalled();
  });

  it('approves with pointsOverride, validates signs, allows zero, and maps negative records to PENALTY', async () => {
    const repository = repositoryMock();

    await withScope(() =>
      new ApproveBehaviorRecordUseCase(repository).execute(RECORD_ID, {
        pointsOverride: 0,
      }),
    );
    expect(repository.approveRecordWithPointLedger).toHaveBeenCalledWith(
      expect.objectContaining({
        recordData: expect.objectContaining({ points: 0 }),
        ledgerData: expect.objectContaining({ amount: 0 }),
      }),
    );

    await expect(
      withScope(() =>
        new ApproveBehaviorRecordUseCase(
          repositoryMock({
            findReviewRecordById: jest
              .fn()
              .mockResolvedValue(record({ points: 7 })),
          }),
        ).execute(RECORD_ID, { pointsOverride: -1 }),
      ),
    ).rejects.toBeInstanceOf(BehaviorRecordPointsInvalidException);

    const negativeRepository = repositoryMock({
      findReviewRecordById: jest.fn().mockResolvedValue(
        record({
          type: BehaviorRecordType.NEGATIVE,
          points: -3,
          category: category({
            type: BehaviorRecordType.NEGATIVE,
            defaultPoints: -3,
          }),
        }),
      ),
      findCategoryById: jest.fn().mockResolvedValue(
        category({
          type: BehaviorRecordType.NEGATIVE,
          defaultPoints: -3,
        }),
      ),
    });

    await withScope(() =>
      new ApproveBehaviorRecordUseCase(negativeRepository).execute(RECORD_ID, {}),
    );
    expect(negativeRepository.approveRecordWithPointLedger).toHaveBeenCalledWith(
      expect.objectContaining({
        ledgerData: expect.objectContaining({
          entryType: BehaviorPointLedgerEntryType.PENALTY,
          amount: -3,
        }),
      }),
    );

    await expect(
      withScope(() =>
        new ApproveBehaviorRecordUseCase(negativeRepository).execute(
          RECORD_ID,
          { pointsOverride: 1 },
        ),
      ),
    ).rejects.toBeInstanceOf(BehaviorRecordPointsInvalidException);
  });

  it('approves only submitted records and rejects invalid lifecycle states with behavior codes', async () => {
    await expectApproveStatus(
      BehaviorRecordStatus.DRAFT,
      BehaviorRecordNotSubmittedException,
    );
    await expectApproveStatus(
      BehaviorRecordStatus.APPROVED,
      BehaviorRecordAlreadyReviewedException,
    );
    await expectApproveStatus(
      BehaviorRecordStatus.REJECTED,
      BehaviorRecordAlreadyReviewedException,
    );
    await expectApproveStatus(
      BehaviorRecordStatus.CANCELLED,
      BehaviorRecordCancelledException,
    );
  });

  it('rejects inactive categories before approval', async () => {
    const repository = repositoryMock({
      findCategoryById: jest.fn().mockResolvedValue(category({ isActive: false })),
    });

    await expect(
      withScope(() =>
        new ApproveBehaviorRecordUseCase(repository).execute(RECORD_ID, {}),
      ),
    ).rejects.toBeInstanceOf(BehaviorCategoryInactiveException);
    expect(repository.approveRecordWithPointLedger).not.toHaveBeenCalled();
  });

  it('translates duplicate behavior point ledger conflicts', async () => {
    const repository = repositoryMock({
      approveRecordWithPointLedger: jest.fn().mockRejectedValue({ code: 'P2002' }),
    });

    await expect(
      withScope(() =>
        new ApproveBehaviorRecordUseCase(repository).execute(RECORD_ID, {}),
      ),
    ).rejects.toBeInstanceOf(BehaviorPointsDuplicateSourceException);
  });

  it('rejects submitted records without writing BehaviorPointLedger, XP, or Rewards and audits mutation', async () => {
    const auditEntries: unknown[] = [];
    const repository = repositoryMock({ auditEntries });

    const result = await withScope(() =>
      new RejectBehaviorRecordUseCase(repository).execute(RECORD_ID, {
        reviewNoteEn: 'Not enough context',
      }),
    );

    expect(result).toMatchObject({
      id: RECORD_ID,
      status: 'rejected',
      reviewedById: ACTOR_ID,
      reviewNoteEn: 'Not enough context',
    });
    expect(repository.rejectRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        recordData: expect.objectContaining({
          status: BehaviorRecordStatus.REJECTED,
          reviewedById: ACTOR_ID,
          reviewedAt: expect.any(Date),
        }),
      }),
    );
    expect(repository.approveRecordWithPointLedger).not.toHaveBeenCalled();
    expect(repository.createBehaviorPointLedger).not.toHaveBeenCalled();
    expect(repository.createXpLedger).not.toHaveBeenCalled();
    expect(repository.updateRewardCatalogItem).not.toHaveBeenCalled();
    expect(repository.createRewardRedemption).not.toHaveBeenCalled();
    expect(auditEntries).toEqual([
      expect.objectContaining({
        action: 'behavior.record.reject',
        after: expect.objectContaining({
          statusBefore: BehaviorRecordStatus.SUBMITTED,
          statusAfter: BehaviorRecordStatus.REJECTED,
          ledgerEntryId: null,
        }),
      }),
    ]);
  });

  it('rejects only submitted records and rejects invalid lifecycle states with behavior codes', async () => {
    await expectRejectStatus(
      BehaviorRecordStatus.DRAFT,
      BehaviorRecordNotSubmittedException,
    );
    await expectRejectStatus(
      BehaviorRecordStatus.APPROVED,
      BehaviorRecordAlreadyReviewedException,
    );
    await expectRejectStatus(
      BehaviorRecordStatus.REJECTED,
      BehaviorRecordAlreadyReviewedException,
    );
    await expectRejectStatus(
      BehaviorRecordStatus.CANCELLED,
      BehaviorRecordCancelledException,
    );
  });

  it('does not audit reads', async () => {
    const auditEntries: unknown[] = [];
    const repository = repositoryMock({ auditEntries });

    await withScope(() =>
      new ListBehaviorReviewQueueUseCase(repository).execute({ search: 'Help' }),
    );
    await withScope(() =>
      new GetBehaviorReviewQueueItemUseCase(repository).execute(RECORD_ID),
    );

    expect(auditEntries).toEqual([]);
  });

  async function expectApproveStatus(
    status: BehaviorRecordStatus,
    errorClass: new (...args: never[]) => Error,
  ) {
    const repository = repositoryMock({
      findReviewRecordById: jest.fn().mockResolvedValue(record({ status })),
    });

    await expect(
      withScope(() =>
        new ApproveBehaviorRecordUseCase(repository).execute(RECORD_ID, {}),
      ),
    ).rejects.toBeInstanceOf(errorClass);
    expect(repository.approveRecordWithPointLedger).not.toHaveBeenCalled();
  }

  async function expectRejectStatus(
    status: BehaviorRecordStatus,
    errorClass: new (...args: never[]) => Error,
  ) {
    const repository = repositoryMock({
      findReviewRecordById: jest.fn().mockResolvedValue(record({ status })),
    });

    await expect(
      withScope(() =>
        new RejectBehaviorRecordUseCase(repository).execute(RECORD_ID, {}),
      ),
    ).rejects.toBeInstanceOf(errorClass);
    expect(repository.rejectRecord).not.toHaveBeenCalled();
  }

  function repositoryMock(
    overrides?: Partial<Record<string, jest.Mock>> & {
      auditEntries?: unknown[];
    },
  ) {
    const auditEntries = overrides?.auditEntries ?? [];
    const repository = {
      listReviewQueue: jest.fn().mockResolvedValue({
        items: [record()],
        total: 1,
        summary: {
          total: 1,
          submitted: 1,
          approved: 0,
          rejected: 0,
          cancelled: 0,
          positive: 1,
          negative: 0,
        },
      }),
      findReviewRecordById: jest.fn().mockResolvedValue(record()),
      findAcademicYear: jest.fn().mockResolvedValue(academicYear()),
      findTerm: jest.fn().mockResolvedValue(term()),
      findStudent: jest.fn().mockResolvedValue(student()),
      findEnrollmentById: jest.fn().mockResolvedValue(enrollment()),
      findEnrollmentForStudent: jest.fn().mockResolvedValue(enrollment()),
      findCategoryById: jest.fn().mockResolvedValue(category()),
      approveRecordWithPointLedger: jest.fn().mockImplementation(async (input) => {
        const ledgerRecord = ledger({
          ...input.ledgerData,
          id: LEDGER_ID,
          schoolId: input.schoolId,
        });
        const updated = record({
          ...input.recordData,
          id: input.recordId,
          pointLedgerEntries: [ledgerRecord],
        });
        auditEntries.push(input.buildAuditEntry(updated, ledgerRecord));
        return { record: updated, ledger: ledgerRecord };
      }),
      rejectRecord: jest.fn().mockImplementation(async (input) => {
        const updated = record({
          ...input.recordData,
          id: input.recordId,
        });
        auditEntries.push(input.buildAuditEntry(updated));
        return updated;
      }),
      createBehaviorPointLedger: jest.fn(),
      createXpLedger: jest.fn(),
      updateRewardCatalogItem: jest.fn(),
      createRewardRedemption: jest.fn(),
      ...overrides,
    };
    delete (repository as Record<string, unknown>).auditEntries;

    return repository as unknown as jest.Mocked<BehaviorReviewRepository> & {
      createBehaviorPointLedger: jest.Mock;
      createXpLedger: jest.Mock;
      updateRewardCatalogItem: jest.Mock;
      createRewardRedemption: jest.Mock;
    };
  }

  function academicYear(overrides?: Record<string, unknown>) {
    return {
      id: YEAR_ID,
      nameEn: '2026/2027',
      nameAr: '2026/2027 AR',
      startDate: new Date('2026-04-01T00:00:00.000Z'),
      endDate: new Date('2026-06-30T00:00:00.000Z'),
      isActive: true,
      ...overrides,
    };
  }

  function term(overrides?: Record<string, unknown>) {
    return {
      id: TERM_ID,
      academicYearId: YEAR_ID,
      nameEn: 'Term 1',
      nameAr: 'Term 1 AR',
      startDate: new Date('2026-04-01T00:00:00.000Z'),
      endDate: new Date('2026-04-30T00:00:00.000Z'),
      isActive: true,
      ...overrides,
    };
  }

  function student(overrides?: Record<string, unknown>) {
    return {
      id: STUDENT_ID,
      firstName: 'Alya',
      lastName: 'Hassan',
      status: StudentStatus.ACTIVE,
      ...overrides,
    };
  }

  function enrollment(overrides?: Record<string, unknown>) {
    return {
      id: ENROLLMENT_ID,
      studentId: STUDENT_ID,
      academicYearId: YEAR_ID,
      termId: TERM_ID,
      classroomId: 'classroom-1',
      status: StudentEnrollmentStatus.ACTIVE,
      enrolledAt: NOW,
      endedAt: null,
      classroom: {
        id: 'classroom-1',
        nameEn: 'Classroom 1',
        nameAr: 'Classroom 1 AR',
      },
      ...overrides,
    };
  }

  function category(overrides?: Record<string, unknown>) {
    return {
      id: CATEGORY_ID,
      code: 'HELPFUL_ACT',
      nameEn: 'Helpful act',
      nameAr: null,
      type: BehaviorRecordType.POSITIVE,
      defaultSeverity: BehaviorSeverity.HIGH,
      defaultPoints: 7,
      isActive: true,
      deletedAt: null,
      ...overrides,
    };
  }

  function record(overrides?: Record<string, unknown>) {
    return {
      id: RECORD_ID,
      schoolId: SCHOOL_ID,
      academicYearId: YEAR_ID,
      termId: TERM_ID,
      studentId: STUDENT_ID,
      enrollmentId: ENROLLMENT_ID,
      categoryId: CATEGORY_ID,
      type: BehaviorRecordType.POSITIVE,
      severity: BehaviorSeverity.HIGH,
      status: BehaviorRecordStatus.SUBMITTED,
      titleEn: 'Helpful act',
      titleAr: null,
      noteEn: null,
      noteAr: null,
      points: 7,
      occurredAt: NOW,
      createdById: ACTOR_ID,
      submittedById: ACTOR_ID,
      submittedAt: NOW,
      reviewedById: null,
      reviewedAt: null,
      cancelledById: null,
      cancelledAt: null,
      reviewNoteEn: null,
      reviewNoteAr: null,
      cancellationReasonEn: null,
      cancellationReasonAr: null,
      metadata: null,
      createdAt: NOW,
      updatedAt: NOW,
      deletedAt: null,
      academicYear: academicYear(),
      term: term(),
      student: student(),
      enrollment: {
        ...enrollment(),
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
      category: category(),
      createdBy: user(),
      submittedBy: user(),
      reviewedBy: null,
      pointLedgerEntries: [],
      ...overrides,
    } as never;
  }

  function ledger(overrides?: Record<string, unknown>) {
    return {
      id: LEDGER_ID,
      schoolId: SCHOOL_ID,
      academicYearId: YEAR_ID,
      termId: TERM_ID,
      studentId: STUDENT_ID,
      enrollmentId: ENROLLMENT_ID,
      recordId: RECORD_ID,
      categoryId: CATEGORY_ID,
      entryType: BehaviorPointLedgerEntryType.AWARD,
      amount: 7,
      reasonEn: 'Approved behavior record',
      reasonAr: null,
      actorId: ACTOR_ID,
      occurredAt: NOW,
      metadata: { source: 'behavior_record_approval' },
      createdAt: NOW,
      updatedAt: NOW,
      ...overrides,
    } as never;
  }

  function user() {
    return {
      id: ACTOR_ID,
      firstName: 'Admin',
      lastName: 'User',
      email: 'admin@example.com',
      userType: UserType.SCHOOL_USER,
    };
  }
});
