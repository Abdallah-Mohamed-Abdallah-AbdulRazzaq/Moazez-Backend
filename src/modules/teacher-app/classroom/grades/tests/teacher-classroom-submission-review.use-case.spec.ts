import { NotFoundDomainException } from '../../../../../common/exceptions/domain-exception';
import { BulkReviewGradeSubmissionAnswersUseCase } from '../../../../grades/assessments/application/bulk-review-grade-submission-answers.use-case';
import { FinalizeGradeSubmissionReviewUseCase } from '../../../../grades/assessments/application/finalize-grade-submission-review.use-case';
import { ReviewGradeSubmissionAnswerUseCase } from '../../../../grades/assessments/application/review-grade-submission-answer.use-case';
import { SyncGradeSubmissionToGradeItemUseCase } from '../../../../grades/assessments/application/sync-grade-submission-to-grade-item.use-case';
import { TeacherAppAccessService } from '../../../access/teacher-app-access.service';
import { TeacherAppRequiredTeacherException } from '../../../shared/teacher-app.errors';
import type { TeacherAppAllocationRecord } from '../../../shared/teacher-app.types';
import { BulkReviewTeacherClassroomSubmissionAnswersUseCase } from '../application/bulk-review-teacher-classroom-submission-answers.use-case';
import { FinalizeTeacherClassroomSubmissionReviewUseCase } from '../application/finalize-teacher-classroom-submission-review.use-case';
import { ReviewTeacherClassroomSubmissionAnswerUseCase } from '../application/review-teacher-classroom-submission-answer.use-case';
import { SyncTeacherClassroomSubmissionGradeItemUseCase } from '../application/sync-teacher-classroom-submission-grade-item.use-case';
import { TeacherClassroomGradesReadAdapter } from '../infrastructure/teacher-classroom-grades-read.adapter';

