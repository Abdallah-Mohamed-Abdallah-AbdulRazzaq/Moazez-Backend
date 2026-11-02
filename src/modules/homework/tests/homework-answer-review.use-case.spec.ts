import {
  HomeworkAssignmentStatus,
  HomeworkQuestionType,
  HomeworkSubmissionStatus,
  HomeworkTargetStatus,
  UserType,
  Prisma,
} from '@prisma/client';
import type {
  HomeworkRepository,
  HomeworkReviewSubmissionRecord,
} from '../infrastructure/homework.repository';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../common/context/request-context';
import { DomainException } from '../../../common/exceptions/domain-exception';
import {
  BulkReviewHomeworkSubmissionAnswersUseCase,
  ReviewHomeworkSubmissionAnswerUseCase,
} from '../application/homework-answer-review.use-cases';
import { ReviewHomeworkSubmissionUseCase } from '../application/homework-submissions.use-cases';

describe('Homework answer review use cases', () => {
  async function withTeacherScope<T>(testFn: () => Promise<T>): Promise<T> {
    return runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: 'teacher-user-1', userType: UserType.TEACHER });
      setActiveMembership({
        membershipId: 'membership-1',
        organizationId: 'org-1',
        schoolId: 'school-1',
        roleId: 'role-1',
        permissions: [],
      });

      return testFn();
    });
  }

  function createRepository(overrides?: Record<string, unknown>): any {
    const submission = seedReviewSubmission({
      answers: [seedAnswer()],
    });
    const auditTransaction = {} as Prisma.TransactionClient;
    const audited = async (
      input: Pick<
        Parameters<HomeworkRepository['reviewSubmission']>[0],
        'audit'
      >,
      current: unknown,
    ) => {
      await input.audit(
        current as HomeworkReviewSubmissionRecord,
        auditTransaction,
      );
      return { outcome: 'reviewed', submission: current };
    };

    return {
      auditTransaction,
      findSubmissionForAnswerReview: jest.fn().mockResolvedValue(submission),
      reviewSubmissionAnswers: jest
        .fn()
        .mockImplementation(
          async (
            input: Parameters<HomeworkRepository['reviewSubmissionAnswers']>[0],
          ) =>
            audited(
              input,
              seedReviewSubmission({
                awardedMarks: input.awardedMarks,
                answers: submission.answers.map((answer: any) => {
                  const review = input.reviews.find(
                    (item: any) => item.answerId === answer.id,
                  );
                  return review
                    ? {
                        ...answer,
                        awardedPoints: review.awardedPoints,
                        teacherComment: review.teacherComment,
                        reviewedAt: review.reviewedAt,
                        reviewedByUserId: review.reviewedByUserId,
                      }
                    : answer;
                }),
              }),
            ),
        ),
      findReviewableSubmission: jest.fn().mockResolvedValue(submission),
      reviewSubmission: jest
        .fn()
        .mockImplementation(
          async (
            input: Parameters<HomeworkRepository['reviewSubmission']>[0],
          ) =>
            audited(
              input,
              seedReviewSubmission({
                status: HomeworkSubmissionStatus.REVIEWED,
                awardedMarks: input.awardedMarks,
                reviewNote: input.reviewNote,
                reviewedAt: input.reviewedAt,
                reviewedByUserId: input.reviewedByUserId,
                answers: submission.answers,
              }),
            ),
        ),
      ...overrides,
    };
  }

  function createAuthRepository(): any {
    return { createAuditLog: jest.fn().mockResolvedValue(undefined) };
  }

  it('distinguishes omitted review properties from own undefined, null and zero commands', async () => {
    const cases = [
      {
        review: {},
        points: 1,
        comment: 'Retained',
        pointsPresent: false,
        commentPresent: false,
      },
      {
        review: { awardedPoints: undefined, teacherComment: undefined },
        points: null,
        comment: null,
        pointsPresent: true,
        commentPresent: true,
      },
      {
        review: { awardedPoints: null, teacherComment: null },
        points: null,
        comment: null,
        pointsPresent: true,
        commentPresent: true,
      },
      {
        review: { awardedPoints: 0, teacherComment: '  ' },
        points: 0,
        comment: null,
        pointsPresent: true,
        commentPresent: true,
      },
    ];
    for (const example of cases) {
      const snapshot = seedReviewSubmission({
        answers: [seedAnswer({ awardedPoints: 1, teacherComment: 'Retained' })],
      });
      const repository = createRepository({
        findSubmissionForAnswerReview: jest.fn().mockResolvedValue(snapshot),
      }) as HomeworkRepository;
      const auth = createAuthRepository() as ConstructorParameters<
        typeof ReviewHomeworkSubmissionAnswerUseCase
      >[1];
      const useCase = new ReviewHomeworkSubmissionAnswerUseCase(
        repository,
        auth,
      );
      const write = jest.spyOn(repository, 'reviewSubmissionAnswers');
      await withTeacherScope(() =>
        useCase.execute({
          homeworkId: 'homework-1',
          submissionId: 'submission-1',
          answerId: 'answer-1',
          review: example.review,
        }),
      );
      expect(write).toHaveBeenCalledWith(
        expect.objectContaining({
          reviews: [
            expect.objectContaining({
              awardedPoints: example.points,
              teacherComment: example.comment,
              awardedPointsChanged: example.pointsPresent,
              teacherCommentChanged: example.commentPresent,
            }),
          ],
        }),
      );
    }
  });

  it('lets a teacher review one answer and recomputes the submission score', async () => {
    const repository = createRepository();
    const authRepository = createAuthRepository();
    const useCase = new ReviewHomeworkSubmissionAnswerUseCase(
      repository,
      authRepository,
    );

    const response = await withTeacherScope(() =>
      useCase.execute({
        homeworkId: 'homework-1',
        submissionId: 'submission-1',
        answerId: 'answer-1',
        reviewedByUserId: 'teacher-user-1',
        review: {
          awardedPoints: 2,
          teacherComment: '  Clear answer  ',
        },
      }),
    );

    expect(repository.reviewSubmissionAnswers).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: 'school-1',
        homeworkAssignmentId: 'homework-1',
        submissionId: 'submission-1',
        awardedMarks: 2,
        reviews: [
          expect.objectContaining({
            answerId: 'answer-1',
            homeworkQuestionId: 'question-1',
            awardedPoints: 2,
            teacherComment: 'Clear answer',
            reviewedByUserId: 'teacher-user-1',
          }),
        ],
      }),
    );
    expect(response.answer).toMatchObject({
      answerId: 'answer-1',
      awardedPoints: 2,
      teacherComment: 'Clear answer',
      reviewedAt: expect.any(String),
    });
    expect(authRepository.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'homework.answer_review.review',
        resourceType: 'homework_submission_answer',
      }),
      (repository as { auditTransaction: Prisma.TransactionClient })
        .auditTransaction,
    );
  });

  it('rejects awarded points that exceed question points', async () => {
    const repository = createRepository();
    const useCase = new ReviewHomeworkSubmissionAnswerUseCase(
      repository,
      createAuthRepository(),
    );

    await expect(
      withTeacherScope(() =>
        useCase.execute({
          homeworkId: 'homework-1',
          submissionId: 'submission-1',
          answerId: 'answer-1',
          review: { awardedPoints: 3 },
        }),
      ),
    ).rejects.toMatchObject<Partial<DomainException>>({
      code: 'homework.answer_review.exceeds_question_points',
    });
    expect(repository.reviewSubmissionAnswers).not.toHaveBeenCalled();
  });

  it('rejects negative awarded points', async () => {
    const repository = createRepository();
    const useCase = new ReviewHomeworkSubmissionAnswerUseCase(
      repository,
      createAuthRepository(),
    );

    await expect(
      withTeacherScope(() =>
        useCase.execute({
          homeworkId: 'homework-1',
          submissionId: 'submission-1',
          answerId: 'answer-1',
          review: { awardedPoints: -1 },
        }),
      ),
    ).rejects.toMatchObject<Partial<DomainException>>({
      code: 'homework.answer_review.invalid_points',
    });
    expect(repository.reviewSubmissionAnswers).not.toHaveBeenCalled();
  });

  it('rejects reviewing an answer from another submission', async () => {
    const repository = createRepository();
    const useCase = new ReviewHomeworkSubmissionAnswerUseCase(
      repository,
      createAuthRepository(),
    );

    await expect(
      withTeacherScope(() =>
        useCase.execute({
          homeworkId: 'homework-1',
          submissionId: 'submission-1',
          answerId: 'answer-from-other-submission',
          review: { awardedPoints: 1 },
        }),
      ),
    ).rejects.toMatchObject<Partial<DomainException>>({
      code: 'homework.answer_review.not_found',
    });
    expect(repository.reviewSubmissionAnswers).not.toHaveBeenCalled();
  });

  it('rejects draft submissions before answer review', async () => {
    const repository = createRepository({
      findSubmissionForAnswerReview: jest
        .fn()
        .mockResolvedValue(
          seedReviewSubmission({ status: HomeworkSubmissionStatus.DRAFT }),
        ),
    });
    const useCase = new ReviewHomeworkSubmissionAnswerUseCase(
      repository,
      createAuthRepository(),
    );

    await expect(
      withTeacherScope(() =>
        useCase.execute({
          homeworkId: 'homework-1',
          submissionId: 'submission-1',
          answerId: 'answer-1',
          review: { awardedPoints: 1 },
        }),
      ),
    ).rejects.toMatchObject<Partial<DomainException>>({
      code: 'homework.answer_review.not_submitted',
    });
    expect(repository.reviewSubmissionAnswers).not.toHaveBeenCalled();
  });

  it('rejects invalid bulk review atomically', async () => {
    const repository = createRepository();
    const useCase = new BulkReviewHomeworkSubmissionAnswersUseCase(
      repository,
      createAuthRepository(),
    );

    await expect(
      withTeacherScope(() =>
        useCase.execute({
          homeworkId: 'homework-1',
          submissionId: 'submission-1',
          reviews: [
            { answerId: 'answer-1', awardedPoints: 1 },
            { answerId: 'answer-other', awardedPoints: 1 },
          ],
        }),
      ),
    ).rejects.toMatchObject<Partial<DomainException>>({
      code: 'homework.answer_review.invalid_scope',
    });
    expect(repository.reviewSubmissionAnswers).not.toHaveBeenCalled();
  });

  it('rolls up submission awarded marks from all reviewed answers', async () => {
    const repository = createRepository({
      findSubmissionForAnswerReview: jest.fn().mockResolvedValue(
        seedReviewSubmission({
          answers: [
            seedAnswer({ id: 'answer-1', awardedPoints: null }),
            seedAnswer({
              id: 'answer-2',
              homeworkQuestionId: 'question-2',
              awardedPoints: { toNumber: () => 1 },
              homeworkQuestion: seedQuestion({ id: 'question-2', points: 2 }),
            }),
          ],
        }),
      ),
    });
    const useCase = new ReviewHomeworkSubmissionAnswerUseCase(
      repository,
      createAuthRepository(),
    );

    await withTeacherScope(() =>
      useCase.execute({
        homeworkId: 'homework-1',
        submissionId: 'submission-1',
        answerId: 'answer-1',
        review: { awardedPoints: 2 },
      }),
    );

    expect(repository.reviewSubmissionAnswers).toHaveBeenCalledWith(
      expect.objectContaining({ awardedMarks: 3 }),
    );
  });

  it('finalizes a question submission using reviewed answer rollup', async () => {
    const submission = seedReviewSubmission({
      answers: [
        seedAnswer({
          awardedPoints: { toNumber: () => 2 },
          reviewedAt: new Date('2026-05-26T10:30:00.000Z'),
        }),
      ],
    });
    const repository = createRepository({
      findReviewableSubmission: jest.fn().mockResolvedValue(submission),
    });
    const authRepository = createAuthRepository();
    const useCase = new ReviewHomeworkSubmissionUseCase(
      repository,
      authRepository,
    );

    await withTeacherScope(() =>
      useCase.execute({
        homeworkId: 'homework-1',
        submissionId: 'submission-1',
        reviewedByUserId: 'teacher-user-1',
        reviewNote: 'Ready',
      }),
    );

    expect(repository.reviewSubmission).toHaveBeenCalledWith(
      expect.objectContaining({
        awardedMarks: 2,
        reviewNote: 'Ready',
      }),
    );
    expect(authRepository.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'homework.submission.review' }),
      (repository as { auditTransaction: Prisma.TransactionClient })
        .auditTransaction,
    );
  });

  it('keeps assignment-level review working for text-only homework', async () => {
    const repository = createRepository({
      findReviewableSubmission: jest.fn().mockResolvedValue(
        seedReviewSubmission({
          answers: [],
          homeworkAssignment: {
            ...seedReviewSubmission().homeworkAssignment,
            questions: [],
          },
        }),
      ),
    });
    const useCase = new ReviewHomeworkSubmissionUseCase(
      repository,
      createAuthRepository(),
    );

    await withTeacherScope(() =>
      useCase.execute({
        homeworkId: 'homework-1',
        submissionId: 'submission-1',
        reviewedByUserId: 'teacher-user-1',
        awardedMarks: 8,
      }),
    );

    expect(repository.reviewSubmission).toHaveBeenCalledWith(
      expect.objectContaining({ awardedMarks: 8 }),
    );
  });
});

