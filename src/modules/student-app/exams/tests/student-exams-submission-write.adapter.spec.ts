import {
  GradeAssessmentApprovalStatus,
  GradeAssessmentDeliveryMode,
  GradeQuestionType,
  GradeScopeType,
  GradeSubmissionStatus,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { GradesSubmissionsRepository } from '../../../grades/assessments/infrastructure/grades-submissions.repository';
import type { StudentAppContext } from '../../shared/student-app.types';
import { StudentExamsSubmissionWriteAdapter } from '../infrastructure/student-exams-submission-write.adapter';

describe('StudentExamsSubmissionWriteAdapter', () => {
  it('starts a visible question-based exam for the current student and enrollment', async () => {
    const {
      adapter,
      repository,
      scopedEnrollmentMocks,
      scopedTeacherSubjectAllocationMocks,
      scopedGradeAssessmentMocks,
    } = createAdapter();
    mockVisibleAssessmentDependencies({
      repository,
      scopedEnrollmentMocks,
      scopedTeacherSubjectAllocationMocks,
      scopedGradeAssessmentMocks,
    });
    repository.findExistingSubmission.mockResolvedValue(null);
    repository.findEnrollmentForSubmission.mockResolvedValue(
      submissionEnrollmentFixture(),
    );
    repository.createSubmission.mockResolvedValue(submissionFixture());

    const result = await adapter.startSubmission({
      context: contextFixture(),
      assessmentId: 'assessment-1',
    });

    expect(
      scopedGradeAssessmentMocks.findFirst.mock.calls[0][0].where,
    ).toMatchObject({
      id: 'assessment-1',
      academicYearId: 'year-1',
      termId: 'term-1',
      subjectId: { in: ['subject-1'] },
      deliveryMode: {
        in: [
          GradeAssessmentDeliveryMode.SCORE_ONLY,
          GradeAssessmentDeliveryMode.QUESTION_BASED,
        ],
      },
      approvalStatus: {
        in: [
          GradeAssessmentApprovalStatus.PUBLISHED,
          GradeAssessmentApprovalStatus.APPROVED,
        ],
      },
      OR: expect.arrayContaining([
        { scopeType: GradeScopeType.CLASSROOM, scopeKey: 'classroom-1' },
      ]),
    });
    expect(repository.createSubmission).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: 'school-1',
        assessmentId: 'assessment-1',
        termId: 'term-1',
        studentId: 'student-1',
        enrollmentId: 'enrollment-1',
      }),
    );
    expect(result.created).toBe(true);
    expect(result.submission.id).toBe('submission-1');
  });

  it('returns an existing current-enrollment submission idempotently on start', async () => {
    const {
      adapter,
      repository,
      scopedEnrollmentMocks,
      scopedTeacherSubjectAllocationMocks,
      scopedGradeAssessmentMocks,
    } = createAdapter();
    mockVisibleAssessmentDependencies({
      repository,
      scopedEnrollmentMocks,
      scopedTeacherSubjectAllocationMocks,
      scopedGradeAssessmentMocks,
    });
    repository.findExistingSubmission.mockResolvedValue(submissionFixture());

    const result = await adapter.startSubmission({
      context: contextFixture(),
      assessmentId: 'assessment-1',
    });

    expect(result).toMatchObject({
      created: false,
      submission: { id: 'submission-1' },
    });
    expect(repository.createSubmission).not.toHaveBeenCalled();
  });

  it('hides assessments that are not visible through Student App exam scope', async () => {
    const {
      adapter,
      repository,
      scopedEnrollmentMocks,
      scopedTeacherSubjectAllocationMocks,
      scopedGradeAssessmentMocks,
    } = createAdapter();
    scopedEnrollmentMocks.findFirstOrThrow.mockResolvedValue(
      enrollmentContextFixture(),
    );
    scopedTeacherSubjectAllocationMocks.findMany.mockResolvedValue([
      { subjectId: 'subject-1' },
    ]);
    scopedGradeAssessmentMocks.findFirst.mockResolvedValue(null);

    await expect(
      adapter.startSubmission({
        context: contextFixture(),
        assessmentId: 'hidden-assessment',
      }),
    ).rejects.toMatchObject({ httpStatus: 404 });
    expect(repository.findAssessmentForSubmission).not.toHaveBeenCalled();
    expect(repository.createSubmission).not.toHaveBeenCalled();
  });

  it('does not reuse an existing submission from another enrollment', async () => {
    const {
      adapter,
      repository,
      scopedEnrollmentMocks,
      scopedTeacherSubjectAllocationMocks,
      scopedGradeAssessmentMocks,
    } = createAdapter();
    mockVisibleAssessmentDependencies({
      repository,
      scopedEnrollmentMocks,
      scopedTeacherSubjectAllocationMocks,
      scopedGradeAssessmentMocks,
    });
    repository.findExistingSubmission.mockResolvedValue(
      submissionFixture({ enrollmentId: 'other-enrollment' }),
    );

    await expect(
      adapter.startSubmission({
        context: contextFixture(),
        assessmentId: 'assessment-1',
      }),
    ).rejects.toMatchObject({ httpStatus: 404 });
    expect(repository.createSubmission).not.toHaveBeenCalled();
  });

  it('rejects score-only assessments before creating a submission', async () => {
    const {
      adapter,
      repository,
      scopedEnrollmentMocks,
      scopedTeacherSubjectAllocationMocks,
      scopedGradeAssessmentMocks,
    } = createAdapter();
    mockVisibleAssessmentDependencies({
      repository,
      scopedEnrollmentMocks,
      scopedTeacherSubjectAllocationMocks,
      scopedGradeAssessmentMocks,
      assessment: assessmentFixture({
        deliveryMode: GradeAssessmentDeliveryMode.SCORE_ONLY,
      }),
    });

    await expect(
      adapter.startSubmission({
        context: contextFixture(),
        assessmentId: 'assessment-1',
      }),
    ).rejects.toMatchObject({ code: 'validation.failed' });
    expect(repository.createSubmission).not.toHaveBeenCalled();
  });

  it('requires start before saving answers', async () => {
    const {
      adapter,
      repository,
      scopedEnrollmentMocks,
      scopedTeacherSubjectAllocationMocks,
      scopedGradeAssessmentMocks,
    } = createAdapter();
    mockVisibleAssessmentDependencies({
      repository,
      scopedEnrollmentMocks,
      scopedTeacherSubjectAllocationMocks,
      scopedGradeAssessmentMocks,
    });
    repository.findExistingSubmissionForEnrollment.mockResolvedValue(null);

    await expect(
      adapter.bulkSaveAnswers({
        context: contextFixture(),
        assessmentId: 'assessment-1',
        command: {
          answers: [
            {
              questionId: 'question-1',
              selectedOptionIds: ['option-1'],
            },
          ],
        },
      }),
    ).rejects.toMatchObject({ httpStatus: 404 });
    expect(
      repository.bulkUpsertAnswersWithSelectedOptions,
    ).not.toHaveBeenCalled();
  });

  it('blocks submitted submission mutation', async () => {
    const {
      adapter,
      repository,
      scopedEnrollmentMocks,
      scopedTeacherSubjectAllocationMocks,
      scopedGradeAssessmentMocks,
    } = createAdapter();
    mockVisibleAssessmentDependencies({
      repository,
      scopedEnrollmentMocks,
      scopedTeacherSubjectAllocationMocks,
      scopedGradeAssessmentMocks,
    });
    repository.findExistingSubmissionForEnrollment.mockResolvedValue(
      submissionFixture({ status: GradeSubmissionStatus.SUBMITTED }),
    );

    await expect(
      adapter.saveAnswer({
        context: contextFixture(),
        assessmentId: 'assessment-1',
        questionId: 'question-1',
        command: { selectedOptionIds: ['option-1'] },
      }),
    ).rejects.toMatchObject({ code: 'grades.submission.already_submitted' });
  });

  it('rejects a question from another assessment', async () => {
    const {
      adapter,
      repository,
      scopedEnrollmentMocks,
      scopedTeacherSubjectAllocationMocks,
      scopedGradeAssessmentMocks,
    } = createAdapter();
    mockVisibleAssessmentDependencies({
      repository,
      scopedEnrollmentMocks,
      scopedTeacherSubjectAllocationMocks,
      scopedGradeAssessmentMocks,
    });
    repository.findExistingSubmissionForEnrollment.mockResolvedValue(
      submissionFixture(),
    );
    repository.findQuestionForAnswer.mockResolvedValue(
      questionFixture({ assessmentId: 'other-assessment' }),
    );

    await expect(
      adapter.saveAnswer({
        context: contextFixture(),
        assessmentId: 'assessment-1',
        questionId: 'question-1',
        command: { selectedOptionIds: ['option-1'] },
      }),
    ).rejects.toMatchObject({ code: 'grades.answer.invalid_question' });
    expect(repository.upsertAnswerWithSelectedOptions).not.toHaveBeenCalled();
  });

  it('rejects an option from another question', async () => {
    const {
      adapter,
      repository,
      scopedEnrollmentMocks,
      scopedTeacherSubjectAllocationMocks,
      scopedGradeAssessmentMocks,
    } = createAdapter();
    mockVisibleAssessmentDependencies({
      repository,
      scopedEnrollmentMocks,
      scopedTeacherSubjectAllocationMocks,
      scopedGradeAssessmentMocks,
    });
    repository.findExistingSubmissionForEnrollment.mockResolvedValue(
      submissionFixture(),
    );
    repository.findQuestionForAnswer.mockResolvedValue(questionFixture());
    repository.findOptionsByIds.mockResolvedValue([
      optionFixture({ id: 'option-other', questionId: 'question-other' }),
    ]);

    await expect(
      adapter.saveAnswer({
        context: contextFixture(),
        assessmentId: 'assessment-1',
        questionId: 'question-1',
        command: { selectedOptionIds: ['option-other'] },
      }),
    ).rejects.toMatchObject({ code: 'grades.answer.invalid_option' });
    expect(repository.upsertAnswerWithSelectedOptions).not.toHaveBeenCalled();
  });

  it('saves bulk answers for the current student submission', async () => {
    const {
      adapter,
      repository,
      scopedEnrollmentMocks,
      scopedTeacherSubjectAllocationMocks,
      scopedGradeAssessmentMocks,
    } = createAdapter();
    mockVisibleAssessmentDependencies({
      repository,
      scopedEnrollmentMocks,
      scopedTeacherSubjectAllocationMocks,
      scopedGradeAssessmentMocks,
    });
    repository.findExistingSubmissionForEnrollment.mockResolvedValue(
      submissionFixture(),
    );
    repository.findQuestionsByIds.mockResolvedValue([questionFixture()]);
    repository.findOptionsByIds.mockResolvedValue([optionFixture()]);
    repository.bulkUpsertAnswersWithSelectedOptions.mockResolvedValue([
      answerFixture(),
    ]);

    const result = await adapter.bulkSaveAnswers({
      context: contextFixture(),
      assessmentId: 'assessment-1',
      command: {
        answers: [
          {
            questionId: 'question-1',
            selectedOptionIds: ['option-1'],
          },
        ],
      },
    });

    expect(
      repository.bulkUpsertAnswersWithSelectedOptions,
    ).toHaveBeenCalledWith([
      expect.objectContaining({
        schoolId: 'school-1',
        submissionId: 'submission-1',
        assessmentId: 'assessment-1',
        studentId: 'student-1',
        questionId: 'question-1',
      }),
    ]);
    expect(result.answers).toHaveLength(1);
  });

  it('blocks submit when required questions are unanswered', async () => {
    const {
      adapter,
      repository,
      scopedEnrollmentMocks,
      scopedTeacherSubjectAllocationMocks,
      scopedGradeAssessmentMocks,
    } = createAdapter();
    mockVisibleAssessmentDependencies({
      repository,
      scopedEnrollmentMocks,
      scopedTeacherSubjectAllocationMocks,
      scopedGradeAssessmentMocks,
    });
    repository.findExistingSubmissionForEnrollment.mockResolvedValue(
      submissionFixture({ answers: [] }),
    );
    repository.findQuestionsForSubmission.mockResolvedValue([
      questionFixture(),
    ]);

    await expect(
      adapter.submitSubmission({
        context: contextFixture(),
        assessmentId: 'assessment-1',
      }),
    ).rejects.toMatchObject({ code: 'validation.failed' });
    expect(repository.submitSubmission).not.toHaveBeenCalled();
  });

  it('submits the current in-progress submission when required answers exist', async () => {
    const {
      adapter,
      repository,
      scopedEnrollmentMocks,
      scopedTeacherSubjectAllocationMocks,
      scopedGradeAssessmentMocks,
    } = createAdapter();
    mockVisibleAssessmentDependencies({
      repository,
      scopedEnrollmentMocks,
      scopedTeacherSubjectAllocationMocks,
      scopedGradeAssessmentMocks,
    });
    repository.findExistingSubmissionForEnrollment.mockResolvedValue(
      submissionFixture(),
    );
    repository.findQuestionsForSubmission.mockResolvedValue([
      questionFixture(),
    ]);
    repository.submitSubmission.mockResolvedValue(
      submissionFixture({ status: GradeSubmissionStatus.SUBMITTED }),
    );

    const result = await adapter.submitSubmission({
      context: contextFixture(),
      assessmentId: 'assessment-1',
    });

    expect(repository.submitSubmission).toHaveBeenCalledWith('submission-1');
    expect(result.beforeStatus).toBe(GradeSubmissionStatus.IN_PROGRESS);
    expect(result.submission.status).toBe(GradeSubmissionStatus.SUBMITTED);
  });
});

