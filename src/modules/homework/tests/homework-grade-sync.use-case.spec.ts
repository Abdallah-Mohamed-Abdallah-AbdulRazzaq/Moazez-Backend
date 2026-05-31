import {
  GradeAssessmentType,
  GradeItemStatus,
  HomeworkAssignmentStatus,
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
  GetHomeworkGradeSyncStatusUseCase,
  LinkHomeworkGradeAssessmentUseCase,
  SyncHomeworkAssignmentToGradesUseCase,
  SyncHomeworkSubmissionToGradesUseCase,
} from '../application/homework-grade-sync.use-cases';

const SCHOOL_ID = 'school-1';
const HOMEWORK_ID = 'homework-1';
const ASSESSMENT_ID = 'assessment-1';
const STUDENT_ID = 'student-1';
const ENROLLMENT_ID = 'enrollment-1';

describe('Homework grade sync use cases', () => {
  async function withSchoolScope<T>(testFn: () => Promise<T>): Promise<T> {
    return runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: 'teacher-user-1', userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: 'membership-1',
        organizationId: 'org-1',
        schoolId: SCHOOL_ID,
        roleId: 'role-1',
        permissions: [],
      });

      return testFn();
    });
  }

  function createRepository(overrides?: Record<string, unknown>): any {
    const assignment = seedAssignment();
    const submission = seedReviewedSubmission();

    return {
      findAssignmentById: jest.fn().mockResolvedValue(assignment),
      updateAssignmentGradeAssessmentLink: jest
        .fn()
        .mockResolvedValue(
          seedAssignment({ gradeAssessmentId: ASSESSMENT_ID }),
        ),
      findReviewableSubmission: jest.fn().mockResolvedValue(submission),
      listReviewedSubmissionsForGradeSync: jest
        .fn()
        .mockResolvedValue([submission]),
      findAssignmentByGradeAssessmentId: jest.fn().mockResolvedValue(null),
      ...overrides,
    };
  }

  function createGradesUseCases(overrides?: Record<string, unknown>): any {
    return {
      getGradeAssessment: {
        execute: jest.fn().mockResolvedValue(seedGradeAssessment()),
      },
      listGradeItems: {
        execute: jest.fn().mockResolvedValue({ items: [] }),
      },
      upsertGradeItem: {
        execute: jest.fn().mockResolvedValue(seedGradeItem({ score: 8 })),
      },
      bulkUpsertGradeItems: {
        execute: jest.fn().mockResolvedValue({
          assessmentId: ASSESSMENT_ID,
          updatedCount: 1,
          items: [seedGradeItem({ score: 8 })],
        }),
      },
      ...overrides,
    };
  }

  function createAuthRepository(): any {
    return { createAuditLog: jest.fn().mockResolvedValue(undefined) };
  }

  it('links homework to a compatible assignment grade assessment', async () => {
    const repository = createRepository();
    const grades = createGradesUseCases();
    const auth = createAuthRepository();
    const useCase = new LinkHomeworkGradeAssessmentUseCase(
      repository,
      grades.getGradeAssessment,
      grades.listGradeItems,
      auth,
    );

    const response = await withSchoolScope(() =>
      useCase.execute(HOMEWORK_ID, { gradeAssessmentId: ASSESSMENT_ID }),
    );

    expect(repository.updateAssignmentGradeAssessmentLink).toHaveBeenCalledWith(
      HOMEWORK_ID,
      ASSESSMENT_ID,
    );
    expect(response).toMatchObject({
      homeworkId: HOMEWORK_ID,
      linked: true,
      gradeAssessment: {
        gradeAssessmentId: ASSESSMENT_ID,
        type: GradeAssessmentType.ASSIGNMENT,
        maxMarks: 10,
      },
    });
    expect(auth.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'homework.grade_sync.link' }),
    );
  });

  it('rejects incompatible grade assessment scope', async () => {
    const repository = createRepository();
    const grades = createGradesUseCases({
      getGradeAssessment: {
        execute: jest.fn().mockResolvedValue(
          seedGradeAssessment({
            scopeType: 'classroom',
            scopeKey: 'other-classroom',
            classroomId: 'other-classroom',
          }),
        ),
      },
    });
    const useCase = new LinkHomeworkGradeAssessmentUseCase(
      repository,
      grades.getGradeAssessment,
      grades.listGradeItems,
      createAuthRepository(),
    );

    await expect(
      withSchoolScope(() =>
        useCase.execute(HOMEWORK_ID, { gradeAssessmentId: ASSESSMENT_ID }),
      ),
    ).rejects.toMatchObject<Partial<DomainException>>({
      code: 'homework.grade_sync.incompatible_scope',
    });
    expect(
      repository.updateAssignmentGradeAssessmentLink,
    ).not.toHaveBeenCalled();
  });

  it('rejects locked or non-assignment grade assessments', async () => {
    const repository = createRepository();
    const lockedGrades = createGradesUseCases({
      getGradeAssessment: {
        execute: jest
          .fn()
          .mockResolvedValue(seedGradeAssessment({ isLocked: true })),
      },
    });
    const lockedUseCase = new LinkHomeworkGradeAssessmentUseCase(
      repository,
      lockedGrades.getGradeAssessment,
      lockedGrades.listGradeItems,
      createAuthRepository(),
    );

    await expect(
      withSchoolScope(() =>
        lockedUseCase.execute(HOMEWORK_ID, {
          gradeAssessmentId: ASSESSMENT_ID,
        }),
      ),
    ).rejects.toMatchObject<Partial<DomainException>>({
      code: 'homework.grade_sync.assessment_locked',
    });

    const quizGrades = createGradesUseCases({
      getGradeAssessment: {
        execute: jest
          .fn()
          .mockResolvedValue(seedGradeAssessment({ type: 'QUIZ' })),
      },
    });
    const quizUseCase = new LinkHomeworkGradeAssessmentUseCase(
      repository,
      quizGrades.getGradeAssessment,
      quizGrades.listGradeItems,
      createAuthRepository(),
    );

    await expect(
      withSchoolScope(() =>
        quizUseCase.execute(HOMEWORK_ID, {
          gradeAssessmentId: ASSESSMENT_ID,
        }),
      ),
    ).rejects.toMatchObject<Partial<DomainException>>({
      code: 'homework.grade_sync.invalid_assessment',
    });
  });

  it('rejects linking a grade assessment already owned by another homework', async () => {
    const repository = createRepository({
      findAssignmentByGradeAssessmentId: jest
        .fn()
        .mockResolvedValue(seedAssignment({ id: 'other-homework' })),
    });
    const grades = createGradesUseCases();
    const useCase = new LinkHomeworkGradeAssessmentUseCase(
      repository,
      grades.getGradeAssessment,
      grades.listGradeItems,
      createAuthRepository(),
    );

    await expect(
      withSchoolScope(() =>
        useCase.execute(HOMEWORK_ID, { gradeAssessmentId: ASSESSMENT_ID }),
      ),
    ).rejects.toMatchObject<Partial<DomainException>>({
      code: 'homework.grade_sync.duplicate_link',
    });
    expect(
      repository.updateAssignmentGradeAssessmentLink,
    ).not.toHaveBeenCalled();
  });

  it('syncs a reviewed submission to a Grades item', async () => {
    const repository = createRepository({
      findAssignmentById: jest
        .fn()
        .mockResolvedValue(
          seedAssignment({ gradeAssessmentId: ASSESSMENT_ID }),
        ),
    });
    const grades = createGradesUseCases();
    const auth = createAuthRepository();
    const useCase = new SyncHomeworkSubmissionToGradesUseCase(
      repository,
      grades.getGradeAssessment,
      grades.listGradeItems,
      grades.upsertGradeItem,
      auth,
    );

    const response = await withSchoolScope(() =>
      useCase.execute({
        homeworkId: HOMEWORK_ID,
        submissionId: 'submission-1',
      }),
    );

    expect(grades.upsertGradeItem.execute).toHaveBeenCalledWith(
      ASSESSMENT_ID,
      STUDENT_ID,
      {
        status: GradeItemStatus.ENTERED,
        score: 8,
        comment: 'Well done',
      },
    );
    expect(response.submissionSync).toMatchObject({
      submissionId: 'submission-1',
      score: 8,
      synced: true,
      idempotent: false,
    });
    expect(auth.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'homework.grade_sync.submission_sync',
        resourceType: 'homework_submission',
      }),
    );
  });

  it('reports repeated single sync as idempotent when the Grades item already matches', async () => {
    const repository = createRepository({
      findAssignmentById: jest
        .fn()
        .mockResolvedValue(
          seedAssignment({ gradeAssessmentId: ASSESSMENT_ID }),
        ),
    });
    const grades = createGradesUseCases({
      listGradeItems: {
        execute: jest
          .fn()
          .mockResolvedValue({ items: [seedGradeItem({ score: 8 })] }),
      },
    });
    const useCase = new SyncHomeworkSubmissionToGradesUseCase(
      repository,
      grades.getGradeAssessment,
      grades.listGradeItems,
      grades.upsertGradeItem,
      createAuthRepository(),
    );

    const response = await withSchoolScope(() =>
      useCase.execute({
        homeworkId: HOMEWORK_ID,
        submissionId: 'submission-1',
      }),
    );

    expect(response.submissionSync?.idempotent).toBe(true);
    expect(grades.upsertGradeItem.execute).toHaveBeenCalledTimes(1);
  });

  it('bulk syncs reviewed submissions through the Grades bulk upsert path', async () => {
    const repository = createRepository({
      findAssignmentById: jest
        .fn()
        .mockResolvedValue(
          seedAssignment({ gradeAssessmentId: ASSESSMENT_ID }),
        ),
    });
    const grades = createGradesUseCases();
    const useCase = new SyncHomeworkAssignmentToGradesUseCase(
      repository,
      grades.getGradeAssessment,
      grades.listGradeItems,
      grades.bulkUpsertGradeItems,
      createAuthRepository(),
    );

    const response = await withSchoolScope(() => useCase.execute(HOMEWORK_ID));

    expect(grades.bulkUpsertGradeItems.execute).toHaveBeenCalledWith(
      ASSESSMENT_ID,
      {
        items: [
          {
            studentId: STUDENT_ID,
            status: GradeItemStatus.ENTERED,
            score: 8,
            comment: 'Well done',
          },
        ],
      },
    );
    expect(response.syncSummary).toMatchObject({
      totalReviewedSubmissions: 1,
      failedSyncSubmissions: 0,
    });
  });

  it('rejects unreviewed submissions', async () => {
    const repository = createRepository({
      findAssignmentById: jest
        .fn()
        .mockResolvedValue(
          seedAssignment({ gradeAssessmentId: ASSESSMENT_ID }),
        ),
      findReviewableSubmission: jest.fn().mockResolvedValue(
        seedReviewedSubmission({
          status: HomeworkSubmissionStatus.SUBMITTED,
          homeworkTarget: seedTarget({
            status: HomeworkTargetStatus.SUBMITTED,
          }),
        }),
      ),
    });
    const grades = createGradesUseCases();
    const useCase = new SyncHomeworkSubmissionToGradesUseCase(
      repository,
      grades.getGradeAssessment,
      grades.listGradeItems,
      grades.upsertGradeItem,
      createAuthRepository(),
    );

    await expect(
      withSchoolScope(() =>
        useCase.execute({
          homeworkId: HOMEWORK_ID,
          submissionId: 'submission-1',
        }),
      ),
    ).rejects.toMatchObject<Partial<DomainException>>({
      code: 'homework.grade_sync.submission_not_reviewed',
    });
    expect(grades.upsertGradeItem.execute).not.toHaveBeenCalled();
  });

  it('rejects missing score and scores above homework or assessment marks', async () => {
    const grades = createGradesUseCases();
    const baseAssignment = seedAssignment({ gradeAssessmentId: ASSESSMENT_ID });

    const missingScoreUseCase = new SyncHomeworkSubmissionToGradesUseCase(
      createRepository({
        findAssignmentById: jest.fn().mockResolvedValue(baseAssignment),
        findReviewableSubmission: jest
          .fn()
          .mockResolvedValue(seedReviewedSubmission({ awardedMarks: null })),
      }),
      grades.getGradeAssessment,
      grades.listGradeItems,
      grades.upsertGradeItem,
      createAuthRepository(),
    );

    await expect(
      withSchoolScope(() =>
        missingScoreUseCase.execute({
          homeworkId: HOMEWORK_ID,
          submissionId: 'submission-1',
        }),
      ),
    ).rejects.toMatchObject<Partial<DomainException>>({
      code: 'homework.grade_sync.missing_score',
    });

    const aboveHomeworkUseCase = new SyncHomeworkSubmissionToGradesUseCase(
      createRepository({
        findAssignmentById: jest.fn().mockResolvedValue(
          seedAssignment({
            gradeAssessmentId: ASSESSMENT_ID,
            totalMarks: { toNumber: () => 5 },
          }),
        ),
        findReviewableSubmission: jest
          .fn()
          .mockResolvedValue(seedReviewedSubmission({ awardedMarks: 8 })),
      }),
      grades.getGradeAssessment,
      grades.listGradeItems,
      grades.upsertGradeItem,
      createAuthRepository(),
    );

    await expect(
      withSchoolScope(() =>
        aboveHomeworkUseCase.execute({
          homeworkId: HOMEWORK_ID,
          submissionId: 'submission-1',
        }),
      ),
    ).rejects.toMatchObject<Partial<DomainException>>({
      code: 'homework.grade_sync.score_exceeds_homework_marks',
    });

    const aboveAssessmentGrades = createGradesUseCases({
      getGradeAssessment: {
        execute: jest
          .fn()
          .mockResolvedValue(seedGradeAssessment({ maxScore: 6 })),
      },
    });
    const aboveAssessmentUseCase = new SyncHomeworkSubmissionToGradesUseCase(
      createRepository({
        findAssignmentById: jest.fn().mockResolvedValue(baseAssignment),
        findReviewableSubmission: jest
          .fn()
          .mockResolvedValue(seedReviewedSubmission({ awardedMarks: 8 })),
      }),
      aboveAssessmentGrades.getGradeAssessment,
      aboveAssessmentGrades.listGradeItems,
      aboveAssessmentGrades.upsertGradeItem,
      createAuthRepository(),
    );

    await expect(
      withSchoolScope(() =>
        aboveAssessmentUseCase.execute({
          homeworkId: HOMEWORK_ID,
          submissionId: 'submission-1',
        }),
      ),
    ).rejects.toMatchObject<Partial<DomainException>>({
      code: 'homework.grade_sync.score_exceeds_assessment_marks',
    });
  });

  it('keeps linked reviewed homework pending until explicit manual sync', async () => {
    const repository = createRepository({
      findAssignmentById: jest
        .fn()
        .mockResolvedValue(
          seedAssignment({ gradeAssessmentId: ASSESSMENT_ID }),
        ),
    });
    const grades = createGradesUseCases();
    const useCase = new GetHomeworkGradeSyncStatusUseCase(
      repository,
      grades.getGradeAssessment,
      grades.listGradeItems,
    );

    const response = await withSchoolScope(() => useCase.execute(HOMEWORK_ID));

    expect(response.syncSummary).toMatchObject({
      totalReviewedSubmissions: 1,
      syncedSubmissions: 0,
      pendingSyncSubmissions: 1,
    });
    expect(grades.upsertGradeItem.execute).not.toHaveBeenCalled();
    expect(grades.bulkUpsertGradeItems.execute).not.toHaveBeenCalled();
  });

  it('syncs text-only reviewed homework when it is linked and scored', async () => {
    const repository = createRepository({
      findAssignmentById: jest
        .fn()
        .mockResolvedValue(
          seedAssignment({ gradeAssessmentId: ASSESSMENT_ID, questions: [] }),
        ),
      findReviewableSubmission: jest.fn().mockResolvedValue(
        seedReviewedSubmission({
          homeworkAssignment: { questions: [] },
          awardedMarks: 7,
        }),
      ),
    });
    const grades = createGradesUseCases({
      upsertGradeItem: {
        execute: jest.fn().mockResolvedValue(seedGradeItem({ score: 7 })),
      },
    });
    const useCase = new SyncHomeworkSubmissionToGradesUseCase(
      repository,
      grades.getGradeAssessment,
      grades.listGradeItems,
      grades.upsertGradeItem,
      createAuthRepository(),
    );

    await withSchoolScope(() =>
      useCase.execute({
        homeworkId: HOMEWORK_ID,
        submissionId: 'submission-1',
      }),
    );

    expect(grades.upsertGradeItem.execute).toHaveBeenCalledWith(
      ASSESSMENT_ID,
      STUDENT_ID,
      expect.objectContaining({ score: 7 }),
    );
  });
});

