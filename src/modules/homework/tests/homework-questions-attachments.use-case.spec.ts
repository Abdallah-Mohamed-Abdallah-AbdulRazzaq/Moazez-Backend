import {
  HomeworkAssignmentMode,
  HomeworkAssignmentStatus,
  HomeworkQuestionType,
  HomeworkTargetMode,
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
import { PublishHomeworkAssignmentUseCase } from '../application/homework-assignments.use-cases';
import {
  CreateHomeworkAttachmentUseCase,
  ReorderHomeworkAttachmentUseCase,
} from '../application/homework-attachments.use-cases';
import {
  CreateHomeworkQuestionOptionUseCase,
  CreateHomeworkQuestionUseCase,
  DeleteHomeworkQuestionOptionUseCase,
  ReorderHomeworkQuestionOptionUseCase,
  ReorderHomeworkQuestionUseCase,
  UpdateHomeworkQuestionUseCase,
  validateHomeworkQuestionsForPublish,
} from '../application/homework-questions.use-cases';
import {
  presentHomeworkQuestionAdmin,
  presentHomeworkQuestionSafe,
} from '../presenters/homework-question.presenter';
import { presentHomeworkAttachment } from '../presenters/homework-attachment.presenter';

describe('Homework questions and attachments use cases', () => {
  async function withScope<T>(testFn: () => Promise<T>): Promise<T> {
    return runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: 'actor-1', userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: 'membership-1',
        organizationId: 'org-1',
        schoolId: 'school-1',
        roleId: 'role-1',
        permissions: ['homework.assignments.manage'],
      });

      return testFn();
    });
  }

  function createRepository(overrides?: Record<string, unknown>): any {
    const repo = {
      findAssignmentById: jest.fn().mockResolvedValue(seedAssignment()),
      listQuestions: jest.fn().mockResolvedValue([]),
      findQuestionById: jest.fn().mockResolvedValue(seedQuestion()),
      getNextQuestionSortOrder: jest.fn().mockResolvedValue(1),
      createQuestionWithOptions: jest
        .fn()
        .mockImplementation(async ({ question, options }) =>
          seedQuestion({
            ...question,
            options: options.map((option: any) =>
              seedOption({
                ...option,
                homeworkQuestionId: question.id,
              }),
            ),
          }),
        ),
      updateQuestion: jest
        .fn()
        .mockImplementation(async ({ data }) => seedQuestion(data)),
      softDeleteQuestion: jest.fn().mockResolvedValue(undefined),
      getNextOptionSortOrder: jest.fn().mockResolvedValue(2),
      findQuestionOptionById: jest.fn().mockResolvedValue(seedOption()),
      createQuestionOption: jest.fn().mockResolvedValue(
        seedQuestion({
          options: [seedOption(), seedOption({ id: 'option-2' })],
        }),
      ),
      updateQuestionOption: jest.fn().mockResolvedValue(
        seedQuestion({
          options: [seedOption({ sortOrder: 5 })],
        }),
      ),
      softDeleteQuestionOption: jest.fn().mockResolvedValue(
        seedQuestion({
          options: [],
        }),
      ),
      findAttachmentFile: jest.fn().mockResolvedValue({
        id: 'file-1',
        schoolId: 'school-1',
        deletedAt: null,
      }),
      getNextAttachmentSortOrder: jest.fn().mockResolvedValue(1),
      createAttachment: jest
        .fn()
        .mockImplementation(async (data) => seedAttachment(data)),
      updateAttachment: jest
        .fn()
        .mockImplementation(async ({ data }) => seedAttachment(data)),
      findAttachmentById: jest.fn().mockResolvedValue(seedAttachment()),
      ...overrides,
    };

    return repo;
  }

  function createPublishRepository(overrides?: Record<string, unknown>): any {
    return {
      ...createRepository(overrides),
      findTeacherAllocationById: jest.fn().mockResolvedValue(seedAllocation()),
      findTimetableEntryById: jest.fn().mockResolvedValue(null),
      findEligibleEnrollments: jest.fn().mockResolvedValue([seedEnrollment()]),
      listCurrentTargetStudentIds: jest.fn().mockResolvedValue([]),
      publishAssignmentWithTargets: jest
        .fn()
        .mockImplementation(async (id, data) =>
          seedAssignment({ id, ...data, status: HomeworkAssignmentStatus.PUBLISHED }),
        ),
      isPublishedTimetableEntry: jest.fn().mockReturnValue(true),
    };
  }

  function createAuthRepository(): any {
    return { createAuditLog: jest.fn().mockResolvedValue(undefined) };
  }

  it('creates a text question', async () => {
    const repository = createRepository();
    const useCase = new CreateHomeworkQuestionUseCase(
      repository,
      createAuthRepository(),
    );

    const response = await withScope(() =>
      useCase.execute('homework-1', {
        type: HomeworkQuestionType.SHORT_TEXT,
        prompt: '  Explain photosynthesis  ',
        points: 2,
      }),
    );

    expect(repository.createQuestionWithOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        question: expect.objectContaining({
          prompt: 'Explain photosynthesis',
          points: expect.anything(),
          createdByUserId: 'actor-1',
        }),
        options: [],
      }),
    );
    expect(response.question.prompt).toBe('Explain photosynthesis');
  });

  it('rejects empty prompt', async () => {
    const useCase = new CreateHomeworkQuestionUseCase(
      createRepository(),
      createAuthRepository(),
    );

    await expect(
      withScope(() =>
        useCase.execute('homework-1', {
          type: HomeworkQuestionType.SHORT_TEXT,
          prompt: '   ',
        }),
      ),
    ).rejects.toMatchObject<Partial<DomainException>>({
      code: 'homework.question.invalid_type_payload',
    });
  });

  it('creates a single-choice question with options', async () => {
    const repository = createRepository();
    const useCase = new CreateHomeworkQuestionUseCase(
      repository,
      createAuthRepository(),
    );

    const response = await withScope(() =>
      useCase.execute('homework-1', {
        type: HomeworkQuestionType.SINGLE_CHOICE,
        prompt: 'Choose one',
        options: [
          { text: 'A', isCorrect: true },
          { text: 'B', isCorrect: false },
        ],
      }),
    );

    expect(response.question.options).toHaveLength(2);
    expect(response.question.options[0].isCorrect).toBe(true);
  });

  it('rejects options on a text question', async () => {
    const useCase = new CreateHomeworkQuestionUseCase(
      createRepository(),
      createAuthRepository(),
    );

    await expect(
      withScope(() =>
        useCase.execute('homework-1', {
          type: HomeworkQuestionType.LONG_TEXT,
          prompt: 'Write a paragraph',
          options: [{ text: 'Not allowed' }],
        }),
      ),
    ).rejects.toMatchObject<Partial<DomainException>>({
      code: 'homework.question.invalid_type_payload',
    });
  });

  it('validates publish rejects malformed choice question', async () => {
    await expect(
      validateHomeworkQuestionsForPublish(
        createRepository({
          listQuestions: jest.fn().mockResolvedValue([
            seedQuestion({
              type: HomeworkQuestionType.SINGLE_CHOICE,
              options: [seedOption({ isCorrect: false })],
            }),
          ]),
        }),
        'homework-1',
      ),
    ).rejects.toMatchObject<Partial<DomainException>>({
      code: 'homework.assignment.invalid_question_structure',
    });
  });

  it('publishes description-only homework when there are no questions', async () => {
    const repository = createPublishRepository();
    const useCase = new PublishHomeworkAssignmentUseCase(
      repository,
      createAuthRepository(),
    );

    const response = await withScope(() => useCase.execute('homework-1'));

    expect(repository.listQuestions).toHaveBeenCalledWith('homework-1');
    expect(response.status).toBe('published');
  });

  it('reorders questions inside the same assignment', async () => {
    const repository = createRepository();
    const useCase = new ReorderHomeworkQuestionUseCase(
      repository,
      createAuthRepository(),
    );

    await withScope(() =>
      useCase.execute('homework-1', 'question-1', { sortOrder: 9 }),
    );

    expect(repository.updateQuestion).toHaveBeenCalledWith(
      expect.objectContaining({
        homeworkId: 'homework-1',
        questionId: 'question-1',
        data: expect.objectContaining({ sortOrder: 9 }),
      }),
    );
  });

  it('creates, reorders, and deletes options', async () => {
    const repository = createRepository();
    await withScope(() =>
      new CreateHomeworkQuestionOptionUseCase(
        repository,
        createAuthRepository(),
      ).execute('homework-1', 'question-1', { text: 'New', isCorrect: true }),
    );
    await withScope(() =>
      new ReorderHomeworkQuestionOptionUseCase(
        repository,
        createAuthRepository(),
      ).execute('homework-1', 'question-1', 'option-1', { sortOrder: 1 }),
    );
    await withScope(() =>
      new DeleteHomeworkQuestionOptionUseCase(
        repository,
        createAuthRepository(),
      ).execute('homework-1', 'question-1', 'option-1'),
    );

    expect(repository.createQuestionOption).toHaveBeenCalled();
    expect(repository.updateQuestionOption).toHaveBeenCalledWith(
      expect.objectContaining({
        homeworkId: 'homework-1',
        questionId: 'question-1',
        optionId: 'option-1',
        data: expect.objectContaining({ sortOrder: 1 }),
      }),
    );
    expect(repository.softDeleteQuestionOption).toHaveBeenCalledWith({
      homeworkId: 'homework-1',
      questionId: 'question-1',
      optionId: 'option-1',
    });
  });

  it('attaches an existing same-school file and rejects wrong-school files', async () => {
    const repository = createRepository();
    const useCase = new CreateHomeworkAttachmentUseCase(
      repository,
      createAuthRepository(),
    );

    const response = await withScope(() =>
      useCase.execute('homework-1', { fileId: 'file-1', title: 'Worksheet' }),
    );
    expect(response.attachment.fileId).toBe('file-1');
    expect(repository.createAttachment).toHaveBeenCalledWith(
      expect.objectContaining({ schoolId: 'school-1', fileId: 'file-1' }),
    );

    const wrongSchool = new CreateHomeworkAttachmentUseCase(
      createRepository({
        findAttachmentFile: jest.fn().mockResolvedValue({
          id: 'file-2',
          schoolId: 'school-2',
          deletedAt: null,
        }),
      }),
      createAuthRepository(),
    );
    await expect(
      withScope(() => wrongSchool.execute('homework-1', { fileId: 'file-2' })),
    ).rejects.toMatchObject<Partial<DomainException>>({
      code: 'homework.attachment.file_not_found',
    });
  });

  it('rejects question and attachment mutation after publish', async () => {
    const repository = createRepository({
      findAssignmentById: jest.fn().mockResolvedValue(
        seedAssignment({
          status: HomeworkAssignmentStatus.PUBLISHED,
        }),
      ),
    });

    await expect(
      withScope(() =>
        new UpdateHomeworkQuestionUseCase(
          repository,
          createAuthRepository(),
        ).execute('homework-1', 'question-1', { prompt: 'Nope' }),
      ),
    ).rejects.toMatchObject<Partial<DomainException>>({
      code: 'homework.question.read_only',
    });

    await expect(
      withScope(() =>
        new ReorderHomeworkAttachmentUseCase(
          repository,
          createAuthRepository(),
        ).execute('homework-1', 'attachment-1', { sortOrder: 2 }),
      ),
    ).rejects.toMatchObject<Partial<DomainException>>({
      code: 'homework.attachment.read_only',
    });
  });

  it('keeps student/parent presenters safe and teacher/admin presenter complete', () => {
    const question = seedQuestion({
      expectedAnswer: 'Secret',
      options: [seedOption({ isCorrect: true })],
    });
    const admin = presentHomeworkQuestionAdmin(question);
    const safe = presentHomeworkQuestionSafe(question);

    expect(admin.expectedAnswer).toBe('Secret');
    expect(admin.options[0].isCorrect).toBe(true);
    expect(JSON.stringify(safe)).not.toContain('expectedAnswer');
    expect(JSON.stringify(safe)).not.toContain('isCorrect');
    expect(JSON.stringify(safe)).not.toContain('schoolId');

    const attachment = presentHomeworkAttachment(seedAttachment());
    expect(JSON.stringify(attachment)).not.toContain('schoolId');
    expect(JSON.stringify(attachment)).not.toContain('organizationId');
    expect(JSON.stringify(attachment)).not.toContain('objectKey');
  });
});