describe('Teacher classroom submission review use-cases', () => {
  it('rejects non-teacher actors through the Teacher App access service', async () => {
    for (const scenario of createReviewScenarios()) {
      const { useCases, accessService, gradesAdapter, coreUseCases } =
        createUseCases();
      accessService.assertTeacherOwnsAllocation.mockRejectedValue(
        new TeacherAppRequiredTeacherException({ reason: 'actor_not_teacher' }),
      );

      await expect(scenario.execute(useCases)).rejects.toMatchObject({
        code: 'teacher_app.actor.required_teacher',
      });
      expect(
        gradesAdapter.assertOwnedAssignmentSubmissionReviewTarget,
      ).not.toHaveBeenCalled();
      expect(gradesAdapter.assertOwnedSubmissionAnswer).not.toHaveBeenCalled();
      expect(gradesAdapter.assertOwnedSubmissionAnswers).not.toHaveBeenCalled();
      expect(coreUseCases.reviewAnswer.execute).not.toHaveBeenCalled();
      expect(coreUseCases.bulkReview.execute).not.toHaveBeenCalled();
      expect(coreUseCases.finalizeReview.execute).not.toHaveBeenCalled();
      expect(coreUseCases.syncGradeItem.execute).not.toHaveBeenCalled();
    }
  });

  it('checks allocation ownership and boundaries before Grades core mutations', async () => {
    for (const scenario of createReviewScenarios()) {
      const { useCases, accessService, gradesAdapter, coreUseCases } =
        createUseCases();

      await scenario.execute(useCases);

      const accessOrder =
        accessService.assertTeacherOwnsAllocation.mock.invocationCallOrder[0];
      const boundaryOrder =
        gradesAdapter.assertOwnedAssignmentSubmissionReviewTarget.mock
          .invocationCallOrder[0];
      const coreOrder =
        coreUseCases[scenario.coreUseCase].execute.mock.invocationCallOrder[0];

      expect(accessOrder).toBeLessThan(boundaryOrder);
      expect(boundaryOrder).toBeLessThan(coreOrder);
      expect(accessService.assertTeacherOwnsAllocation).toHaveBeenCalledWith(
        'allocation-1',
      );
    }
  });

  it('delegates single answer review only after submission and answer boundary validation', async () => {
    const { useCases, gradesAdapter, coreUseCases } = createUseCases();

    const result = await useCases.reviewAnswer.execute(
      'allocation-1',
      'assignment-1',
      'submission-1',
      'answer-1',
      {
        awardedPoints: 8,
        reviewerComment: 'Clear work',
      },
    );
    const json = JSON.stringify(result);

    expect(
      gradesAdapter.assertOwnedAssignmentSubmissionReviewTarget,
    ).toHaveBeenCalledWith({
      allocation: expect.objectContaining({
        classroomId: 'classroom-1',
        subjectId: 'subject-1',
        termId: 'term-1',
      }),
      assignmentId: 'assignment-1',
      submissionId: 'submission-1',
    });
    expect(gradesAdapter.assertOwnedSubmissionAnswer).toHaveBeenCalledWith({
      allocation: expect.objectContaining({ id: 'allocation-1' }),
      assignmentId: 'assignment-1',
      submissionId: 'submission-1',
      answerId: 'answer-1',
    });
    expect(coreUseCases.reviewAnswer.execute).toHaveBeenCalledWith(
      'submission-1',
      'answer-1',
      {
        awardedPoints: 8,
        reviewerComment: 'Clear work',
      },
    );
    expect(result).toMatchObject({
      classId: 'allocation-1',
      assignmentId: 'assignment-1',
      submissionId: 'submission-1',
      source: 'grades_assessment',
      answer: {
        answerId: 'answer-1',
        questionId: 'question-1',
        correctionStatus: 'corrected',
        score: 8,
        maxScore: 10,
        feedback: 'Clear work',
      },
    });
    expect(json).not.toContain('schoolId');
    expect(json).not.toContain('scheduleId');
    expect(json).not.toContain('answerKey');
    expect(json).not.toContain('correctAnswer');
    expect(json).not.toContain('isCorrect');
    expect(json).not.toContain('reviewedById');
    expect(json).not.toContain('createdAt');
    expect(json).not.toContain('updatedAt');
  });

  it('delegates bulk answer review only after validating every answer belongs to the submission', async () => {
    const { useCases, gradesAdapter, coreUseCases } = createUseCases();
    const dto = {
      reviews: [
        {
          answerId: 'answer-1',
          awardedPoints: 8,
          reviewerComment: 'Clear work',
        },
      ],
    };

    const result = await useCases.bulkReview.execute(
      'allocation-1',
      'assignment-1',
      'submission-1',
      dto,
    );
    const json = JSON.stringify(result);

    expect(gradesAdapter.assertOwnedSubmissionAnswers).toHaveBeenCalledWith({
      allocation: expect.objectContaining({ id: 'allocation-1' }),
      assignmentId: 'assignment-1',
      submissionId: 'submission-1',
      answerIds: ['answer-1'],
    });
    expect(coreUseCases.bulkReview.execute).toHaveBeenCalledWith(
      'submission-1',
      dto,
    );
    expect(result.reviewedCount).toBe(1);
    expect(result.answers[0]).toMatchObject({
      answerId: 'answer-1',
      score: 8,
    });
    expect(json).not.toContain('schoolId');
    expect(json).not.toContain('scheduleId');
    expect(json).not.toContain('answerKey');
  });

  it('delegates finalize and sync to Grades core after owned submission boundary validation', async () => {
    const { useCases, coreUseCases } = createUseCases();

    const finalized = await useCases.finalizeReview.execute(
      'allocation-1',
      'assignment-1',
      'submission-1',
    );
    const synced = await useCases.syncGradeItem.execute(
      'allocation-1',
      'assignment-1',
      'submission-1',
    );
    const json = JSON.stringify({ finalized, synced });

    expect(coreUseCases.finalizeReview.execute).toHaveBeenCalledWith(
      'submission-1',
    );
    expect(coreUseCases.syncGradeItem.execute).toHaveBeenCalledWith(
      'submission-1',
    );
    expect(finalized).toMatchObject({
      classId: 'allocation-1',
      assignmentId: 'assignment-1',
      source: 'grades_assessment',
      submission: {
        submissionId: 'submission-1',
        status: 'corrected',
        finalizedAt: expect.any(String),
      },
    });
    expect(synced).toMatchObject({
      classId: 'allocation-1',
      assignmentId: 'assignment-1',
      submissionId: 'submission-1',
      source: 'grades_assessment',
      synced: true,
      idempotent: false,
      gradeItem: {
        gradeItemId: 'grade-item-1',
        assignmentId: 'assignment-1',
        studentId: 'student-1',
        score: 8,
      },
    });
    expect(json).not.toContain('schoolId');
    expect(json).not.toContain('scheduleId');
    expect(json).not.toContain('answerKey');
    expect(json).not.toContain('metadata');
    expect(json).not.toContain('enteredById');
  });

  it('returns safe 404 before Grades core for assignment, submission, student, and answer boundary mismatches', async () => {
    for (const scenario of [
      {
        label: 'assignment from another classroom',
        execute: (useCases: ReviewUseCases) =>
          useCases.reviewAnswer.execute(
            'allocation-1',
            'other-classroom-assignment',
            'submission-1',
            'answer-1',
            { awardedPoints: 1 },
          ),
        rejectTarget: true,
      },
      {
        label: 'assignment from another subject',
        execute: (useCases: ReviewUseCases) =>
          useCases.bulkReview.execute(
            'allocation-1',
            'other-subject-assignment',
            'submission-1',
            { reviews: [{ answerId: 'answer-1', awardedPoints: 1 }] },
          ),
        rejectTarget: true,
      },
      {
        label: 'assignment from another term',
        execute: (useCases: ReviewUseCases) =>
          useCases.finalizeReview.execute(
            'allocation-1',
            'other-term-assignment',
            'submission-1',
          ),
        rejectTarget: true,
      },
      {
        label: 'submission from another assignment',
        execute: (useCases: ReviewUseCases) =>
          useCases.syncGradeItem.execute(
            'allocation-1',
            'assignment-1',
            'other-assignment-submission',
          ),
        rejectTarget: true,
      },
      {
        label: 'submission student outside owned classroom',
        execute: (useCases: ReviewUseCases) =>
          useCases.reviewAnswer.execute(
            'allocation-1',
            'assignment-1',
            'outside-student-submission',
            'answer-1',
            { awardedPoints: 1 },
          ),
        rejectTarget: true,
      },
      {
        label: 'answer from another submission',
        execute: (useCases: ReviewUseCases) =>
          useCases.reviewAnswer.execute(
            'allocation-1',
            'assignment-1',
            'submission-1',
            'answer-from-another-submission',
            { awardedPoints: 1 },
          ),
        rejectAnswer: true,
      },
    ]) {
      const { useCases, gradesAdapter, coreUseCases } = createUseCases();
      const notFound = new NotFoundDomainException('Not found', {
        label: scenario.label,
      });

      if (scenario.rejectTarget) {
        gradesAdapter.assertOwnedAssignmentSubmissionReviewTarget.mockRejectedValue(
          notFound,
        );
      }
      if (scenario.rejectAnswer) {
        gradesAdapter.assertOwnedSubmissionAnswer.mockRejectedValue(notFound);
      }

      await expect(scenario.execute(useCases)).rejects.toMatchObject({
        code: 'not_found',
      });
      expect(coreUseCases.reviewAnswer.execute).not.toHaveBeenCalled();
      expect(coreUseCases.bulkReview.execute).not.toHaveBeenCalled();
      expect(coreUseCases.finalizeReview.execute).not.toHaveBeenCalled();
      expect(coreUseCases.syncGradeItem.execute).not.toHaveBeenCalled();
    }
  });

  it('keeps Homework core deferred and leaves review rules and audit with Grades core', async () => {
    const { useCases, coreUseCases } = createUseCases();

    const response = await useCases.reviewAnswer.execute(
      'allocation-1',
      'assignment-1',
      'submission-1',
      'answer-1',
      { awardedPoints: 8 },
    );
    const json = JSON.stringify(response);

    expect(coreUseCases.reviewAnswer.execute).toHaveBeenCalledTimes(1);
    expect(json).toContain('grades_assessment');
    expect(json).not.toContain('homeworkId');
    expect(json).not.toContain('homework');
  });
});

