import {
  HomeworkAssignmentMode,
  HomeworkAssignmentStatus,
  HomeworkQuestionType,
  HomeworkSubmissionStatus,
  HomeworkTargetMode,
  HomeworkTargetStatus,
  Prisma,
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
  ListHomeworkSubmissionAnswersUseCase,
  SaveStudentHomeworkAnswerUseCase,
  SaveStudentHomeworkAnswersDraftUseCase,
  validateRequiredHomeworkAnswers,
} from '../application/homework-answers.use-cases';
import {
  CreateStudentHomeworkSubmissionAttachmentUseCase,
  ReorderStudentHomeworkSubmissionAttachmentUseCase,
} from '../application/homework-submission-attachments.use-cases';
import {
  presentHomeworkAnswersParent,
  presentHomeworkAnswersStudent,
  presentHomeworkAnswersTeacher,
} from '../presenters/homework-answer.presenter';
import { presentHomeworkSubmissionAttachment } from '../presenters/homework-submission-attachment.presenter';

describe('Homework answers and submission attachments use cases', () => {
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
    const question = seedQuestion();
    const submission = seedSubmission();
    const repo = {
      findStudentTargetForSubmission: jest.fn().mockResolvedValue(
        seedTarget({
          questions: [question],
          submissions: [submission],
        }),
      ),
      findSubmissionById: jest.fn().mockResolvedValue(submission),
      resolveDraftSubmission: jest.fn().mockResolvedValue({
        outcome: 'saved',
        submission,
      }),
      upsertSubmissionAnswer: jest.fn().mockImplementation(async ({ data }) =>
        seedAnswer({
          ...data,
          selectedOptionIds:
            data.selectedOptionIds === Prisma.JsonNull
              ? null
              : data.selectedOptionIds,
          homeworkQuestion: question,
        }),
      ),
      listSubmissionAnswers: jest.fn().mockResolvedValue([seedAnswer()]),
      findAttachmentFile: jest.fn().mockResolvedValue(seedFile()),
      getNextSubmissionAttachmentSortOrder: jest.fn().mockResolvedValue(1),
      createSubmissionAttachment: jest
        .fn()
        .mockImplementation(async (data) => seedSubmissionAttachment(data)),
      findSubmissionAttachmentById: jest
        .fn()
        .mockResolvedValue(seedSubmissionAttachment()),
      updateSubmissionAttachment: jest
        .fn()
        .mockImplementation(async ({ data }) =>
          seedSubmissionAttachment({ ...data }),
        ),
      ...overrides,
    };

    return repo;
  }

  function createAuthRepository(): any {
    return { createAuditLog: jest.fn().mockResolvedValue(undefined) };
  }

  it('saves a draft text answer', async () => {
    const question = seedQuestion({
      type: HomeworkQuestionType.SHORT_TEXT,
      options: [],
    });
    const repository = createRepository({
      findStudentTargetForSubmission: jest.fn().mockResolvedValue(
        seedTarget({
          questions: [question],
          submissions: [seedSubmission()],
        }),
      ),
    });
    const useCase = new SaveStudentHomeworkAnswerUseCase(repository);

    const response = await withStudentScope(() =>
      useCase.execute({
        homeworkId: 'homework-1',
        studentId: 'student-1',
        enrollmentId: 'enrollment-1',
        questionId: 'question-1',
        answer: { questionId: 'question-1', textAnswer: '  Cell theory  ' },
      }),
    );

    expect(repository.upsertSubmissionAnswer).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          textAnswer: 'Cell theory',
          selectedOptionIds: Prisma.JsonNull,
          isDraft: true,
        }),
      }),
    );
    expect(response.answer).toMatchObject({
      questionId: 'question-1',
      textAnswer: 'Cell theory',
      selectedOptionIds: [],
      isDraft: true,
    });
  });

  it('saves single-choice and multiple-choice answers', async () => {
    const single = seedQuestion({
      id: 'single-question',
      type: HomeworkQuestionType.SINGLE_CHOICE,
      options: [seedOption({ id: 'single-option' })],
    });
    const multiple = seedQuestion({
      id: 'multi-question',
      type: HomeworkQuestionType.MULTIPLE_CHOICE,
      options: [
        seedOption({ id: 'multi-option-1' }),
        seedOption({ id: 'multi-option-2' }),
      ],
    });
    const submission = seedSubmission();
    const repository = createRepository({
      findStudentTargetForSubmission: jest.fn().mockResolvedValue(
        seedTarget({
          questions: [single, multiple],
          submissions: [submission],
        }),
      ),
      resolveDraftSubmission: jest.fn().mockResolvedValue({
        outcome: 'saved',
        submission,
      }),
      upsertSubmissionAnswer: jest.fn().mockImplementation(async ({ data }) =>
        seedAnswer({
          ...data,
          homeworkQuestion:
            data.homeworkQuestionId === single.id ? single : multiple,
        }),
      ),
    });
    const useCase = new SaveStudentHomeworkAnswersDraftUseCase(repository);

    const response = await withStudentScope(() =>
      useCase.execute({
        homeworkId: 'homework-1',
        studentId: 'student-1',
        enrollmentId: 'enrollment-1',
        answers: [
          {
            questionId: 'single-question',
            selectedOptionIds: ['single-option'],
          },
          {
            questionId: 'multi-question',
            selectedOptionIds: ['multi-option-1', 'multi-option-2'],
          },
        ],
      }),
    );

    expect(repository.upsertSubmissionAnswer).toHaveBeenCalledTimes(2);
    expect(repository.upsertSubmissionAnswer).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          homeworkQuestionId: 'single-question',
          selectedOptionIds: ['single-option'],
        }),
      }),
    );
    expect(repository.upsertSubmissionAnswer).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          homeworkQuestionId: 'multi-question',
          selectedOptionIds: ['multi-option-1', 'multi-option-2'],
        }),
      }),
    );
    expect(response.items).toHaveLength(2);
  });

  it('rejects selected options from another question', async () => {
    const repository = createRepository();
    const useCase = new SaveStudentHomeworkAnswerUseCase(repository);

    await expect(
      withStudentScope(() =>
        useCase.execute({
          homeworkId: 'homework-1',
          studentId: 'student-1',
          enrollmentId: 'enrollment-1',
          questionId: 'question-1',
          answer: {
            questionId: 'question-1',
            selectedOptionIds: ['option-from-another-question'],
          },
        }),
      ),
    ).rejects.toMatchObject<Partial<DomainException>>({
      code: 'homework.answer.invalid_option',
    });
    expect(repository.upsertSubmissionAnswer).not.toHaveBeenCalled();
  });

  it('rejects mixed text and selected options for an answer', async () => {
    const repository = createRepository();
    const useCase = new SaveStudentHomeworkAnswerUseCase(repository);

    await expect(
      withStudentScope(() =>
        useCase.execute({
          homeworkId: 'homework-1',
          studentId: 'student-1',
          enrollmentId: 'enrollment-1',
          questionId: 'question-1',
          answer: {
            questionId: 'question-1',
            textAnswer: 'A',
            selectedOptionIds: ['option-1'],
          },
        }),
      ),
    ).rejects.toMatchObject<Partial<DomainException>>({
      code: 'homework.answer.invalid_payload',
    });
    expect(repository.upsertSubmissionAnswer).not.toHaveBeenCalled();
  });

  it('validates required answers before final submit while allowing optional unanswered questions', () => {
    const required = seedQuestion({
      id: 'required-question',
      type: HomeworkQuestionType.SHORT_TEXT,
      isRequired: true,
      options: [],
    });
    const optional = seedQuestion({
      id: 'optional-question',
      type: HomeworkQuestionType.LONG_TEXT,
      isRequired: false,
      options: [],
    });

    expect(() =>
      validateRequiredHomeworkAnswers({
        questions: [required],
        answers: [],
      }),
    ).toThrow(
      expect.objectContaining({ code: 'homework.answer.missing_required' }),
    );

    expect(() =>
      validateRequiredHomeworkAnswers({
        questions: [optional],
        answers: [],
      }),
    ).not.toThrow();
  });

  it('prevents answer mutation after submit', async () => {
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
    const useCase = new SaveStudentHomeworkAnswerUseCase(repository);

    await expect(
      withStudentScope(() =>
        useCase.execute({
          homeworkId: 'homework-1',
          studentId: 'student-1',
          enrollmentId: 'enrollment-1',
          questionId: 'question-1',
          answer: { questionId: 'question-1', selectedOptionIds: ['option-1'] },
        }),
      ),
    ).rejects.toMatchObject<Partial<DomainException>>({
      code: 'homework.answer.read_only',
    });
    expect(repository.resolveDraftSubmission).not.toHaveBeenCalled();
  });

  it('attaches an existing same-school file to a student submission', async () => {
    const repository = createRepository();
    const authRepository = createAuthRepository();
    const useCase = new CreateStudentHomeworkSubmissionAttachmentUseCase(
      repository,
      authRepository,
    );

    const response = await withStudentScope(() =>
      useCase.execute(
        {
          homeworkId: 'homework-1',
          studentId: 'student-1',
          enrollmentId: 'enrollment-1',
        },
        { fileId: 'file-1', title: ' Proof ', description: '  Work photo  ' },
      ),
    );

    expect(repository.createSubmissionAttachment).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: 'school-1',
        homeworkSubmissionId: 'submission-1',
        fileId: 'file-1',
        title: 'Proof',
        description: 'Work photo',
        createdByUserId: 'student-user-1',
      }),
    );
    expect(response.attachment).toMatchObject({
      fileId: 'file-1',
      title: 'Proof',
      file: { filename: 'submission.pdf' },
    });
    expect(authRepository.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'homework.submission_attachment.create',
      }),
    );
  });

  it('rejects wrong-school file attachments', async () => {
    const repository = createRepository({
      findAttachmentFile: jest.fn().mockResolvedValue(
        seedFile({
          id: 'file-school-b',
          schoolId: 'school-b',
        }),
      ),
    });
    const useCase = new CreateStudentHomeworkSubmissionAttachmentUseCase(
      repository,
      createAuthRepository(),
    );

    await expect(
      withStudentScope(() =>
        useCase.execute(
          {
            homeworkId: 'homework-1',
            studentId: 'student-1',
            enrollmentId: 'enrollment-1',
          },
          { fileId: 'file-school-b' },
        ),
      ),
    ).rejects.toMatchObject<Partial<DomainException>>({
      code: 'homework.submission_attachment.file_not_found',
    });
    expect(repository.createSubmissionAttachment).not.toHaveBeenCalled();
  });

  it('reorders submission attachments inside the same submission', async () => {
    const repository = createRepository();
    const useCase = new ReorderStudentHomeworkSubmissionAttachmentUseCase(
      repository,
      createAuthRepository(),
    );

    await withStudentScope(() =>
      useCase.execute(
        {
          homeworkId: 'homework-1',
          studentId: 'student-1',
          enrollmentId: 'enrollment-1',
          attachmentId: 'submission-attachment-1',
        },
        { sortOrder: 3 },
      ),
    );

    expect(repository.updateSubmissionAttachment).toHaveBeenCalledWith({
      homeworkAssignmentId: 'homework-1',
      submissionId: 'submission-1',
      attachmentId: 'submission-attachment-1',
      data: { sortOrder: 3 },
    });
  });

  it('keeps student and parent answer presenters safe while teacher sees review context', () => {
    const answer = seedAnswer({
      teacherComment: 'Teacher-only note',
      awardedPoints: { toNumber: () => 1 },
      reviewedAt: new Date('2026-05-26T10:30:00.000Z'),
      homeworkQuestion: seedQuestion({
        options: [seedOption({ isCorrect: true })],
      }),
    });
    const student = presentHomeworkAnswersStudent([answer]);
    const parent = presentHomeworkAnswersParent([answer]);
    const teacher = presentHomeworkAnswersTeacher([answer]);
    const attachment = presentHomeworkSubmissionAttachment({
      ...seedSubmissionAttachment(),
      schoolId: 'school-1',
      organizationId: 'org-1',
      file: {
        originalName: 'submission.pdf',
        mimeType: 'application/pdf',
        sizeBytes: BigInt(2048),
        objectKey: 'raw-storage-key',
      },
    } as any);

    expect(JSON.stringify(student)).not.toContain('isCorrect');
    expect(JSON.stringify(student)).not.toContain('Teacher-only note');
    expect(JSON.stringify(student)).not.toContain('schoolId');
    expect(JSON.stringify(parent)).not.toContain('isCorrect');
    expect(JSON.stringify(parent)).not.toContain('awardedPoints');
    expect(teacher.items[0].selectedOptions[0]).toMatchObject({
      optionId: 'option-1',
      isCorrect: true,
    });
    expect(teacher.items[0]).toMatchObject({
      teacherComment: 'Teacher-only note',
      awardedPoints: 1,
    });
    expect(JSON.stringify(attachment)).not.toContain('raw-storage-key');
    expect(JSON.stringify(attachment)).not.toContain('schoolId');
    expect(JSON.stringify(attachment)).not.toContain('organizationId');
  });

  it('lets teacher-owned submission reads use Homework Core answer presenter', async () => {
    const repository = createRepository();
    const useCase = new ListHomeworkSubmissionAnswersUseCase(repository);

    const response = await withTeacherScope(() =>
      useCase.execute({
        homeworkId: 'homework-1',
        submissionId: 'submission-1',
      }),
    );

    expect(repository.findSubmissionById).toHaveBeenCalledWith({
      homeworkAssignmentId: 'homework-1',
      submissionId: 'submission-1',
    });
    expect(repository.listSubmissionAnswers).toHaveBeenCalledWith({
      homeworkAssignmentId: 'homework-1',
      submissionId: 'submission-1',
    });
    expect(response.items[0]).toMatchObject({
      answerId: 'answer-1',
      homeworkId: 'homework-1',
      submissionId: 'submission-1',
      prompt: expect.objectContaining({ prompt: 'Choose one' }),
    });
    expect(response.items[0].selectedOptions[0]).toHaveProperty('isCorrect');
  });
});