function seedAssignment(overrides?: Record<string, unknown>): any {
  return {
    id: HOMEWORK_ID,
    schoolId: SCHOOL_ID,
    academicYearId: 'year-1',
    termId: 'term-1',
    classroomId: 'classroom-1',
    subjectId: 'subject-1',
    teacherUserId: 'teacher-user-1',
    teacherSubjectAllocationId: 'allocation-1',
    status: HomeworkAssignmentStatus.PUBLISHED,
    totalMarks: { toNumber: () => 10 },
    isGraded: true,
    gradeAssessmentId: null,
    deletedAt: null,
    classroom: {
      id: 'classroom-1',
      section: {
        id: 'section-1',
        grade: {
          id: 'grade-1',
          stageId: 'stage-1',
        },
      },
    },
    counters: {
      totalTargets: 1,
      [HomeworkTargetStatus.ASSIGNED]: 0,
      [HomeworkTargetStatus.VIEWED]: 0,
      [HomeworkTargetStatus.SUBMITTED]: 0,
      [HomeworkTargetStatus.LATE]: 0,
      [HomeworkTargetStatus.MISSING]: 0,
      [HomeworkTargetStatus.REVIEWED]: 1,
      [HomeworkTargetStatus.EXCUSED]: 0,
    },
    ...overrides,
  };
}