function contextFixture(): StudentAppContext {
  return {
    studentUserId: 'student-user-1',
    studentId: 'student-1',
    schoolId: 'school-1',
    organizationId: 'org-1',
    membershipId: 'membership-1',
    roleId: 'role-1',
    permissions: ['students.records.view'],
    enrollmentId: 'enrollment-1',
    classroomId: 'classroom-1',
    academicYearId: 'year-1',
    requestedAcademicYearId: 'year-1',
    requestedTermId: 'term-1',
    termId: 'term-1',
  };
}

function mockVisibleAssessmentDependencies(params: {
  repository: jest.Mocked<GradesSubmissionsRepository>;
  scopedEnrollmentMocks: ReturnType<typeof modelMocks>;
  scopedTeacherSubjectAllocationMocks: ReturnType<typeof modelMocks>;
  scopedGradeAssessmentMocks: ReturnType<typeof modelMocks>;
  assessment?: ReturnType<typeof assessmentFixture>;
}): void {
  params.scopedEnrollmentMocks.findFirstOrThrow.mockResolvedValue(
    enrollmentContextFixture(),
  );
  params.scopedTeacherSubjectAllocationMocks.findMany.mockResolvedValue([
    { subjectId: 'subject-1' },
  ]);
  params.scopedGradeAssessmentMocks.findFirst.mockResolvedValue({
    id: 'assessment-1',
  });
  params.repository.findAssessmentForSubmission.mockResolvedValue(
    params.assessment ?? assessmentFixture(),
  );
}

