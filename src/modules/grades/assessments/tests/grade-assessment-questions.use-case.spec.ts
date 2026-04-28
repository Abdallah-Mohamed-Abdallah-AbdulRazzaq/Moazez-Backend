import {
  AuditOutcome,
  GradeAssessmentApprovalStatus,
  GradeAssessmentDeliveryMode,
  GradeQuestionType,
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
import { BulkUpdateGradeAssessmentQuestionPointsUseCase } from '../application/bulk-update-grade-assessment-question-points.use-case';
import { CreateGradeAssessmentQuestionUseCase } from '../application/create-grade-assessment-question.use-case';
import { DeleteGradeAssessmentQuestionUseCase } from '../application/delete-grade-assessment-question.use-case';
import { ListGradeAssessmentQuestionsUseCase } from '../application/list-grade-assessment-questions.use-case';
import { ReorderGradeAssessmentQuestionsUseCase } from '../application/reorder-grade-assessment-questions.use-case';
import { UpdateGradeAssessmentQuestionUseCase } from '../application/update-grade-assessment-question.use-case';
import {
  GradeAnswerInvalidOptionException,
  GradeQuestionStructureLockedException,
} from '../domain/grade-question-domain';
import {
  GradeAssessmentInvalidStatusTransitionException,
  GradeAssessmentLockedException,
} from '../domain/grade-assessment-domain';
import { GradeTermClosedException } from '../../shared/domain/grade-workflow';
import {
  GradeAssessmentForQuestionManagementRecord,
  GradeAssessmentQuestionRecord,
  GradeAssessmentQuestionWithAssessmentRecord,
  GradesAssessmentQuestionsRepository,
} from '../infrastructure/grades-assessment-questions.repository';

const SCHOOL_ID = 'school-1';
const ASSESSMENT_ID = 'assessment-1';
const QUESTION_ID = 'question-1';

describe('grade assessment question use cases', () => {
  async function withGradesScope<T>(fn: () => Promise<T>): Promise<T> {
    return runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: 'user-1', userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: 'membership-1',
        organizationId: 'org-1',
        schoolId: SCHOOL_ID,
        roleId: 'role-1',
        permissions: ['grades.questions.view', 'grades.questions.manage'],
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
  ): GradeAssessmentForQuestionManagementRecord {
    return {
      id: ASSESSMENT_ID,
      schoolId: SCHOOL_ID,
      academicYearId: 'year-1',
      termId: 'term-1',
      deliveryMode:
        overrides?.deliveryMode ?? GradeAssessmentDeliveryMode.QUESTION_BASED,
      approvalStatus:
        overrides?.approvalStatus ?? GradeAssessmentApprovalStatus.DRAFT,
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

  function optionRecord(
    overrides?: Partial<GradeAssessmentQuestionRecord['options'][number]>,
  ): GradeAssessmentQuestionRecord['options'][number] {
    return {
      id: overrides?.id ?? 'option-1',
      schoolId: SCHOOL_ID,
      assessmentId: ASSESSMENT_ID,
      questionId: QUESTION_ID,
      label: overrides?.label ?? 'A',
      labelAr: overrides?.labelAr ?? null,
      value: overrides?.value ?? 'a',
      isCorrect: overrides?.isCorrect ?? true,
      sortOrder: overrides?.sortOrder ?? 1,
      metadata: overrides?.metadata ?? null,
      createdAt: new Date('2026-09-10T08:00:00.000Z'),
      updatedAt: new Date('2026-09-10T08:00:00.000Z'),
      deletedAt: null,
    };
  }

  function questionRecord(
    overrides?: Partial<{
      id: string;
      type: GradeQuestionType;
      points: number;
      sortOrder: number;
      options: GradeAssessmentQuestionRecord['options'];
    }>,
  ): GradeAssessmentQuestionRecord {
    return {
      id: overrides?.id ?? QUESTION_ID,
      schoolId: SCHOOL_ID,
      assessmentId: ASSESSMENT_ID,
      type: overrides?.type ?? GradeQuestionType.MCQ_SINGLE,
      prompt: 'Choose one',
      promptAr: null,
      explanation: null,
      explanationAr: null,
      points: new Prisma.Decimal(overrides?.points ?? 5),
      sortOrder: overrides?.sortOrder ?? 1,
      required: true,
      answerKey: null,
      metadata: null,
      createdAt: new Date('2026-09-10T08:00:00.000Z'),
      updatedAt: new Date('2026-09-10T08:00:00.000Z'),
      deletedAt: null,
      options: overrides?.options ?? [
        optionRecord({ id: 'option-1', isCorrect: true, sortOrder: 1 }),
        optionRecord({
          id: 'option-2',
          label: 'B',
          value: 'b',
          isCorrect: false,
          sortOrder: 2,
        }),
      ],
    };
  }

  function questionWithAssessment(
    overrides?: Parameters<typeof questionRecord>[0] & {
      assessment?: GradeAssessmentForQuestionManagementRecord;
    },
  ): GradeAssessmentQuestionWithAssessmentRecord {
    return {
      ...questionRecord(overrides),
      assessment: overrides?.assessment ?? assessmentRecord(),
    };
  }

  function baseRepository(overrides?: Partial<Record<string, jest.Mock>>) {
    return {
      findAssessmentForQuestionManagement: jest
        .fn()
        .mockResolvedValue(assessmentRecord()),
      listQuestions: jest
        .fn()
        .mockResolvedValue([
          questionRecord({ id: 'question-1', sortOrder: 1, points: 4 }),
          questionRecord({ id: 'question-2', sortOrder: 2, points: 6 }),
        ]),
      findQuestionByIdWithAssessment: jest
        .fn()
        .mockResolvedValue(questionWithAssessment()),
      listQuestionsByIds: jest
        .fn()
        .mockImplementation((ids: string[]) =>
          Promise.resolve(
            ids.map((id) => ({ id, assessmentId: ASSESSMENT_ID })),
          ),
        ),
      countSubmissionsForAssessment: jest.fn().mockResolvedValue(0),
      getNextQuestionSortOrder: jest.fn().mockResolvedValue(3),
      isQuestionSortOrderTaken: jest.fn().mockResolvedValue(false),
      createQuestionWithOptions: jest.fn().mockImplementation((input) =>
        Promise.resolve(
          questionRecord({
            type: input.type,
            points: input.points,
            sortOrder: input.sortOrder,
            options: input.options.map(
              (
                option: GradeAssessmentQuestionRecord['options'][number],
                index: number,
              ) =>
                optionRecord({
                  ...option,
                  id: `created-option-${index + 1}`,
                }),
            ),
          }),
        ),
      ),
      updateQuestionAndReplaceOptions: jest
        .fn()
        .mockImplementation((_id, input) =>
          Promise.resolve(
            questionRecord({
              type: input.data.type ?? GradeQuestionType.MCQ_SINGLE,
              points: input.data.points ?? 5,
              options: input.options
                ? input.options.map(
                    (
                      option: GradeAssessmentQuestionRecord['options'][number],
                      index: number,
                    ) =>
                      optionRecord({
                        ...option,
                        id: `updated-option-${index + 1}`,
                      }),
                  )
                : undefined,
            }),
          ),
        ),
      softDeleteQuestionAndOptions: jest.fn().mockResolvedValue([]),
      reorderQuestions: jest
        .fn()
        .mockImplementation((_params) =>
          Promise.resolve([
            questionRecord({ id: 'question-2', sortOrder: 1, points: 6 }),
            questionRecord({ id: 'question-1', sortOrder: 2, points: 4 }),
          ]),
        ),
      bulkUpdateQuestionPoints: jest
        .fn()
        .mockImplementation((_params) =>
          Promise.resolve([
            questionRecord({ id: 'question-1', points: 3, sortOrder: 1 }),
            questionRecord({ id: 'question-2', points: 4, sortOrder: 2 }),
          ]),
        ),
      ...overrides,
    } as unknown as GradesAssessmentQuestionsRepository;
  }

  function authRepository(overrides?: Partial<Record<string, jest.Mock>>) {
    return {
      createAuditLog: jest.fn().mockResolvedValue(undefined),
      ...overrides,
    } as unknown as AuthRepository;
  }

  const mcqSingleCommand = {
    type: GradeQuestionType.MCQ_SINGLE,
    prompt: 'Choose one',
    points: 5,
    options: [
      { label: 'A', isCorrect: true },
      { label: 'B', isCorrect: false },
    ],
  };

  it('lists active questions in repository order with totals', async () => {
    const repository = baseRepository();
    const useCase = new ListGradeAssessmentQuestionsUseCase(repository);

    const result = await withGradesScope(() =>
      useCase.execute(ASSESSMENT_ID, {}),
    );

    expect(repository.listQuestions).toHaveBeenCalledWith(ASSESSMENT_ID);
    expect(result).toMatchObject({
      assessmentId: ASSESSMENT_ID,
      totalQuestions: 2,
      totalPoints: 10,
      pointsMatchMaxScore: true,
      questions: [
        expect.objectContaining({ id: 'question-1', sortOrder: 1 }),
        expect.objectContaining({ id: 'question-2', sortOrder: 2 }),
      ],
    });
  });

  it('creates MCQ_SINGLE with exactly one correct option and audits it', async () => {
    const repository = baseRepository();
    const auth = authRepository();
    const useCase = new CreateGradeAssessmentQuestionUseCase(repository, auth);

    const result = await withGradesScope(() =>
      useCase.execute(ASSESSMENT_ID, mcqSingleCommand),
    );

    expect(repository.createQuestionWithOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        assessmentId: ASSESSMENT_ID,
        type: GradeQuestionType.MCQ_SINGLE,
        points: 5,
        sortOrder: 3,
        options: [
          expect.objectContaining({ label: 'A', isCorrect: true }),
          expect.objectContaining({ label: 'B', isCorrect: false }),
        ],
      }),
    );
    expect(result).toMatchObject({ type: 'mcq_single', points: 5 });
    expect(auth.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'grades.question.create',
        resourceType: 'grade_assessment_question',
        outcome: AuditOutcome.SUCCESS,
      }),
    );
  });

  it('rejects MCQ_SINGLE with multiple correct options', async () => {
    const repository = baseRepository({ createQuestionWithOptions: jest.fn() });
    const useCase = new CreateGradeAssessmentQuestionUseCase(
      repository,
      authRepository(),
    );

    await expect(
      withGradesScope(() =>
        useCase.execute(ASSESSMENT_ID, {
          ...mcqSingleCommand,
          options: [
            { label: 'A', isCorrect: true },
            { label: 'B', isCorrect: true },
          ],
        }),
      ),
    ).rejects.toBeInstanceOf(GradeAnswerInvalidOptionException);
    expect(repository.createQuestionWithOptions).not.toHaveBeenCalled();
  });

  it('creates MCQ_MULTI with at least one correct option', async () => {
    const repository = baseRepository();
    const useCase = new CreateGradeAssessmentQuestionUseCase(
      repository,
      authRepository(),
    );

    await withGradesScope(() =>
      useCase.execute(ASSESSMENT_ID, {
        ...mcqSingleCommand,
        type: GradeQuestionType.MCQ_MULTI,
        options: [
          { label: 'A', isCorrect: true },
          { label: 'B', isCorrect: true },
          { label: 'C', isCorrect: false },
        ],
      }),
    );

    expect(repository.createQuestionWithOptions).toHaveBeenCalled();
  });

  it('validates TRUE_FALSE exactly one correct option', async () => {
    const repository = baseRepository();
    const useCase = new CreateGradeAssessmentQuestionUseCase(
      repository,
      authRepository(),
    );

    await withGradesScope(() =>
      useCase.execute(ASSESSMENT_ID, {
        type: GradeQuestionType.TRUE_FALSE,
        prompt: 'Correct?',
        points: 2,
        options: [
          { label: 'True', value: 'true', isCorrect: true },
          { label: 'False', value: 'false', isCorrect: false },
        ],
      }),
    );

    await expect(
      withGradesScope(() =>
        useCase.execute(ASSESSMENT_ID, {
          type: GradeQuestionType.TRUE_FALSE,
          prompt: 'Correct?',
          points: 2,
          options: [
            { label: 'True', value: 'true', isCorrect: true },
            { label: 'False', value: 'false', isCorrect: true },
          ],
        }),
      ),
    ).rejects.toBeInstanceOf(GradeAnswerInvalidOptionException);
  });

  it('auto-normalizes TRUE_FALSE options from answerKey when options are omitted', async () => {
    const repository = baseRepository();
    const useCase = new CreateGradeAssessmentQuestionUseCase(
      repository,
      authRepository(),
    );

    await withGradesScope(() =>
      useCase.execute(ASSESSMENT_ID, {
        type: GradeQuestionType.TRUE_FALSE,
        prompt: 'Correct?',
        points: 2,
        answerKey: true,
      }),
    );

    expect(repository.createQuestionWithOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        options: [
          expect.objectContaining({ value: 'true', isCorrect: true }),
          expect.objectContaining({ value: 'false', isCorrect: false }),
        ],
      }),
    );
  });

  it('rejects SHORT_ANSWER options', async () => {
    const repository = baseRepository({ createQuestionWithOptions: jest.fn() });
    const useCase = new CreateGradeAssessmentQuestionUseCase(
      repository,
      authRepository(),
    );

    await expect(
      withGradesScope(() =>
        useCase.execute(ASSESSMENT_ID, {
          type: GradeQuestionType.SHORT_ANSWER,
          prompt: 'Explain',
          points: 3,
          options: [{ label: 'A', isCorrect: true }],
        }),
      ),
    ).rejects.toBeInstanceOf(GradeAnswerInvalidOptionException);
    expect(repository.createQuestionWithOptions).not.toHaveBeenCalled();
  });

  it('rejects SCORE_ONLY assessment question management', async () => {
    const repository = baseRepository({
      findAssessmentForQuestionManagement: jest.fn().mockResolvedValue(
        assessmentRecord({
          deliveryMode: GradeAssessmentDeliveryMode.SCORE_ONLY,
        }),
      ),
      createQuestionWithOptions: jest.fn(),
    });
    const useCase = new CreateGradeAssessmentQuestionUseCase(
      repository,
      authRepository(),
    );

    await expect(
      withGradesScope(() => useCase.execute(ASSESSMENT_ID, mcqSingleCommand)),
    ).rejects.toBeInstanceOf(ValidationDomainException);
    expect(repository.createQuestionWithOptions).not.toHaveBeenCalled();
  });

  it('rejects non-DRAFT, locked, closed-term, and submitted assessments', async () => {
    await expectCreateRejected(
      baseRepository({
        findAssessmentForQuestionManagement: jest.fn().mockResolvedValue(
          assessmentRecord({
            approvalStatus: GradeAssessmentApprovalStatus.PUBLISHED,
          }),
        ),
      }),
      GradeAssessmentInvalidStatusTransitionException,
    );

    await expectCreateRejected(
      baseRepository({
        findAssessmentForQuestionManagement: jest
          .fn()
          .mockResolvedValue(
            assessmentRecord({
              lockedAt: new Date('2026-09-10T08:00:00.000Z'),
            }),
          ),
      }),
      GradeAssessmentLockedException,
    );

    await expectCreateRejected(
      baseRepository({
        findAssessmentForQuestionManagement: jest
          .fn()
          .mockResolvedValue(assessmentRecord({ termActive: false })),
      }),
      GradeTermClosedException,
    );

    await expectCreateRejected(
      baseRepository({
        countSubmissionsForAssessment: jest.fn().mockResolvedValue(1),
      }),
      GradeQuestionStructureLockedException,
    );
  });

  it('updates a question and replaces options deterministically', async () => {
    const repository = baseRepository();
    const auth = authRepository();
    const useCase = new UpdateGradeAssessmentQuestionUseCase(repository, auth);

    const result = await withGradesScope(() =>
      useCase.execute(QUESTION_ID, {
        prompt: 'Updated',
        points: 6,
        options: [
          { label: 'New A', isCorrect: false, sortOrder: 1 },
          { label: 'New B', isCorrect: true, sortOrder: 2 },
        ],
      }),
    );

    expect(repository.updateQuestionAndReplaceOptions).toHaveBeenCalledWith(
      QUESTION_ID,
      expect.objectContaining({
        data: expect.objectContaining({ prompt: 'Updated', points: 6 }),
        options: [
          expect.objectContaining({ label: 'New A', sortOrder: 1 }),
          expect.objectContaining({ label: 'New B', sortOrder: 2 }),
        ],
      }),
    );
    expect(result).toMatchObject({ points: 6 });
    expect(auth.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'grades.question.update',
        before: expect.objectContaining({ id: QUESTION_ID }),
        after: expect.objectContaining({ id: QUESTION_ID }),
      }),
    );
  });

  it('returns not found for missing or cross-school question updates', async () => {
    const repository = baseRepository({
      findQuestionByIdWithAssessment: jest.fn().mockResolvedValue(null),
      updateQuestionAndReplaceOptions: jest.fn(),
    });
    const useCase = new UpdateGradeAssessmentQuestionUseCase(
      repository,
      authRepository(),
    );

    await expect(
      withGradesScope(() =>
        useCase.execute(QUESTION_ID, { prompt: 'Updated' }),
      ),
    ).rejects.toBeInstanceOf(NotFoundDomainException);
    expect(repository.updateQuestionAndReplaceOptions).not.toHaveBeenCalled();
  });

  it('soft-deletes a question and options', async () => {
    const repository = baseRepository();
    const auth = authRepository();
    const useCase = new DeleteGradeAssessmentQuestionUseCase(repository, auth);

    const result = await withGradesScope(() => useCase.execute(QUESTION_ID));

    expect(repository.softDeleteQuestionAndOptions).toHaveBeenCalledWith({
      questionId: QUESTION_ID,
      assessmentId: ASSESSMENT_ID,
    });
    expect(result).toEqual({ ok: true });
    expect(auth.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'grades.question.delete' }),
    );
  });

  it('reorders when all active question ids are included', async () => {
    const repository = baseRepository();
    const auth = authRepository();
    const useCase = new ReorderGradeAssessmentQuestionsUseCase(
      repository,
      auth,
    );

    const result = await withGradesScope(() =>
      useCase.execute(ASSESSMENT_ID, {
        questionIds: ['question-2', 'question-1'],
      }),
    );

    expect(repository.reorderQuestions).toHaveBeenCalledWith({
      assessmentId: ASSESSMENT_ID,
      questionIds: ['question-2', 'question-1'],
    });
    expect(result.questions.map((question) => question.id)).toEqual([
      'question-2',
      'question-1',
    ]);
    expect(auth.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'grades.question.reorder' }),
    );
  });

  it('rejects reorder missing, duplicate, or foreign question ids', async () => {
    await expectReorderRejected(
      { questionIds: ['question-1'] },
      ValidationDomainException,
    );
    await expectReorderRejected(
      { questionIds: ['question-1', 'question-1'] },
      ValidationDomainException,
    );
    await expectReorderRejected(
      { questionIds: ['question-1', 'foreign-question'] },
      NotFoundDomainException,
      baseRepository({
        listQuestionsByIds: jest
          .fn()
          .mockResolvedValue([
            { id: 'question-1', assessmentId: ASSESSMENT_ID },
          ]),
      }),
    );
  });

  it('bulk-updates points and does not enforce total equal to maxScore', async () => {
    const repository = baseRepository({
      findAssessmentForQuestionManagement: jest
        .fn()
        .mockResolvedValue(assessmentRecord({ maxScore: 10 })),
    });
    const auth = authRepository();
    const useCase = new BulkUpdateGradeAssessmentQuestionPointsUseCase(
      repository,
      auth,
    );

    const result = await withGradesScope(() =>
      useCase.execute(ASSESSMENT_ID, {
        items: [
          { questionId: 'question-1', points: 3 },
          { questionId: 'question-2', points: 4 },
        ],
      }),
    );

    expect(repository.bulkUpdateQuestionPoints).toHaveBeenCalledWith({
      assessmentId: ASSESSMENT_ID,
      items: [
        { questionId: 'question-1', points: 3 },
        { questionId: 'question-2', points: 4 },
      ],
    });
    expect(result.totalPoints).toBe(7);
    expect(result.pointsMatchMaxScore).toBe(false);
    expect(auth.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'grades.question.points.bulk_update',
      }),
    );
  });

  it('bulk points rejects duplicate question ids', async () => {
    const repository = baseRepository({ bulkUpdateQuestionPoints: jest.fn() });
    const useCase = new BulkUpdateGradeAssessmentQuestionPointsUseCase(
      repository,
      authRepository(),
    );

    await expect(
      withGradesScope(() =>
        useCase.execute(ASSESSMENT_ID, {
          items: [
            { questionId: 'question-1', points: 3 },
            { questionId: 'question-1', points: 4 },
          ],
        }),
      ),
    ).rejects.toBeInstanceOf(ValidationDomainException);
    expect(repository.bulkUpdateQuestionPoints).not.toHaveBeenCalled();
  });

  async function expectCreateRejected(
    repository: GradesAssessmentQuestionsRepository,
    errorClass: new (...args: never[]) => Error,
  ): Promise<void> {
    const useCase = new CreateGradeAssessmentQuestionUseCase(
      repository,
      authRepository(),
    );

    await expect(
      withGradesScope(() => useCase.execute(ASSESSMENT_ID, mcqSingleCommand)),
    ).rejects.toBeInstanceOf(errorClass);
  }

  async function expectReorderRejected(
    command: { questionIds: string[] },
    errorClass: new (...args: never[]) => Error,
    repository = baseRepository(),
  ): Promise<void> {
    const useCase = new ReorderGradeAssessmentQuestionsUseCase(
      repository,
      authRepository(),
    );

    await expect(
      withGradesScope(() => useCase.execute(ASSESSMENT_ID, command)),
    ).rejects.toBeInstanceOf(errorClass);
  }
});