function seedAssignment(overrides?: Record<string, unknown>): any {
  const now = new Date('2026-05-26T10:00:00.000Z');
  return {
    id: 'homework-1',
    schoolId: 'school-1',
    academicYearId: 'year-1',
    termId: 'term-1',
    classroomId: 'classroom-1',
    subjectId: 'subject-1',
    teacherUserId: 'teacher-1',
    teacherSubjectAllocationId: 'allocation-1',
    timetableEntryId: null,
    scheduleDate: null,
    title: 'Homework',
    description: 'Read and answer.',
    mode: HomeworkAssignmentMode.HOMEWORK,
    status: HomeworkAssignmentStatus.DRAFT,
    targetMode: HomeworkTargetMode.CLASSROOM,
    publishAt: null,
    publishedAt: null,
    dueAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    closedAt: null,
    estimatedMinutes: null,
    totalMarks: null,
    isGraded: false,
    gradeAssessmentId: null,
    createdByUserId: 'actor-1',
    publishedByUserId: null,
    cancelledAt: null,
    archivedAt: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    academicYear: { id: 'year-1', nameAr: '2026', nameEn: '2026/2027' },
    term: {
      id: 'term-1',
      nameAr: 'Term 1',
      nameEn: 'Term 1',
      academicYearId: 'year-1',
      startDate: new Date('2026-09-01'),
      endDate: new Date('2026-12-31'),
    },
    classroom: {
      id: 'classroom-1',
      nameAr: 'Class A',
      nameEn: 'Class A',
      section: {
        id: 'section-1',
        nameAr: 'A',
        nameEn: 'A',
        grade: { id: 'grade-1', nameAr: 'Grade 1', nameEn: 'Grade 1' },
      },
    },
    subject: {
      id: 'subject-1',
      nameAr: 'Math',
      nameEn: 'Math',
      code: 'MATH',
      color: '#2563eb',
    },
    teacherUser: { id: 'teacher-1', firstName: 'Mona', lastName: 'Teacher' },
    questions: [],
    attachments: [],
    counters: {
      totalTargets: 1,
      [HomeworkTargetStatus.ASSIGNED]: 1,
      [HomeworkTargetStatus.VIEWED]: 0,
      [HomeworkTargetStatus.SUBMITTED]: 0,
      [HomeworkTargetStatus.LATE]: 0,
      [HomeworkTargetStatus.MISSING]: 0,
      [HomeworkTargetStatus.REVIEWED]: 0,
      [HomeworkTargetStatus.EXCUSED]: 0,
    },
    ...overrides,
  };
}