function seedTarget(overrides?: {
  targetStatus?: HomeworkTargetStatus;
  assignmentStatus?: HomeworkAssignmentStatus;
  questions?: any[];
  submissions?: any[];
}): any {
  return {
    id: 'target-1',
    schoolId: 'school-1',
    homeworkAssignmentId: 'homework-1',
    studentId: 'student-1',
    enrollmentId: 'enrollment-1',
    status: overrides?.targetStatus ?? HomeworkTargetStatus.ASSIGNED,
    homeworkAssignment: {
      id: 'homework-1',
      status: overrides?.assignmentStatus ?? HomeworkAssignmentStatus.PUBLISHED,
      mode: HomeworkAssignmentMode.HOMEWORK,
      targetMode: HomeworkTargetMode.CLASSROOM,
      dueAt: new Date('2030-05-26T10:00:00.000Z'),
      deletedAt: null,
      questions: overrides?.questions ?? [seedQuestion()],
    },
    submissions: overrides?.submissions ?? [seedSubmission()],
  };
}

function seedSubmission(overrides?: Record<string, unknown>): any {
  const now = new Date('2026-05-26T10:00:00.000Z');
  return {
    id: 'submission-1',
    schoolId: 'school-1',
    homeworkAssignmentId: 'homework-1',
    homeworkTargetId: 'target-1',
    studentId: 'student-1',
    enrollmentId: 'enrollment-1',
    status: HomeworkSubmissionStatus.DRAFT,
    bodyText: null,
    submittedAt: null,
    reviewedAt: null,
    reviewedByUserId: null,
    reviewNote: null,
    awardedMarks: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    answers: [],
    attachments: [],
    ...overrides,
  };
}