function seedGradeAssessment(overrides?: Record<string, unknown>): any {
  return {
    id: ASSESSMENT_ID,
    academicYearId: 'year-1',
    yearId: 'year-1',
    termId: 'term-1',
    subjectId: 'subject-1',
    scopeType: 'classroom',
    scopeKey: 'classroom-1',
    scopeId: 'classroom-1',
    stageId: null,
    gradeId: null,
    sectionId: null,
    classroomId: 'classroom-1',
    title: 'Homework Grade Column',
    titleEn: 'Homework Grade Column',
    titleAr: null,
    type: GradeAssessmentType.ASSIGNMENT,
    deliveryMode: 'SCORE_ONLY',
    date: '2026-09-10',
    weight: 10,
    maxScore: 10,
    expectedTimeMinutes: null,
    approvalStatus: 'published',
    isLocked: false,
    publishedAt: '2026-09-10T08:00:00.000Z',
    publishedById: 'teacher-user-1',
    approvedAt: null,
    approvedById: null,
    lockedAt: null,
    lockedById: null,
    createdById: 'teacher-user-1',
    createdAt: '2026-09-10T08:00:00.000Z',
    updatedAt: '2026-09-10T08:00:00.000Z',
    subject: null,
    ...overrides,
  };
}

function seedReviewedSubmission(overrides?: Record<string, unknown>): any {
  return {
    id: 'submission-1',
    schoolId: SCHOOL_ID,
    homeworkAssignmentId: HOMEWORK_ID,
    homeworkTargetId: 'target-1',
    studentId: STUDENT_ID,
    enrollmentId: ENROLLMENT_ID,
    status: HomeworkSubmissionStatus.REVIEWED,
    bodyText: 'Submitted',
    submittedAt: new Date('2026-09-10T09:00:00.000Z'),
    reviewedAt: new Date('2026-09-10T10:00:00.000Z'),
    reviewedByUserId: 'teacher-user-1',
    reviewNote: 'Well done',
    awardedMarks: { toNumber: () => 8 },
    createdAt: new Date('2026-09-10T08:00:00.000Z'),
    updatedAt: new Date('2026-09-10T10:00:00.000Z'),
    answers: [],
    attachments: [],
    student: {
      id: STUDENT_ID,
      firstName: 'Learner',
      lastName: 'One',
    },
    homeworkAssignment: {
      totalMarks: { toNumber: () => 10 },
      questions: [],
    },
    homeworkTarget: seedTarget(),
    ...overrides,
  };
}

function seedTarget(overrides?: Record<string, unknown>): any {
  return {
    id: 'target-1',
    status: HomeworkTargetStatus.REVIEWED,
    submittedAt: new Date('2026-09-10T09:00:00.000Z'),
    reviewedAt: new Date('2026-09-10T10:00:00.000Z'),
    ...overrides,
  };
}

function seedGradeItem(overrides?: Record<string, unknown>): any {
  return {
    id: 'grade-item-1',
    assessmentId: ASSESSMENT_ID,
    studentId: STUDENT_ID,
    enrollmentId: ENROLLMENT_ID,
    student: null,
    score: 8,
    status: GradeItemStatus.ENTERED.toLowerCase(),
    comment: 'Well done',
    enteredById: 'teacher-user-1',
    enteredAt: '2026-09-10T10:15:00.000Z',
    createdAt: '2026-09-10T10:15:00.000Z',
    updatedAt: '2026-09-10T10:15:00.000Z',
    isVirtualMissing: false,
    ...overrides,
  };
}