type ReviewUseCases = {
  reviewAnswer: ReviewTeacherClassroomSubmissionAnswerUseCase;
  bulkReview: BulkReviewTeacherClassroomSubmissionAnswersUseCase;
  finalizeReview: FinalizeTeacherClassroomSubmissionReviewUseCase;
  syncGradeItem: SyncTeacherClassroomSubmissionGradeItemUseCase;
};

type CoreUseCases = {
  reviewAnswer: jest.Mocked<Pick<ReviewGradeSubmissionAnswerUseCase, 'execute'>>;
  bulkReview: jest.Mocked<Pick<BulkReviewGradeSubmissionAnswersUseCase, 'execute'>>;
  finalizeReview: jest.Mocked<
    Pick<FinalizeGradeSubmissionReviewUseCase, 'execute'>
  >;
  syncGradeItem: jest.Mocked<
    Pick<SyncGradeSubmissionToGradeItemUseCase, 'execute'>
  >;
};

function createReviewScenarios(): Array<{
  coreUseCase: keyof CoreUseCases;
  execute: (useCases: ReviewUseCases) => Promise<unknown>;
}> {
  return [
    {
      coreUseCase: 'reviewAnswer',
      execute: (useCases) =>
        useCases.reviewAnswer.execute(
          'allocation-1',
          'assignment-1',
          'submission-1',
          'answer-1',
          { awardedPoints: 8 },
        ),
    },
    {
      coreUseCase: 'bulkReview',
      execute: (useCases) =>
        useCases.bulkReview.execute(
          'allocation-1',
          'assignment-1',
          'submission-1',
          { reviews: [{ answerId: 'answer-1', awardedPoints: 8 }] },
        ),
    },
    {
      coreUseCase: 'finalizeReview',
      execute: (useCases) =>
        useCases.finalizeReview.execute(
          'allocation-1',
          'assignment-1',
          'submission-1',
        ),
    },
    {
      coreUseCase: 'syncGradeItem',
      execute: (useCases) =>
        useCases.syncGradeItem.execute(
          'allocation-1',
          'assignment-1',
          'submission-1',
        ),
    },
  ];
}

