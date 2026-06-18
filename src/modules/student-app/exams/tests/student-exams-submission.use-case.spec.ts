import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import { StudentAppRequiredStudentException } from '../../shared/student-app-errors';
import type {
  StudentAppContext,
  StudentAppCurrentStudentWithEnrollment,
} from '../../shared/student-app.types';
import { BulkSaveStudentExamAnswersUseCase } from '../application/bulk-save-student-exam-answers.use-case';
import { SaveStudentExamAnswerUseCase } from '../application/save-student-exam-answer.use-case';
import { StartStudentExamSubmissionUseCase } from '../application/start-student-exam-submission.use-case';
import { SubmitStudentExamSubmissionUseCase } from '../application/submit-student-exam-submission.use-case';
import { StudentExamsReadAdapter } from '../infrastructure/student-exams-read.adapter';
import { StudentExamsSubmissionWriteAdapter } from '../infrastructure/student-exams-submission-write.adapter';

describe('Student Exam submission use-cases', () => {
  it('requires Student App current-student access before starting', async () => {
    const {
      startUseCase,
      accessService,
      writeAdapter,
      readAdapter,
      authRepository,
    } = createUseCases();
    accessService.getCurrentStudentWithEnrollment.mockRejectedValue(
      new StudentAppRequiredStudentException({ reason: 'actor_not_student' }),
    );

    await expect(startUseCase.execute('assessment-1')).rejects.toMatchObject({
      code: 'student_app.actor.required_student',
    });
    expect(writeAdapter.startSubmission).not.toHaveBeenCalled();
    expect(readAdapter.findExamSubmission).not.toHaveBeenCalled();
    expect(authRepository.createAuditLog).not.toHaveBeenCalled();
  });

  it('starts an exam and returns the safe Student App submission state', async () => {
    const { startUseCase, writeAdapter, readAdapter, authRepository } =
      createUseCasesWithValidAccess();
    writeAdapter.startSubmission.mockResolvedValue({
      submission: submissionMutationFixture(),
      created: true,
    });
    readAdapter.findExamSubmission.mockResolvedValue(
      submissionReadResultFixture(),
    );

    const result = await startUseCase.execute('assessment-1');

    expect(writeAdapter.startSubmission).toHaveBeenCalledWith({
      context: contextFixture(),
      assessmentId: 'assessment-1',
    });
    expect(authRepository.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        module: 'grades',
        action: 'grades.submission.create',
        resourceType: 'grade_submission',
        resourceId: 'submission-1',
      }),
    );
    expect(result).toMatchObject({
      assessmentId: 'assessment-1',
      status: 'in_progress',
      submission: { submissionId: 'submission-1', status: 'in_progress' },
    });
  });

  it('does not audit idempotent start when the submission already exists', async () => {
    const { startUseCase, writeAdapter, readAdapter, authRepository } =
      createUseCasesWithValidAccess();
    writeAdapter.startSubmission.mockResolvedValue({
      submission: submissionMutationFixture(),
      created: false,
    });
    readAdapter.findExamSubmission.mockResolvedValue(
      submissionReadResultFixture(),
    );

    await startUseCase.execute('assessment-1');

    expect(authRepository.createAuditLog).not.toHaveBeenCalled();
  });

  it('bulk-saves answers and returns sanitized submission state', async () => {
    const { bulkSaveUseCase, writeAdapter, readAdapter, authRepository } =
      createUseCasesWithValidAccess();
    writeAdapter.bulkSaveAnswers.mockResolvedValue({
      submission: submissionMutationFixture(),
      answers: [answerMutationFixture()],
    });
    readAdapter.findExamSubmission.mockResolvedValue(
      submissionReadResultFixture({
        answerJson: {
          selected: 'A',
          correctAnswer: 'A',
          correctAnswers: ['A'],
          isCorrect: true,
          objectKey: 'raw-object',
          kept: true,
        },
      }),
    );

    const result = await bulkSaveUseCase.execute('assessment-1', {
      answers: [
        {
          questionId: 'question-1',
          selectedOptionIds: ['option-1'],
        },
      ],
    });
    const serialized = JSON.stringify(result);

    expect(writeAdapter.bulkSaveAnswers).toHaveBeenCalledWith({
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
    expect(authRepository.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'grades.submission.answers.bulk_save',
      }),
    );
    expect(serialized).toContain('kept');
    for (const forbidden of [
      'answerKey',
      'correctAnswer',
      'correctAnswers',
      'isCorrect',
      'schoolId',
      'organizationId',
      'membershipId',
      'deletedAt',
      'objectKey',
      'bucket',
      'signedUrl',
      'reviewedById',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('single-saves an answer through the current student context', async () => {
    const { saveUseCase, writeAdapter, readAdapter, authRepository } =
      createUseCasesWithValidAccess();
    writeAdapter.saveAnswer.mockResolvedValue({
      submission: submissionMutationFixture(),
      answer: answerMutationFixture(),
    });
    readAdapter.findExamSubmission.mockResolvedValue(
      submissionReadResultFixture(),
    );

    await saveUseCase.execute({
      assessmentId: 'assessment-1',
      questionId: 'question-1',
      command: { selectedOptionIds: ['option-1'] },
    });

    expect(writeAdapter.saveAnswer).toHaveBeenCalledWith({
      context: contextFixture(),
      assessmentId: 'assessment-1',
      questionId: 'question-1',
      command: { selectedOptionIds: ['option-1'] },
    });
    expect(authRepository.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'grades.submission.answer.save',
        resourceType: 'grade_submission_answer',
      }),
    );
  });

  it('submits the current student submission and returns submitted state', async () => {
    const { submitUseCase, writeAdapter, readAdapter, authRepository } =
      createUseCasesWithValidAccess();
    writeAdapter.submitSubmission.mockResolvedValue({
      submission: submissionMutationFixture({ status: 'SUBMITTED' }),
      beforeStatus: 'IN_PROGRESS',
    });
    readAdapter.findExamSubmission.mockResolvedValue(
      submissionReadResultFixture({ status: 'SUBMITTED' }),
    );

    const result = await submitUseCase.execute('assessment-1');

    expect(writeAdapter.submitSubmission).toHaveBeenCalledWith({
      context: contextFixture(),
      assessmentId: 'assessment-1',
    });
    expect(authRepository.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'grades.submission.submit',
        before: { status: 'IN_PROGRESS' },
      }),
    );
    expect(result.status).toBe('completed');
    expect(result.submission?.status).toBe('submitted');
  });
});

