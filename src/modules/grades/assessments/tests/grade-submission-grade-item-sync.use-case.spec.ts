import {
  AuditOutcome,
  GradeAssessmentApprovalStatus,
  GradeAssessmentDeliveryMode,
  GradeItemStatus,
  GradeScopeType,
  GradeSubmissionStatus,
  Prisma,
  StudentEnrollmentStatus,
  StudentStatus,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../../common/context/request-context';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { SyncGradeSubmissionToGradeItemUseCase } from '../application/sync-grade-submission-to-grade-item.use-case';
import { GradesSubmissionGradeItemSyncRepository } from '../infrastructure/grades-submission-grade-item-sync.repository';

const SCHOOL_ID = 'school-1';
const ASSESSMENT_ID = 'assessment-1';
const SUBMISSION_ID = 'submission-1';
const STUDENT_ID = 'student-1';
const ENROLLMENT_ID = 'enrollment-1';
const TERM_ID = 'term-1';

describe('SyncGradeSubmissionToGradeItemUseCase', () => {
  async function withGradesReviewScope<T>(fn: () => Promise<T>): Promise<T> {
    return runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: 'reviewer-1', userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: 'membership-1',
        organizationId: 'org-1',
        schoolId: SCHOOL_ID,
        roleId: 'role-1',
        permissions: ['grades.submissions.review'],
      });

      return fn();
    });
  }

  function assessmentRecord(
    overrides?: Partial<{
      deliveryMode: GradeAssessmentDeliveryMode;
      approvalStatus: GradeAssessmentApprovalStatus;
      lockedAt: Date | null;
      termActive: boolean;
      maxScore: number;
    }>,
  ) {
    return {
      id: ASSESSMENT_ID,
      schoolId: SCHOOL_ID,
      academicYearId: 'year-1',
      termId: TERM_ID,
      deliveryMode:
        overrides?.deliveryMode ?? GradeAssessmentDeliveryMode.QUESTION_BASED,
      approvalStatus:
        overrides?.approvalStatus ?? GradeAssessmentApprovalStatus.PUBLISHED,
      lockedAt: overrides?.lockedAt ?? null,
      maxScore: new Prisma.Decimal(overrides?.maxScore ?? 20),
      term: {
        id: TERM_ID,
        academicYearId: 'year-1',
        isActive: overrides?.termActive ?? true,
      },
    };
  }

  function submissionRecord(
    overrides?: Partial<{
      status: GradeSubmissionStatus;
      deliveryMode: GradeAssessmentDeliveryMode;
      approvalStatus: GradeAssessmentApprovalStatus;
      lockedAt: Date | null;
      termActive: boolean;
      totalScore: number | null;
      maxScore: number | null;
      assessmentMaxScore: number;
    }>,
  ) {
    return {
      id: SUBMISSION_ID,
      schoolId: SCHOOL_ID,
      assessmentId: ASSESSMENT_ID,
      termId: TERM_ID,
      studentId: STUDENT_ID,
      enrollmentId: ENROLLMENT_ID,
      status: overrides?.status ?? GradeSubmissionStatus.CORRECTED,
      correctedAt: new Date('2026-09-20T10:00:00.000Z'),
      totalScore:
        overrides?.totalScore === undefined
          ? new Prisma.Decimal(8)
          : overrides.totalScore === null
            ? null
            : new Prisma.Decimal(overrides.totalScore),
      maxScore:
        overrides?.maxScore === undefined
          ? new Prisma.Decimal(10)
          : overrides.maxScore === null
            ? null
            : new Prisma.Decimal(overrides.maxScore),
      assessment: assessmentRecord({
        deliveryMode: overrides?.deliveryMode,
        approvalStatus: overrides?.approvalStatus,
        lockedAt: overrides?.lockedAt,
        termActive: overrides?.termActive,
        maxScore: overrides?.assessmentMaxScore ?? 20,
      }),
      student: {
        id: STUDENT_ID,
        schoolId: SCHOOL_ID,
        status: StudentStatus.ACTIVE,
        deletedAt: null,
      },
      enrollment: {
        id: ENROLLMENT_ID,
        schoolId: SCHOOL_ID,
        studentId: STUDENT_ID,
        academicYearId: 'year-1',
        termId: TERM_ID,
        status: StudentEnrollmentStatus.ACTIVE,
        deletedAt: null,
      },
    };
  }

  function gradeItemRecord(
    overrides?: Partial<{
      id: string;
      score: number | null;
      status: GradeItemStatus;
      enrollmentId: string | null;
      enteredById: string | null;
      enteredAt: Date | null;
    }>,
  ) {
    return {
      id: overrides?.id ?? 'grade-item-1',
      schoolId: SCHOOL_ID,
      termId: TERM_ID,
      assessmentId: ASSESSMENT_ID,
      studentId: STUDENT_ID,
      enrollmentId:
        overrides?.enrollmentId === undefined
          ? ENROLLMENT_ID
          : overrides.enrollmentId,
      score:
        overrides?.score === undefined || overrides.score === null
          ? null
          : new Prisma.Decimal(overrides.score),
      status: overrides?.status ?? GradeItemStatus.ENTERED,
      comment: null,
      enteredById:
        overrides?.enteredById === undefined
          ? 'reviewer-1'
          : overrides.enteredById,
      enteredAt:
        overrides?.enteredAt === undefined
          ? new Date('2026-09-20T11:00:00.000Z')
          : overrides.enteredAt,
      createdAt: new Date('2026-09-20T11:00:00.000Z'),
      updatedAt: new Date('2026-09-20T11:00:00.000Z'),
    };
  }

  function repository(overrides?: Partial<Record<string, jest.Mock>>) {
    return {
      findSubmissionForGradeItemSync: jest
        .fn()
        .mockResolvedValue(submissionRecord()),
      findGradeItemForSubmission: jest.fn().mockResolvedValue(null),
      upsertGradeItemFromSubmission: jest.fn().mockImplementation((input) =>
        Promise.resolve(
          gradeItemRecord({
            score: input.score,
            status: input.status,
            enrollmentId: input.enrollmentId,
            enteredById: input.enteredById,
            enteredAt: input.enteredAt,
          }),
        ),
      ),
      ...overrides,
    } as unknown as jest.Mocked<GradesSubmissionGradeItemSyncRepository>;
  }

  function authRepository() {
    return {
      createAuditLog: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<AuthRepository>;
  }

  it('creates a GradeItem for a CORRECTED question-based submission', async () => {
    const repo = repository();
    const auth = authRepository();
    const useCase = new SyncGradeSubmissionToGradeItemUseCase(repo, auth);

    const result = await withGradesReviewScope(() =>
      useCase.execute(SUBMISSION_ID),
    );

    expect(repo.upsertGradeItemFromSubmission).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: SCHOOL_ID,
        termId: TERM_ID,
        assessmentId: ASSESSMENT_ID,
        studentId: STUDENT_ID,
        enrollmentId: ENROLLMENT_ID,
        score: 8,
        status: GradeItemStatus.ENTERED,
        enteredById: 'reviewer-1',
        enteredAt: expect.any(Date),
      }),
    );
    expect(result).toMatchObject({
      synced: true,
      idempotent: false,
      submission: {
        id: SUBMISSION_ID,
        totalScore: 8,
        maxScore: 10,
        status: 'corrected',
      },
      gradeItem: {
        assessmentId: ASSESSMENT_ID,
        studentId: STUDENT_ID,
        enrollmentId: ENROLLMENT_ID,
        score: 8,
        status: 'entered',
        enteredById: 'reviewer-1',
        enteredAt: expect.any(String),
      },
    });
  });

  it('updates an existing GradeItem and reports idempotency when it already matches', async () => {
    const existingEnteredAt = new Date('2026-09-19T08:00:00.000Z');
    const repo = repository({
      findGradeItemForSubmission: jest
        .fn()
        .mockResolvedValue(
          gradeItemRecord({ score: 8, enteredAt: existingEnteredAt }),
        ),
    });
    const useCase = new SyncGradeSubmissionToGradeItemUseCase(
      repo,
      authRepository(),
    );

    const result = await withGradesReviewScope(() =>
      useCase.execute(SUBMISSION_ID),
    );

    expect(repo.upsertGradeItemFromSubmission).toHaveBeenCalledWith(
      expect.objectContaining({
        score: 8,
        status: GradeItemStatus.ENTERED,
        enteredAt: existingEnteredAt,
      }),
    );
    expect(result.idempotent).toBe(true);
  });

  it('maps score from submission.totalScore, not percentage', async () => {
    const repo = repository({
      findSubmissionForGradeItemSync: jest.fn().mockResolvedValue(
        submissionRecord({
          totalScore: 8,
          maxScore: 10,
          assessmentMaxScore: 20,
        }),
      ),
    });
    const useCase = new SyncGradeSubmissionToGradeItemUseCase(
      repo,
      authRepository(),
    );

    await withGradesReviewScope(() => useCase.execute(SUBMISSION_ID));

    expect(repo.upsertGradeItemFromSubmission).toHaveBeenCalledWith(
      expect.objectContaining({ score: 8 }),
    );
  });

  it.each([
    GradeSubmissionStatus.IN_PROGRESS,
    GradeSubmissionStatus.SUBMITTED,
  ])('rejects %s submissions', async (status) => {
    const repo = repository({
      findSubmissionForGradeItemSync: jest
        .fn()
        .mockResolvedValue(submissionRecord({ status })),
    });
    const useCase = new SyncGradeSubmissionToGradeItemUseCase(
      repo,
      authRepository(),
    );

    await expect(
      withGradesReviewScope(() => useCase.execute(SUBMISSION_ID)),
    ).rejects.toMatchObject({ code: 'grades.submission.not_submitted' });
    expect(repo.upsertGradeItemFromSubmission).not.toHaveBeenCalled();
  });

  it('rejects SCORE_ONLY assessments', async () => {
    const repo = repository({
      findSubmissionForGradeItemSync: jest.fn().mockResolvedValue(
        submissionRecord({
          deliveryMode: GradeAssessmentDeliveryMode.SCORE_ONLY,
        }),
      ),
    });
    const useCase = new SyncGradeSubmissionToGradeItemUseCase(
      repo,
      authRepository(),
    );

    await expect(
      withGradesReviewScope(() => useCase.execute(SUBMISSION_ID)),
    ).rejects.toMatchObject({ code: 'validation.failed' });
  });

  it('rejects locked assessments', async () => {
    const repo = repository({
      findSubmissionForGradeItemSync: jest
        .fn()
        .mockResolvedValue(
          submissionRecord({ lockedAt: new Date('2026-09-20T08:00:00.000Z') }),
        ),
    });
    const useCase = new SyncGradeSubmissionToGradeItemUseCase(
      repo,
      authRepository(),
    );

    await expect(
      withGradesReviewScope(() => useCase.execute(SUBMISSION_ID)),
    ).rejects.toMatchObject({ code: 'grades.assessment.locked' });
  });

  it('rejects closed or inactive terms', async () => {
    const repo = repository({
      findSubmissionForGradeItemSync: jest
        .fn()
        .mockResolvedValue(submissionRecord({ termActive: false })),
    });
    const useCase = new SyncGradeSubmissionToGradeItemUseCase(
      repo,
      authRepository(),
    );

    await expect(
      withGradesReviewScope(() => useCase.execute(SUBMISSION_ID)),
    ).rejects.toMatchObject({ code: 'grades.term.closed' });
  });

  it.each([
    { totalScore: null, maxScore: 10 },
    { totalScore: 8, maxScore: null },
  ])('rejects missing score fields %#', async (scoreOverrides) => {
    const repo = repository({
      findSubmissionForGradeItemSync: jest
        .fn()
        .mockResolvedValue(submissionRecord(scoreOverrides)),
    });
    const useCase = new SyncGradeSubmissionToGradeItemUseCase(
      repo,
      authRepository(),
    );

    await expect(
      withGradesReviewScope(() => useCase.execute(SUBMISSION_ID)),
    ).rejects.toMatchObject({ code: 'validation.failed' });
    expect(repo.upsertGradeItemFromSubmission).not.toHaveBeenCalled();
  });

  it('does not mutate submission status, answers, or questions', async () => {
    const submission = {
      ...submissionRecord(),
      answers: [{ id: 'answer-1', awardedPoints: new Prisma.Decimal(8) }],
      assessment: {
        ...assessmentRecord(),
        questions: [{ id: 'question-1', points: new Prisma.Decimal(10) }],
      },
    };
    const before = JSON.stringify(submission);
    const repo = repository({
      findSubmissionForGradeItemSync: jest.fn().mockResolvedValue(submission),
    });
    const useCase = new SyncGradeSubmissionToGradeItemUseCase(
      repo,
      authRepository(),
    );

    await withGradesReviewScope(() => useCase.execute(SUBMISSION_ID));

    expect(JSON.stringify(submission)).toBe(before);
  });

  it('audits the sync with previous and new GradeItem state', async () => {
    const before = gradeItemRecord({ score: 5 });
    const repo = repository({
      findGradeItemForSubmission: jest.fn().mockResolvedValue(before),
    });
    const auth = authRepository();
    const useCase = new SyncGradeSubmissionToGradeItemUseCase(repo, auth);

    await withGradesReviewScope(() => useCase.execute(SUBMISSION_ID));

    expect(auth.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'grades.submission.grade_item.sync',
        resourceType: 'grade_submission',
        resourceId: SUBMISSION_ID,
        outcome: AuditOutcome.SUCCESS,
        before: expect.objectContaining({
          gradeItem: expect.objectContaining({ score: 5 }),
        }),
        after: expect.objectContaining({
          submission: expect.objectContaining({ totalScore: 8 }),
          gradeItem: expect.objectContaining({
            score: 8,
            status: GradeItemStatus.ENTERED,
          }),
        }),
      }),
    );
  });
});
