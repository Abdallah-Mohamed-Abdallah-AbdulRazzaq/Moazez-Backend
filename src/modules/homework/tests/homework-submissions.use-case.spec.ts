import {
  HomeworkAssignmentStatus,
  HomeworkQuestionType,
  HomeworkSubmissionStatus,
  HomeworkTargetStatus,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../common/context/request-context';
import { DomainException } from '../../../common/exceptions/domain-exception';
import {
  GetHomeworkSubmissionUseCase,
  GetHomeworkSubmissionForReviewUseCase,
  ListHomeworkSubmissionsForReviewUseCase,
  ReviewHomeworkSubmissionUseCase,
  SaveHomeworkSubmissionDraftUseCase,
  SubmitHomeworkSubmissionUseCase,
} from '../application/homework-submissions.use-cases';
import { HomeworkRepository } from '../infrastructure/homework.repository';

describe('Homework submission use cases', () => {
  async function withStudentScope<T>(testFn: () => Promise<T>): Promise<T> {
    return runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: 'student-user-1', userType: UserType.STUDENT });
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

  async function withTeacherScope<T>(testFn: () => Promise<T>): Promise<T> {
    return runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: 'teacher-1', userType: UserType.TEACHER });
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
    return {
      findStudentTargetForSubmission: jest.fn().mockResolvedValue(seedTarget()),
      saveDraftSubmission: jest.fn().mockImplementation(async (input) => ({
        outcome: 'saved',
        submission: seedSubmission({
          bodyText: input.bodyText,
          status: HomeworkSubmissionStatus.DRAFT,
        }),
      })),
      submitSubmission: jest.fn().mockImplementation(async (input) => ({
        outcome: 'submitted',
        submission: seedSubmission({
          bodyText: input.bodyText,
          status: input.submissionStatus,
          submittedAt: input.submittedAt,
        }),
      })),
      listReviewableSubmissions: jest.fn().mockResolvedValue({
        items: [seedReviewSubmission()],
        total: 1,
        page: 1,
        limit: 25,
      }),
      findReviewableSubmission: jest.fn().mockResolvedValue(
        seedReviewSubmission({
          status: HomeworkSubmissionStatus.SUBMITTED,
        }),
      ),
      reviewSubmission: jest.fn().mockImplementation(async (input) => ({
        outcome: 'reviewed',
        submission: seedReviewSubmission({
          status: HomeworkSubmissionStatus.REVIEWED,
          reviewedAt: input.reviewedAt,
          reviewedByUserId: input.reviewedByUserId,
          reviewNote: input.reviewNote,
          awardedMarks: input.awardedMarks,
        }),
      })),
      ...overrides,
    };
  }

  function createAuthRepository(): any {
    return { createAuditLog: jest.fn().mockResolvedValue(undefined) };
  }

  it('returns the current submission for a student-owned target', async () => {
    const repository = createRepository({
      findStudentTargetForSubmission: jest
        .fn()
        .mockResolvedValue(
          seedTarget({ submissions: [seedSubmission({ id: 'submission-1' })] }),
        ),
    });
    const useCase = new GetHomeworkSubmissionUseCase(repository);

    const submission = await withStudentScope(() =>
      useCase.execute({
        homeworkId: 'homework-1',
        studentId: 'student-1',
        enrollmentId: 'enrollment-1',
      }),
    );

    expect(submission).toMatchObject({ id: 'submission-1' });
  });

  it('creates a draft submission for a student-owned published homework target', async () => {
    const repository = createRepository();
    const useCase = new SaveHomeworkSubmissionDraftUseCase(repository);

    const submission = await withStudentScope(() =>
      useCase.execute({
        homeworkId: 'homework-1',
        studentId: 'student-1',
        enrollmentId: 'enrollment-1',
        bodyText: '  My draft answer  ',
      }),
    );

    expect(repository.saveDraftSubmission).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: 'school-1',
        homeworkAssignmentId: 'homework-1',
        homeworkTargetId: 'target-1',
        studentId: 'student-1',
        enrollmentId: 'enrollment-1',
        bodyText: 'My draft answer',
      }),
    );
    expect(submission.status).toBe(HomeworkSubmissionStatus.DRAFT);
  });

  it('updates an existing draft submission', async () => {
    const repository = createRepository({
      findStudentTargetForSubmission: jest.fn().mockResolvedValue(
        seedTarget({
          submissions: [
            seedSubmission({
              id: 'submission-1',
              bodyText: 'Old draft',
              status: HomeworkSubmissionStatus.DRAFT,
            }),
          ],
        }),
      ),
    });
    const useCase = new SaveHomeworkSubmissionDraftUseCase(repository);

    await withStudentScope(() =>
      useCase.execute({
        homeworkId: 'homework-1',
        studentId: 'student-1',
        enrollmentId: 'enrollment-1',
        bodyText: 'Updated draft',
      }),
    );

    expect(repository.saveDraftSubmission).toHaveBeenCalledWith(
      expect.objectContaining({ bodyText: 'Updated draft' }),
    );
  });

  it('submits before due date and updates the target as submitted', async () => {
    const repository = createRepository();
    const authRepository = createAuthRepository();
    const useCase = new SubmitHomeworkSubmissionUseCase(
      repository,
      authRepository,
    );

    const submission = await withStudentScope(() =>
      useCase.execute({
        homeworkId: 'homework-1',
        studentId: 'student-1',
        enrollmentId: 'enrollment-1',
        bodyText: 'Final answer',
      }),
    );

    expect(repository.submitSubmission).toHaveBeenCalledWith(
      expect.objectContaining({
        submissionStatus: HomeworkSubmissionStatus.SUBMITTED,
        targetStatus: HomeworkTargetStatus.SUBMITTED,
        bodyText: 'Final answer',
        submittedAt: expect.any(Date),
      }),
    );
    expect(submission.status).toBe(HomeworkSubmissionStatus.SUBMITTED);
    expect(authRepository.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'homework.submission.submit' }),
    );
  });

  it('submits after due date as late and updates the target as late', async () => {
    const repository = createRepository({
      findStudentTargetForSubmission: jest
        .fn()
        .mockResolvedValue(
          seedTarget({ dueAt: new Date(Date.now() - 60_000) }),
        ),
    });
    const useCase = new SubmitHomeworkSubmissionUseCase(
      repository,
      createAuthRepository(),
    );

    await withStudentScope(() =>
      useCase.execute({
        homeworkId: 'homework-1',
        studentId: 'student-1',
        enrollmentId: 'enrollment-1',
        bodyText: 'Late answer',
      }),
    );

    expect(repository.submitSubmission).toHaveBeenCalledWith(
      expect.objectContaining({
        submissionStatus: HomeworkSubmissionStatus.LATE,
        targetStatus: HomeworkTargetStatus.LATE,
      }),
    );
  });

  it('rejects duplicate submit attempts', async () => {
    const repository = createRepository({
      findStudentTargetForSubmission: jest.fn().mockResolvedValue(
        seedTarget({
          targetStatus: HomeworkTargetStatus.SUBMITTED,
          submittedAt: new Date(),
          submissions: [
            seedSubmission({ status: HomeworkSubmissionStatus.SUBMITTED }),
          ],
        }),
      ),
    });
    const useCase = new SubmitHomeworkSubmissionUseCase(
      repository,
      createAuthRepository(),
    );

    await expect(
      withStudentScope(() =>
        useCase.execute({
          homeworkId: 'homework-1',
          studentId: 'student-1',
          enrollmentId: 'enrollment-1',
          bodyText: 'Again',
        }),
      ),
    ).rejects.toMatchObject<Partial<DomainException>>({
      code: 'homework.submission.already_submitted',
    });
    expect(repository.submitSubmission).not.toHaveBeenCalled();
  });

  it('rejects draft edits after submission', async () => {
    const repository = createRepository({
      findStudentTargetForSubmission: jest.fn().mockResolvedValue(
        seedTarget({
          targetStatus: HomeworkTargetStatus.SUBMITTED,
          submissions: [
            seedSubmission({ status: HomeworkSubmissionStatus.SUBMITTED }),
          ],
        }),
      ),
    });
    const useCase = new SaveHomeworkSubmissionDraftUseCase(repository);

    await expect(
      withStudentScope(() =>
        useCase.execute({
          homeworkId: 'homework-1',
          studentId: 'student-1',
          enrollmentId: 'enrollment-1',
          bodyText: 'Cannot edit',
        }),
      ),
    ).rejects.toMatchObject<Partial<DomainException>>({
      code: 'homework.submission.already_submitted',
    });
    expect(repository.saveDraftSubmission).not.toHaveBeenCalled();
  });

  it('rejects hidden draft or cancelled assignments with safe not found', async () => {
    const repository = createRepository({
      findStudentTargetForSubmission: jest.fn().mockResolvedValue(null),
    });
    const useCase = new SaveHomeworkSubmissionDraftUseCase(repository);

    await expect(
      withStudentScope(() =>
        useCase.execute({
          homeworkId: 'hidden-homework',
          studentId: 'student-1',
          enrollmentId: 'enrollment-1',
          bodyText: 'Hidden',
        }),
      ),
    ).rejects.toMatchObject<Partial<DomainException>>({
      code: 'homework.submission.target_not_found',
    });
  });

  it('rejects closed assignments as not submittable', async () => {
    const repository = createRepository({
      findStudentTargetForSubmission: jest.fn().mockResolvedValue(
        seedTarget({
          assignmentStatus: HomeworkAssignmentStatus.CLOSED,
        }),
      ),
    });
    const useCase = new SubmitHomeworkSubmissionUseCase(
      repository,
      createAuthRepository(),
    );

    await expect(
      withStudentScope(() =>
        useCase.execute({
          homeworkId: 'homework-1',
          studentId: 'student-1',
          enrollmentId: 'enrollment-1',
          bodyText: 'Closed',
        }),
      ),
    ).rejects.toMatchObject<Partial<DomainException>>({
      code: 'homework.submission.not_submittable',
    });
    expect(repository.submitSubmission).not.toHaveBeenCalled();
  });

  it('rejects blank final body text and performs no side effects', async () => {
    const repository = createRepository();
    const authRepository = createAuthRepository();
    const useCase = new SubmitHomeworkSubmissionUseCase(
      repository,
      authRepository,
    );

    await expect(
      withStudentScope(() =>
        useCase.execute({
          homeworkId: 'homework-1',
          studentId: 'student-1',
          enrollmentId: 'enrollment-1',
          bodyText: '   ',
        }),
      ),
    ).rejects.toMatchObject<Partial<DomainException>>({
      code: 'validation.failed',
    });
    expect(repository.submitSubmission).not.toHaveBeenCalled();
    expect(authRepository.createAuditLog).not.toHaveBeenCalled();
    expect((repository as any).createGradeItem).toBeUndefined();
    expect((repository as any).createNotification).toBeUndefined();
    expect((repository as any).grantXp).toBeUndefined();
  });

  it('submits required-question homework from saved answers without body text', async () => {
    const repository = createRepository({
      findStudentTargetForSubmission: jest.fn().mockResolvedValue(
        seedTarget({
          questions: [
            seedQuestion({
              type: HomeworkQuestionType.SHORT_TEXT,
              options: [],
            }),
          ],
          submissions: [
            seedSubmission({
              bodyText: null,
              answers: [
                seedAnswer({
                  homeworkQuestionId: 'question-1',
                  textAnswer: 'Saved answer',
                  selectedOptionIds: null,
                }),
              ],
            }),
          ],
        }),
      ),
    });
    const useCase = new SubmitHomeworkSubmissionUseCase(
      repository,
      createAuthRepository(),
    );

    const submission = await withStudentScope(() =>
      useCase.execute({
        homeworkId: 'homework-1',
        studentId: 'student-1',
        enrollmentId: 'enrollment-1',
      }),
    );

    expect(repository.submitSubmission).toHaveBeenCalledWith(
      expect.objectContaining({
        bodyText: null,
        submissionStatus: HomeworkSubmissionStatus.SUBMITTED,
      }),
    );
    expect(submission.status).toBe(HomeworkSubmissionStatus.SUBMITTED);
  });

  it('rejects final submit when a required homework question is unanswered', async () => {
    const repository = createRepository({
      findStudentTargetForSubmission: jest.fn().mockResolvedValue(
        seedTarget({
          questions: [
            seedQuestion({
              type: HomeworkQuestionType.SHORT_TEXT,
              options: [],
            }),
          ],
          submissions: [seedSubmission({ bodyText: null, answers: [] })],
        }),
      ),
    });
    const useCase = new SubmitHomeworkSubmissionUseCase(
      repository,
      createAuthRepository(),
    );

    await expect(
      withStudentScope(() =>
        useCase.execute({
          homeworkId: 'homework-1',
          studentId: 'student-1',
          enrollmentId: 'enrollment-1',
        }),
      ),
    ).rejects.toMatchObject<Partial<DomainException>>({
      code: 'homework.answer.missing_required',
    });
    expect(repository.submitSubmission).not.toHaveBeenCalled();
  });

  it('allows final submit when only optional homework questions are unanswered', async () => {
    const repository = createRepository({
      findStudentTargetForSubmission: jest.fn().mockResolvedValue(
        seedTarget({
          questions: [
            seedQuestion({
              type: HomeworkQuestionType.LONG_TEXT,
              isRequired: false,
              options: [],
            }),
          ],
          submissions: [seedSubmission({ bodyText: null, answers: [] })],
        }),
      ),
    });
    const useCase = new SubmitHomeworkSubmissionUseCase(
      repository,
      createAuthRepository(),
    );

    await withStudentScope(() =>
      useCase.execute({
        homeworkId: 'homework-1',
        studentId: 'student-1',
        enrollmentId: 'enrollment-1',
      }),
    );

    expect(repository.submitSubmission).toHaveBeenCalledWith(
      expect.objectContaining({ bodyText: null }),
    );
  });

  it('lists teacher-reviewable submissions through submitted, late, or reviewed status only', async () => {
    const repository = createRepository();
    const useCase = new ListHomeworkSubmissionsForReviewUseCase(repository);

    await withTeacherScope(() =>
      useCase.execute({
        homeworkId: 'homework-1',
        page: 2,
        limit: 10,
        search: 'learner',
      }),
    );

    expect(repository.listReviewableSubmissions).toHaveBeenCalledWith({
      homeworkAssignmentId: 'homework-1',
      statuses: undefined,
      search: 'learner',
      page: 2,
      limit: 10,
    });
  });

  it('gets a single teacher-visible submitted submission', async () => {
    const repository = createRepository();
    const useCase = new GetHomeworkSubmissionForReviewUseCase(repository);

    const submission = await withTeacherScope(() =>
      useCase.execute({
        homeworkId: 'homework-1',
        submissionId: 'submission-1',
      }),
    );

    expect(repository.findReviewableSubmission).toHaveBeenCalledWith({
      homeworkAssignmentId: 'homework-1',
      submissionId: 'submission-1',
    });
    expect(submission.status).toBe(HomeworkSubmissionStatus.SUBMITTED);
  });

  it('reviews a submitted submission and records target review metadata', async () => {
    const repository = createRepository();
    const authRepository = createAuthRepository();
    const useCase = new ReviewHomeworkSubmissionUseCase(
      repository,
      authRepository,
    );

    const submission = await withTeacherScope(() =>
      useCase.execute({
        homeworkId: 'homework-1',
        submissionId: 'submission-1',
        reviewedByUserId: 'teacher-1',
        reviewNote: '  Good work  ',
        awardedMarks: 8.5,
      }),
    );

    expect(repository.reviewSubmission).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: 'school-1',
        homeworkAssignmentId: 'homework-1',
        submissionId: 'submission-1',
        homeworkTargetId: 'target-1',
        studentId: 'student-1',
        enrollmentId: 'enrollment-1',
        reviewedByUserId: 'teacher-1',
        reviewNote: 'Good work',
        awardedMarks: 8.5,
        reviewedAt: expect.any(Date),
      }),
    );
    expect(submission.status).toBe(HomeworkSubmissionStatus.REVIEWED);
    expect(authRepository.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'homework.submission.review' }),
    );
  });

  it('reviews a late submission with the same reviewed target lifecycle', async () => {
    const repository = createRepository({
      findReviewableSubmission: jest.fn().mockResolvedValue(
        seedReviewSubmission({
          status: HomeworkSubmissionStatus.LATE,
          submittedAt: new Date('2026-09-11T08:00:00.000Z'),
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
        reviewedByUserId: 'teacher-1',
      }),
    );

    expect(repository.reviewSubmission).toHaveBeenCalledWith(
      expect.objectContaining({
        reviewNote: null,
        awardedMarks: null,
      }),
    );
  });

  it('rejects awarded marks for ungraded or over-max homework', async () => {
    const repository = createRepository({
      findReviewableSubmission: jest
        .fn()
        .mockResolvedValue(seedReviewSubmission({ isGraded: false })),
    });
    const useCase = new ReviewHomeworkSubmissionUseCase(
      repository,
      createAuthRepository(),
    );

    await expect(
      withTeacherScope(() =>
        useCase.execute({
          homeworkId: 'homework-1',
          submissionId: 'submission-1',
          reviewedByUserId: 'teacher-1',
          awardedMarks: 1,
        }),
      ),
    ).rejects.toMatchObject<Partial<DomainException>>({
      code: 'homework.submission.review_invalid',
    });
    expect(repository.reviewSubmission).not.toHaveBeenCalled();

    repository.findReviewableSubmission.mockResolvedValue(
      seedReviewSubmission({ totalMarks: 10, isGraded: true }),
    );

    await expect(
      withTeacherScope(() =>
        useCase.execute({
          homeworkId: 'homework-1',
          submissionId: 'submission-1',
          reviewedByUserId: 'teacher-1',
          awardedMarks: 11,
        }),
      ),
    ).rejects.toMatchObject<Partial<DomainException>>({
      code: 'homework.submission.review_invalid',
    });
  });

  it('rejects duplicate review attempts', async () => {
    const repository = createRepository({
      findReviewableSubmission: jest
        .fn()
        .mockResolvedValue(
          seedReviewSubmission({ status: HomeworkSubmissionStatus.REVIEWED }),
        ),
    });
    const useCase = new ReviewHomeworkSubmissionUseCase(
      repository,
      createAuthRepository(),
    );

    await expect(
      withTeacherScope(() =>
        useCase.execute({
          homeworkId: 'homework-1',
          submissionId: 'submission-1',
          reviewedByUserId: 'teacher-1',
        }),
      ),
    ).rejects.toMatchObject<Partial<DomainException>>({
      code: 'homework.submission.already_reviewed',
    });
    expect(repository.reviewSubmission).not.toHaveBeenCalled();
  });

  it('performs no grade notification xp or reward side effects during review', async () => {
    const repository = createRepository();
    const useCase = new ReviewHomeworkSubmissionUseCase(
      repository,
      createAuthRepository(),
    );

    await withTeacherScope(() =>
      useCase.execute({
        homeworkId: 'homework-1',
        submissionId: 'submission-1',
        reviewedByUserId: 'teacher-1',
      }),
    );

    expect((repository as any).createGradeItem).toBeUndefined();
    expect((repository as any).createNotification).toBeUndefined();
    expect((repository as any).grantXp).toBeUndefined();
    expect((repository as any).createRewardRedemption).toBeUndefined();
  });
});