function enrollmentContextFixture() {
  return {
    id: 'enrollment-1',
    classroom: {
      id: 'classroom-1',
      section: {
        id: 'section-1',
        grade: {
          id: 'grade-1',
          stage: { id: 'stage-1' },
        },
      },
    },
  };
}

function submissionEnrollmentFixture() {
  return {
    id: 'enrollment-1',
    studentId: 'student-1',
    academicYearId: 'year-1',
    termId: 'term-1',
    classroomId: 'classroom-1',
    classroom: {
      id: 'classroom-1',
      sectionId: 'section-1',
      section: {
        id: 'section-1',
        gradeId: 'grade-1',
        grade: { id: 'grade-1', stageId: 'stage-1' },
      },
    },
  } as never;
}

function assessmentFixture(overrides?: {
  deliveryMode?: GradeAssessmentDeliveryMode;
}) {
  return {
    id: 'assessment-1',
    schoolId: 'school-1',
    academicYearId: 'year-1',
    termId: 'term-1',
    subjectId: 'subject-1',
    scopeType: GradeScopeType.CLASSROOM,
    scopeKey: 'classroom-1',
    stageId: null,
    gradeId: null,
    sectionId: null,
    classroomId: 'classroom-1',
    titleEn: 'Quiz',
    titleAr: null,
    deliveryMode:
      overrides?.deliveryMode ?? GradeAssessmentDeliveryMode.QUESTION_BASED,
    approvalStatus: GradeAssessmentApprovalStatus.PUBLISHED,
    lockedAt: null,
    maxScore: 10,
    deletedAt: null,
    term: {
      id: 'term-1',
      academicYearId: 'year-1',
      startDate: new Date('2026-09-01T00:00:00.000Z'),
      endDate: new Date('2027-06-30T00:00:00.000Z'),
      isActive: true,
    },
  } as never;
}