function seedAllocation(): any {
  return {
    id: 'allocation-1',
    schoolId: 'school-1',
    teacherUserId: 'teacher-1',
    subjectId: 'subject-1',
    classroomId: 'classroom-1',
    termId: 'term-1',
    term: {
      id: 'term-1',
      academicYearId: 'year-1',
      startDate: new Date('2026-09-01'),
      endDate: new Date('2026-12-31'),
    },
    classroom: {
      id: 'classroom-1',
      sectionId: 'section-1',
      section: {
        id: 'section-1',
        gradeId: 'grade-1',
        grade: { id: 'grade-1', stageId: 'stage-1' },
      },
    },
    subject: { id: 'subject-1' },
    teacherUser: { id: 'teacher-1' },
  };
}

function seedEnrollment(): any {
  return {
    id: 'enrollment-1',
    studentId: 'student-1',
    academicYearId: 'year-1',
    termId: 'term-1',
    classroomId: 'classroom-1',
    student: { id: 'student-1', firstName: 'Sara', lastName: 'Learner' },
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
    createdByUserId: 'actor-1',
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

function seedAttachment(overrides?: Record<string, unknown>): any {
  const now = new Date('2026-05-26T10:00:00.000Z');
  return {
    id: 'attachment-1',
    schoolId: 'school-1',
    homeworkAssignmentId: 'homework-1',
    fileId: 'file-1',
    title: null,
    description: null,
    sortOrder: 0,
    createdByUserId: 'actor-1',
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    file: {
      id: 'file-1',
      originalName: 'worksheet.pdf',
      mimeType: 'application/pdf',
      sizeBytes: BigInt(2048),
      deletedAt: null,
    },
    ...overrides,
  };
}
