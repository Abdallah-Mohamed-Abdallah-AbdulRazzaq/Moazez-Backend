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
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../common/context/request-context';
import { NotFoundDomainException } from '../../../common/exceptions/domain-exception';
import {
  GetBehaviorOverviewUseCase,
  GetClassroomBehaviorSummaryUseCase,
  GetStudentBehaviorSummaryUseCase,
} from '../application/behavior-dashboard.use-cases';
import { BehaviorScopeInvalidException } from '../domain/behavior-records-domain';
import { BehaviorDashboardRepository } from '../infrastructure/behavior-dashboard.repository';

const SCHOOL_ID = 'school-1';
const ACTOR_ID = 'user-1';
const YEAR_ID = 'year-1';
const TERM_ID = 'term-1';
const STUDENT_ID = 'student-1';
const CLASSROOM_ID = 'classroom-1';
const ENROLLMENT_ID = 'enrollment-1';
const CATEGORY_ID = 'category-1';
const NOW = new Date('2026-04-30T12:00:00.000Z');

describe('Behavior dashboard use cases', () => {
  async function withScope<T>(fn: () => Promise<T>): Promise<T> {
    return runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: ACTOR_ID, userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: 'membership-1',
        organizationId: 'org-1',
        schoolId: SCHOOL_ID,
        roleId: 'role-1',
        permissions: ['behavior.overview.view', 'behavior.records.view'],
      });

      return fn();
    });
  }

  it('overview validates academic year, term ownership, student, and classroom when provided', async () => {
    await expect(
      withScope(() =>
        new GetBehaviorOverviewUseCase(
          repositoryMock({
            findAcademicYear: jest.fn().mockResolvedValue(null),
          }),
        ).execute({ academicYearId: YEAR_ID }),
      ),
    ).rejects.toBeInstanceOf(NotFoundDomainException);

    await expect(
      withScope(() =>
        new GetBehaviorOverviewUseCase(
          repositoryMock({
            findTerm: jest
              .fn()
              .mockResolvedValue(term({ academicYearId: 'year-2' })),
          }),
        ).execute({ academicYearId: YEAR_ID, termId: TERM_ID }),
      ),
    ).rejects.toBeInstanceOf(BehaviorScopeInvalidException);

    await expect(
      withScope(() =>
        new GetBehaviorOverviewUseCase(
          repositoryMock({ findStudent: jest.fn().mockResolvedValue(null) }),
        ).execute({ studentId: STUDENT_ID }),
      ),
    ).rejects.toBeInstanceOf(NotFoundDomainException);

    await expect(
      withScope(() =>
        new GetBehaviorOverviewUseCase(
          repositoryMock({ findClassroom: jest.fn().mockResolvedValue(null) }),
        ).execute({ classroomId: CLASSROOM_ID }),
      ),
    ).rejects.toBeInstanceOf(NotFoundDomainException);
  });

  it('overview returns combined record, review, point, category, and recent summaries', async () => {
    const repository = repositoryMock();

    const result = await withScope(() =>
      new GetBehaviorOverviewUseCase(repository).execute({
        academicYearId: YEAR_ID,
        termId: TERM_ID,
        studentId: STUDENT_ID,
        classroomId: CLASSROOM_ID,
        occurredFrom: '2026-04-01T00:00:00.000Z',
        occurredTo: '2026-04-30T23:59:59.000Z',
      }),
    );

    expect(repository.loadBehaviorOverviewData).toHaveBeenCalledWith(
      expect.objectContaining({
        academicYearId: YEAR_ID,
        termId: TERM_ID,
        studentId: STUDENT_ID,
        classroomId: CLASSROOM_ID,
        occurredFrom: expect.any(Date),
        occurredTo: expect.any(Date),
      }),
    );
    expect(result).toMatchObject({
      scope: {
        academicYearId: YEAR_ID,
        termId: TERM_ID,
        studentId: STUDENT_ID,
        classroomId: CLASSROOM_ID,
      },
      records: {
        total: 2,
        submitted: 1,
        approved: 1,
        positive: 1,
        negative: 1,
      },
      review: {
        pendingReview: 1,
        reviewed: 1,
        approvalRate: 1,
      },
      points: {
        totalPoints: 4,
        positivePoints: 7,
        negativePoints: -3,
        awardEntries: 1,
        penaltyEntries: 1,
      },
      categories: {
        totalCategories: 1,
        activeCategories: 1,
        topCategories: [{ categoryId: CATEGORY_ID }],
      },
      recentActivity: [{ id: 'record-approved' }, { id: 'record-submitted' }],
    });
  });

  it('student summary validates ownership and aggregates records, points, categories, timeline, and ledger', async () => {
    const repository = repositoryMock();

    await expect(
      withScope(() =>
        new GetStudentBehaviorSummaryUseCase(
          repositoryMock({ findStudent: jest.fn().mockResolvedValue(null) }),
        ).execute(STUDENT_ID, {}),
      ),
    ).rejects.toBeInstanceOf(NotFoundDomainException);

    const result = await withScope(() =>
      new GetStudentBehaviorSummaryUseCase(repository).execute(STUDENT_ID, {
        academicYearId: YEAR_ID,
        termId: TERM_ID,
      }),
    );

    expect(repository.loadStudentBehaviorSummaryData).toHaveBeenCalledWith(
      expect.objectContaining({ studentId: STUDENT_ID }),
    );
    expect(result).toMatchObject({
      student: {
        id: STUDENT_ID,
        firstName: 'Alya',
        lastName: 'Hassan',
        nameAr: null,
        code: null,
        admissionNo: null,
      },
      records: { total: 2, positive: 1, negative: 1 },
      points: { totalPoints: 4, awardEntries: 1, penaltyEntries: 1 },
      categoryBreakdown: [{ categoryId: CATEGORY_ID }],
      timeline: [{ id: 'record-approved' }, { id: 'record-submitted' }],
      ledger: [
        { id: 'ledger-award', entryType: 'award' },
        { id: 'ledger-penalty', entryType: 'penalty' },
      ],
    });
  });

  it('classroom summary validates classroom ownership and aggregates active enrolled students only', async () => {
    await expect(
      withScope(() =>
        new GetClassroomBehaviorSummaryUseCase(
          repositoryMock({ findClassroom: jest.fn().mockResolvedValue(null) }),
        ).execute(CLASSROOM_ID, {}),
      ),
    ).rejects.toBeInstanceOf(NotFoundDomainException);

    const repository = repositoryMock();
    const result = await withScope(() =>
      new GetClassroomBehaviorSummaryUseCase(repository).execute(CLASSROOM_ID, {
        academicYearId: YEAR_ID,
        termId: TERM_ID,
      }),
    );

    expect(repository.loadClassroomBehaviorSummaryData).toHaveBeenCalledWith(
      expect.objectContaining({ classroomId: CLASSROOM_ID }),
    );
    expect(result).toMatchObject({
      classroom: {
        id: CLASSROOM_ID,
        grade: { id: 'grade-1' },
        section: { id: 'section-1' },
        stage: { id: 'stage-1' },
      },
      students: {
        totalEnrolledStudents: 1,
        studentsWithBehaviorRecords: 1,
        studentsWithPoints: 1,
      },
      records: { total: 2, positive: 1, negative: 1 },
      points: { totalPoints: 4, averagePointsPerStudent: 4 },
      studentSummaries: [
        {
          student: { id: STUDENT_ID },
          records: { total: 2 },
          points: { totalPoints: 4 },
        },
      ],
      recentActivity: [{ id: 'record-approved' }, { id: 'record-submitted' }],
    });
  });

  it('read use cases do not audit and do not call repository write helpers', async () => {
    const repository = repositoryMock();

    await withScope(() =>
      new GetBehaviorOverviewUseCase(repository).execute({}),
    );
    await withScope(() =>
      new GetStudentBehaviorSummaryUseCase(repository).execute(STUDENT_ID, {}),
    );
    await withScope(() =>
      new GetClassroomBehaviorSummaryUseCase(repository).execute(
        CLASSROOM_ID,
        {},
      ),
    );

    expect(repository.createAuditLog).not.toHaveBeenCalled();
    expect(repository.createBehaviorPointLedger).not.toHaveBeenCalled();
    expect(repository.createXpLedger).not.toHaveBeenCalled();
    expect(repository.updateBehaviorRecord).not.toHaveBeenCalled();
  });

  function repositoryMock(overrides?: Partial<Record<string, jest.Mock>>) {
    const dataset = overviewDataset();
    const repository = {
      findAcademicYear: jest.fn().mockResolvedValue(academicYear()),
      findTerm: jest.fn().mockResolvedValue(term()),
      findStudent: jest.fn().mockResolvedValue(student()),
      findClassroom: jest.fn().mockResolvedValue(classroom()),
      loadBehaviorOverviewData: jest.fn().mockResolvedValue(dataset),
      loadStudentBehaviorSummaryData: jest.fn().mockResolvedValue({
        ...dataset,
        student: student(),
      }),
      loadClassroomBehaviorSummaryData: jest.fn().mockResolvedValue({
        ...dataset,
        classroom: classroom(),
        activeEnrollments: [enrollment()],
      }),
      loadActiveClassroomStudents: jest.fn().mockResolvedValue([enrollment()]),
      loadBehaviorRecordsForScope: jest.fn().mockResolvedValue(dataset.records),
      loadBehaviorPointLedgerForScope: jest
        .fn()
        .mockResolvedValue(dataset.ledgerEntries),
      loadCategoriesForScope: jest.fn().mockResolvedValue(dataset.categories),
      loadRecentBehaviorRecords: jest.fn().mockResolvedValue(dataset.records),
      loadTopCategoryCandidates: jest.fn().mockResolvedValue(dataset.records),
      createAuditLog: jest.fn(),
      createBehaviorPointLedger: jest.fn(),
      createXpLedger: jest.fn(),
      updateBehaviorRecord: jest.fn(),
      ...overrides,
    };

    return repository as unknown as jest.Mocked<BehaviorDashboardRepository> & {
      createAuditLog: jest.Mock;
      createBehaviorPointLedger: jest.Mock;
      createXpLedger: jest.Mock;
      updateBehaviorRecord: jest.Mock;
    };
  }

  function overviewDataset() {
    return {
      records: [
        record({
          id: 'record-approved',
          status: BehaviorRecordStatus.APPROVED,
          type: BehaviorRecordType.POSITIVE,
          points: 7,
          reviewedAt: NOW,
          occurredAt: new Date('2026-04-30T12:00:00.000Z'),
        }),
        record({
          id: 'record-submitted',
          status: BehaviorRecordStatus.SUBMITTED,
          type: BehaviorRecordType.NEGATIVE,
          points: -3,
          occurredAt: new Date('2026-04-29T12:00:00.000Z'),
        }),
      ],
      ledgerEntries: [
        ledger({
          id: 'ledger-award',
          entryType: BehaviorPointLedgerEntryType.AWARD,
          amount: 7,
        }),
        ledger({
          id: 'ledger-penalty',
          entryType: BehaviorPointLedgerEntryType.PENALTY,
          amount: -3,
        }),
      ],
      categories: [category()],
      scopedStudents: [student()],
    };
  }

  function academicYear(overrides?: Record<string, unknown>) {
    return {
      id: YEAR_ID,
      nameEn: '2026/2027',
      nameAr: '2026/2027 AR',
      startDate: NOW,
      endDate: NOW,
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
      startDate: NOW,
      endDate: NOW,
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

  function classroom(overrides?: Record<string, unknown>) {
    return {
      id: CLASSROOM_ID,
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
      id: ENROLLMENT_ID,
      studentId: STUDENT_ID,
      academicYearId: YEAR_ID,
      termId: TERM_ID,
      classroomId: CLASSROOM_ID,
      status: StudentEnrollmentStatus.ACTIVE,
      enrolledAt: NOW,
      student: student(),
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
      defaultSeverity: BehaviorSeverity.LOW,
      defaultPoints: 7,
      isActive: true,
      ...overrides,
    };
  }

  function record(overrides?: Record<string, unknown>) {
    return {
      id: 'record-1',
      academicYearId: YEAR_ID,
      termId: TERM_ID,
      studentId: STUDENT_ID,
      enrollmentId: ENROLLMENT_ID,
      categoryId: CATEGORY_ID,
      type: BehaviorRecordType.POSITIVE,
      severity: BehaviorSeverity.LOW,
      status: BehaviorRecordStatus.SUBMITTED,
      titleEn: 'Helpful act',
      titleAr: null,
      noteEn: null,
      noteAr: null,
      points: 7,
      occurredAt: NOW,
      submittedAt: NOW,
      reviewedAt: null,
      cancelledAt: null,
      createdAt: NOW,
      updatedAt: NOW,
      student: student(),
      enrollment: {
        id: ENROLLMENT_ID,
        classroomId: CLASSROOM_ID,
        classroom: classroom(),
      },
      category: category(),
      ...overrides,
    } as never;
  }

  function ledger(overrides?: Record<string, unknown>) {
    return {
      id: 'ledger-1',
      academicYearId: YEAR_ID,
      termId: TERM_ID,
      studentId: STUDENT_ID,
      enrollmentId: ENROLLMENT_ID,
      recordId: 'record-1',
      categoryId: CATEGORY_ID,
      entryType: BehaviorPointLedgerEntryType.AWARD,
      amount: 7,
      actorId: ACTOR_ID,
      occurredAt: NOW,
      createdAt: NOW,
      student: student(),
      category: category(),
      record: {
        id: 'record-1',
        type: BehaviorRecordType.POSITIVE,
        severity: BehaviorSeverity.LOW,
        status: BehaviorRecordStatus.APPROVED,
        occurredAt: NOW,
        createdAt: NOW,
      },
      ...overrides,
    } as never;
  }
});