function submissionFixture(overrides?: {
  status?: GradeSubmissionStatus;
  answers?: ReturnType<typeof answerFixture>[];
  enrollmentId?: string;
}) {
  return {
    id: 'submission-1',
    schoolId: 'school-1',
    assessmentId: 'assessment-1',
    termId: 'term-1',
    studentId: 'student-1',
    enrollmentId: overrides?.enrollmentId ?? 'enrollment-1',
    status: overrides?.status ?? GradeSubmissionStatus.IN_PROGRESS,
    startedAt: new Date('2026-10-04T08:00:00.000Z'),
    submittedAt: null,
    correctedAt: null,
    reviewedById: null,
    totalScore: null,
    maxScore: 10,
    metadata: null,
    createdAt: new Date('2026-10-04T08:00:00.000Z'),
    updatedAt: new Date('2026-10-04T08:00:00.000Z'),
    assessment: assessmentFixture(),
    student: null,
    enrollment: null,
    answers: overrides?.answers ?? [answerFixture()],
  } as never;
}

function questionFixture(overrides?: { assessmentId?: string }) {
  return {
    id: 'question-1',
    schoolId: 'school-1',
    assessmentId: overrides?.assessmentId ?? 'assessment-1',
    type: GradeQuestionType.MCQ_SINGLE,
    prompt: 'Choose one.',
    promptAr: null,
    points: 10,
    sortOrder: 1,
    required: true,
    deletedAt: null,
    options: [optionFixture()],
  } as never;
}