function seedReviewSubmission(overrides?: Record<string, unknown>): any {
  const answers = (overrides?.answers as any[]) ?? [seedAnswer()];
  const homeworkAssignment = {
    id: 'homework-1',
    status: HomeworkAssignmentStatus.PUBLISHED,
    dueAt: new Date('2026-09-10T10:00:00.000Z'),
    totalMarks: { toNumber: () => 10 },
    isGraded: true,
    deletedAt: null,
    questions: [seedQuestion()],
    ...(overrides?.homeworkAssignment as Record<string, unknown> | undefined),
  };

  return {
    id: 'submission-1',
    schoolId: 'school-1',
    homeworkAssignmentId: 'homework-1',
    homeworkTargetId: 'target-1',
    studentId: 'student-1',
    enrollmentId: 'enrollment-1',
    status: HomeworkSubmissionStatus.SUBMITTED,
    bodyText: 'Submitted answer',
    submittedAt: new Date('2026-09-10T09:00:00.000Z'),
    reviewedAt: null,
    reviewedByUserId: null,
    reviewNote: null,
    awardedMarks: null,
    createdAt: new Date('2026-09-10T08:00:00.000Z'),
    updatedAt: new Date('2026-09-10T09:00:00.000Z'),
    answers,
    attachments: [],
    student: {
      id: 'student-1',
      firstName: 'Learner',
      lastName: 'One',
    },
    homeworkAssignment,
    homeworkTarget: {
      id: 'target-1',
      status: HomeworkTargetStatus.SUBMITTED,
      submittedAt: new Date('2026-09-10T09:00:00.000Z'),
      reviewedAt: null,
    },
    ...overrides,
  };
}

