import {
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
  GetHomeworkSubmissionUseCase,
  SaveHomeworkSubmissionDraftUseCase,
  SubmitHomeworkSubmissionUseCase,
} from '../application/homework-submissions.use-cases';

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
      findStudentTargetForSubmission: jest
        .fn()
        .mockResolvedValue(
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
});

function seedTarget(overrides?: {
  targetStatus?: HomeworkTargetStatus;
  assignmentStatus?: HomeworkAssignmentStatus;
  dueAt?: Date;
  submittedAt?: Date | null;
  submissions?: any[];
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
      dueAt:
        overrides?.dueAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000),
      deletedAt: null,
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
    createdAt: new Date('2026-05-25T08:00:00.000Z'),
    updatedAt: new Date('2026-05-25T08:05:00.000Z'),
    ...overrides,
  };
}
