import {
  AuditOutcome,
  GradeAssessmentApprovalStatus,
  GradeAssessmentDeliveryMode,
  GradeAssessmentType,
  GradeQuestionType,
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
import { ApproveGradeAssessmentUseCase } from '../application/approve-grade-assessment.use-case';
import { CreateGradeAssessmentUseCase } from '../application/create-grade-assessment.use-case';
import { CreateQuestionBasedGradeAssessmentUseCase } from '../application/create-question-based-grade-assessment.use-case';
import { DeleteGradeAssessmentUseCase } from '../application/delete-grade-assessment.use-case';
import { GetGradeAssessmentUseCase } from '../application/get-grade-assessment.use-case';
import { ListGradeAssessmentsUseCase } from '../application/list-grade-assessments.use-case';
import { LockGradeAssessmentUseCase } from '../application/lock-grade-assessment.use-case';
import { PublishGradeAssessmentUseCase } from '../application/publish-grade-assessment.use-case';
import { UpdateGradeAssessmentUseCase } from '../application/update-grade-assessment.use-case';
import {
  GradeAssessmentAlreadyApprovedException,
  GradeAssessmentAlreadyLockedException,
  GradeAssessmentAlreadyPublishedException,
  GradeAssessmentInvalidStatusTransitionException,
  GradeAssessmentLockedException,
  GradeAssessmentNotApprovedException,
  GradeAssessmentNotPublishedException,
} from '../domain/grade-assessment-domain';
import { GradeQuestionPointsMismatchException } from '../domain/grade-assessment-question-publish-domain';
import { GradeAnswerInvalidOptionException } from '../domain/grade-question-domain';
import { GradeTermClosedException } from '../../shared/domain/grade-workflow';
import { GradesAssessmentsRepository } from '../infrastructure/grades-assessments.repository';

const SCHOOL_ID = 'school-1';
const YEAR_ID = 'year-1';
const TERM_ID = 'term-1';
const SUBJECT_ID = 'subject-1';
const STAGE_ID = 'stage-1';
const GRADE_ID = 'grade-1';
const SECTION_ID = 'section-1';
const CLASSROOM_ID = 'classroom-1';

describe('Grade assessment use cases', () => {
  async function withGradesScope<T>(fn: () => Promise<T>): Promise<T> {
    return runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: 'user-1', userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: 'membership-1',
        organizationId: 'org-1',
        schoolId: SCHOOL_ID,
        roleId: 'role-1',
        permissions: [
          'grades.assessments.view',
          'grades.assessments.manage',
          'grades.assessments.publish',
          'grades.assessments.approve',
          'grades.assessments.lock',
        ],
      });

      return fn();
    });
  }

  function activeTerm(overrides?: {
    isActive?: boolean;
    startDate?: Date;
    endDate?: Date;
  }) {
    return {
      id: TERM_ID,
      academicYearId: YEAR_ID,
      startDate: overrides?.startDate ?? new Date('2026-09-01T00:00:00.000Z'),
      endDate: overrides?.endDate ?? new Date('2026-12-31T00:00:00.000Z'),
      isActive: overrides?.isActive ?? true,
    };
  }

  function assessmentRecord(
    overrides?: Partial<{
      id: string;
      subjectId: string;
      scopeType: GradeScopeType;
      scopeKey: string;
      stageId: string | null;
      gradeId: string | null;
      sectionId: string | null;
      classroomId: string | null;
      type: GradeAssessmentType;
      deliveryMode: GradeAssessmentDeliveryMode;
      approvalStatus: GradeAssessmentApprovalStatus;
      publishedAt: Date | null;
      publishedById: string | null;
      approvedAt: Date | null;
      approvedById: string | null;
      lockedAt: Date | null;
      lockedById: string | null;
      weight: number;
      maxScore: number;
      deletedAt: Date | null;
    }>,
  ) {
    return {
      id: overrides?.id ?? 'assessment-1',
      schoolId: SCHOOL_ID,
      academicYearId: YEAR_ID,
      termId: TERM_ID,
      subjectId: overrides?.subjectId ?? SUBJECT_ID,
      scopeType: overrides?.scopeType ?? GradeScopeType.GRADE,
      scopeKey: overrides?.scopeKey ?? GRADE_ID,
      stageId: overrides?.stageId ?? STAGE_ID,
      gradeId: overrides?.gradeId ?? GRADE_ID,
      sectionId: overrides?.sectionId ?? null,
      classroomId: overrides?.classroomId ?? null,
      titleEn: 'Quiz 1',
      titleAr: 'Quiz 1 AR',
      type: overrides?.type ?? GradeAssessmentType.QUIZ,
      deliveryMode:
        overrides?.deliveryMode ?? GradeAssessmentDeliveryMode.SCORE_ONLY,
      date: new Date('2026-09-15T00:00:00.000Z'),
      weight: new Prisma.Decimal(overrides?.weight ?? 10),
      maxScore: new Prisma.Decimal(overrides?.maxScore ?? 20),
      expectedTimeMinutes: 30,
      approvalStatus:
        overrides?.approvalStatus ?? GradeAssessmentApprovalStatus.DRAFT,
      publishedAt: overrides?.publishedAt ?? null,
      publishedById: overrides?.publishedById ?? null,
      approvedAt: overrides?.approvedAt ?? null,
      approvedById: overrides?.approvedById ?? null,
      lockedAt: overrides?.lockedAt ?? null,
      lockedById: overrides?.lockedById ?? null,
      createdById: 'user-1',
      createdAt: new Date('2026-09-15T08:00:00.000Z'),
      updatedAt: new Date('2026-09-15T08:00:00.000Z'),
      deletedAt: overrides?.deletedAt ?? null,
      subject: {
        id: overrides?.subjectId ?? SUBJECT_ID,
        nameAr: 'Math AR',
        nameEn: 'Math',
        code: 'MATH',
        color: '#2563eb',
        isActive: true,
      },
    };
  }

  function publishOptionRecord(
    overrides?: Partial<{
      id: string;
      isCorrect: boolean;
      deletedAt: Date | null;
    }>,
  ) {
    return {
      id: overrides?.id ?? 'option-1',
      isCorrect: overrides?.isCorrect ?? true,
      deletedAt: overrides?.deletedAt ?? null,
    };
  }

  function publishQuestionRecord(
    overrides?: Partial<{
      id: string;
      type: GradeQuestionType;
      points: number;
      answerKey: unknown;
      metadata: unknown;
      deletedAt: Date | null;
      options: ReturnType<typeof publishOptionRecord>[];
    }>,
  ) {
    return {
      id: overrides?.id ?? 'question-1',
      type: overrides?.type ?? GradeQuestionType.SHORT_ANSWER,
      points: new Prisma.Decimal(overrides?.points ?? 5),
      answerKey: overrides?.answerKey ?? null,
      metadata: overrides?.metadata ?? null,
      deletedAt: overrides?.deletedAt ?? null,
      options: overrides?.options ?? [],
    };
  }

  function validPublishQuestions() {
    return [
      publishQuestionRecord({
        id: 'question-1',
        type: GradeQuestionType.MCQ_SINGLE,
        points: 5,
        options: [
          publishOptionRecord({ id: 'option-1', isCorrect: true }),
          publishOptionRecord({ id: 'option-2', isCorrect: false }),
        ],
      }),
      publishQuestionRecord({
        id: 'question-2',
        type: GradeQuestionType.SHORT_ANSWER,
        points: 5,
      }),
    ];
  }

  function baseRepository(overrides?: Partial<Record<string, jest.Mock>>) {
    return {
      listAssessments: jest
        .fn()
        .mockResolvedValue([assessmentRecord({ id: 'assessment-1' })]),
      findAssessmentById: jest.fn().mockResolvedValue(assessmentRecord()),
      createAssessment: jest.fn().mockImplementation((data) =>
        Promise.resolve(
          assessmentRecord({
            subjectId: data.subjectId,
            scopeType: data.scopeType,
            scopeKey: data.scopeKey,
            stageId: data.stageId,
            gradeId: data.gradeId,
            sectionId: data.sectionId,
            classroomId: data.classroomId,
            type: data.type,
            deliveryMode: data.deliveryMode,
            approvalStatus: data.approvalStatus,
            weight: Number(data.weight),
            maxScore: Number(data.maxScore),
          }),
        ),
      ),
      updateAssessment: jest.fn().mockImplementation((_id, data) =>
        Promise.resolve(
          assessmentRecord({
            subjectId: data.subjectId ?? SUBJECT_ID,
            scopeType: data.scopeType ?? GradeScopeType.GRADE,
            scopeKey: data.scopeKey ?? GRADE_ID,
            stageId: data.stageId ?? STAGE_ID,
            gradeId: data.gradeId ?? GRADE_ID,
            sectionId: data.sectionId ?? null,
            classroomId: data.classroomId ?? null,
            type: data.type ?? GradeAssessmentType.QUIZ,
            weight: data.weight === undefined ? 10 : Number(data.weight),
            maxScore: data.maxScore === undefined ? 20 : Number(data.maxScore),
          }),
        ),
      ),
      publishAssessment: jest.fn().mockImplementation((_id, data) =>
        Promise.resolve(
          assessmentRecord({
            approvalStatus: data.approvalStatus,
            publishedAt: data.publishedAt,
            publishedById: data.publishedById,
          }),
        ),
      ),
      approveAssessment: jest.fn().mockImplementation((_id, data) =>
        Promise.resolve(
          assessmentRecord({
            approvalStatus: data.approvalStatus,
            publishedAt: new Date('2026-09-16T08:00:00.000Z'),
            publishedById: 'user-1',
            approvedAt: data.approvedAt,
            approvedById: data.approvedById,
          }),
        ),
      ),
      lockAssessment: jest.fn().mockImplementation((_id, data) =>
        Promise.resolve(
          assessmentRecord({
            approvalStatus: GradeAssessmentApprovalStatus.APPROVED,
            publishedAt: new Date('2026-09-16T08:00:00.000Z'),
            publishedById: 'user-1',
            approvedAt: new Date('2026-09-17T08:00:00.000Z'),
            approvedById: 'user-1',
            lockedAt: data.lockedAt,
            lockedById: data.lockedById,
          }),
        ),
      ),
      softDeleteAssessment: jest.fn().mockResolvedValue(
        assessmentRecord({
          deletedAt: new Date('2026-09-16T09:00:00.000Z'),
        }),
      ),
      countGradeItemsForAssessment: jest.fn().mockResolvedValue(0),
      listActiveQuestionsForPublish: jest
        .fn()
        .mockResolvedValue(validPublishQuestions()),
      sumAssessmentWeights: jest.fn().mockResolvedValue(20),
      findAcademicYear: jest.fn().mockResolvedValue({ id: YEAR_ID }),
      findTerm: jest.fn().mockResolvedValue(activeTerm()),
      findSubject: jest.fn().mockResolvedValue({
        id: SUBJECT_ID,
        nameAr: 'Math AR',
        nameEn: 'Math',
        code: 'MATH',
        color: '#2563eb',
        isActive: true,
      }),
      findStage: jest.fn().mockResolvedValue({ id: STAGE_ID }),
      findGrade: jest.fn().mockResolvedValue({
        id: GRADE_ID,
        stageId: STAGE_ID,
      }),
      findSectionWithGrade: jest.fn().mockResolvedValue({
        id: SECTION_ID,
        gradeId: GRADE_ID,
        grade: { stageId: STAGE_ID },
      }),
      findClassroomWithGrade: jest.fn().mockResolvedValue({
        id: CLASSROOM_ID,
        sectionId: SECTION_ID,
        section: {
          gradeId: GRADE_ID,
          grade: { stageId: STAGE_ID },
        },
      }),
      ...overrides,
    } as unknown as GradesAssessmentsRepository;
  }

  function authRepository(overrides?: Partial<Record<string, jest.Mock>>) {
    return {
      createAuditLog: jest.fn().mockResolvedValue(undefined),
      ...overrides,
    } as unknown as AuthRepository;
  }

  const createCommand = {
    yearId: YEAR_ID,
    termId: TERM_ID,
    subjectId: SUBJECT_ID,
    scopeType: 'grade',
    gradeId: GRADE_ID,
    titleEn: 'Quiz 1',
    titleAr: 'Quiz 1 AR',
    type: GradeAssessmentType.QUIZ,
    date: '2026-09-15',
    weight: 10,
    maxScore: 20,
    expectedTimeMinutes: 30,
  };

  it('creates a valid score-only draft assessment', async () => {
    const repository = baseRepository();
    const auth = authRepository();
    const useCase = new CreateGradeAssessmentUseCase(repository, auth);

    const result = await withGradesScope(() => useCase.execute(createCommand));

    expect(repository.createAssessment).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: SCHOOL_ID,
        academicYearId: YEAR_ID,
        termId: TERM_ID,
        subjectId: SUBJECT_ID,
        scopeType: GradeScopeType.GRADE,
        scopeKey: GRADE_ID,
        gradeId: GRADE_ID,
        deliveryMode: GradeAssessmentDeliveryMode.SCORE_ONLY,
        approvalStatus: GradeAssessmentApprovalStatus.DRAFT,
        createdById: 'user-1',
      }),
    );
    expect(result).toMatchObject({
      id: 'assessment-1',
      scopeType: 'grade',
      deliveryMode: 'SCORE_ONLY',
      approvalStatus: 'draft',
      isLocked: false,
      weight: 10,
      maxScore: 20,
    });
    expect(auth.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'grades.assessment.create',
        resourceType: 'grade_assessment',
        outcome: AuditOutcome.SUCCESS,
      }),
    );
  });

  it('keeps the existing create endpoint score-only focused', async () => {
    const repository = baseRepository({ createAssessment: jest.fn() });
    const useCase = new CreateGradeAssessmentUseCase(
      repository,
      authRepository(),
    );

    await expect(
      withGradesScope(() =>
        useCase.execute({
          ...createCommand,
          deliveryMode: GradeAssessmentDeliveryMode.QUESTION_BASED,
        }),
      ),
    ).rejects.toBeInstanceOf(ValidationDomainException);
    expect(repository.createAssessment).not.toHaveBeenCalled();
  });

  it('creates a QUESTION_BASED draft assessment shell', async () => {
    const repository = baseRepository();
    const auth = authRepository();
    const useCase = new CreateQuestionBasedGradeAssessmentUseCase(
      repository,
      auth,
    );

    const result = await withGradesScope(() => useCase.execute(createCommand));

    expect(repository.createAssessment).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: SCHOOL_ID,
        academicYearId: YEAR_ID,
        termId: TERM_ID,
        subjectId: SUBJECT_ID,
        scopeType: GradeScopeType.GRADE,
        scopeKey: GRADE_ID,
        deliveryMode: GradeAssessmentDeliveryMode.QUESTION_BASED,
        approvalStatus: GradeAssessmentApprovalStatus.DRAFT,
        createdById: 'user-1',
      }),
    );
    expect(repository.listActiveQuestionsForPublish).not.toHaveBeenCalled();
    expect(repository.countGradeItemsForAssessment).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      id: 'assessment-1',
      deliveryMode: 'question_based',
      approvalStatus: 'draft',
      isLocked: false,
      maxScore: 20,
      weight: 10,
    });
    expect(auth.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'grades.assessment.create',
        resourceType: 'grade_assessment',
        outcome: AuditOutcome.SUCCESS,
        after: expect.objectContaining({
          deliveryMode: GradeAssessmentDeliveryMode.QUESTION_BASED,
        }),
      }),
    );
  });

  it('validates term, subject, scope, and weight budget for question-based creation', async () => {
    await expectQuestionBasedCreateRejected(
      baseRepository({
        findTerm: jest.fn().mockResolvedValue(activeTerm({ isActive: false })),
        createAssessment: jest.fn(),
      }),
      GradeTermClosedException,
    );

    await expectQuestionBasedCreateRejected(
      baseRepository({
        findSubject: jest.fn().mockResolvedValue(null),
        createAssessment: jest.fn(),
      }),
      NotFoundDomainException,
    );

    await expectQuestionBasedCreateRejected(
      baseRepository({
        findGrade: jest.fn().mockResolvedValue(null),
        createAssessment: jest.fn(),
      }),
      NotFoundDomainException,
    );

    await expectQuestionBasedCreateRejected(
      baseRepository({
        sumAssessmentWeights: jest.fn().mockResolvedValue(95),
        createAssessment: jest.fn(),
      }),
      ValidationDomainException,
    );
  });

  it('rejects creating in a closed or inactive term', async () => {
    const repository = baseRepository({
      findTerm: jest.fn().mockResolvedValue(activeTerm({ isActive: false })),
      createAssessment: jest.fn(),
    });
    const useCase = new CreateGradeAssessmentUseCase(
      repository,
      authRepository(),
    );

    await expect(
      withGradesScope(() => useCase.execute(createCommand)),
    ).rejects.toBeInstanceOf(GradeTermClosedException);
    expect(repository.createAssessment).not.toHaveBeenCalled();
  });

  it('validates subject ownership on create', async () => {
    const repository = baseRepository({
      findSubject: jest.fn().mockResolvedValue(null),
      createAssessment: jest.fn(),
    });
    const useCase = new CreateGradeAssessmentUseCase(
      repository,
      authRepository(),
    );

    await expect(
      withGradesScope(() => useCase.execute(createCommand)),
    ).rejects.toBeInstanceOf(NotFoundDomainException);
    expect(repository.createAssessment).not.toHaveBeenCalled();
  });

  it('validates scope ownership on create', async () => {
    const repository = baseRepository({
      findGrade: jest.fn().mockResolvedValue(null),
      createAssessment: jest.fn(),
    });
    const useCase = new CreateGradeAssessmentUseCase(
      repository,
      authRepository(),
    );

    await expect(
      withGradesScope(() => useCase.execute(createCommand)),
    ).rejects.toBeInstanceOf(NotFoundDomainException);
    expect(repository.createAssessment).not.toHaveBeenCalled();
  });

  it('rejects assessment weight budgets over 100', async () => {
    const repository = baseRepository({
      sumAssessmentWeights: jest.fn().mockResolvedValue(95),
      createAssessment: jest.fn(),
    });
    const useCase = new CreateGradeAssessmentUseCase(
      repository,
      authRepository(),
    );

    await expect(
      withGradesScope(() => useCase.execute(createCommand)),
    ).rejects.toBeInstanceOf(ValidationDomainException);
    expect(repository.createAssessment).not.toHaveBeenCalled();
  });

  it('rejects invalid weight and maxScore values', async () => {
    const repository = baseRepository({ createAssessment: jest.fn() });
    const useCase = new CreateGradeAssessmentUseCase(
      repository,
      authRepository(),
    );

    await expect(
      withGradesScope(() => useCase.execute({ ...createCommand, weight: 0 })),
    ).rejects.toBeInstanceOf(ValidationDomainException);

    await expect(
      withGradesScope(() => useCase.execute({ ...createCommand, maxScore: 0 })),
    ).rejects.toBeInstanceOf(ValidationDomainException);
    expect(repository.createAssessment).not.toHaveBeenCalled();
  });

  it('lists assessments using non-deleted repository rows', async () => {
    const repository = baseRepository({
      listAssessments: jest
        .fn()
        .mockResolvedValue([
          assessmentRecord({ id: 'active-assessment', deletedAt: null }),
        ]),
    });
    const useCase = new ListGradeAssessmentsUseCase(repository);

    const result = await withGradesScope(() =>
      useCase.execute({ yearId: YEAR_ID, termId: TERM_ID }),
    );

    expect(repository.listAssessments).toHaveBeenCalledWith(
      expect.objectContaining({
        academicYearId: YEAR_ID,
        termId: TERM_ID,
      }),
    );
    expect(result.items.map((item) => item.id)).toEqual(['active-assessment']);
  });

  it('returns one assessment in the presenter shape', async () => {
    const repository = baseRepository();
    const useCase = new GetGradeAssessmentUseCase(repository);

    const result = await withGradesScope(() => useCase.execute('assessment-1'));

    expect(result).toMatchObject({
      id: 'assessment-1',
      academicYearId: YEAR_ID,
      yearId: YEAR_ID,
      termId: TERM_ID,
      subjectId: SUBJECT_ID,
      subject: expect.objectContaining({ id: SUBJECT_ID, name: 'Math' }),
      scopeType: 'grade',
      scopeKey: GRADE_ID,
      titleEn: 'Quiz 1',
      type: GradeAssessmentType.QUIZ,
      deliveryMode: GradeAssessmentDeliveryMode.SCORE_ONLY,
      date: '2026-09-15',
      approvalStatus: 'draft',
    });
  });

  it('publishes a DRAFT assessment and records audit metadata', async () => {
    const repository = baseRepository();
    const auth = authRepository();
    const useCase = new PublishGradeAssessmentUseCase(repository, auth);

    const result = await withGradesScope(() => useCase.execute('assessment-1'));

    expect(repository.publishAssessment).toHaveBeenCalledWith(
      'assessment-1',
      expect.objectContaining({
        approvalStatus: GradeAssessmentApprovalStatus.PUBLISHED,
        publishedAt: expect.any(Date),
        publishedById: 'user-1',
      }),
    );
    expect(repository.countGradeItemsForAssessment).not.toHaveBeenCalled();
    expect(repository.listActiveQuestionsForPublish).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      id: 'assessment-1',
      approvalStatus: 'published',
      publishedById: 'user-1',
      isLocked: false,
    });
    expect(result.publishedAt).toEqual(expect.any(String));
    expect(auth.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'grades.assessment.publish',
        resourceType: 'grade_assessment',
        outcome: AuditOutcome.SUCCESS,
        before: expect.objectContaining({
          approvalStatus: GradeAssessmentApprovalStatus.DRAFT,
          publishedAt: null,
          publishedById: null,
        }),
        after: expect.objectContaining({
          approvalStatus: GradeAssessmentApprovalStatus.PUBLISHED,
          publishedById: 'user-1',
        }),
      }),
    );
  });

  it('publishes a valid QUESTION_BASED assessment and audits question summary', async () => {
    const repository = baseRepository({
      findAssessmentById: jest.fn().mockResolvedValue(
        assessmentRecord({
          deliveryMode: GradeAssessmentDeliveryMode.QUESTION_BASED,
          maxScore: 10,
        }),
      ),
      publishAssessment: jest.fn().mockImplementation((_id, data) =>
        Promise.resolve(
          assessmentRecord({
            deliveryMode: GradeAssessmentDeliveryMode.QUESTION_BASED,
            approvalStatus: data.approvalStatus,
            publishedAt: data.publishedAt,
            publishedById: data.publishedById,
            maxScore: 10,
          }),
        ),
      ),
      listActiveQuestionsForPublish: jest
        .fn()
        .mockResolvedValue(validPublishQuestions()),
    });
    const auth = authRepository();
    const useCase = new PublishGradeAssessmentUseCase(repository, auth);

    const result = await withGradesScope(() => useCase.execute('assessment-1'));

    expect(repository.listActiveQuestionsForPublish).toHaveBeenCalledWith(
      'assessment-1',
    );
    expect(repository.publishAssessment).toHaveBeenCalledWith(
      'assessment-1',
      expect.objectContaining({
        approvalStatus: GradeAssessmentApprovalStatus.PUBLISHED,
        publishedAt: expect.any(Date),
        publishedById: 'user-1',
      }),
    );
    expect(result).toMatchObject({
      id: 'assessment-1',
      deliveryMode: 'question_based',
      approvalStatus: 'published',
    });
    expect(auth.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'grades.assessment.publish',
        after: expect.objectContaining({
          approvalStatus: GradeAssessmentApprovalStatus.PUBLISHED,
          questionSummary: {
            totalQuestions: 2,
            totalPoints: 10,
            maxScore: 10,
            pointsMatchMaxScore: true,
          },
        }),
      }),
    );
  });

  it('rejects QUESTION_BASED publish with zero active questions', async () => {
    const repository = baseRepository({
      findAssessmentById: jest.fn().mockResolvedValue(
        assessmentRecord({
          deliveryMode: GradeAssessmentDeliveryMode.QUESTION_BASED,
          maxScore: 10,
        }),
      ),
      listActiveQuestionsForPublish: jest.fn().mockResolvedValue([]),
      publishAssessment: jest.fn(),
    });
    const useCase = new PublishGradeAssessmentUseCase(
      repository,
      authRepository(),
    );

    await expect(
      withGradesScope(() => useCase.execute('assessment-1')),
    ).rejects.toBeInstanceOf(ValidationDomainException);
    expect(repository.publishAssessment).not.toHaveBeenCalled();
  });

  it('rejects QUESTION_BASED publish when active question points do not match maxScore', async () => {
    const repository = baseRepository({
      findAssessmentById: jest.fn().mockResolvedValue(
        assessmentRecord({
          deliveryMode: GradeAssessmentDeliveryMode.QUESTION_BASED,
          maxScore: 10,
        }),
      ),
      listActiveQuestionsForPublish: jest
        .fn()
        .mockResolvedValue([
          publishQuestionRecord({ id: 'question-1', points: 4 }),
        ]),
      publishAssessment: jest.fn(),
    });
    const useCase = new PublishGradeAssessmentUseCase(
      repository,
      authRepository(),
    );

    await expect(
      withGradesScope(() => useCase.execute('assessment-1')),
    ).rejects.toBeInstanceOf(GradeQuestionPointsMismatchException);
    expect(repository.publishAssessment).not.toHaveBeenCalled();
  });

  it.each([
    [
      'MCQ_SINGLE',
      publishQuestionRecord({
        type: GradeQuestionType.MCQ_SINGLE,
        options: [
          publishOptionRecord({ id: 'option-1', isCorrect: true }),
          publishOptionRecord({ id: 'option-2', isCorrect: true }),
        ],
      }),
    ],
    [
      'MCQ_MULTI',
      publishQuestionRecord({
        type: GradeQuestionType.MCQ_MULTI,
        options: [
          publishOptionRecord({ id: 'option-1', isCorrect: false }),
          publishOptionRecord({ id: 'option-2', isCorrect: false }),
        ],
      }),
    ],
    [
      'TRUE_FALSE',
      publishQuestionRecord({
        type: GradeQuestionType.TRUE_FALSE,
        options: [
          publishOptionRecord({ id: 'option-1', isCorrect: true }),
          publishOptionRecord({ id: 'option-2', isCorrect: false }),
          publishOptionRecord({ id: 'option-3', isCorrect: false }),
        ],
      }),
    ],
  ])(
    'rejects QUESTION_BASED publish with invalid %s options',
    async (_label, question) => {
      const repository = baseRepository({
        findAssessmentById: jest.fn().mockResolvedValue(
          assessmentRecord({
            deliveryMode: GradeAssessmentDeliveryMode.QUESTION_BASED,
            maxScore: 5,
          }),
        ),
        listActiveQuestionsForPublish: jest.fn().mockResolvedValue([question]),
        publishAssessment: jest.fn(),
      });
      const useCase = new PublishGradeAssessmentUseCase(
        repository,
        authRepository(),
      );

      await expect(
        withGradesScope(() => useCase.execute('assessment-1')),
      ).rejects.toBeInstanceOf(GradeAnswerInvalidOptionException);
      expect(repository.publishAssessment).not.toHaveBeenCalled();
    },
  );

  it('ignores soft-deleted questions and options in QUESTION_BASED publish validation', async () => {
    const repository = baseRepository({
      findAssessmentById: jest.fn().mockResolvedValue(
        assessmentRecord({
          deliveryMode: GradeAssessmentDeliveryMode.QUESTION_BASED,
          maxScore: 5,
        }),
      ),
      listActiveQuestionsForPublish: jest.fn().mockResolvedValue([
        publishQuestionRecord({
          id: 'active-question',
          type: GradeQuestionType.MCQ_SINGLE,
          points: 5,
          options: [
            publishOptionRecord({ id: 'option-1', isCorrect: true }),
            publishOptionRecord({ id: 'option-2', isCorrect: false }),
            publishOptionRecord({
              id: 'deleted-option',
              isCorrect: true,
              deletedAt: new Date('2026-09-12T08:00:00.000Z'),
            }),
          ],
        }),
        publishQuestionRecord({
          id: 'deleted-question',
          type: GradeQuestionType.MCQ_SINGLE,
          points: 100,
          deletedAt: new Date('2026-09-12T08:00:00.000Z'),
          options: [],
        }),
      ]),
    });
    const useCase = new PublishGradeAssessmentUseCase(
      repository,
      authRepository(),
    );

    const result = await withGradesScope(() => useCase.execute('assessment-1'));

    expect(result).toMatchObject({
      id: 'assessment-1',
      approvalStatus: 'published',
    });
    expect(repository.publishAssessment).toHaveBeenCalled();
  });

  it('rejects publishing an already PUBLISHED assessment', async () => {
    const repository = baseRepository({
      findAssessmentById: jest.fn().mockResolvedValue(
        assessmentRecord({
          approvalStatus: GradeAssessmentApprovalStatus.PUBLISHED,
        }),
      ),
      publishAssessment: jest.fn(),
    });
    const useCase = new PublishGradeAssessmentUseCase(
      repository,
      authRepository(),
    );

    await expect(
      withGradesScope(() => useCase.execute('assessment-1')),
    ).rejects.toBeInstanceOf(GradeAssessmentAlreadyPublishedException);
    expect(repository.publishAssessment).not.toHaveBeenCalled();
  });

  it('rejects publishing an APPROVED assessment', async () => {
    const repository = baseRepository({
      findAssessmentById: jest.fn().mockResolvedValue(
        assessmentRecord({
          approvalStatus: GradeAssessmentApprovalStatus.APPROVED,
        }),
      ),
      publishAssessment: jest.fn(),
    });
    const useCase = new PublishGradeAssessmentUseCase(
      repository,
      authRepository(),
    );

    await expect(
      withGradesScope(() => useCase.execute('assessment-1')),
    ).rejects.toBeInstanceOf(GradeAssessmentAlreadyApprovedException);
    expect(repository.publishAssessment).not.toHaveBeenCalled();
  });

  it('rejects publishing a locked assessment', async () => {
    const repository = baseRepository({
      findAssessmentById: jest.fn().mockResolvedValue(
        assessmentRecord({
          lockedAt: new Date('2026-09-20T08:00:00.000Z'),
        }),
      ),
      publishAssessment: jest.fn(),
    });
    const useCase = new PublishGradeAssessmentUseCase(
      repository,
      authRepository(),
    );

    await expect(
      withGradesScope(() => useCase.execute('assessment-1')),
    ).rejects.toBeInstanceOf(GradeAssessmentLockedException);
    expect(repository.publishAssessment).not.toHaveBeenCalled();
  });

  it('rejects publishing in a closed or inactive term', async () => {
    const repository = baseRepository({
      findTerm: jest.fn().mockResolvedValue(activeTerm({ isActive: false })),
      publishAssessment: jest.fn(),
    });
    const useCase = new PublishGradeAssessmentUseCase(
      repository,
      authRepository(),
    );

    await expect(
      withGradesScope(() => useCase.execute('assessment-1')),
    ).rejects.toBeInstanceOf(GradeTermClosedException);
    expect(repository.publishAssessment).not.toHaveBeenCalled();
  });

  it('approves a PUBLISHED assessment and records audit metadata', async () => {
    const repository = baseRepository({
      findAssessmentById: jest.fn().mockResolvedValue(
        assessmentRecord({
          approvalStatus: GradeAssessmentApprovalStatus.PUBLISHED,
          publishedAt: new Date('2026-09-16T08:00:00.000Z'),
          publishedById: 'user-1',
        }),
      ),
    });
    const auth = authRepository();
    const useCase = new ApproveGradeAssessmentUseCase(repository, auth);

    const result = await withGradesScope(() => useCase.execute('assessment-1'));

    expect(repository.approveAssessment).toHaveBeenCalledWith(
      'assessment-1',
      expect.objectContaining({
        approvalStatus: GradeAssessmentApprovalStatus.APPROVED,
        approvedAt: expect.any(Date),
        approvedById: 'user-1',
      }),
    );
    expect(result).toMatchObject({
      id: 'assessment-1',
      approvalStatus: 'approved',
      approvedById: 'user-1',
      isLocked: false,
    });
    expect(result.approvedAt).toEqual(expect.any(String));
    expect(auth.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'grades.assessment.approve',
        before: expect.objectContaining({
          approvalStatus: GradeAssessmentApprovalStatus.PUBLISHED,
          approvedAt: null,
          approvedById: null,
        }),
        after: expect.objectContaining({
          approvalStatus: GradeAssessmentApprovalStatus.APPROVED,
          approvedById: 'user-1',
        }),
      }),
    );
  });

  it('approves a PUBLISHED question-based assessment', async () => {
    const repository = baseRepository({
      findAssessmentById: jest.fn().mockResolvedValue(
        assessmentRecord({
          deliveryMode: GradeAssessmentDeliveryMode.QUESTION_BASED,
          approvalStatus: GradeAssessmentApprovalStatus.PUBLISHED,
          publishedAt: new Date('2026-09-16T08:00:00.000Z'),
          publishedById: 'user-1',
        }),
      ),
      approveAssessment: jest.fn().mockImplementation((_id, data) =>
        Promise.resolve(
          assessmentRecord({
            deliveryMode: GradeAssessmentDeliveryMode.QUESTION_BASED,
            approvalStatus: data.approvalStatus,
            publishedAt: new Date('2026-09-16T08:00:00.000Z'),
            publishedById: 'user-1',
            approvedAt: data.approvedAt,
            approvedById: data.approvedById,
          }),
        ),
      ),
    });
    const useCase = new ApproveGradeAssessmentUseCase(
      repository,
      authRepository(),
    );

    const result = await withGradesScope(() => useCase.execute('assessment-1'));

    expect(repository.approveAssessment).toHaveBeenCalledWith(
      'assessment-1',
      expect.objectContaining({
        approvalStatus: GradeAssessmentApprovalStatus.APPROVED,
      }),
    );
    expect(result).toMatchObject({
      id: 'assessment-1',
      deliveryMode: 'question_based',
      approvalStatus: 'approved',
    });
  });

  it('rejects approving a DRAFT assessment', async () => {
    const repository = baseRepository({
      approveAssessment: jest.fn(),
    });
    const useCase = new ApproveGradeAssessmentUseCase(
      repository,
      authRepository(),
    );

    await expect(
      withGradesScope(() => useCase.execute('assessment-1')),
    ).rejects.toBeInstanceOf(GradeAssessmentNotPublishedException);
    expect(repository.approveAssessment).not.toHaveBeenCalled();
  });

  it('rejects approving an already APPROVED assessment', async () => {
    const repository = baseRepository({
      findAssessmentById: jest.fn().mockResolvedValue(
        assessmentRecord({
          approvalStatus: GradeAssessmentApprovalStatus.APPROVED,
        }),
      ),
      approveAssessment: jest.fn(),
    });
    const useCase = new ApproveGradeAssessmentUseCase(
      repository,
      authRepository(),
    );

    await expect(
      withGradesScope(() => useCase.execute('assessment-1')),
    ).rejects.toBeInstanceOf(GradeAssessmentAlreadyApprovedException);
    expect(repository.approveAssessment).not.toHaveBeenCalled();
  });

  it('rejects approving a locked assessment', async () => {
    const repository = baseRepository({
      findAssessmentById: jest.fn().mockResolvedValue(
        assessmentRecord({
          approvalStatus: GradeAssessmentApprovalStatus.PUBLISHED,
          lockedAt: new Date('2026-09-20T08:00:00.000Z'),
        }),
      ),
      approveAssessment: jest.fn(),
    });
    const useCase = new ApproveGradeAssessmentUseCase(
      repository,
      authRepository(),
    );

    await expect(
      withGradesScope(() => useCase.execute('assessment-1')),
    ).rejects.toBeInstanceOf(GradeAssessmentLockedException);
    expect(repository.approveAssessment).not.toHaveBeenCalled();
  });

  it('rejects approving in a closed or inactive term', async () => {
    const repository = baseRepository({
      findAssessmentById: jest.fn().mockResolvedValue(
        assessmentRecord({
          approvalStatus: GradeAssessmentApprovalStatus.PUBLISHED,
        }),
      ),
      findTerm: jest.fn().mockResolvedValue(activeTerm({ isActive: false })),
      approveAssessment: jest.fn(),
    });
    const useCase = new ApproveGradeAssessmentUseCase(
      repository,
      authRepository(),
    );

    await expect(
      withGradesScope(() => useCase.execute('assessment-1')),
    ).rejects.toBeInstanceOf(GradeTermClosedException);
    expect(repository.approveAssessment).not.toHaveBeenCalled();
  });

  it('locks an APPROVED assessment and records audit metadata', async () => {
    const repository = baseRepository({
      findAssessmentById: jest.fn().mockResolvedValue(
        assessmentRecord({
          approvalStatus: GradeAssessmentApprovalStatus.APPROVED,
          publishedAt: new Date('2026-09-16T08:00:00.000Z'),
          publishedById: 'user-1',
          approvedAt: new Date('2026-09-17T08:00:00.000Z'),
          approvedById: 'user-1',
        }),
      ),
    });
    const auth = authRepository();
    const useCase = new LockGradeAssessmentUseCase(repository, auth);

    const result = await withGradesScope(() => useCase.execute('assessment-1'));

    expect(repository.lockAssessment).toHaveBeenCalledWith(
      'assessment-1',
      expect.objectContaining({
        lockedAt: expect.any(Date),
        lockedById: 'user-1',
      }),
    );
    expect(result).toMatchObject({
      id: 'assessment-1',
      approvalStatus: 'approved',
      lockedById: 'user-1',
      isLocked: true,
    });
    expect(result.lockedAt).toEqual(expect.any(String));
    expect(auth.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'grades.assessment.lock',
        before: expect.objectContaining({
          approvalStatus: GradeAssessmentApprovalStatus.APPROVED,
          lockedAt: null,
          lockedById: null,
        }),
        after: expect.objectContaining({
          approvalStatus: GradeAssessmentApprovalStatus.APPROVED,
          lockedById: 'user-1',
        }),
      }),
    );
  });

  it('rejects locking a DRAFT assessment', async () => {
    const repository = baseRepository({
      lockAssessment: jest.fn(),
    });
    const useCase = new LockGradeAssessmentUseCase(
      repository,
      authRepository(),
    );

    await expect(
      withGradesScope(() => useCase.execute('assessment-1')),
    ).rejects.toBeInstanceOf(GradeAssessmentNotApprovedException);
    expect(repository.lockAssessment).not.toHaveBeenCalled();
  });

  it('rejects locking a PUBLISHED assessment', async () => {
    const repository = baseRepository({
      findAssessmentById: jest.fn().mockResolvedValue(
        assessmentRecord({
          approvalStatus: GradeAssessmentApprovalStatus.PUBLISHED,
        }),
      ),
      lockAssessment: jest.fn(),
    });
    const useCase = new LockGradeAssessmentUseCase(
      repository,
      authRepository(),
    );

    await expect(
      withGradesScope(() => useCase.execute('assessment-1')),
    ).rejects.toBeInstanceOf(GradeAssessmentNotApprovedException);
    expect(repository.lockAssessment).not.toHaveBeenCalled();
  });

  it('rejects locking an already locked assessment', async () => {
    const repository = baseRepository({
      findAssessmentById: jest.fn().mockResolvedValue(
        assessmentRecord({
          approvalStatus: GradeAssessmentApprovalStatus.APPROVED,
          lockedAt: new Date('2026-09-20T08:00:00.000Z'),
        }),
      ),
      lockAssessment: jest.fn(),
    });
    const useCase = new LockGradeAssessmentUseCase(
      repository,
      authRepository(),
    );

    await expect(
      withGradesScope(() => useCase.execute('assessment-1')),
    ).rejects.toBeInstanceOf(GradeAssessmentAlreadyLockedException);
    expect(repository.lockAssessment).not.toHaveBeenCalled();
  });

  it('rejects locking in a closed or inactive term', async () => {
    const repository = baseRepository({
      findAssessmentById: jest.fn().mockResolvedValue(
        assessmentRecord({
          approvalStatus: GradeAssessmentApprovalStatus.APPROVED,
        }),
      ),
      findTerm: jest.fn().mockResolvedValue(activeTerm({ isActive: false })),
      lockAssessment: jest.fn(),
    });
    const useCase = new LockGradeAssessmentUseCase(
      repository,
      authRepository(),
    );

    await expect(
      withGradesScope(() => useCase.execute('assessment-1')),
    ).rejects.toBeInstanceOf(GradeTermClosedException);
    expect(repository.lockAssessment).not.toHaveBeenCalled();
  });

  it('returns not found when locking a missing or soft-deleted assessment', async () => {
    const repository = baseRepository({
      findAssessmentById: jest.fn().mockResolvedValue(null),
      lockAssessment: jest.fn(),
    });
    const useCase = new LockGradeAssessmentUseCase(
      repository,
      authRepository(),
    );

    await expect(
      withGradesScope(() => useCase.execute('assessment-1')),
    ).rejects.toBeInstanceOf(NotFoundDomainException);
    expect(repository.lockAssessment).not.toHaveBeenCalled();
  });

  it('updates a draft assessment', async () => {
    const repository = baseRepository();
    const auth = authRepository();
    const useCase = new UpdateGradeAssessmentUseCase(repository, auth);

    const result = await withGradesScope(() =>
      useCase.execute('assessment-1', {
        titleEn: 'Quiz 1 updated',
        weight: 15,
      }),
    );

    expect(repository.updateAssessment).toHaveBeenCalledWith(
      'assessment-1',
      expect.objectContaining({
        titleEn: 'Quiz 1 updated',
        weight: expect.any(Prisma.Decimal),
      }),
    );
    expect(result.weight).toBe(15);
    expect(auth.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'grades.assessment.update',
        before: expect.objectContaining({ weight: 10 }),
        after: expect.objectContaining({ weight: 15 }),
      }),
    );
  });

  it('rejects updating a non-DRAFT assessment', async () => {
    const repository = baseRepository({
      findAssessmentById: jest.fn().mockResolvedValue(
        assessmentRecord({
          approvalStatus: GradeAssessmentApprovalStatus.PUBLISHED,
        }),
      ),
      updateAssessment: jest.fn(),
    });
    const useCase = new UpdateGradeAssessmentUseCase(
      repository,
      authRepository(),
    );

    await expect(
      withGradesScope(() =>
        useCase.execute('assessment-1', { titleEn: 'Updated' }),
      ),
    ).rejects.toBeInstanceOf(GradeAssessmentInvalidStatusTransitionException);
    expect(repository.updateAssessment).not.toHaveBeenCalled();
  });

  it('rejects updating an APPROVED assessment', async () => {
    const repository = baseRepository({
      findAssessmentById: jest.fn().mockResolvedValue(
        assessmentRecord({
          approvalStatus: GradeAssessmentApprovalStatus.APPROVED,
        }),
      ),
      updateAssessment: jest.fn(),
    });
    const useCase = new UpdateGradeAssessmentUseCase(
      repository,
      authRepository(),
    );

    await expect(
      withGradesScope(() =>
        useCase.execute('assessment-1', { titleEn: 'Updated' }),
      ),
    ).rejects.toBeInstanceOf(GradeAssessmentInvalidStatusTransitionException);
    expect(repository.updateAssessment).not.toHaveBeenCalled();
  });

  it('rejects updating a locked assessment', async () => {
    const repository = baseRepository({
      findAssessmentById: jest.fn().mockResolvedValue(
        assessmentRecord({
          lockedAt: new Date('2026-09-20T08:00:00.000Z'),
        }),
      ),
      updateAssessment: jest.fn(),
    });
    const useCase = new UpdateGradeAssessmentUseCase(
      repository,
      authRepository(),
    );

    await expect(
      withGradesScope(() =>
        useCase.execute('assessment-1', { titleEn: 'Updated' }),
      ),
    ).rejects.toBeInstanceOf(GradeAssessmentLockedException);
    expect(repository.updateAssessment).not.toHaveBeenCalled();
  });

  it('rejects updating when the term is closed', async () => {
    const repository = baseRepository({
      findTerm: jest.fn().mockResolvedValue(activeTerm({ isActive: false })),
      updateAssessment: jest.fn(),
    });
    const useCase = new UpdateGradeAssessmentUseCase(
      repository,
      authRepository(),
    );

    await expect(
      withGradesScope(() =>
        useCase.execute('assessment-1', { titleEn: 'Updated' }),
      ),
    ).rejects.toBeInstanceOf(GradeTermClosedException);
    expect(repository.updateAssessment).not.toHaveBeenCalled();
  });

  it('rejects update weight budgets over 100', async () => {
    const repository = baseRepository({
      sumAssessmentWeights: jest.fn().mockResolvedValue(95),
      updateAssessment: jest.fn(),
    });
    const useCase = new UpdateGradeAssessmentUseCase(
      repository,
      authRepository(),
    );

    await expect(
      withGradesScope(() => useCase.execute('assessment-1', { weight: 15 })),
    ).rejects.toBeInstanceOf(ValidationDomainException);
    expect(repository.updateAssessment).not.toHaveBeenCalled();
  });

  it('soft-deletes a draft assessment', async () => {
    const repository = baseRepository();
    const auth = authRepository();
    const useCase = new DeleteGradeAssessmentUseCase(repository, auth);

    const result = await withGradesScope(() => useCase.execute('assessment-1'));

    expect(repository.softDeleteAssessment).toHaveBeenCalledWith(
      'assessment-1',
    );
    expect(result).toEqual({ ok: true });
    expect(auth.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'grades.assessment.delete',
        before: expect.objectContaining({ deletedAt: null }),
        after: expect.objectContaining({
          deletedAt: '2026-09-16T09:00:00.000Z',
        }),
      }),
    );
  });

  it('rejects deleting a non-DRAFT assessment', async () => {
    const repository = baseRepository({
      findAssessmentById: jest.fn().mockResolvedValue(
        assessmentRecord({
          approvalStatus: GradeAssessmentApprovalStatus.APPROVED,
        }),
      ),
      softDeleteAssessment: jest.fn(),
    });
    const useCase = new DeleteGradeAssessmentUseCase(
      repository,
      authRepository(),
    );

    await expect(
      withGradesScope(() => useCase.execute('assessment-1')),
    ).rejects.toBeInstanceOf(GradeAssessmentInvalidStatusTransitionException);
    expect(repository.softDeleteAssessment).not.toHaveBeenCalled();
  });

  it('rejects deleting a PUBLISHED assessment', async () => {
    const repository = baseRepository({
      findAssessmentById: jest.fn().mockResolvedValue(
        assessmentRecord({
          approvalStatus: GradeAssessmentApprovalStatus.PUBLISHED,
        }),
      ),
      softDeleteAssessment: jest.fn(),
    });
    const useCase = new DeleteGradeAssessmentUseCase(
      repository,
      authRepository(),
    );

    await expect(
      withGradesScope(() => useCase.execute('assessment-1')),
    ).rejects.toBeInstanceOf(GradeAssessmentInvalidStatusTransitionException);
    expect(repository.softDeleteAssessment).not.toHaveBeenCalled();
  });

  it('rejects deleting a locked assessment', async () => {
    const repository = baseRepository({
      findAssessmentById: jest.fn().mockResolvedValue(
        assessmentRecord({
          lockedAt: new Date('2026-09-20T08:00:00.000Z'),
        }),
      ),
      softDeleteAssessment: jest.fn(),
    });
    const useCase = new DeleteGradeAssessmentUseCase(
      repository,
      authRepository(),
    );

    await expect(
      withGradesScope(() => useCase.execute('assessment-1')),
    ).rejects.toBeInstanceOf(GradeAssessmentLockedException);
    expect(repository.softDeleteAssessment).not.toHaveBeenCalled();
  });

  it('rejects deleting an assessment that already has grade items', async () => {
    const repository = baseRepository({
      countGradeItemsForAssessment: jest.fn().mockResolvedValue(1),
      softDeleteAssessment: jest.fn(),
    });
    const useCase = new DeleteGradeAssessmentUseCase(
      repository,
      authRepository(),
    );

    await expect(
      withGradesScope(() => useCase.execute('assessment-1')),
    ).rejects.toBeInstanceOf(GradeAssessmentInvalidStatusTransitionException);
    expect(repository.softDeleteAssessment).not.toHaveBeenCalled();
  });

  it('rejects protected updates when grade items already exist', async () => {
    const repository = baseRepository({
      countGradeItemsForAssessment: jest.fn().mockResolvedValue(1),
      updateAssessment: jest.fn(),
    });
    const useCase = new UpdateGradeAssessmentUseCase(
      repository,
      authRepository(),
    );

    await expect(
      withGradesScope(() => useCase.execute('assessment-1', { maxScore: 25 })),
    ).rejects.toBeInstanceOf(GradeAssessmentInvalidStatusTransitionException);
    expect(repository.updateAssessment).not.toHaveBeenCalled();
  });

  async function expectQuestionBasedCreateRejected(
    repository: GradesAssessmentsRepository,
    errorClass: new (...args: never[]) => Error,
  ): Promise<void> {
    const useCase = new CreateQuestionBasedGradeAssessmentUseCase(
      repository,
      authRepository(),
    );

    await expect(
      withGradesScope(() => useCase.execute(createCommand)),
    ).rejects.toBeInstanceOf(errorClass);
    expect(repository.createAssessment).not.toHaveBeenCalled();
  }
});