function createUseCases(): {
  useCases: ReviewUseCases;
  accessService: jest.Mocked<TeacherAppAccessService>;
  gradesAdapter: jest.Mocked<TeacherClassroomGradesReadAdapter>;
  coreUseCases: CoreUseCases;
} {
  const accessService = {
    assertTeacherOwnsAllocation: jest.fn(() =>
      Promise.resolve(allocationFixture()),
    ),
  } as unknown as jest.Mocked<TeacherAppAccessService>;
  const gradesAdapter = {
    assertOwnedAssignmentSubmissionReviewTarget: jest.fn(() =>
      Promise.resolve({ assignment: {}, submission: {} }),
    ),
    assertOwnedSubmissionAnswer: jest.fn(() => Promise.resolve()),
    assertOwnedSubmissionAnswers: jest.fn(() => Promise.resolve()),
  } as unknown as jest.Mocked<TeacherClassroomGradesReadAdapter>;
  const coreUseCases: CoreUseCases = {
    reviewAnswer: {
      execute: jest.fn(() => Promise.resolve(reviewedAnswerFixture())),
    },
    bulkReview: {
      execute: jest.fn(() =>
        Promise.resolve({
          submissionId: 'submission-1',
          reviewedCount: 1,
          answers: [reviewedAnswerFixture()],
        }),
      ),
    },
    finalizeReview: {
      execute: jest.fn(() => Promise.resolve(finalizedSubmissionFixture())),
    },
    syncGradeItem: {
      execute: jest.fn(() => Promise.resolve(syncResultFixture())),
    },
  };

  return {
    useCases: {
      reviewAnswer: new ReviewTeacherClassroomSubmissionAnswerUseCase(
        accessService,
        gradesAdapter,
        coreUseCases.reviewAnswer as ReviewGradeSubmissionAnswerUseCase,
      ),
      bulkReview: new BulkReviewTeacherClassroomSubmissionAnswersUseCase(
        accessService,
        gradesAdapter,
        coreUseCases.bulkReview as BulkReviewGradeSubmissionAnswersUseCase,
      ),
      finalizeReview: new FinalizeTeacherClassroomSubmissionReviewUseCase(
        accessService,
        gradesAdapter,
        coreUseCases.finalizeReview as FinalizeGradeSubmissionReviewUseCase,
      ),
      syncGradeItem: new SyncTeacherClassroomSubmissionGradeItemUseCase(
        accessService,
        gradesAdapter,
        coreUseCases.syncGradeItem as SyncGradeSubmissionToGradeItemUseCase,
      ),
    },
    accessService,
    gradesAdapter,
    coreUseCases,
  };
}