describe('HomeworkRepository submission review methods', () => {
  it('builds teacher review list filters that exclude draft submissions', async () => {
    const { repository, prismaMocks } = createPrismaBackedRepository();
    prismaMocks.homeworkSubmission.findMany.mockResolvedValue([]);
    prismaMocks.homeworkSubmission.count.mockResolvedValue(0);

    await repository.listReviewableSubmissions({
      homeworkAssignmentId: 'homework-1',
      page: 1,
      limit: 25,
    });

    const where =
      prismaMocks.homeworkSubmission.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({
      homeworkAssignmentId: 'homework-1',
      status: {
        in: [
          HomeworkSubmissionStatus.SUBMITTED,
          HomeworkSubmissionStatus.LATE,
          HomeworkSubmissionStatus.REVIEWED,
        ],
      },
      homeworkAssignment: {
        is: {
          deletedAt: null,
          status: {
            in: [
              HomeworkAssignmentStatus.PUBLISHED,
              HomeworkAssignmentStatus.CLOSED,
            ],
          },
        },
      },
    });
    expect(JSON.stringify(where)).not.toContain(HomeworkSubmissionStatus.DRAFT);
  });

  it('keeps draft submissions hidden even when explicit review statuses are provided', async () => {
    const { repository, prismaMocks } = createPrismaBackedRepository();
    prismaMocks.homeworkSubmission.findMany.mockResolvedValue([]);
    prismaMocks.homeworkSubmission.count.mockResolvedValue(0);

    await repository.listReviewableSubmissions({
      homeworkAssignmentId: 'homework-1',
      statuses: [
        HomeworkSubmissionStatus.DRAFT,
        HomeworkSubmissionStatus.SUBMITTED,
        HomeworkSubmissionStatus.REVIEWED,
      ],
      page: 1,
      limit: 25,
    });

    const where =
      prismaMocks.homeworkSubmission.findMany.mock.calls[0][0].where;
    expect(where.status.in).toEqual([
      HomeworkSubmissionStatus.SUBMITTED,
      HomeworkSubmissionStatus.REVIEWED,
    ]);
    expect(where.status.in).not.toContain(HomeworkSubmissionStatus.DRAFT);
  });

  it.each([
    HomeworkAssignmentStatus.DRAFT,
    HomeworkAssignmentStatus.CANCELLED,
    HomeworkAssignmentStatus.ARCHIVED,
  ])(
    'builds teacher review list filters that exclude %s assignments',
    async (hiddenStatus) => {
      const { repository, prismaMocks } = createPrismaBackedRepository();
      prismaMocks.homeworkSubmission.findMany.mockResolvedValue([]);
      prismaMocks.homeworkSubmission.count.mockResolvedValue(0);

      await repository.listReviewableSubmissions({
        homeworkAssignmentId: 'homework-1',
        page: 1,
        limit: 25,
      });

      const where =
        prismaMocks.homeworkSubmission.findMany.mock.calls[0][0].where;
      const visibleStatuses = where.homeworkAssignment.is.status.in;
      expect(visibleStatuses).toEqual([
        HomeworkAssignmentStatus.PUBLISHED,
        HomeworkAssignmentStatus.CLOSED,
      ]);
      expect(visibleStatuses).not.toContain(hiddenStatus);
    },
  );

  it('finds one visible review submission without exposing drafts', async () => {
    const { repository, prismaMocks } = createPrismaBackedRepository();
    prismaMocks.homeworkSubmission.findFirst.mockResolvedValue(null);

    await repository.findReviewableSubmission({
      homeworkAssignmentId: 'homework-1',
      submissionId: 'submission-1',
    });

    const where =
      prismaMocks.homeworkSubmission.findFirst.mock.calls[0][0].where;
    expect(where).toMatchObject({
      id: 'submission-1',
      homeworkAssignmentId: 'homework-1',
      status: {
        in: [
          HomeworkSubmissionStatus.SUBMITTED,
          HomeworkSubmissionStatus.LATE,
          HomeworkSubmissionStatus.REVIEWED,
        ],
      },
      homeworkAssignment: {
        is: {
          deletedAt: null,
          status: {
            in: [
              HomeworkAssignmentStatus.PUBLISHED,
              HomeworkAssignmentStatus.CLOSED,
            ],
          },
        },
      },
    });
  });

  it.each([
    HomeworkAssignmentStatus.CANCELLED,
    HomeworkAssignmentStatus.ARCHIVED,
  ])(
    'builds detail filters that return not found for %s assignment submissions',
    async (hiddenStatus) => {
      const { repository, prismaMocks } = createPrismaBackedRepository();
      prismaMocks.homeworkSubmission.findFirst.mockResolvedValue(null);

      const submission = await repository.findReviewableSubmission({
        homeworkAssignmentId: 'homework-1',
        submissionId: 'submission-1',
      });

      const where =
        prismaMocks.homeworkSubmission.findFirst.mock.calls[0][0].where;
      const visibleStatuses = where.homeworkAssignment.is.status.in;
      expect(submission).toBeNull();
      expect(visibleStatuses).toEqual([
        HomeworkAssignmentStatus.PUBLISHED,
        HomeworkAssignmentStatus.CLOSED,
      ]);
      expect(visibleStatuses).not.toContain(hiddenStatus);
    },
  );

  it.each([
    HomeworkAssignmentStatus.PUBLISHED,
    HomeworkAssignmentStatus.CLOSED,
  ])(
    'keeps %s assignment submitted late and reviewed submissions visible',
    async (visibleAssignmentStatus) => {
      const { repository, prismaMocks } = createPrismaBackedRepository();
      prismaMocks.homeworkSubmission.findFirst.mockResolvedValue(
        seedReviewSubmission({
          assignmentStatus: visibleAssignmentStatus,
          status: HomeworkSubmissionStatus.REVIEWED,
        }),
      );

      const submission = await repository.findReviewableSubmission({
        homeworkAssignmentId: 'homework-1',
        submissionId: 'submission-1',
      });

      const where =
        prismaMocks.homeworkSubmission.findFirst.mock.calls[0][0].where;
      expect(where.status.in).toEqual([
        HomeworkSubmissionStatus.SUBMITTED,
        HomeworkSubmissionStatus.LATE,
        HomeworkSubmissionStatus.REVIEWED,
      ]);
      expect(where.homeworkAssignment.is.status.in).toContain(
        visibleAssignmentStatus,
      );
      expect(submission?.status).toBe(HomeworkSubmissionStatus.REVIEWED);
    },
  );

  it('updates submission and target together with school-safe transaction bounds', async () => {
    const { repository, prismaMocks, txMocks } = createPrismaBackedRepository();
    txMocks.homeworkSubmission.findFirst
      .mockResolvedValueOnce(
        seedReviewSubmission({ status: HomeworkSubmissionStatus.SUBMITTED }),
      )
      .mockResolvedValueOnce(
        seedReviewSubmission({ status: HomeworkSubmissionStatus.REVIEWED }),
      );

    const result = await repository.reviewSubmission({
      schoolId: 'school-1',
      homeworkAssignmentId: 'homework-1',
      submissionId: 'submission-1',
      homeworkTargetId: 'target-1',
      studentId: 'student-1',
      enrollmentId: 'enrollment-1',
      reviewedByUserId: 'teacher-1',
      reviewedAt: new Date('2026-05-25T08:30:00.000Z'),
      reviewNote: 'Done',
      awardedMarks: 8,
    });

    expect(prismaMocks.$transaction).toHaveBeenCalled();
    expect(txMocks.homeworkSubmission.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          schoolId: 'school-1',
          id: 'submission-1',
          homeworkAssignmentId: 'homework-1',
          homeworkTargetId: 'target-1',
          studentId: 'student-1',
          enrollmentId: 'enrollment-1',
        },
        data: expect.objectContaining({
          status: HomeworkSubmissionStatus.REVIEWED,
          reviewedByUserId: 'teacher-1',
          reviewNote: 'Done',
          awardedMarks: 8,
        }),
      }),
    );
    expect(txMocks.homeworkTarget.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          schoolId: 'school-1',
          id: 'target-1',
          homeworkAssignmentId: 'homework-1',
          studentId: 'student-1',
          enrollmentId: 'enrollment-1',
        },
        data: expect.objectContaining({
          status: HomeworkTargetStatus.REVIEWED,
          reviewedAt: expect.any(Date),
        }),
      }),
    );
    expect(result.outcome).toBe('reviewed');
  });
});

