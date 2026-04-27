import {
  AuditOutcome,
  GradeAssessmentApprovalStatus,
  GradeAssessmentDeliveryMode,
  GradeItemStatus,
  GradeScopeType,
  Prisma,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../../common/context/request-context';
import {
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { BulkUpsertGradeAssessmentItemsUseCase } from '../application/bulk-upsert-grade-assessment-items.use-case';
import { ListGradeAssessmentItemsUseCase } from '../application/list-grade-assessment-items.use-case';
import { UpsertGradeAssessmentItemUseCase } from '../application/upsert-grade-assessment-item.use-case';
import { GradebookNoEnrollmentException } from '../domain/grade-item-entry-domain';
import { GradeItemScoreOutOfRangeException } from '../../shared/domain/grade-item-validation';
import { GradeTermClosedException } from '../../shared/domain/grade-workflow';
import {
  GradeAssessmentLockedException,
  GradeAssessmentNotPublishedException,
} from '../domain/grade-assessment-domain';
import { GradesAssessmentItemsRepository } from '../infrastructure/grades-assessment-items.repository';

const SCHOOL_ID = 'school-1';
const YEAR_ID = 'year-1';
const TERM_ID = 'term-1';
const ASSESSMENT_ID = 'assessment-1';
const STUDENT_ID = 'student-1';
const STUDENT_TWO_ID = 'student-2';
const ENROLLMENT_ID = 'enrollment-1';
const GRADE_ID = 'grade-1';
const SECTION_ID = 'section-1';
const CLASSROOM_ID = 'classroom-1';

describe('grade assessment item use cases', () => {
  async function withGradesScope<T>(fn: () => Promise<T>): Promise<T> {
    return runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: 'user-1', userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: 'membership-1',
        organizationId: 'org-1',
        schoolId: SCHOOL_ID,
        roleId: 'role-1',
        permissions: ['grades.items.view', 'grades.items.manage'],
      });

      return fn();
    });
  }

  function assessmentRecord(
    overrides?: Partial<{
      approvalStatus: GradeAssessmentApprovalStatus;
      deliveryMode: GradeAssessmentDeliveryMode;
      lockedAt: Date | null;
      maxScore: number;
      termActive: boolean;
    }>,
  ) {
    return {
      id: ASSESSMENT_ID,
      schoolId: SCHOOL_ID,
      academicYearId: YEAR_ID,
      termId: TERM_ID,
      subjectId: 'subject-1',
      scopeType: GradeScopeType.GRADE,
      scopeKey: GRADE_ID,
      stageId: 'stage-1',
      gradeId: GRADE_ID,
      sectionId: null,
      classroomId: null,
      deliveryMode:
        overrides?.deliveryMode ?? GradeAssessmentDeliveryMode.SCORE_ONLY,
      maxScore: new Prisma.Decimal(overrides?.maxScore ?? 20),
      approvalStatus:
        overrides?.approvalStatus ?? GradeAssessmentApprovalStatus.PUBLISHED,
      lockedAt: overrides?.lockedAt ?? null,
      deletedAt: null,
      term: {
        id: TERM_ID,
        academicYearId: YEAR_ID,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2026-12-31T00:00:00.000Z'),
        isActive: overrides?.termActive ?? true,
      },
    };
  }

  function studentRecord(studentId = STUDENT_ID) {
    return {
      id: studentId,
      firstName: studentId === STUDENT_TWO_ID ? 'Mona' : 'Ahmed',
      lastName: 'Ali',
      status: 'ACTIVE',
    };
  }

  function enrollmentRecord(
    overrides?: Partial<{ id: string; studentId: string }>,
  ) {
    const studentId = overrides?.studentId ?? STUDENT_ID;

    return {
      id: overrides?.id ?? ENROLLMENT_ID,
      schoolId: SCHOOL_ID,
      studentId,
      academicYearId: YEAR_ID,
      termId: TERM_ID,
      classroomId: CLASSROOM_ID,
      status: 'ACTIVE',
      enrolledAt: new Date('2026-09-01T00:00:00.000Z'),
      endedAt: null,
      createdAt: new Date('2026-09-01T00:00:00.000Z'),
      updatedAt: new Date('2026-09-01T00:00:00.000Z'),
      student: studentRecord(studentId),
      classroom: {
        id: CLASSROOM_ID,
        sectionId: SECTION_ID,
        nameAr: 'Class AR',
        nameEn: 'Class A',
        section: {
          id: SECTION_ID,
          gradeId: GRADE_ID,
          nameAr: 'Section AR',
          nameEn: 'Section A',
          grade: {
            id: GRADE_ID,
            stageId: 'stage-1',
            nameAr: 'Grade AR',
            nameEn: 'Grade A',
            stage: {
              id: 'stage-1',
              nameAr: 'Stage AR',
              nameEn: 'Stage A',
            },
          },
        },
      },
    };
  }

  function gradeItemRecord(
    overrides?: Partial<{
      id: string;
      studentId: string;
      enrollmentId: string | null;
      score: number | null;
      status: GradeItemStatus;
      comment: string | null;
    }>,
  ) {
    const studentId = overrides?.studentId ?? STUDENT_ID;

    return {
      id: overrides?.id ?? 'item-1',
      schoolId: SCHOOL_ID,
      termId: TERM_ID,
      assessmentId: ASSESSMENT_ID,
      studentId,
      enrollmentId:
        overrides?.enrollmentId === undefined
          ? ENROLLMENT_ID
          : overrides.enrollmentId,
      score:
        overrides?.score === undefined || overrides.score === null
          ? null
          : new Prisma.Decimal(overrides.score),
      status: overrides?.status ?? GradeItemStatus.ENTERED,
      comment: overrides?.comment ?? 'Good',
      enteredById: 'user-1',
      enteredAt: new Date('2026-09-15T08:00:00.000Z'),
      createdAt: new Date('2026-09-15T08:00:00.000Z'),
      updatedAt: new Date('2026-09-15T08:00:00.000Z'),
      student: studentRecord(studentId),
      enrollment: enrollmentRecord({
        studentId,
        id: overrides?.enrollmentId ?? ENROLLMENT_ID,
      }),
    };
  }

  function baseRepository(overrides?: Partial<Record<string, jest.Mock>>) {
    return {
      findAssessmentForItems: jest.fn().mockResolvedValue(assessmentRecord()),
      listAssessmentItems: jest.fn().mockResolvedValue([gradeItemRecord()]),
      listStudentsInAssessmentScope: jest
        .fn()
        .mockResolvedValue([enrollmentRecord()]),
      findStudentForGradeEntry: jest.fn().mockResolvedValue(studentRecord()),
      findStudentsForBulkGradeEntry: jest
        .fn()
        .mockResolvedValue([
          studentRecord(STUDENT_ID),
          studentRecord(STUDENT_TWO_ID),
        ]),
      findStudentEnrollmentForAssessmentScope: jest
        .fn()
        .mockResolvedValue(enrollmentRecord()),
      findStudentEnrollmentsForAssessmentScope: jest
        .fn()
        .mockResolvedValue([
          enrollmentRecord({ studentId: STUDENT_ID, id: ENROLLMENT_ID }),
          enrollmentRecord({ studentId: STUDENT_TWO_ID, id: 'enrollment-2' }),
        ]),
      findGradeItemByAssessmentAndStudent: jest.fn().mockResolvedValue(null),
      findGradeItemsByAssessmentAndStudents: jest.fn().mockResolvedValue([]),
      upsertGradeItem: jest.fn().mockImplementation((input) =>
        Promise.resolve(
          gradeItemRecord({
            studentId: input.studentId,
            enrollmentId: input.enrollmentId,
            score: input.score,
            status: input.status,
            comment: input.comment,
          }),
        ),
      ),
      bulkUpsertGradeItems: jest.fn().mockImplementation((inputs) =>
        Promise.resolve(
          inputs.map(
            (
              input: {
                studentId: string;
                score: number | null;
                status: GradeItemStatus;
                comment: string | null;
              },
              index: number,
            ) =>
              gradeItemRecord({
                id: `item-${index + 1}`,
                studentId: input.studentId,
                score: input.score,
                status: input.status,
                comment: input.comment,
              }),
          ),
        ),
      ),
      ...overrides,
    } as unknown as GradesAssessmentItemsRepository;
  }

  function authRepository(overrides?: Partial<Record<string, jest.Mock>>) {
    return {
      createAuditLog: jest.fn().mockResolvedValue(undefined),
      ...overrides,
    } as unknown as AuthRepository;
  }

  it('lists persisted grade items', async () => {
    const repository = baseRepository({
      listAssessmentItems: jest
        .fn()
        .mockResolvedValue([gradeItemRecord({ score: 18 })]),
    });
    const useCase = new ListGradeAssessmentItemsUseCase(repository);

    const result = await withGradesScope(() =>
      useCase.execute(ASSESSMENT_ID, { includeMissingStudents: false }),
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      assessmentId: ASSESSMENT_ID,
      studentId: STUDENT_ID,
      score: 18,
      status: 'entered',
      isVirtualMissing: false,
    });
  });

  it('optionally includes virtual missing students without persisting them', async () => {
    const repository = baseRepository({
      listAssessmentItems: jest
        .fn()
        .mockResolvedValue([gradeItemRecord({ studentId: STUDENT_ID })]),
      listStudentsInAssessmentScope: jest
        .fn()
        .mockResolvedValue([
          enrollmentRecord({ studentId: STUDENT_ID, id: ENROLLMENT_ID }),
          enrollmentRecord({ studentId: STUDENT_TWO_ID, id: 'enrollment-2' }),
        ]),
    });
    const useCase = new ListGradeAssessmentItemsUseCase(repository);

    const result = await withGradesScope(() =>
      useCase.execute(ASSESSMENT_ID, {}),
    );

    expect(result.items).toHaveLength(2);
    expect(result.items[1]).toMatchObject({
      id: null,
      studentId: STUDENT_TWO_ID,
      enrollmentId: 'enrollment-2',
      score: null,
      status: 'missing',
      isVirtualMissing: true,
    });
  });

  it('upserts an ENTERED item with an in-range score and audits it', async () => {
    const repository = baseRepository({
      findGradeItemByAssessmentAndStudent: jest
        .fn()
        .mockResolvedValue(gradeItemRecord({ score: 10 })),
    });
    const auth = authRepository();
    const useCase = new UpsertGradeAssessmentItemUseCase(repository, auth);

    const result = await withGradesScope(() =>
      useCase.execute(ASSESSMENT_ID, STUDENT_ID, {
        status: GradeItemStatus.ENTERED,
        score: 18,
        comment: 'Strong work',
      }),
    );

    expect(repository.upsertGradeItem).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: SCHOOL_ID,
        assessmentId: ASSESSMENT_ID,
        studentId: STUDENT_ID,
        enrollmentId: ENROLLMENT_ID,
        score: 18,
        status: GradeItemStatus.ENTERED,
        comment: 'Strong work',
        enteredById: 'user-1',
        enteredAt: expect.any(Date),
      }),
    );
    expect(result).toMatchObject({
      score: 18,
      status: 'entered',
      comment: 'Strong work',
    });
    expect(auth.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'grades.item.update',
        resourceType: 'grade_item',
        outcome: AuditOutcome.SUCCESS,
        before: expect.objectContaining({ score: 10 }),
        after: expect.objectContaining({ score: 18 }),
      }),
    );
  });

  it('rejects score above maxScore', async () => {
    const repository = baseRepository();
    const useCase = new UpsertGradeAssessmentItemUseCase(
      repository,
      authRepository(),
    );

    await expect(
      withGradesScope(() =>
        useCase.execute(ASSESSMENT_ID, STUDENT_ID, {
          status: GradeItemStatus.ENTERED,
          score: 21,
        }),
      ),
    ).rejects.toBeInstanceOf(GradeItemScoreOutOfRangeException);
    expect(repository.upsertGradeItem).not.toHaveBeenCalled();
  });

  it('rejects score below zero', async () => {
    const repository = baseRepository();
    const useCase = new UpsertGradeAssessmentItemUseCase(
      repository,
      authRepository(),
    );

    await expect(
      withGradesScope(() =>
        useCase.execute(ASSESSMENT_ID, STUDENT_ID, {
          status: GradeItemStatus.ENTERED,
          score: -1,
        }),
      ),
    ).rejects.toBeInstanceOf(GradeItemScoreOutOfRangeException);
    expect(repository.upsertGradeItem).not.toHaveBeenCalled();
  });

  it('requires score for ENTERED items', async () => {
    const repository = baseRepository();
    const useCase = new UpsertGradeAssessmentItemUseCase(
      repository,
      authRepository(),
    );

    await expect(
      withGradesScope(() =>
        useCase.execute(ASSESSMENT_ID, STUDENT_ID, {
          status: GradeItemStatus.ENTERED,
        }),
      ),
    ).rejects.toBeInstanceOf(ValidationDomainException);
    expect(repository.upsertGradeItem).not.toHaveBeenCalled();
  });

  it.each([GradeItemStatus.MISSING, GradeItemStatus.ABSENT])(
    'stores null score for %s items',
    async (status) => {
      const repository = baseRepository();
      const useCase = new UpsertGradeAssessmentItemUseCase(
        repository,
        authRepository(),
      );

      const result = await withGradesScope(() =>
        useCase.execute(ASSESSMENT_ID, STUDENT_ID, {
          status,
          score: 12,
        }),
      );

      expect(repository.upsertGradeItem).toHaveBeenCalledWith(
        expect.objectContaining({
          status,
          score: null,
        }),
      );
      expect(result).toMatchObject({
        score: null,
        status: status.toLowerCase(),
      });
    },
  );

  it('rejects DRAFT assessments', async () => {
    const repository = baseRepository({
      findAssessmentForItems: jest.fn().mockResolvedValue(
        assessmentRecord({
          approvalStatus: GradeAssessmentApprovalStatus.DRAFT,
        }),
      ),
    });
    const useCase = new UpsertGradeAssessmentItemUseCase(
      repository,
      authRepository(),
    );

    await expect(
      withGradesScope(() =>
        useCase.execute(ASSESSMENT_ID, STUDENT_ID, {
          status: GradeItemStatus.ENTERED,
          score: 10,
        }),
      ),
    ).rejects.toBeInstanceOf(GradeAssessmentNotPublishedException);
  });

  it.each([
    GradeAssessmentApprovalStatus.PUBLISHED,
    GradeAssessmentApprovalStatus.APPROVED,
  ])('allows %s assessments', async (approvalStatus) => {
    const repository = baseRepository({
      findAssessmentForItems: jest
        .fn()
        .mockResolvedValue(assessmentRecord({ approvalStatus })),
    });
    const useCase = new UpsertGradeAssessmentItemUseCase(
      repository,
      authRepository(),
    );

    await withGradesScope(() =>
      useCase.execute(ASSESSMENT_ID, STUDENT_ID, {
        status: GradeItemStatus.ENTERED,
        score: 10,
      }),
    );

    expect(repository.upsertGradeItem).toHaveBeenCalled();
  });

  it('rejects locked assessments', async () => {
    const repository = baseRepository({
      findAssessmentForItems: jest.fn().mockResolvedValue(
        assessmentRecord({
          lockedAt: new Date('2026-09-20T08:00:00.000Z'),
        }),
      ),
    });
    const useCase = new UpsertGradeAssessmentItemUseCase(
      repository,
      authRepository(),
    );

    await expect(
      withGradesScope(() =>
        useCase.execute(ASSESSMENT_ID, STUDENT_ID, {
          status: GradeItemStatus.ENTERED,
          score: 10,
        }),
      ),
    ).rejects.toBeInstanceOf(GradeAssessmentLockedException);
  });

  it('rejects closed or inactive terms', async () => {
    const repository = baseRepository({
      findAssessmentForItems: jest
        .fn()
        .mockResolvedValue(assessmentRecord({ termActive: false })),
    });
    const useCase = new UpsertGradeAssessmentItemUseCase(
      repository,
      authRepository(),
    );

    await expect(
      withGradesScope(() =>
        useCase.execute(ASSESSMENT_ID, STUDENT_ID, {
          status: GradeItemStatus.ENTERED,
          score: 10,
        }),
      ),
    ).rejects.toBeInstanceOf(GradeTermClosedException);
  });

  it('rejects non-SCORE_ONLY assessments', async () => {
    const repository = baseRepository({
      findAssessmentForItems: jest.fn().mockResolvedValue(
        assessmentRecord({
          deliveryMode: GradeAssessmentDeliveryMode.QUESTION_BASED,
        }),
      ),
    });
    const useCase = new UpsertGradeAssessmentItemUseCase(
      repository,
      authRepository(),
    );

    await expect(
      withGradesScope(() =>
        useCase.execute(ASSESSMENT_ID, STUDENT_ID, {
          status: GradeItemStatus.ENTERED,
          score: 10,
        }),
      ),
    ).rejects.toBeInstanceOf(ValidationDomainException);
  });

  it('rejects students outside the current school as not found', async () => {
    const repository = baseRepository({
      findStudentForGradeEntry: jest.fn().mockResolvedValue(null),
      upsertGradeItem: jest.fn(),
    });
    const useCase = new UpsertGradeAssessmentItemUseCase(
      repository,
      authRepository(),
    );

    await expect(
      withGradesScope(() =>
        useCase.execute(ASSESSMENT_ID, STUDENT_ID, {
          status: GradeItemStatus.ENTERED,
          score: 10,
        }),
      ),
    ).rejects.toBeInstanceOf(NotFoundDomainException);
    expect(repository.upsertGradeItem).not.toHaveBeenCalled();
  });

  it('rejects students without an enrollment in the assessment scope', async () => {
    const repository = baseRepository({
      findStudentEnrollmentForAssessmentScope: jest
        .fn()
        .mockResolvedValue(null),
      upsertGradeItem: jest.fn(),
    });
    const useCase = new UpsertGradeAssessmentItemUseCase(
      repository,
      authRepository(),
    );

    await expect(
      withGradesScope(() =>
        useCase.execute(ASSESSMENT_ID, STUDENT_ID, {
          status: GradeItemStatus.ENTERED,
          score: 10,
        }),
      ),
    ).rejects.toBeInstanceOf(GradebookNoEnrollmentException);
    expect(repository.upsertGradeItem).not.toHaveBeenCalled();
  });

  it('bulk upserts all valid rows and audits the summary', async () => {
    const repository = baseRepository();
    const auth = authRepository();
    const useCase = new BulkUpsertGradeAssessmentItemsUseCase(repository, auth);

    const result = await withGradesScope(() =>
      useCase.execute(ASSESSMENT_ID, {
        items: [
          {
            studentId: STUDENT_ID,
            status: GradeItemStatus.ENTERED,
            score: 18,
          },
          {
            studentId: STUDENT_TWO_ID,
            status: GradeItemStatus.ABSENT,
          },
        ],
      }),
    );

    expect(repository.bulkUpsertGradeItems).toHaveBeenCalledWith([
      expect.objectContaining({
        studentId: STUDENT_ID,
        score: 18,
        status: GradeItemStatus.ENTERED,
      }),
      expect.objectContaining({
        studentId: STUDENT_TWO_ID,
        score: null,
        status: GradeItemStatus.ABSENT,
      }),
    ]);
    expect(result).toMatchObject({
      assessmentId: ASSESSMENT_ID,
      updatedCount: 2,
    });
    expect(auth.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'grades.items.bulk_update',
        resourceType: 'grade_assessment',
        outcome: AuditOutcome.SUCCESS,
        after: expect.objectContaining({
          affectedStudentIds: [STUDENT_ID, STUDENT_TWO_ID],
          count: 2,
        }),
      }),
    );
  });

  it('bulk rejects duplicate studentIds before writing', async () => {
    const repository = baseRepository();
    const useCase = new BulkUpsertGradeAssessmentItemsUseCase(
      repository,
      authRepository(),
    );

    await expect(
      withGradesScope(() =>
        useCase.execute(ASSESSMENT_ID, {
          items: [
            {
              studentId: STUDENT_ID,
              status: GradeItemStatus.ENTERED,
              score: 18,
            },
            {
              studentId: STUDENT_ID,
              status: GradeItemStatus.MISSING,
            },
          ],
        }),
      ),
    ).rejects.toBeInstanceOf(ValidationDomainException);
    expect(repository.bulkUpsertGradeItems).not.toHaveBeenCalled();
  });

  it('bulk rejects any invalid score and writes nothing', async () => {
    const repository = baseRepository();
    const useCase = new BulkUpsertGradeAssessmentItemsUseCase(
      repository,
      authRepository(),
    );

    await expect(
      withGradesScope(() =>
        useCase.execute(ASSESSMENT_ID, {
          items: [
            {
              studentId: STUDENT_ID,
              status: GradeItemStatus.ENTERED,
              score: 18,
            },
            {
              studentId: STUDENT_TWO_ID,
              status: GradeItemStatus.ENTERED,
              score: 21,
            },
          ],
        }),
      ),
    ).rejects.toBeInstanceOf(GradeItemScoreOutOfRangeException);
    expect(repository.bulkUpsertGradeItems).not.toHaveBeenCalled();
  });
});