function allocationFixture(): TeacherAppAllocationRecord {
  return {
    id: 'allocation-1',
    schoolId: 'school-1',
    teacherUserId: 'teacher-1',
    subjectId: 'subject-1',
    classroomId: 'classroom-1',
    termId: 'term-1',
    subject: null,
    classroom: null,
    term: {
      id: 'term-1',
      schoolId: 'school-1',
      academicYearId: 'year-1',
      nameAr: 'Term AR',
      nameEn: 'Term',
      isActive: true,
    },
  };
}

function reviewedAnswerFixture() {
  return {
    id: 'answer-1',
    questionId: 'question-1',
    type: 'short_answer',
    answerText: 'Student visible answer',
    answerJson: null,
    correctionStatus: 'corrected',
    awardedPoints: 8,
    maxPoints: 10,
    reviewerComment: 'Clear work',
    reviewerCommentAr: null,
    selectedOptions: [],
    reviewedAt: '2026-09-15T10:00:00.000Z',
    reviewedById: 'teacher-1',
    createdAt: '2026-09-15T09:00:00.000Z',
    updatedAt: '2026-09-15T10:00:00.000Z',
  };
}

function finalizedSubmissionFixture() {
  const answer = reviewedAnswerFixture();

  return {
    id: 'submission-1',
    assessmentId: 'assignment-1',
    termId: 'term-1',
    studentId: 'student-1',
    enrollmentId: 'enrollment-1',
    status: 'corrected',
    startedAt: '2026-09-15T08:00:00.000Z',
    submittedAt: '2026-09-15T09:00:00.000Z',
    correctedAt: '2026-09-15T10:30:00.000Z',
    reviewedById: 'teacher-1',
    totalScore: 8,
    maxScore: 10,
    student: {
      id: 'student-1',
      firstName: 'Mona',
      lastName: 'Ahmed',
      nameAr: null,
      nameEn: 'Mona Ahmed',
      code: null,
      admissionNo: null,
    },
    enrollment: {
      id: 'enrollment-1',
      classroomId: 'classroom-1',
      sectionId: 'section-1',
      gradeId: 'grade-1',
      classroomName: 'Classroom',
      sectionName: 'Section',
      gradeName: 'Grade',
    },
    assessment: {
      id: 'assignment-1',
      titleEn: 'Worksheet',
      titleAr: null,
      deliveryMode: 'question_based',
      approvalStatus: 'approved',
      maxScore: 10,
    },
    progress: {
      totalQuestions: 1,
      answeredCount: 1,
      requiredAnsweredCount: 1,
      requiredQuestionCount: 1,
      pendingCorrectionCount: 0,
    },
    answers: [answer],
    questions: [
      {
        id: 'question-1',
        type: 'short_answer',
        prompt: 'Solve it',
        promptAr: null,
        points: 10,
        sortOrder: 1,
        required: true,
        answer,
      },
    ],
  };
}

function syncResultFixture() {
  return {
    submission: {
      id: 'submission-1',
      assessmentId: 'assignment-1',
      studentId: 'student-1',
      enrollmentId: 'enrollment-1',
      status: 'corrected',
      totalScore: 8,
      maxScore: 10,
      correctedAt: '2026-09-15T10:30:00.000Z',
    },
    gradeItem: {
      id: 'grade-item-1',
      assessmentId: 'assignment-1',
      studentId: 'student-1',
      enrollmentId: 'enrollment-1',
      status: 'entered',
      score: 8,
      enteredAt: '2026-09-15T10:31:00.000Z',
      enteredById: 'teacher-1',
    },
    synced: true,
    idempotent: false,
  };
}
