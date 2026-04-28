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
import { BulkSaveGradeSubmissionAnswersUseCase } from '../application/bulk-save-grade-submission-answers.use-case';
import { GetGradeSubmissionUseCase } from '../application/get-grade-submission.use-case';
import { ListGradeSubmissionsUseCase } from '../application/list-grade-submissions.use-case';
import { ResolveGradeSubmissionUseCase } from '../application/resolve-grade-submission.use-case';
import { SaveGradeSubmissionAnswerUseCase } from '../application/save-grade-submission-answer.use-case';
import { SubmitGradeSubmissionUseCase } from '../application/submit-grade-submission.use-case';
import { GradesSubmissionsRepository } from '../infrastructure/grades-submissions.repository';

const SCHOOL_ID = 'school-1';
const ASSESSMENT_ID = 'assessment-1';
const SUBMISSION_ID = 'submission-1';
const STUDENT_ID = 'student-1';
const ENROLLMENT_ID = 'enrollment-1';
const QUESTION_ID = 'question-1';
const QUESTION_TWO_ID = 'question-2';
const OPTION_ID = 'option-1';
const OPTION_TWO_ID = 'option-2';

describe('grade submissions use cases', () => {
  async function withGradesScope<T>(fn: () => Promise<T>): Promise<T> {
    return runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: 'user-1', userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: 'membership-1',
        organizationId: 'org-1',
        schoolId: SCHOOL_ID,
        roleId: 'role-1',
        permissions: ['grades.submissions.view', 'grades.submissions.submit'],
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
      scopeType: GradeScopeType;
      gradeId: string;
    }>,
  ) {
    const gradeId = overrides?.gradeId ?? 'grade-1';

    return {
      id: ASSESSMENT_ID,
      schoolId: SCHOOL_ID,
      academicYearId: 'year-1',
      termId: 'term-1',
      subjectId: 'subject-1',
      scopeType: overrides?.scopeType ?? GradeScopeType.GRADE,
      scopeKey: gradeId,
      stageId: 'stage-1',
      gradeId,
      sectionId: null,
      classroomId: null,
      titleEn: 'Quiz 1',
      titleAr: null,
      deliveryMode:
        overrides?.deliveryMode ?? GradeAssessmentDeliveryMode.QUESTION_BASED,
      approvalStatus:
        overrides?.approvalStatus ?? GradeAssessmentApprovalStatus.PUBLISHED,
      lockedAt: overrides?.lockedAt ?? null,
      maxScore: new Prisma.Decimal(10),
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

  function enrollmentRecord(overrides?: { gradeId?: string }) {
    const gradeId = overrides?.gradeId ?? 'grade-1';

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
          gradeId,
          grade: {
            id: gradeId,
            nameAr: null,
            nameEn: 'Grade 1',
            stageId: 'stage-1',
          },
        },
      },
    };
  }

  function optionRecord(overrides?: {
    id?: string;
    questionId?: string;
    label?: string;
  }) {
    return {
      id: overrides?.id ?? OPTION_ID,
      schoolId: SCHOOL_ID,
      assessmentId: ASSESSMENT_ID,
      questionId: overrides?.questionId ?? QUESTION_ID,
      label: overrides?.label ?? 'A',
      labelAr: null,
      value: 'a',
      deletedAt: null,
    };
  }

  function questionRecord(
    overrides?: Partial<{
      id: string;
      type: GradeQuestionType;
      points: number;
      required: boolean;
      options: ReturnType<typeof optionRecord>[];
    }>,
  ) {
    const id = overrides?.id ?? QUESTION_ID;

    return {
      id,
      schoolId: SCHOOL_ID,
      assessmentId: ASSESSMENT_ID,
      type: overrides?.type ?? GradeQuestionType.MCQ_SINGLE,
      prompt: 'Choose one',
      promptAr: null,
      points: new Prisma.Decimal(overrides?.points ?? 5),
      sortOrder: id === QUESTION_ID ? 1 : 2,
      required: overrides?.required ?? true,
      deletedAt: null,
      options:
        overrides?.options ??
        (overrides?.type === GradeQuestionType.SHORT_ANSWER ||
        overrides?.type === GradeQuestionType.ESSAY
          ? []
          : [
              optionRecord({ id: OPTION_ID, questionId: id, label: 'A' }),
              optionRecord({ id: OPTION_TWO_ID, questionId: id, label: 'B' }),
            ]),
    };
  }

  function answerRecord(
    overrides?: Partial<{
      id: string;
      questionId: string;
      type: GradeQuestionType;
      answerText: string | null;
      answerJson: unknown;
      selectedOptionIds: string[];
    }>,
  ) {
    const questionId = overrides?.questionId ?? QUESTION_ID;
    const selectedOptionIds = overrides?.selectedOptionIds ?? [OPTION_ID];

    return {
      id: overrides?.id ?? `answer-${questionId}`,
      schoolId: SCHOOL_ID,
      submissionId: SUBMISSION_ID,
      assessmentId: ASSESSMENT_ID,
      questionId,
      studentId: STUDENT_ID,
      answerText: overrides?.answerText ?? null,
      answerJson: overrides?.answerJson ?? null,
      correctionStatus: GradeAnswerCorrectionStatus.PENDING,
      awardedPoints: null,
      maxPoints: new Prisma.Decimal(5),
      reviewerComment: null,
      reviewerCommentAr: null,
      reviewedById: null,
      reviewedAt: null,
      createdAt: new Date('2026-09-10T08:00:00.000Z'),
      updatedAt: new Date('2026-09-10T08:00:00.000Z'),
      question: {
        id: questionId,
        type: overrides?.type ?? GradeQuestionType.MCQ_SINGLE,
        points: new Prisma.Decimal(5),
      },
      selectedOptions: selectedOptionIds.map((optionId) => ({
        schoolId: SCHOOL_ID,
        answerId: `answer-${questionId}`,
        optionId,
        createdAt: new Date('2026-09-10T08:00:00.000Z'),
        option: {
          id: optionId,
          questionId,
          label: optionId === OPTION_ID ? 'A' : 'B',
          labelAr: null,
          value: optionId === OPTION_ID ? 'a' : 'b',
          deletedAt: null,
        },
      })),
    };
  }

  function submissionRecord(
    overrides?: Partial<{
      status: GradeSubmissionStatus;
      assessment: ReturnType<typeof assessmentRecord>;
      answers: ReturnType<typeof answerRecord>[];
    }>,
  ) {
    return {
      id: SUBMISSION_ID,
      schoolId: SCHOOL_ID,
      assessmentId: ASSESSMENT_ID,
      termId: 'term-1',
      studentId: STUDENT_ID,
      enrollmentId: ENROLLMENT_ID,
      status: overrides?.status ?? GradeSubmissionStatus.IN_PROGRESS,
      startedAt: new Date('2026-09-10T08:00:00.000Z'),
      submittedAt: null,
      correctedAt: null,
      reviewedById: null,
      totalScore: null,
      maxScore: new Prisma.Decimal(10),
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
      answers: overrides?.answers ?? [],
    };
  }

  function questionsForSubmit() {
    return [
      questionRecord({ id: QUESTION_ID, type: GradeQuestionType.MCQ_SINGLE }),
      questionRecord({
        id: QUESTION_TWO_ID,
        type: GradeQuestionType.SHORT_ANSWER,
      }),
    ];
  }

  function baseRepository(overrides?: Partial<Record<string, jest.Mock>>) {
    const questions = questionsForSubmit();

    return {
      findAssessmentForSubmission: jest
        .fn()
        .mockResolvedValue(assessmentRecord()),
      findStudentForSubmission: jest.fn().mockResolvedValue({
        id: STUDENT_ID,
        firstName: 'Ahmed',
        lastName: 'Ali',
        status: 'ACTIVE',
      }),
      findEnrollmentForSubmission: jest
        .fn()
        .mockResolvedValue(enrollmentRecord()),
      findExistingSubmission: jest.fn().mockResolvedValue(null),
      createSubmission: jest.fn().mockResolvedValue(submissionRecord()),
      listSubmissions: jest.fn().mockResolvedValue([submissionRecord()]),
      findSubmissionDetail: jest.fn().mockResolvedValue(submissionRecord()),
      findQuestionForAnswer: jest.fn().mockResolvedValue(questionRecord()),
      findQuestionsForSubmission: jest.fn().mockResolvedValue(questions),
      findQuestionsByIds: jest
        .fn()
        .mockImplementation((ids: string[]) =>
          Promise.resolve(
            questions.filter((question) => ids.includes(question.id)),
          ),
        ),
      findOptionsForQuestion: jest
        .fn()
        .mockResolvedValue([
          optionRecord({ id: OPTION_ID }),
          optionRecord({ id: OPTION_TWO_ID }),
        ]),
      findOptionsByIds: jest.fn().mockImplementation((ids: string[]) =>
        Promise.resolve(
          ids.map((id) =>
            optionRecord({
              id,
              label: id === OPTION_ID ? 'A' : 'B',
            }),
          ),
        ),
      ),
      upsertAnswerWithSelectedOptions: jest
        .fn()
        .mockResolvedValue(answerRecord()),
      bulkUpsertAnswersWithSelectedOptions: jest.fn().mockResolvedValue([
        answerRecord(),
        answerRecord({
          id: 'answer-2',
          questionId: QUESTION_TWO_ID,
          type: GradeQuestionType.SHORT_ANSWER,
          answerText: 'written',
          selectedOptionIds: [],
        }),
      ]),
      submitSubmission: jest.fn().mockResolvedValue(
        submissionRecord({
          status: GradeSubmissionStatus.SUBMITTED,
          answers: [
            answerRecord(),
            answerRecord({
              questionId: QUESTION_TWO_ID,
              type: GradeQuestionType.SHORT_ANSWER,
              answerText: 'written',
              selectedOptionIds: [],
            }),
          ],
        }),
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

  it('resolve creates IN_PROGRESS submission for valid published question-based assessment', async () => {
    const repository = baseRepository();
    const auth = authRepository();
    const useCase = new ResolveGradeSubmissionUseCase(repository, auth);

    const result = await withGradesScope(() =>
      useCase.execute(ASSESSMENT_ID, { studentId: STUDENT_ID }),
    );

    expect(repository.createSubmission).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: SCHOOL_ID,
        assessmentId: ASSESSMENT_ID,
        studentId: STUDENT_ID,
        enrollmentId: ENROLLMENT_ID,
      }),
    );
    expect(result.status).toBe('in_progress');
    expect(auth.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'grades.submission.create' }),
    );
  });

  it('resolve is idempotent when submission already exists', async () => {
    const repository = baseRepository({
      findExistingSubmission: jest.fn().mockResolvedValue(submissionRecord()),
    });
    const auth = authRepository();
    const useCase = new ResolveGradeSubmissionUseCase(repository, auth);

    const result = await withGradesScope(() =>
      useCase.execute(ASSESSMENT_ID, { studentId: STUDENT_ID }),
    );

    expect(result.id).toBe(SUBMISSION_ID);
    expect(repository.createSubmission).not.toHaveBeenCalled();
    expect(auth.createAuditLog).not.toHaveBeenCalled();
  });

  it('resolve rejects SCORE_ONLY assessment', async () => {
    const repository = baseRepository({
      findAssessmentForSubmission: jest.fn().mockResolvedValue(
        assessmentRecord({
          deliveryMode: GradeAssessmentDeliveryMode.SCORE_ONLY,
        }),
      ),
    });
    const useCase = new ResolveGradeSubmissionUseCase(
      repository,
      authRepository(),
    );

    await expect(
      withGradesScope(() =>
        useCase.execute(ASSESSMENT_ID, { studentId: STUDENT_ID }),
      ),
    ).rejects.toMatchObject({ code: 'validation.failed' });
  });

  it('resolve rejects DRAFT assessment', async () => {
    const repository = baseRepository({
      findAssessmentForSubmission: jest.fn().mockResolvedValue(
        assessmentRecord({
          approvalStatus: GradeAssessmentApprovalStatus.DRAFT,
        }),
      ),
    });
    const useCase = new ResolveGradeSubmissionUseCase(
      repository,
      authRepository(),
    );

    await expect(
      withGradesScope(() =>
        useCase.execute(ASSESSMENT_ID, { studentId: STUDENT_ID }),
      ),
    ).rejects.toMatchObject({ code: 'grades.assessment.not_published' });
  });

  it('resolve rejects locked assessment', async () => {
    const repository = baseRepository({
      findAssessmentForSubmission: jest
        .fn()
        .mockResolvedValue(assessmentRecord({ lockedAt: new Date() })),
    });
    const useCase = new ResolveGradeSubmissionUseCase(
      repository,
      authRepository(),
    );

    await expect(
      withGradesScope(() =>
        useCase.execute(ASSESSMENT_ID, { studentId: STUDENT_ID }),
      ),
    ).rejects.toMatchObject({ code: 'grades.assessment.locked' });
  });

  it('resolve rejects closed/inactive term', async () => {
    const repository = baseRepository({
      findAssessmentForSubmission: jest
        .fn()
        .mockResolvedValue(assessmentRecord({ termActive: false })),
    });
    const useCase = new ResolveGradeSubmissionUseCase(
      repository,
      authRepository(),
    );

    await expect(
      withGradesScope(() =>
        useCase.execute(ASSESSMENT_ID, { studentId: STUDENT_ID }),
      ),
    ).rejects.toMatchObject({ code: 'grades.term.closed' });
  });

  it('resolve rejects student outside school', async () => {
    const repository = baseRepository({
      findStudentForSubmission: jest.fn().mockResolvedValue(null),
    });
    const useCase = new ResolveGradeSubmissionUseCase(
      repository,
      authRepository(),
    );

    await expect(
      withGradesScope(() =>
        useCase.execute(ASSESSMENT_ID, { studentId: STUDENT_ID }),
      ),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('resolve rejects student outside assessment scope/enrollment', async () => {
    const repository = baseRepository({
      findEnrollmentForSubmission: jest.fn().mockResolvedValue(null),
    });
    const useCase = new ResolveGradeSubmissionUseCase(
      repository,
      authRepository(),
    );

    await expect(
      withGradesScope(() =>
        useCase.execute(ASSESSMENT_ID, { studentId: STUDENT_ID }),
      ),
    ).rejects.toMatchObject({ code: 'grades.gradebook.no_enrollment' });
  });

  it('list submissions returns rows with progress', async () => {
    const repository = baseRepository({
      listSubmissions: jest.fn().mockResolvedValue([
        {
          ...submissionRecord(),
          answers: [answerRecord()],
        },
      ]),
    });
    const useCase = new ListGradeSubmissionsUseCase(repository);

    const result = await withGradesScope(() =>
      useCase.execute(ASSESSMENT_ID, {}),
    );

    expect(result.items[0]).toMatchObject({
      id: SUBMISSION_ID,
      progress: {
        totalQuestions: 2,
        answeredCount: 1,
        pendingCorrectionCount: 1,
      },
    });
  });

  it('detail returns questions and answers', async () => {
    const repository = baseRepository({
      findSubmissionDetail: jest
        .fn()
        .mockResolvedValue(submissionRecord({ answers: [answerRecord()] })),
    });
    const useCase = new GetGradeSubmissionUseCase(repository);

    const result = await withGradesScope(() => useCase.execute(SUBMISSION_ID));

    expect(result.answers).toHaveLength(1);
    expect(result.questions).toHaveLength(2);
    expect(result.questions[1].answer).toBeNull();
  });

  it('save MCQ_SINGLE answer succeeds with exactly one option', async () => {
    const repository = baseRepository();
    const auth = authRepository();
    const useCase = new SaveGradeSubmissionAnswerUseCase(repository, auth);

    const result = await withGradesScope(() =>
      useCase.execute(SUBMISSION_ID, QUESTION_ID, {
        selectedOptionIds: [OPTION_ID],
      }),
    );

    expect(repository.upsertAnswerWithSelectedOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ selectedOptionIds: [OPTION_ID] }),
      }),
    );
    expect(result.awardedPoints).toBeNull();
    expect(auth.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'grades.submission.answer.save' }),
    );
  });

  it('save MCQ_SINGLE rejects multiple options', async () => {
    const repository = baseRepository();
    const useCase = new SaveGradeSubmissionAnswerUseCase(
      repository,
      authRepository(),
    );

    await expect(
      withGradesScope(() =>
        useCase.execute(SUBMISSION_ID, QUESTION_ID, {
          selectedOptionIds: [OPTION_ID, OPTION_TWO_ID],
        }),
      ),
    ).rejects.toMatchObject({ code: 'validation.failed' });
  });

  it('save MCQ_MULTI succeeds with multiple options', async () => {
    const repository = baseRepository({
      findQuestionForAnswer: jest
        .fn()
        .mockResolvedValue(
          questionRecord({ type: GradeQuestionType.MCQ_MULTI }),
        ),
    });
    const useCase = new SaveGradeSubmissionAnswerUseCase(
      repository,
      authRepository(),
    );

    await withGradesScope(() =>
      useCase.execute(SUBMISSION_ID, QUESTION_ID, {
        selectedOptionIds: [OPTION_ID, OPTION_TWO_ID],
      }),
    );

    expect(repository.upsertAnswerWithSelectedOptions).toHaveBeenCalled();
  });

  it('save TRUE_FALSE succeeds with one option', async () => {
    const repository = baseRepository({
      findQuestionForAnswer: jest
        .fn()
        .mockResolvedValue(
          questionRecord({ type: GradeQuestionType.TRUE_FALSE }),
        ),
    });
    const useCase = new SaveGradeSubmissionAnswerUseCase(
      repository,
      authRepository(),
    );

    await withGradesScope(() =>
      useCase.execute(SUBMISSION_ID, QUESTION_ID, {
        selectedOptionIds: [OPTION_ID],
      }),
    );

    expect(repository.upsertAnswerWithSelectedOptions).toHaveBeenCalled();
  });

  it('save written answer rejects selected options', async () => {
    const repository = baseRepository({
      findQuestionForAnswer: jest.fn().mockResolvedValue(
        questionRecord({
          type: GradeQuestionType.ESSAY,
          options: [],
        }),
      ),
    });
    const useCase = new SaveGradeSubmissionAnswerUseCase(
      repository,
      authRepository(),
    );

    await expect(
      withGradesScope(() =>
        useCase.execute(SUBMISSION_ID, QUESTION_ID, {
          answerText: 'Written',
          selectedOptionIds: [OPTION_ID],
        }),
      ),
    ).rejects.toMatchObject({ code: 'validation.failed' });
  });

  it('save rejects option from another question/school', async () => {
    const repository = baseRepository({
      findOptionsByIds: jest
        .fn()
        .mockResolvedValue([optionRecord({ questionId: 'other-question' })]),
    });
    const useCase = new SaveGradeSubmissionAnswerUseCase(
      repository,
      authRepository(),
    );

    await expect(
      withGradesScope(() =>
        useCase.execute(SUBMISSION_ID, QUESTION_ID, {
          selectedOptionIds: [OPTION_ID],
        }),
      ),
    ).rejects.toMatchObject({ code: 'grades.answer.invalid_option' });
  });

  it('bulk save succeeds all-or-nothing', async () => {
    const repository = baseRepository();
    const auth = authRepository();
    const useCase = new BulkSaveGradeSubmissionAnswersUseCase(repository, auth);

    const result = await withGradesScope(() =>
      useCase.execute(SUBMISSION_ID, {
        answers: [
          { questionId: QUESTION_ID, selectedOptionIds: [OPTION_ID] },
          { questionId: QUESTION_TWO_ID, answerText: 'written' },
        ],
      }),
    );

    expect(result.savedCount).toBe(2);
    expect(repository.bulkUpsertAnswersWithSelectedOptions).toHaveBeenCalled();
    expect(auth.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'grades.submission.answers.bulk_save',
      }),
    );
  });

  it('bulk save rejects duplicate questionIds', async () => {
    const repository = baseRepository();
    const useCase = new BulkSaveGradeSubmissionAnswersUseCase(
      repository,
      authRepository(),
    );

    await expect(
      withGradesScope(() =>
        useCase.execute(SUBMISSION_ID, {
          answers: [
            { questionId: QUESTION_ID, selectedOptionIds: [OPTION_ID] },
            { questionId: QUESTION_ID, selectedOptionIds: [OPTION_ID] },
          ],
        }),
      ),
    ).rejects.toMatchObject({ code: 'validation.failed' });
    expect(
      repository.bulkUpsertAnswersWithSelectedOptions,
    ).not.toHaveBeenCalled();
  });

  it('bulk save rejects if any answer invalid and writes nothing', async () => {
    const repository = baseRepository();
    const useCase = new BulkSaveGradeSubmissionAnswersUseCase(
      repository,
      authRepository(),
    );

    await expect(
      withGradesScope(() =>
        useCase.execute(SUBMISSION_ID, {
          answers: [
            { questionId: QUESTION_ID, selectedOptionIds: [OPTION_ID] },
            { questionId: QUESTION_TWO_ID },
          ],
        }),
      ),
    ).rejects.toMatchObject({ code: 'validation.failed' });
    expect(
      repository.bulkUpsertAnswersWithSelectedOptions,
    ).not.toHaveBeenCalled();
  });

  it('submit succeeds when all required questions answered', async () => {
    const repository = baseRepository({
      findSubmissionDetail: jest.fn().mockResolvedValue(
        submissionRecord({
          answers: [
            answerRecord(),
            answerRecord({
              questionId: QUESTION_TWO_ID,
              type: GradeQuestionType.SHORT_ANSWER,
              answerText: 'written',
              selectedOptionIds: [],
            }),
          ],
        }),
      ),
    });
    const auth = authRepository();
    const useCase = new SubmitGradeSubmissionUseCase(repository, auth);

    const result = await withGradesScope(() => useCase.execute(SUBMISSION_ID));

    expect(result.status).toBe('submitted');
    expect(repository.submitSubmission).toHaveBeenCalledWith(SUBMISSION_ID);
    expect(auth.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'grades.submission.submit' }),
    );
  });

  it('submit rejects when required question missing', async () => {
    const repository = baseRepository({
      findSubmissionDetail: jest
        .fn()
        .mockResolvedValue(submissionRecord({ answers: [answerRecord()] })),
    });
    const useCase = new SubmitGradeSubmissionUseCase(
      repository,
      authRepository(),
    );

    await expect(
      withGradesScope(() => useCase.execute(SUBMISSION_ID)),
    ).rejects.toMatchObject({ code: 'validation.failed' });
    expect(repository.submitSubmission).not.toHaveBeenCalled();
  });

  it('submit rejects already SUBMITTED submission', async () => {
    const repository = baseRepository({
      findSubmissionDetail: jest.fn().mockResolvedValue(
        submissionRecord({
          status: GradeSubmissionStatus.SUBMITTED,
          answers: [answerRecord()],
        }),
      ),
    });
    const useCase = new SubmitGradeSubmissionUseCase(
      repository,
      authRepository(),
    );

    await expect(
      withGradesScope(() => useCase.execute(SUBMISSION_ID)),
    ).rejects.toMatchObject({ code: 'grades.submission.already_submitted' });
  });

  it('save answer rejects SUBMITTED submission', async () => {
    const repository = baseRepository({
      findSubmissionDetail: jest.fn().mockResolvedValue(
        submissionRecord({
          status: GradeSubmissionStatus.SUBMITTED,
        }),
      ),
    });
    const useCase = new SaveGradeSubmissionAnswerUseCase(
      repository,
      authRepository(),
    );

    await expect(
      withGradesScope(() =>
        useCase.execute(SUBMISSION_ID, QUESTION_ID, {
          selectedOptionIds: [OPTION_ID],
        }),
      ),
    ).rejects.toMatchObject({ code: 'grades.submission.already_submitted' });
  });

  it('save answer does not create GradeItem', async () => {
    const repository = baseRepository();
    const useCase = new SaveGradeSubmissionAnswerUseCase(
      repository,
      authRepository(),
    );

    await withGradesScope(() =>
      useCase.execute(SUBMISSION_ID, QUESTION_ID, {
        selectedOptionIds: [OPTION_ID],
      }),
    );

    expect(repository.countGradeItemsForAssessment).not.toHaveBeenCalled();
  });

  it('submit does not create GradeItem', async () => {
    const repository = baseRepository({
      findSubmissionDetail: jest.fn().mockResolvedValue(
        submissionRecord({
          answers: [
            answerRecord(),
            answerRecord({
              questionId: QUESTION_TWO_ID,
              type: GradeQuestionType.SHORT_ANSWER,
              answerText: 'written',
              selectedOptionIds: [],
            }),
          ],
        }),
      ),
    });
    const useCase = new SubmitGradeSubmissionUseCase(
      repository,
      authRepository(),
    );

    await withGradesScope(() => useCase.execute(SUBMISSION_ID));

    expect(repository.countGradeItemsForAssessment).not.toHaveBeenCalled();
  });
});