function optionFixture(overrides?: { id?: string; questionId?: string }) {
  return {
    id: overrides?.id ?? 'option-1',
    schoolId: 'school-1',
    assessmentId: 'assessment-1',
    questionId: overrides?.questionId ?? 'question-1',
    label: 'Visible option',
    labelAr: null,
    value: 'A',
    sortOrder: 1,
    deletedAt: null,
  } as never;
}

function answerFixture() {
  return {
    id: 'answer-1',
    schoolId: 'school-1',
    submissionId: 'submission-1',
    assessmentId: 'assessment-1',
    questionId: 'question-1',
    studentId: 'student-1',
    answerText: null,
    answerJson: null,
    correctionStatus: 'PENDING',
    awardedPoints: null,
    maxPoints: 10,
    reviewerComment: null,
    reviewerCommentAr: null,
    reviewedById: null,
    reviewedAt: null,
    createdAt: new Date('2026-10-04T08:00:00.000Z'),
    updatedAt: new Date('2026-10-04T08:00:00.000Z'),
    question: {
      id: 'question-1',
      assessmentId: 'assessment-1',
      type: GradeQuestionType.MCQ_SINGLE,
      points: 10,
      deletedAt: null,
    },
    selectedOptions: [
      {
        schoolId: 'school-1',
        answerId: 'answer-1',
        optionId: 'option-1',
        createdAt: new Date('2026-10-04T08:00:00.000Z'),
        option: {
          id: 'option-1',
          questionId: 'question-1',
          label: 'Visible option',
          labelAr: null,
          value: 'A',
          deletedAt: null,
        },
      },
    ],
  } as never;
}

function modelMocks() {
  return {
    findFirst: jest.fn(),
    findFirstOrThrow: jest.fn(),
    findMany: jest.fn(),
  };
}

function createAdapter(): {
  adapter: StudentExamsSubmissionWriteAdapter;
  repository: jest.Mocked<GradesSubmissionsRepository>;
  scopedEnrollmentMocks: ReturnType<typeof modelMocks>;
  scopedTeacherSubjectAllocationMocks: ReturnType<typeof modelMocks>;
  scopedGradeAssessmentMocks: ReturnType<typeof modelMocks>;
} {
  const scopedEnrollmentMocks = modelMocks();
  const scopedTeacherSubjectAllocationMocks = modelMocks();
  const scopedGradeAssessmentMocks = modelMocks();
  const prisma = {
    scoped: {
      enrollment: scopedEnrollmentMocks,
      teacherSubjectAllocation: scopedTeacherSubjectAllocationMocks,
      gradeAssessment: scopedGradeAssessmentMocks,
    },
  } as unknown as PrismaService;
  const repository = {
    findAssessmentForSubmission: jest.fn(),
    findExistingSubmission: jest.fn(),
    findExistingSubmissionForEnrollment: jest.fn(),
    findEnrollmentForSubmission: jest.fn(),
    createSubmission: jest.fn(),
    findQuestionForAnswer: jest.fn(),
    findQuestionsByIds: jest.fn(),
    findOptionsByIds: jest.fn(),
    upsertAnswerWithSelectedOptions: jest.fn(),
    bulkUpsertAnswersWithSelectedOptions: jest.fn(),
    findQuestionsForSubmission: jest.fn(),
    submitSubmission: jest.fn(),
  } as unknown as jest.Mocked<GradesSubmissionsRepository>;

  return {
    adapter: new StudentExamsSubmissionWriteAdapter(prisma, repository),
    repository,
    scopedEnrollmentMocks,
    scopedTeacherSubjectAllocationMocks,
    scopedGradeAssessmentMocks,
  };
}