function seedTarget(overrides?: {
  targetStatus?: HomeworkTargetStatus;
  assignmentStatus?: HomeworkAssignmentStatus;
  dueAt?: Date;
  submittedAt?: Date | null;
  submissions?: any[];
  questions?: any[];
}): any {
  return {
    id: 'target-1',
    schoolId: 'school-1',
    homeworkAssignmentId: 'homework-1',
    studentId: 'student-1',
    enrollmentId: 'enrollment-1',
    status: overrides?.targetStatus ?? HomeworkTargetStatus.ASSIGNED,
    submittedAt: overrides?.submittedAt ?? null,
    homeworkAssignment: {
      id: 'homework-1',
      status: overrides?.assignmentStatus ?? HomeworkAssignmentStatus.PUBLISHED,
      dueAt: overrides?.dueAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000),
      deletedAt: null,
      questions: overrides?.questions ?? [],
    },
    submissions: overrides?.submissions ?? [],
  };
}

function seedSubmission(overrides?: Record<string, unknown>): any {
  return {
    id: 'submission-1',
    schoolId: 'school-1',
    homeworkAssignmentId: 'homework-1',
    homeworkTargetId: 'target-1',
    studentId: 'student-1',
    enrollmentId: 'enrollment-1',
    status: HomeworkSubmissionStatus.DRAFT,
    bodyText: 'Draft answer',
    submittedAt: null,
    reviewedAt: null,
    reviewedByUserId: null,
    reviewNote: null,
    awardedMarks: null,
    createdAt: new Date('2026-05-25T08:00:00.000Z'),
    updatedAt: new Date('2026-05-25T08:05:00.000Z'),
    answers: [],
    attachments: [],
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
    points: { toNumber: () => 1 },
    sortOrder: 0,
    isRequired: true,
    expectedAnswer: null,
    metadata: null,
    createdByUserId: 'teacher-1',
    updatedByUserId: null,
    deletedAt: null,
    createdAt: new Date('2026-05-25T08:00:00.000Z'),
    updatedAt: new Date('2026-05-25T08:00:00.000Z'),
    options: [],
    ...overrides,
  };
}