function seedQuestion(overrides?: Record<string, unknown>): any {
  const now = new Date('2026-05-26T10:00:00.000Z');
  return {
    id: 'question-1',
    schoolId: 'school-1',
    homeworkAssignmentId: 'homework-1',
    type: HomeworkQuestionType.SINGLE_CHOICE,
    prompt: 'Choose one',
    instructions: null,
    points: { toNumber: () => 1 },
    sortOrder: 0,
    isRequired: true,
    expectedAnswer: null,
    metadata: null,
    createdByUserId: 'teacher-1',
    updatedByUserId: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    options: [seedOption()],
    ...overrides,
  };
}

function seedOption(overrides?: Record<string, unknown>): any {
  const now = new Date('2026-05-26T10:00:00.000Z');
  return {
    id: 'option-1',
    schoolId: 'school-1',
    homeworkQuestionId: 'question-1',
    text: 'A',
    isCorrect: false,
    sortOrder: 0,
    metadata: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function seedAnswer(overrides?: Record<string, unknown>): any {
  const now = new Date('2026-05-26T10:00:00.000Z');
  const homeworkQuestion =
    (overrides?.homeworkQuestion as any) ?? seedQuestion();
  return {
    id: 'answer-1',
    schoolId: 'school-1',
    homeworkSubmissionId: 'submission-1',
    homeworkAssignmentId: 'homework-1',
    homeworkTargetId: 'target-1',
    homeworkQuestionId: homeworkQuestion.id,
    textAnswer: null,
    selectedOptionIds: ['option-1'],
    isDraft: true,
    teacherComment: null,
    awardedPoints: null,
    reviewedAt: null,
    reviewedByUserId: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    homeworkQuestion,
    ...overrides,
  };
}

function seedFile(overrides?: Record<string, unknown>): any {
  return {
    id: 'file-1',
    schoolId: 'school-1',
    originalName: 'submission.pdf',
    mimeType: 'application/pdf',
    sizeBytes: BigInt(2048),
    uploaderId: 'student-user-1',
    deletedAt: null,
    ...overrides,
  };
}

function seedSubmissionAttachment(overrides?: Record<string, unknown>): any {
  const now = new Date('2026-05-26T10:00:00.000Z');
  return {
    id: 'submission-attachment-1',
    schoolId: 'school-1',
    homeworkSubmissionId: 'submission-1',
    homeworkAssignmentId: 'homework-1',
    homeworkTargetId: 'target-1',
    fileId: 'file-1',
    title: null,
    description: null,
    sortOrder: 0,
    createdByUserId: 'student-user-1',
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    file: seedFile(),
    ...overrides,
  };
}