function seedAnswer(overrides?: Record<string, unknown>): any {
  const homeworkQuestion =
    (overrides?.homeworkQuestion as any) ?? seedQuestion();
  return {
    id: 'answer-1',
    schoolId: 'school-1',
    homeworkSubmissionId: 'submission-1',
    homeworkAssignmentId: 'homework-1',
    homeworkTargetId: 'target-1',
    homeworkQuestionId: homeworkQuestion.id,
    textAnswer: 'Answer text',
    selectedOptionIds: null,
    isDraft: false,
    teacherComment: null,
    awardedPoints: null,
    reviewedAt: null,
    reviewedByUserId: null,
    deletedAt: null,
    createdAt: new Date('2026-09-10T09:00:00.000Z'),
    updatedAt: new Date('2026-09-10T09:00:00.000Z'),
    homeworkQuestion,
    ...overrides,
  };
}

function seedQuestion(overrides?: Record<string, unknown>): any {
  return {
    id: 'question-1',
    schoolId: 'school-1',
    homeworkAssignmentId: 'homework-1',
    type: HomeworkQuestionType.SHORT_TEXT,
    prompt: 'Explain',
    instructions: null,
    points: { toNumber: () => 2 },
    sortOrder: 0,
    isRequired: true,
    expectedAnswer: null,
    metadata: null,
    createdByUserId: 'teacher-user-1',
    updatedByUserId: null,
    deletedAt: null,
    createdAt: new Date('2026-09-10T08:00:00.000Z'),
    updatedAt: new Date('2026-09-10T08:00:00.000Z'),
    options: [],
    ...overrides,
  };
}