function seedAnswer(overrides?: Record<string, unknown>): any {
  return {
    id: 'answer-1',
    schoolId: 'school-1',
    homeworkSubmissionId: 'submission-1',
    homeworkAssignmentId: 'homework-1',
    homeworkTargetId: 'target-1',
    homeworkQuestionId: 'question-1',
    textAnswer: 'Saved answer',
    selectedOptionIds: null,
    isDraft: false,
    teacherComment: null,
    awardedPoints: null,
    reviewedAt: null,
    reviewedByUserId: null,
    deletedAt: null,
    createdAt: new Date('2026-05-25T08:00:00.000Z'),
    updatedAt: new Date('2026-05-25T08:00:00.000Z'),
    ...overrides,
  };
}

function seedReviewSubmission(overrides?: Record<string, unknown>): any {
  const submittedAt =
    (overrides?.submittedAt as Date | undefined) ??
    new Date('2026-09-10T08:00:00.000Z');
  const totalMarks = overrides?.totalMarks ?? { toNumber: () => 10 };
  const isGraded = overrides?.isGraded ?? true;
  const assignmentStatus =
    overrides?.assignmentStatus ?? HomeworkAssignmentStatus.PUBLISHED;

  return {
    ...seedSubmission({
      status: HomeworkSubmissionStatus.SUBMITTED,
      bodyText: 'Submitted answer',
      submittedAt,
      ...overrides,
    }),
    student: {
      id: 'student-1',
      firstName: 'Student',
      lastName: 'One',
    },
    homeworkAssignment: {
      id: 'homework-1',
      status: assignmentStatus,
      dueAt: new Date('2026-09-10T10:00:00.000Z'),
      totalMarks,
      isGraded,
      deletedAt: null,
    },
    homeworkTarget: {
      id: 'target-1',
      status: HomeworkTargetStatus.SUBMITTED,
      submittedAt,
      reviewedAt: null,
    },
  };
}

function modelMocks() {
  return {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    updateMany: jest.fn(),
  };
}

function createPrismaBackedRepository(): {
  repository: HomeworkRepository;
  prismaMocks: any;
  txMocks: any;
} {
  const txMocks = {
    homeworkSubmission: modelMocks(),
    homeworkTarget: modelMocks(),
  };
  const prismaMocks = {
    homeworkSubmission: modelMocks(),
    homeworkTarget: modelMocks(),
    $transaction: jest.fn(async (callback) => callback(txMocks)),
  };
  const prisma = {
    scoped: prismaMocks,
  };

  return {
    repository: new HomeworkRepository(prisma as any),
    prismaMocks,
    txMocks,
  };
}
