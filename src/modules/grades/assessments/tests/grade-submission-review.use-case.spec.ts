import {
  GradeAnswerCorrectionStatus,
  GradeAssessmentApprovalStatus,
  GradeAssessmentDeliveryMode,
  GradeQuestionType,
  GradeScopeType,
  GradeSubmissionStatus,
  Prisma,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../../common/context/request-context';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { BulkReviewGradeSubmissionAnswersUseCase } from '../application/bulk-review-grade-submission-answers.use-case';
import { FinalizeGradeSubmissionReviewUseCase } from '../application/finalize-grade-submission-review.use-case';
import { ReviewGradeSubmissionAnswerUseCase } from '../application/review-grade-submission-answer.use-case';
import {
  AnswerReviewUpdateInput,
  FinalizeSubmissionInput,
  GradesSubmissionsRepository,
} from '../infrastructure/grades-submissions.repository';

const SCHOOL_ID = 'school-1';
const ASSESSMENT_ID = 'assessment-1';
const SUBMISSION_ID = 'submission-1';
const STUDENT_ID = 'student-1';
const ENROLLMENT_ID = 'enrollment-1';
const QUESTION_ID = 'question-1';
const QUESTION_TWO_ID = 'question-2';
const ANSWER_ID = 'answer-1';
const ANSWER_TWO_ID = 'answer-2';
const OPTION_ID = 'option-1';

describe('grade submission review use cases', () => {
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
      termId: 'term-1',
      subjectId: 'subject-1',
      scopeType: GradeScopeType.GRADE,
      scopeKey: 'grade-1',
      stageId: 'stage-1',
      gradeId: 'grade-1',
      sectionId: null,
      classroomId: null,
      titleEn: 'Quiz 1',
      titleAr: null,
      deliveryMode:
        overrides?.deliveryMode ?? GradeAssessmentDeliveryMode.QUESTION_BASED,
      approvalStatus:
        overrides?.approvalStatus ?? GradeAssessmentApprovalStatus.PUBLISHED,
      lockedAt: overrides?.lockedAt ?? null,
      maxScore: new Prisma.Decimal(overrides?.maxScore ?? 10),
      deletedAt: null,
      term: {
        id: 'term-1',
        academicYearId: 'year-1',
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2026-12-31T00:00:00.000Z'),
        isActive: overrides?.termActive ?? true,
      },
    };
  }

  function enrollmentRecord() {
    return {
      id: ENROLLMENT_ID,
      schoolId: SCHOOL_ID,
      studentId: STUDENT_ID,
      academicYearId: 'year-1',
      termId: 'term-1',
      classroomId: 'classroom-1',
      status: 'ACTIVE',
      enrolledAt: new Date('2026-09-01T00:00:00.000Z'),
      endedAt: null,
      classroom: {
        id: 'classroom-1',
        nameAr: null,
        nameEn: 'Classroom A',
        sectionId: 'section-1',
        section: {
          id: 'section-1',
          nameAr: null,
          nameEn: 'Section A',
          gradeId: 'grade-1',
          grade: {
            id: 'grade-1',
            nameAr: null,
            nameEn: 'Grade 1',
            stageId: 'stage-1',
          },
        },
      },
    };
  }

  function questionRecord(
    overrides?: Partial<{
      id: string;
      type: GradeQuestionType;
      points: number;
      required: boolean;
    }>,
  ) {
    const id = overrides?.id ?? QUESTION_ID;

    return {
      id,
      schoolId: SCHOOL_ID,
      assessmentId: ASSESSMENT_ID,
      type: overrides?.type ?? GradeQuestionType.MCQ_SINGLE,
      prompt: 'Prompt',
      promptAr: null,
      points: new Prisma.Decimal(overrides?.points ?? 5),
      sortOrder: id === QUESTION_ID ? 1 : 2,
      required: overrides?.required ?? true,
      deletedAt: null,
      options: [
        {
          id: OPTION_ID,
          questionId: id,
          label: 'A',
          labelAr: null,
          value: 'a',
          sortOrder: 1,
          deletedAt: null,
        },
      ],
    };
  }

  function answerRecord(
    overrides?: Partial<{
      id: string;
      submissionId: string;
      questionId: string;
      type: GradeQuestionType;
      correctionStatus: GradeAnswerCorrectionStatus;
      awardedPoints: number | null;
      maxPoints: number | null;
      reviewedById: string | null;
      reviewedAt: Date | null;
      reviewerComment: string | null;
      reviewerCommentAr: string | null;
      questionDeletedAt: Date | null;
    }>,
  ) {
    const id = overrides?.id ?? ANSWER_ID;
    const questionId = overrides?.questionId ?? QUESTION_ID;

    return {
      id,
      schoolId: SCHOOL_ID,
      submissionId: overrides?.submissionId ?? SUBMISSION_ID,
      assessmentId: ASSESSMENT_ID,
      questionId,
      studentId: STUDENT_ID,
      answerText: null,
      answerJson: null,
      correctionStatus:
        overrides?.correctionStatus ?? GradeAnswerCorrectionStatus.PENDING,
      awardedPoints:
        overrides?.awardedPoints === undefined
          ? null
          : overrides.awardedPoints === null
            ? null
            : new Prisma.Decimal(overrides.awardedPoints),
      maxPoints:
        overrides?.maxPoints === undefined
          ? new Prisma.Decimal(5)
          : overrides.maxPoints === null
            ? null
            : new Prisma.Decimal(overrides.maxPoints),
      reviewerComment: overrides?.reviewerComment ?? null,
      reviewerCommentAr: overrides?.reviewerCommentAr ?? null,
      reviewedById: overrides?.reviewedById ?? null,
      reviewedAt: overrides?.reviewedAt ?? null,
      createdAt: new Date('2026-09-10T08:00:00.000Z'),
      updatedAt: new Date('2026-09-10T08:00:00.000Z'),
      question: {
        id: questionId,
        assessmentId: ASSESSMENT_ID,
        type: overrides?.type ?? GradeQuestionType.MCQ_SINGLE,
        points: new Prisma.Decimal(5),
        required: true,
        deletedAt: overrides?.questionDeletedAt ?? null,
      },
      selectedOptions: [
        {
          schoolId: SCHOOL_ID,
          answerId: id,
          optionId: OPTION_ID,
          createdAt: new Date('2026-09-10T08:00:00.000Z'),
          option: {
            id: OPTION_ID,
            questionId,
            label: 'A',
            labelAr: null,
            value: 'a',
            deletedAt: null,
          },
        },
      ],
    };
  }

  function submissionRecord(
    overrides?: Partial<{
      status: GradeSubmissionStatus;
      assessment: ReturnType<typeof assessmentRecord>;
      answers: ReturnType<typeof answerRecord>[];
      totalScore: number | null;
      maxScore: number | null;
      reviewedById: string | null;
      correctedAt: Date | null;
    }>,
  ) {
    return {
      id: SUBMISSION_ID,
      schoolId: SCHOOL_ID,
      assessmentId: ASSESSMENT_ID,
      termId: 'term-1',
      studentId: STUDENT_ID,
      enrollmentId: ENROLLMENT_ID,
      status: overrides?.status ?? GradeSubmissionStatus.SUBMITTED,
      startedAt: new Date('2026-09-10T08:00:00.000Z'),
      submittedAt: new Date('2026-09-10T09:00:00.000Z'),
      correctedAt: overrides?.correctedAt ?? null,
      reviewedById: overrides?.reviewedById ?? null,
      totalScore:
        overrides?.totalScore === undefined || overrides.totalScore === null
          ? null
          : new Prisma.Decimal(overrides.totalScore),
      maxScore:
        overrides?.maxScore === undefined
          ? new Prisma.Decimal(10)
          : overrides.maxScore === null
            ? null
            : new Prisma.Decimal(overrides.maxScore),
      metadata: null,
      createdAt: new Date('2026-09-10T08:00:00.000Z'),
      updatedAt: new Date('2026-09-10T08:00:00.000Z'),
      assessment: overrides?.assessment ?? assessmentRecord(),
      student: {
        id: STUDENT_ID,
        firstName: 'Ahmed',
        lastName: 'Ali',
        status: 'ACTIVE',
      },
      enrollment: enrollmentRecord(),
      answers: overrides?.answers ?? [answerRecord()],
    };
  }

  function reviewedAnswerFromInput(
    input: AnswerReviewUpdateInput,
    base = answerRecord({ id: input.answerId }),
  ) {
    return {
      ...base,
      awardedPoints: input.awardedPoints,
      correctionStatus: input.correctionStatus,
      reviewerComment: input.reviewerComment,
      reviewerCommentAr: input.reviewerCommentAr,
      reviewedById: input.reviewedById,
      reviewedAt: input.reviewedAt,
    };
  }

  function finalizedSubmissionFromInput(
    input: FinalizeSubmissionInput,
    base = submissionRecord(),
  ) {
    return {
      ...base,
      status: input.status,
      correctedAt: input.correctedAt,
      reviewedById: input.reviewedById,
      totalScore: input.totalScore,
      maxScore: input.maxScore,
    };
  }

  function questionsForReview() {
    return [
      questionRecord({ id: QUESTION_ID, type: GradeQuestionType.MCQ_SINGLE }),
      questionRecord({
        id: QUESTION_TWO_ID,
        type: GradeQuestionType.SHORT_ANSWER,
      }),
    ];
  }

  function baseRepository(overrides?: Partial<Record<string, jest.Mock>>) {
    const answers = [
      answerRecord(),
      answerRecord({
        id: ANSWER_TWO_ID,
        questionId: QUESTION_TWO_ID,
        type: GradeQuestionType.SHORT_ANSWER,
      }),
    ];

    return {
      findSubmissionForReview: jest
        .fn()
        .mockResolvedValue(submissionRecord({ answers })),
      findAnswerForReview: jest.fn().mockResolvedValue(answers[0]),
      findAnswersForBulkReview: jest.fn().mockResolvedValue(answers),
      updateAnswerReview: jest
        .fn()
        .mockImplementation((input: AnswerReviewUpdateInput) =>
          Promise.resolve(reviewedAnswerFromInput(input)),
        ),
      bulkUpdateAnswerReviews: jest
        .fn()
        .mockImplementation((inputs: AnswerReviewUpdateInput[]) =>
          Promise.resolve(
            inputs.map((input) =>
              reviewedAnswerFromInput(
                input,
                answers.find((answer) => answer.id === input.answerId),
              ),
            ),
          ),
        ),
      listActiveQuestionsForSubmission: jest
        .fn()
        .mockResolvedValue(questionsForReview()),
      finalizeSubmission: jest
        .fn()
        .mockImplementation((input: FinalizeSubmissionInput) =>
          Promise.resolve(finalizedSubmissionFromInput(input)),
        ),
      countGradeItemsForAssessment: jest.fn().mockResolvedValue(0),
      ...overrides,
    } as unknown as jest.Mocked<GradesSubmissionsRepository>;
  }

  function authRepository() {
    return {
      createAuditLog: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<AuthRepository>;
  }

  it('single review succeeds for a SUBMITTED submission and sets review fields', async () => {
    const repository = baseRepository();
    const auth = authRepository();
    const useCase = new ReviewGradeSubmissionAnswerUseCase(repository, auth);

    const result = await withGradesReviewScope(() =>
      useCase.execute(SUBMISSION_ID, ANSWER_ID, {
        awardedPoints: 4,
        reviewerComment: 'Good work',
      }),
    );

    expect(repository.updateAnswerReview).toHaveBeenCalledWith(
      expect.objectContaining({
        answerId: ANSWER_ID,
        submissionId: SUBMISSION_ID,
        awardedPoints: expect.any(Prisma.Decimal),
        correctionStatus: GradeAnswerCorrectionStatus.CORRECTED,
        reviewerComment: 'Good work',
        reviewedById: 'reviewer-1',
        reviewedAt: expect.any(Date),
      }),
    );
    expect(result).toMatchObject({
      id: ANSWER_ID,
      awardedPoints: 4,
      correctionStatus: 'corrected',
      reviewerComment: 'Good work',
      reviewedAt: expect.any(String),
      reviewedById: 'reviewer-1',
    });
    expect(auth.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'grades.submission.answer.review',
        before: expect.objectContaining({ awardedPoints: null }),
        after: expect.objectContaining({ awardedPoints: 4 }),
      }),
    );
  });

  it('single review rejects IN_PROGRESS submission', async () => {
    const repository = baseRepository({
      findSubmissionForReview: jest
        .fn()
        .mockResolvedValue(
          submissionRecord({ status: GradeSubmissionStatus.IN_PROGRESS }),
        ),
    });
    const useCase = new ReviewGradeSubmissionAnswerUseCase(
      repository,
      authRepository(),
    );

    await expect(
      withGradesReviewScope(() =>
        useCase.execute(SUBMISSION_ID, ANSWER_ID, { awardedPoints: 4 }),
      ),
    ).rejects.toMatchObject({ code: 'grades.submission.not_submitted' });
    expect(repository.updateAnswerReview).not.toHaveBeenCalled();
  });

  it('single review rejects already CORRECTED submission', async () => {
    const repository = baseRepository({
      findSubmissionForReview: jest
        .fn()
        .mockResolvedValue(
          submissionRecord({ status: GradeSubmissionStatus.CORRECTED }),
        ),
    });
    const useCase = new ReviewGradeSubmissionAnswerUseCase(
      repository,
      authRepository(),
    );

    await expect(
      withGradesReviewScope(() =>
        useCase.execute(SUBMISSION_ID, ANSWER_ID, { awardedPoints: 4 }),
      ),
    ).rejects.toMatchObject({ code: 'grades.review.already_finalized' });
  });

  it('single review rejects locked assessment', async () => {
    const repository = baseRepository({
      findSubmissionForReview: jest.fn().mockResolvedValue(
        submissionRecord({
          assessment: assessmentRecord({ lockedAt: new Date() }),
        }),
      ),
    });
    const useCase = new ReviewGradeSubmissionAnswerUseCase(
      repository,
      authRepository(),
    );

    await expect(
      withGradesReviewScope(() =>
        useCase.execute(SUBMISSION_ID, ANSWER_ID, { awardedPoints: 4 }),
      ),
    ).rejects.toMatchObject({ code: 'grades.assessment.locked' });
  });

  it('single review rejects closed/inactive term', async () => {
    const repository = baseRepository({
      findSubmissionForReview: jest.fn().mockResolvedValue(
        submissionRecord({
          assessment: assessmentRecord({ termActive: false }),
        }),
      ),
    });
    const useCase = new ReviewGradeSubmissionAnswerUseCase(
      repository,
      authRepository(),
    );

    await expect(
      withGradesReviewScope(() =>
        useCase.execute(SUBMISSION_ID, ANSWER_ID, { awardedPoints: 4 }),
      ),
    ).rejects.toMatchObject({ code: 'grades.term.closed' });
  });

  it('single review rejects awardedPoints outside the answer max points', async () => {
    const repository = baseRepository();
    const useCase = new ReviewGradeSubmissionAnswerUseCase(
      repository,
      authRepository(),
    );

    await expect(
      withGradesReviewScope(() =>
        useCase.execute(SUBMISSION_ID, ANSWER_ID, { awardedPoints: 6 }),
      ),
    ).rejects.toMatchObject({ code: 'validation.failed' });

    await expect(
      withGradesReviewScope(() =>
        useCase.execute(SUBMISSION_ID, ANSWER_ID, { awardedPoints: -1 }),
      ),
    ).rejects.toMatchObject({ code: 'validation.failed' });
  });

  it('single review rejects answer from another submission', async () => {
    const repository = baseRepository({
      findAnswerForReview: jest
        .fn()
        .mockResolvedValue(answerRecord({ submissionId: 'submission-other' })),
    });
    const useCase = new ReviewGradeSubmissionAnswerUseCase(
      repository,
      authRepository(),
    );

    await expect(
      withGradesReviewScope(() =>
        useCase.execute(SUBMISSION_ID, ANSWER_ID, { awardedPoints: 4 }),
      ),
    ).rejects.toMatchObject({ code: 'not_found' });
    expect(repository.updateAnswerReview).not.toHaveBeenCalled();
  });

  it('bulk review succeeds all-or-nothing and audits once', async () => {
    const repository = baseRepository();
    const auth = authRepository();
    const useCase = new BulkReviewGradeSubmissionAnswersUseCase(
      repository,
      auth,
    );

    const result = await withGradesReviewScope(() =>
      useCase.execute(SUBMISSION_ID, {
        reviews: [
          { answerId: ANSWER_ID, awardedPoints: 4 },
          { answerId: ANSWER_TWO_ID, awardedPoints: 5 },
        ],
      }),
    );

    expect(result.reviewedCount).toBe(2);
    expect(repository.bulkUpdateAnswerReviews).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ answerId: ANSWER_ID }),
        expect.objectContaining({ answerId: ANSWER_TWO_ID }),
      ]),
    );
    expect(auth.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'grades.submission.answers.bulk_review',
        after: expect.objectContaining({
          reviewedCount: 2,
          answerIds: [ANSWER_ID, ANSWER_TWO_ID],
        }),
      }),
    );
  });

  it('bulk review rejects duplicate answerIds', async () => {
    const repository = baseRepository();
    const useCase = new BulkReviewGradeSubmissionAnswersUseCase(
      repository,
      authRepository(),
    );

    await expect(
      withGradesReviewScope(() =>
        useCase.execute(SUBMISSION_ID, {
          reviews: [
            { answerId: ANSWER_ID, awardedPoints: 4 },
            { answerId: ANSWER_ID, awardedPoints: 5 },
          ],
        }),
      ),
    ).rejects.toMatchObject({ code: 'validation.failed' });
    expect(repository.bulkUpdateAnswerReviews).not.toHaveBeenCalled();
  });

  it('bulk review rejects invalid awardedPoints and writes nothing', async () => {
    const repository = baseRepository();
    const useCase = new BulkReviewGradeSubmissionAnswersUseCase(
      repository,
      authRepository(),
    );

    await expect(
      withGradesReviewScope(() =>
        useCase.execute(SUBMISSION_ID, {
          reviews: [
            { answerId: ANSWER_ID, awardedPoints: 4 },
            { answerId: ANSWER_TWO_ID, awardedPoints: 8 },
          ],
        }),
      ),
    ).rejects.toMatchObject({ code: 'validation.failed' });
    expect(repository.bulkUpdateAnswerReviews).not.toHaveBeenCalled();
  });

  it('finalize succeeds when all required answers are corrected and calculates score', async () => {
    const correctedAnswers = [
      answerRecord({
        correctionStatus: GradeAnswerCorrectionStatus.CORRECTED,
        awardedPoints: 4,
      }),
      answerRecord({
        id: ANSWER_TWO_ID,
        questionId: QUESTION_TWO_ID,
        type: GradeQuestionType.SHORT_ANSWER,
        correctionStatus: GradeAnswerCorrectionStatus.CORRECTED,
        awardedPoints: 5,
      }),
    ];
    const repository = baseRepository({
      findSubmissionForReview: jest
        .fn()
        .mockResolvedValue(submissionRecord({ answers: correctedAnswers })),
    });
    const auth = authRepository();
    const useCase = new FinalizeGradeSubmissionReviewUseCase(repository, auth);

    const result = await withGradesReviewScope(() =>
      useCase.execute(SUBMISSION_ID),
    );

    expect(repository.finalizeSubmission).toHaveBeenCalledWith(
      expect.objectContaining({
        submissionId: SUBMISSION_ID,
        status: GradeSubmissionStatus.CORRECTED,
        reviewedById: 'reviewer-1',
        correctedAt: expect.any(Date),
        totalScore: expect.any(Prisma.Decimal),
        maxScore: expect.any(Prisma.Decimal),
      }),
    );
    const finalizeInput = (repository.finalizeSubmission as jest.Mock).mock
      .calls[0][0] as FinalizeSubmissionInput;
    expect(finalizeInput.totalScore.toNumber()).toBe(9);
    expect(finalizeInput.maxScore.toNumber()).toBe(10);
    expect(result).toMatchObject({
      status: 'corrected',
      correctedAt: expect.any(String),
      reviewedById: 'reviewer-1',
      totalScore: 9,
      maxScore: 10,
    });
    expect(auth.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'grades.submission.review.finalize',
        before: expect.objectContaining({ status: GradeSubmissionStatus.SUBMITTED }),
        after: expect.objectContaining({
          status: GradeSubmissionStatus.CORRECTED,
          totalScore: 9,
        }),
      }),
    );
  });

  it('finalize rejects when a required answer is missing', async () => {
    const repository = baseRepository({
      findSubmissionForReview: jest.fn().mockResolvedValue(
        submissionRecord({
          answers: [
            answerRecord({
              correctionStatus: GradeAnswerCorrectionStatus.CORRECTED,
              awardedPoints: 4,
            }),
          ],
        }),
      ),
    });
    const useCase = new FinalizeGradeSubmissionReviewUseCase(
      repository,
      authRepository(),
    );

    await expect(
      withGradesReviewScope(() => useCase.execute(SUBMISSION_ID)),
    ).rejects.toMatchObject({ code: 'grades.review.pending_answers' });
    expect(repository.finalizeSubmission).not.toHaveBeenCalled();
  });

  it('finalize rejects when any required answer is not corrected', async () => {
    const repository = baseRepository({
      findSubmissionForReview: jest.fn().mockResolvedValue(
        submissionRecord({
          answers: [
            answerRecord({
              correctionStatus: GradeAnswerCorrectionStatus.CORRECTED,
              awardedPoints: 4,
            }),
            answerRecord({
              id: ANSWER_TWO_ID,
              questionId: QUESTION_TWO_ID,
              type: GradeQuestionType.SHORT_ANSWER,
              correctionStatus: GradeAnswerCorrectionStatus.PENDING,
              awardedPoints: null,
            }),
          ],
        }),
      ),
    });
    const useCase = new FinalizeGradeSubmissionReviewUseCase(
      repository,
      authRepository(),
    );

    await expect(
      withGradesReviewScope(() => useCase.execute(SUBMISSION_ID)),
    ).rejects.toMatchObject({ code: 'grades.review.pending_answers' });
  });

  it('finalize rejects IN_PROGRESS and already CORRECTED submissions', async () => {
    const inProgressRepository = baseRepository({
      findSubmissionForReview: jest
        .fn()
        .mockResolvedValue(
          submissionRecord({ status: GradeSubmissionStatus.IN_PROGRESS }),
        ),
    });
    const correctedRepository = baseRepository({
      findSubmissionForReview: jest
        .fn()
        .mockResolvedValue(
          submissionRecord({ status: GradeSubmissionStatus.CORRECTED }),
        ),
    });

    await expect(
      withGradesReviewScope(() =>
        new FinalizeGradeSubmissionReviewUseCase(
          inProgressRepository,
          authRepository(),
        ).execute(SUBMISSION_ID),
      ),
    ).rejects.toMatchObject({ code: 'grades.submission.not_submitted' });

    await expect(
      withGradesReviewScope(() =>
        new FinalizeGradeSubmissionReviewUseCase(
          correctedRepository,
          authRepository(),
        ).execute(SUBMISSION_ID),
      ),
    ).rejects.toMatchObject({ code: 'grades.review.already_finalized' });
  });

  it('review and finalize do not create or update GradeItems', async () => {
    const correctedAnswers = [
      answerRecord({
        correctionStatus: GradeAnswerCorrectionStatus.CORRECTED,
        awardedPoints: 4,
      }),
      answerRecord({
        id: ANSWER_TWO_ID,
        questionId: QUESTION_TWO_ID,
        type: GradeQuestionType.SHORT_ANSWER,
        correctionStatus: GradeAnswerCorrectionStatus.CORRECTED,
        awardedPoints: 5,
      }),
    ];
    const repository = baseRepository({
      findSubmissionForReview: jest
        .fn()
        .mockResolvedValue(submissionRecord({ answers: correctedAnswers })),
    });

    await withGradesReviewScope(() =>
      new ReviewGradeSubmissionAnswerUseCase(
        repository,
        authRepository(),
      ).execute(SUBMISSION_ID, ANSWER_ID, { awardedPoints: 4 }),
    );
    await withGradesReviewScope(() =>
      new FinalizeGradeSubmissionReviewUseCase(
        repository,
        authRepository(),
      ).execute(SUBMISSION_ID),
    );

    expect(repository.countGradeItemsForAssessment).not.toHaveBeenCalled();
  });
});