function createUseCases(): {
  startUseCase: StartStudentExamSubmissionUseCase;
  bulkSaveUseCase: BulkSaveStudentExamAnswersUseCase;
  saveUseCase: SaveStudentExamAnswerUseCase;
  submitUseCase: SubmitStudentExamSubmissionUseCase;
  accessService: jest.Mocked<StudentAppAccessService>;
  writeAdapter: jest.Mocked<StudentExamsSubmissionWriteAdapter>;
  readAdapter: jest.Mocked<StudentExamsReadAdapter>;
  authRepository: jest.Mocked<AuthRepository>;
} {
  const accessService = {
    getCurrentStudentWithEnrollment: jest.fn(),
  } as unknown as jest.Mocked<StudentAppAccessService>;
  const writeAdapter = {
    startSubmission: jest.fn(),
    bulkSaveAnswers: jest.fn(),
    saveAnswer: jest.fn(),
    submitSubmission: jest.fn(),
  } as unknown as jest.Mocked<StudentExamsSubmissionWriteAdapter>;
  const readAdapter = {
    findExamSubmission: jest.fn(),
  } as unknown as jest.Mocked<StudentExamsReadAdapter>;
  const authRepository = {
    createAuditLog: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<AuthRepository>;

  return {
    startUseCase: new StartStudentExamSubmissionUseCase(
      accessService,
      writeAdapter,
      readAdapter,
      authRepository,
    ),
    bulkSaveUseCase: new BulkSaveStudentExamAnswersUseCase(
      accessService,
      writeAdapter,
      readAdapter,
      authRepository,
    ),
    saveUseCase: new SaveStudentExamAnswerUseCase(
      accessService,
      writeAdapter,
      readAdapter,
      authRepository,
    ),
    submitUseCase: new SubmitStudentExamSubmissionUseCase(
      accessService,
      writeAdapter,
      readAdapter,
      authRepository,
    ),
    accessService,
    writeAdapter,
    readAdapter,
    authRepository,
  };
}

function createUseCasesWithValidAccess(): ReturnType<typeof createUseCases> {
  const created = createUseCases();
  created.accessService.getCurrentStudentWithEnrollment.mockResolvedValue(
    currentStudentFixture(),
  );
  return created;
}

function currentStudentFixture(): StudentAppCurrentStudentWithEnrollment {
  return {
    context: contextFixture(),
    student: {} as StudentAppCurrentStudentWithEnrollment['student'],
    enrollment: {} as StudentAppCurrentStudentWithEnrollment['enrollment'],
  };
}

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

function submissionMutationFixture(overrides?: { status?: string }) {
  return {
    id: 'submission-1',
    assessmentId: 'assessment-1',
    status: overrides?.status ?? 'IN_PROGRESS',
  } as never;
}

function answerMutationFixture() {
  return {
    id: 'answer-1',
    submissionId: 'submission-1',
    assessmentId: 'assessment-1',
    questionId: 'question-1',
    answerText: null,
    answerJson: null,
    selectedOptions: [],
  } as never;
}

function submissionReadResultFixture(overrides?: {
  status?: string;
  answerJson?: unknown;
}) {
  return {
    exam: examFixture(),
    submission: {
      id: 'submission-1',
      assessmentId: 'assessment-1',
      status: overrides?.status ?? 'IN_PROGRESS',
      startedAt: new Date('2026-10-04T08:00:00.000Z'),
      submittedAt:
        overrides?.status === 'SUBMITTED'
          ? new Date('2026-10-04T08:30:00.000Z')
          : null,
      correctedAt: null,
      totalScore: null,
      maxScore: 10,
      answers: [
        {
          id: 'answer-1',
          questionId: 'question-1',
          answerText: 'A',
          answerJson: overrides?.answerJson ?? { selected: 'A' },
          correctionStatus: 'PENDING',
          awardedPoints: null,
          maxPoints: 10,
          reviewerComment: null,
          reviewerCommentAr: null,
          reviewedAt: null,
          question: {
            id: 'question-1',
            type: 'MCQ_SINGLE',
          },
          selectedOptions: [
            {
              optionId: 'option-1',
              option: {
                id: 'option-1',
                label: 'Visible option',
                labelAr: null,
                value: 'A',
              },
            },
          ],
        },
      ],
    },
  } as never;
}

function examFixture() {
  return {
    id: 'assessment-1',
    subjectId: 'subject-1',
    titleEn: 'Quiz 1',
    titleAr: null,
    type: 'QUIZ',
    deliveryMode: 'QUESTION_BASED',
    date: new Date('2026-10-01T00:00:00.000Z'),
    maxScore: 10,
    expectedTimeMinutes: 30,
    approvalStatus: 'PUBLISHED',
    lockedAt: null,
    subject: {
      id: 'subject-1',
      nameAr: 'Math AR',
      nameEn: 'Math',
    },
    questions: [
      {
        id: 'question-1',
        type: 'MCQ_SINGLE',
        prompt: 'Choose one.',
        promptAr: null,
        points: 10,
        sortOrder: 1,
        required: true,
        options: [
          {
            id: 'option-1',
            label: 'Visible option',
            labelAr: null,
            value: 'A',
            sortOrder: 1,
          },
        ],
      },
    ],
  };
}
