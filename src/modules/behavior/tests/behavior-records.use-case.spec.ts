import {
  AuditOutcome,
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
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../common/exceptions/domain-exception';
import {
  CancelBehaviorRecordUseCase,
  CreateBehaviorRecordUseCase,
  GetBehaviorRecordUseCase,
  ListBehaviorRecordsUseCase,
  SubmitBehaviorRecordUseCase,
  UpdateBehaviorRecordUseCase,
} from '../application/behavior-records.use-cases';
import {
  BehaviorCategoryInactiveException,
  BehaviorRecordAlreadySubmittedException,
  BehaviorRecordCancelledException,
  BehaviorScopeInvalidException,
} from '../domain/behavior-records-domain';
import { BehaviorRecordsRepository } from '../infrastructure/behavior-records.repository';

const SCHOOL_ID = 'school-1';
const ACTOR_ID = 'user-1';
const RECORD_ID = 'record-1';
const YEAR_ID = 'year-1';
const TERM_ID = 'term-1';
const STUDENT_ID = 'student-1';
const ENROLLMENT_ID = 'enrollment-1';
const CATEGORY_ID = 'category-1';
const NOW = new Date('2026-04-30T12:00:00.000Z');

describe('Behavior record use cases', () => {
  async function withScope<T>(fn: () => Promise<T>): Promise<T> {
    return runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: ACTOR_ID, userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: 'membership-1',
        organizationId: 'org-1',
        schoolId: SCHOOL_ID,
        roleId: 'role-1',
        permissions: [
          'behavior.records.view',
          'behavior.records.create',
          'behavior.records.manage',
        ],
      });

      return fn();
    });
  }

  it('creates DRAFT records with category defaults and audits without ledger or XP writes', async () => {
    const auditEntries: unknown[] = [];
    const repository = repositoryMock({ auditEntries });

    const result = await withScope(() =>
      new CreateBehaviorRecordUseCase(repository).execute({
        academicYearId: YEAR_ID,
        termId: TERM_ID,
        studentId: STUDENT_ID,
        categoryId: CATEGORY_ID,
        titleEn: 'Helpful act',
        occurredAt: NOW.toISOString(),
      }),
    );

    expect(repository.createRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: SCHOOL_ID,
        data: expect.objectContaining({
          type: BehaviorRecordType.POSITIVE,
          severity: BehaviorSeverity.HIGH,
          points: 7,
          status: BehaviorRecordStatus.DRAFT,
          createdById: ACTOR_ID,
          enrollmentId: ENROLLMENT_ID,
        }),
      }),
    );
    expect(result).toMatchObject({
      id: RECORD_ID,
      type: 'positive',
      severity: 'high',
      status: 'draft',
      points: 7,
    });
    expect(auditEntries).toEqual([
      expect.objectContaining({
        action: 'behavior.record.create',
        module: 'behavior',
        resourceType: 'behavior_record',
        outcome: AuditOutcome.SUCCESS,
      }),
    ]);
    expect(repository.createBehaviorPointLedger).not.toHaveBeenCalled();
    expect(repository.createXpLedger).not.toHaveBeenCalled();
  });

  it('requires type when category is omitted', async () => {
    const repository = repositoryMock();

    await expect(
      withScope(() =>
        new CreateBehaviorRecordUseCase(repository).execute({
          academicYearId: YEAR_ID,
          termId: TERM_ID,
          studentId: STUDENT_ID,
          titleEn: 'Uncategorized note',
          occurredAt: NOW.toISOString(),
        }),
      ),
    ).rejects.toBeInstanceOf(ValidationDomainException);
    expect(repository.createRecord).not.toHaveBeenCalled();
  });

  it('validates create ownership for academic year, term, student, enrollment, and category', async () => {
    await expectCreateValidation(
      { findAcademicYear: jest.fn().mockResolvedValue(null) },
      NotFoundDomainException,
    );
    await expectCreateValidation(
      { findTerm: jest.fn().mockResolvedValue(null) },
      NotFoundDomainException,
    );
    await expectCreateValidation(
      { findTerm: jest.fn().mockResolvedValue(term({ academicYearId: 'year-2' })) },
      BehaviorScopeInvalidException,
    );
    await expectCreateValidation(
      { findStudent: jest.fn().mockResolvedValue(null) },
      NotFoundDomainException,
    );
    await expectCreateValidation(
      {
        findEnrollmentById: jest
          .fn()
          .mockResolvedValue(enrollment({ studentId: 'student-2' })),
      },
      BehaviorScopeInvalidException,
      { enrollmentId: ENROLLMENT_ID },
    );
    await expectCreateValidation(
      { findCategoryById: jest.fn().mockResolvedValue(null) },
      NotFoundDomainException,
    );
  });

  it('rejects inactive categories on create and submit', async () => {
    const inactiveCategory = category({ isActive: false });
    await expectCreateValidation(
      { findCategoryById: jest.fn().mockResolvedValue(inactiveCategory) },
      BehaviorCategoryInactiveException,
    );

    const repository = repositoryMock({
      findRecordById: jest
        .fn()
        .mockResolvedValue(record({ status: BehaviorRecordStatus.DRAFT })),
      findCategoryById: jest.fn().mockResolvedValue(inactiveCategory),
    });

    await expect(
      withScope(() =>
        new SubmitBehaviorRecordUseCase(repository).execute(RECORD_ID),
      ),
    ).rejects.toBeInstanceOf(BehaviorCategoryInactiveException);
    expect(repository.submitRecord).not.toHaveBeenCalled();
  });

  it('rejects create when occurredAt is outside the term', async () => {
    const repository = repositoryMock();

    await expect(
      withScope(() =>
        new CreateBehaviorRecordUseCase(repository).execute({
          academicYearId: YEAR_ID,
          termId: TERM_ID,
          studentId: STUDENT_ID,
          categoryId: CATEGORY_ID,
          titleEn: 'Outside term',
          occurredAt: '2026-05-05T12:00:00.000Z',
        }),
      ),
    ).rejects.toMatchObject({ code: 'behavior.record.outside_term' });
  });

  it('updates only DRAFT records and audits the mutation', async () => {
    const auditEntries: unknown[] = [];
    const repository = repositoryMock({ auditEntries });

    const result = await withScope(() =>
      new UpdateBehaviorRecordUseCase(repository).execute(RECORD_ID, {
        titleEn: 'Updated title',
        points: 3,
      }),
    );

    expect(repository.updateRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        recordId: RECORD_ID,
        data: expect.objectContaining({
          titleEn: 'Updated title',
          points: 3,
        }),
      }),
    );
    expect(result).toMatchObject({ id: RECORD_ID, titleEn: 'Updated title' });
    expect(auditEntries).toEqual([
      expect.objectContaining({
        action: 'behavior.record.update',
        before: expect.objectContaining({ status: BehaviorRecordStatus.DRAFT }),
      }),
    ]);

    await expect(
      withScope(() =>
        new UpdateBehaviorRecordUseCase(
          repositoryMock({
            findRecordById: jest
              .fn()
              .mockResolvedValue(
                record({ status: BehaviorRecordStatus.SUBMITTED }),
              ),
          }),
        ).execute(RECORD_ID, { titleEn: 'Nope' }),
      ),
    ).rejects.toMatchObject({
      code: 'behavior.record.invalid_status_transition',
    });

    await expect(
      withScope(() =>
        new UpdateBehaviorRecordUseCase(
          repositoryMock({
            findRecordById: jest
              .fn()
              .mockResolvedValue(
                record({ status: BehaviorRecordStatus.CANCELLED }),
              ),
          }),
        ).execute(RECORD_ID, { titleEn: 'Nope' }),
      ),
    ).rejects.toBeInstanceOf(BehaviorRecordCancelledException);
  });

  it('submits only DRAFT records and sets submit metadata', async () => {
    const auditEntries: unknown[] = [];
    const repository = repositoryMock({ auditEntries });

    const result = await withScope(() =>
      new SubmitBehaviorRecordUseCase(repository).execute(RECORD_ID),
    );

    expect(repository.submitRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        recordId: RECORD_ID,
        data: expect.objectContaining({
          status: BehaviorRecordStatus.SUBMITTED,
          submittedById: ACTOR_ID,
          submittedAt: expect.any(Date),
        }),
      }),
    );
    expect(result).toMatchObject({ status: 'submitted' });
    expect(auditEntries).toEqual([
      expect.objectContaining({ action: 'behavior.record.submit' }),
    ]);

    await expect(
      withScope(() =>
        new SubmitBehaviorRecordUseCase(
          repositoryMock({
            findRecordById: jest
              .fn()
              .mockResolvedValue(
                record({ status: BehaviorRecordStatus.SUBMITTED }),
              ),
          }),
        ).execute(RECORD_ID),
      ),
    ).rejects.toBeInstanceOf(BehaviorRecordAlreadySubmittedException);
  });

  it('cancels DRAFT and SUBMITTED records, rejects CANCELLED, and audits the mutation', async () => {
    for (const status of [
      BehaviorRecordStatus.DRAFT,
      BehaviorRecordStatus.SUBMITTED,
    ]) {
      const auditEntries: unknown[] = [];
      const repository = repositoryMock({
        auditEntries,
        findRecordById: jest.fn().mockResolvedValue(record({ status })),
      });

      const result = await withScope(() =>
        new CancelBehaviorRecordUseCase(repository).execute(RECORD_ID, {
          cancellationReasonEn: 'Duplicate entry',
        }),
      );

      expect(result).toMatchObject({ status: 'cancelled' });
      expect(repository.cancelRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: BehaviorRecordStatus.CANCELLED,
            cancelledById: ACTOR_ID,
            cancelledAt: expect.any(Date),
            cancellationReasonEn: 'Duplicate entry',
          }),
        }),
      );
      expect(auditEntries).toEqual([
        expect.objectContaining({ action: 'behavior.record.cancel' }),
      ]);
    }

    await expect(
      withScope(() =>
        new CancelBehaviorRecordUseCase(
          repositoryMock({
            findRecordById: jest
              .fn()
              .mockResolvedValue(
                record({ status: BehaviorRecordStatus.CANCELLED }),
              ),
          }),
        ).execute(RECORD_ID, {}),
      ),
    ).rejects.toBeInstanceOf(BehaviorRecordCancelledException);
  });

  it('does not audit reads', async () => {
    const auditEntries: unknown[] = [];
    const repository = repositoryMock({ auditEntries });

    await withScope(() =>
      new ListBehaviorRecordsUseCase(repository).execute({ search: 'Help' }),
    );
    await withScope(() =>
      new GetBehaviorRecordUseCase(repository).execute(RECORD_ID),
    );

    expect(auditEntries).toEqual([]);
  });

  async function expectCreateValidation(
    overrides: Partial<Record<string, jest.Mock>>,
    errorClass: new (...args: never[]) => Error,
    commandOverrides?: Record<string, unknown>,
  ) {
    const repository = repositoryMock(overrides);

    await expect(
      withScope(() =>
        new CreateBehaviorRecordUseCase(repository).execute({
          academicYearId: YEAR_ID,
          termId: TERM_ID,
          studentId: STUDENT_ID,
          categoryId: CATEGORY_ID,
          titleEn: 'Helpful act',
          occurredAt: NOW.toISOString(),
          ...commandOverrides,
        }),
      ),
    ).rejects.toBeInstanceOf(errorClass);
    expect(repository.createRecord).not.toHaveBeenCalled();
  }

  function repositoryMock(
    overrides?: Partial<Record<string, jest.Mock>> & {
      auditEntries?: unknown[];
    },
  ) {
    const auditEntries = overrides?.auditEntries ?? [];
    const repository = {
      listRecords: jest.fn().mockResolvedValue({
        items: [record()],
        total: 1,
        summary: {
          total: 1,
          draft: 1,
          submitted: 0,
          approved: 0,
          rejected: 0,
          cancelled: 0,
          positive: 1,
          negative: 0,
        },
      }),
      findRecordById: jest.fn().mockResolvedValue(record()),
      findAcademicYear: jest.fn().mockResolvedValue(academicYear()),
      findTerm: jest.fn().mockResolvedValue(term()),
      findStudent: jest.fn().mockResolvedValue(student()),
      findEnrollmentById: jest.fn().mockResolvedValue(enrollment()),
      findEnrollmentForStudent: jest.fn().mockResolvedValue(enrollment()),
      findCategoryById: jest.fn().mockResolvedValue(category()),
      createRecord: jest.fn().mockImplementation(async (input) => {
        const created = record({ ...input.data, id: RECORD_ID });
        auditEntries.push(input.buildAuditEntry(created));
        return created;
      }),
      updateRecord: jest.fn().mockImplementation(async (input) => {
        const updated = record({ ...input.data, id: input.recordId });
        auditEntries.push(input.buildAuditEntry(updated));
        return updated;
      }),
      submitRecord: jest.fn().mockImplementation(async (input) => {
        const updated = record({ ...input.data, id: input.recordId });
        auditEntries.push(input.buildAuditEntry(updated));
        return updated;
      }),
      cancelRecord: jest.fn().mockImplementation(async (input) => {
        const updated = record({ ...input.data, id: input.recordId });
        auditEntries.push(input.buildAuditEntry(updated));
        return updated;
      }),
      createBehaviorPointLedger: jest.fn(),
      createXpLedger: jest.fn(),
      ...overrides,
    };
    delete (repository as Record<string, unknown>).auditEntries;

    return repository as unknown as jest.Mocked<BehaviorRecordsRepository> & {
      createBehaviorPointLedger: jest.Mock;
      createXpLedger: jest.Mock;
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
      status: BehaviorRecordStatus.DRAFT,
      titleEn: 'Helpful act',
      titleAr: null,
      noteEn: null,
      noteAr: null,
      points: 7,
      occurredAt: NOW,
      createdById: ACTOR_ID,
      submittedById: null,
      submittedAt: null,
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
      submittedBy: null,
      reviewedBy: null,
      cancelledBy: null,
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
