import {
  AuditOutcome,
  FileVisibility,
  Prisma,
  ReinforcementProofType,
  ReinforcementReviewOutcome,
  ReinforcementRewardType,
  ReinforcementSource,
  ReinforcementSubmissionStatus,
  ReinforcementTaskStatus,
  StudentEnrollmentStatus,
  StudentStatus,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../../common/context/request-context';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { ApproveReinforcementSubmissionUseCase } from '../application/approve-reinforcement-submission.use-case';
import { GetReinforcementReviewItemUseCase } from '../application/get-reinforcement-review-item.use-case';
import { ListReinforcementReviewQueueUseCase } from '../application/list-reinforcement-review-queue.use-case';
import { RejectReinforcementSubmissionUseCase } from '../application/reject-reinforcement-submission.use-case';
import { SubmitReinforcementStageUseCase } from '../application/submit-reinforcement-stage.use-case';
import { ReinforcementReviewsRepository } from '../infrastructure/reinforcement-reviews.repository';

const SCHOOL_ID = 'school-1';
const ASSIGNMENT_ID = 'assignment-1';
const TASK_ID = 'task-1';
const STAGE_ID = 'stage-1';
const STUDENT_ID = 'student-1';
const ENROLLMENT_ID = 'enrollment-1';

describe('reinforcement review use cases', () => {
  async function withScope<T>(fn: () => Promise<T>): Promise<T> {
    return runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: 'reviewer-1', userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: 'membership-1',
        organizationId: 'org-1',
        schoolId: SCHOOL_ID,
        roleId: 'role-1',
        permissions: [
          'reinforcement.tasks.manage',
          'reinforcement.reviews.view',
          'reinforcement.reviews.manage',
        ],
      });

      return fn();
    });
  }

  it('submits a valid assignment stage and audits the mutation', async () => {
    const repository = baseRepository();
    const auth = authRepository();
    const useCase = new SubmitReinforcementStageUseCase(repository, auth);

    const result = await withScope(() =>
      useCase.execute(ASSIGNMENT_ID, STAGE_ID, { proofText: 'Done' }),
    );

    expect(repository.createOrResubmitSubmission).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: SCHOOL_ID,
        assignmentStatus: ReinforcementTaskStatus.UNDER_REVIEW,
        proofText: 'Done',
      }),
    );
    expect(result.status).toBe('submitted');
    expect(result.assignment.status).toBe('under_review');
    expect(auth.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'reinforcement.submission.submit',
        resourceType: 'reinforcement_submission',
        outcome: AuditOutcome.SUCCESS,
      }),
    );
  });

  it('requires proofFileId when proof type requires a file', async () => {
    const repository = baseRepository({
      findStageForAssignment: jest.fn().mockResolvedValue(
        stageRecord({ proofType: ReinforcementProofType.IMAGE }),
      ),
      createOrResubmitSubmission: jest.fn(),
    });
    const useCase = new SubmitReinforcementStageUseCase(
      repository,
      authRepository(),
    );

    await expect(
      withScope(() => useCase.execute(ASSIGNMENT_ID, STAGE_ID, {})),
    ).rejects.toMatchObject({ code: 'validation.failed' });
    expect(repository.createOrResubmitSubmission).not.toHaveBeenCalled();
  });

  it('accepts no proof when proof type is none', async () => {
    const repository = baseRepository();
    const useCase = new SubmitReinforcementStageUseCase(
      repository,
      authRepository(),
    );

    await expect(
      withScope(() => useCase.execute(ASSIGNMENT_ID, STAGE_ID, {})),
    ).resolves.toMatchObject({ status: 'submitted' });
  });

  it('rejects cancelled assignment or task submissions', async () => {
    const repository = baseRepository({
      findAssignmentForSubmit: jest
        .fn()
        .mockResolvedValue(
          assignmentRecord({ status: ReinforcementTaskStatus.CANCELLED }),
        ),
    });
    const useCase = new SubmitReinforcementStageUseCase(
      repository,
      authRepository(),
    );

    await expect(
      withScope(() => useCase.execute(ASSIGNMENT_ID, STAGE_ID, {})),
    ).rejects.toMatchObject({ code: 'reinforcement.task.cancelled' });
  });

  it('rejects a stage that does not belong to the task', async () => {
    const repository = baseRepository({
      findStageForAssignment: jest
        .fn()
        .mockResolvedValue(stageRecord({ taskId: 'other-task' })),
      createOrResubmitSubmission: jest.fn(),
    });
    const useCase = new SubmitReinforcementStageUseCase(
      repository,
      authRepository(),
    );

    await expect(
      withScope(() => useCase.execute(ASSIGNMENT_ID, STAGE_ID, {})),
    ).rejects.toMatchObject({ code: 'validation.failed' });
  });

  it('rejects already submitted submissions', async () => {
    const repository = baseRepository({
      findSubmissionByAssignmentStage: jest
        .fn()
        .mockResolvedValue(submissionState(ReinforcementSubmissionStatus.SUBMITTED)),
    });
    const useCase = new SubmitReinforcementStageUseCase(
      repository,
      authRepository(),
    );

    await expect(
      withScope(() => useCase.execute(ASSIGNMENT_ID, STAGE_ID, {})),
    ).rejects.toMatchObject({
      code: 'reinforcement.submission.already_submitted',
    });
  });

  it('resubmits rejected submissions as submitted', async () => {
    const repository = baseRepository({
      findSubmissionByAssignmentStage: jest
        .fn()
        .mockResolvedValue(submissionState(ReinforcementSubmissionStatus.REJECTED)),
    });
    const useCase = new SubmitReinforcementStageUseCase(
      repository,
      authRepository(),
    );

    await withScope(() => useCase.execute(ASSIGNMENT_ID, STAGE_ID, {}));

    expect(repository.createOrResubmitSubmission).toHaveBeenCalledWith(
      expect.objectContaining({ existingSubmissionId: 'submission-1' }),
    );
  });

  it('approves a submitted one-stage assignment and marks it completed', async () => {
    const repository = baseRepository();
    const auth = authRepository();
    const useCase = new ApproveReinforcementSubmissionUseCase(repository, auth);

    const result = await withScope(() =>
      useCase.execute('submission-1', { note: 'Great' }),
    );

    expect(repository.approveSubmissionWithReview).toHaveBeenCalledWith(
      expect.objectContaining({
        assignmentStatus: ReinforcementTaskStatus.COMPLETED,
        assignmentProgress: 100,
        note: 'Great',
      }),
    );
    expect(result.status).toBe('approved');
    expect(result.assignment).toMatchObject({
      status: 'completed',
      progress: 100,
    });
    expect(auth.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'reinforcement.review.approve',
        resourceType: 'reinforcement_review',
      }),
    );
  });

  it('keeps a multi-stage assignment in progress until all stages are approved', async () => {
    const repository = baseRepository({
      listActiveStagesForTask: jest
        .fn()
        .mockResolvedValue([{ id: STAGE_ID }, { id: 'stage-2' }]),
      approveSubmissionWithReview: jest.fn().mockImplementation((input) =>
        Promise.resolve(
          reviewItem({
            status: ReinforcementSubmissionStatus.APPROVED,
            assignmentStatus: input.assignmentStatus,
            assignmentProgress: input.assignmentProgress,
            reviewOutcome: ReinforcementReviewOutcome.APPROVED,
          }),
        ),
      ),
    });
    const useCase = new ApproveReinforcementSubmissionUseCase(
      repository,
      authRepository(),
    );

    const result = await withScope(() => useCase.execute('submission-1', {}));

    expect(result.assignment).toMatchObject({
      status: 'in_progress',
      progress: 50,
    });
  });

  it('rejects without a note or noteAr', async () => {
    const repository = baseRepository();
    const useCase = new RejectReinforcementSubmissionUseCase(
      repository,
      authRepository(),
    );

    await expect(
      withScope(() => useCase.execute('submission-1', {})),
    ).rejects.toMatchObject({ code: 'validation.failed' });
  });

  it('rejects a submitted proof and audits the review', async () => {
    const repository = baseRepository();
    const auth = authRepository();
    const useCase = new RejectReinforcementSubmissionUseCase(repository, auth);

    const result = await withScope(() =>
      useCase.execute('submission-1', { note: 'Try again' }),
    );

    expect(repository.rejectSubmissionWithReview).toHaveBeenCalledWith(
      expect.objectContaining({
        assignmentStatus: ReinforcementTaskStatus.IN_PROGRESS,
        assignmentProgress: 0,
      }),
    );
    expect(result).toMatchObject({
      status: 'rejected',
      assignment: { status: 'in_progress' },
      currentReview: { outcome: 'rejected' },
    });
    expect(auth.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'reinforcement.review.reject',
        resourceType: 'reinforcement_review',
      }),
    );
  });

  it('reads list and detail without auditing', async () => {
    const repository = baseRepository();
    const auth = authRepository();

    await new ListReinforcementReviewQueueUseCase(repository).execute({});
    await new GetReinforcementReviewItemUseCase(repository).execute('submission-1');

    expect(auth.createAuditLog).not.toHaveBeenCalled();
  });

  it('does not expose an XP ledger write path from review use cases', () => {
    const repository = baseRepository() as unknown as Record<string, unknown>;

    expect(repository.createXpLedger).toBeUndefined();
    expect(repository.writeXpLedger).toBeUndefined();
  });

  function baseRepository(overrides?: Partial<Record<string, jest.Mock>>) {
    const repository = {
      findAssignmentForSubmit: jest.fn().mockResolvedValue(assignmentRecord()),
      findStageForAssignment: jest.fn().mockResolvedValue(stageRecord()),
      findProofFile: jest.fn().mockResolvedValue({
        id: 'file-1',
        originalName: 'proof.png',
        mimeType: 'image/png',
        sizeBytes: BigInt(1234),
        visibility: FileVisibility.PRIVATE,
        createdAt: new Date('2026-04-29T08:00:00.000Z'),
      }),
      findSubmissionByAssignmentStage: jest.fn().mockResolvedValue(null),
      createOrResubmitSubmission: jest
        .fn()
        .mockResolvedValue(reviewItem()),
      findSubmissionForReview: jest.fn().mockResolvedValue(reviewItem()),
      listReviewQueue: jest.fn().mockResolvedValue({
        items: [reviewItem()],
        total: 1,
      }),
      listActiveStagesForTask: jest.fn().mockResolvedValue([{ id: STAGE_ID }]),
      listApprovedStageIdsForAssignment: jest.fn().mockResolvedValue([]),
      approveSubmissionWithReview: jest.fn().mockImplementation((input) =>
        Promise.resolve(
          reviewItem({
            status: ReinforcementSubmissionStatus.APPROVED,
            assignmentStatus: input.assignmentStatus,
            assignmentProgress: input.assignmentProgress,
            reviewOutcome: ReinforcementReviewOutcome.APPROVED,
          }),
        ),
      ),
      rejectSubmissionWithReview: jest.fn().mockImplementation((input) =>
        Promise.resolve(
          reviewItem({
            status: ReinforcementSubmissionStatus.REJECTED,
            assignmentStatus: input.assignmentStatus,
            assignmentProgress: input.assignmentProgress,
            reviewOutcome: ReinforcementReviewOutcome.REJECTED,
          }),
        ),
      ),
      ...overrides,
    };

    return repository as unknown as ReinforcementReviewsRepository;
  }

  function authRepository() {
    return {
      createAuditLog: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuthRepository;
  }

  function assignmentRecord(
    overrides?: Partial<{
      status: ReinforcementTaskStatus;
      taskStatus: ReinforcementTaskStatus;
    }>,
  ) {
    return {
      id: ASSIGNMENT_ID,
      schoolId: SCHOOL_ID,
      taskId: TASK_ID,
      academicYearId: 'year-1',
      termId: 'term-1',
      studentId: STUDENT_ID,
      enrollmentId: ENROLLMENT_ID,
      status: overrides?.status ?? ReinforcementTaskStatus.NOT_COMPLETED,
      progress: 0,
      startedAt: null,
      completedAt: null,
      cancelledAt: null,
      task: {
        id: TASK_ID,
        status: overrides?.taskStatus ?? ReinforcementTaskStatus.NOT_COMPLETED,
        deletedAt: null,
      },
      student: {
        id: STUDENT_ID,
        status: StudentStatus.ACTIVE,
        deletedAt: null,
      },
      enrollment: {
        id: ENROLLMENT_ID,
        schoolId: SCHOOL_ID,
        studentId: STUDENT_ID,
        status: StudentEnrollmentStatus.ACTIVE,
      },
    };
  }

  function stageRecord(
    overrides?: Partial<{
      taskId: string;
      proofType: ReinforcementProofType;
    }>,
  ) {
    return {
      id: STAGE_ID,
      taskId: overrides?.taskId ?? TASK_ID,
      sortOrder: 1,
      titleEn: 'Upload proof',
      titleAr: null,
      proofType: overrides?.proofType ?? ReinforcementProofType.NONE,
      requiresApproval: true,
      deletedAt: null,
    };
  }

  function submissionState(status: ReinforcementSubmissionStatus) {
    return {
      id: 'submission-1',
      assignmentId: ASSIGNMENT_ID,
      taskId: TASK_ID,
      stageId: STAGE_ID,
      status,
    };
  }

  function reviewItem(
    overrides?: Partial<{
      status: ReinforcementSubmissionStatus;
      assignmentStatus: ReinforcementTaskStatus;
      assignmentProgress: number;
      reviewOutcome: ReinforcementReviewOutcome;
    }>,
  ) {
    const now = new Date('2026-04-29T08:00:00.000Z');
    const review =
      overrides?.reviewOutcome === undefined
        ? null
        : {
            id: 'review-1',
            submissionId: 'submission-1',
            assignmentId: ASSIGNMENT_ID,
            taskId: TASK_ID,
            stageId: STAGE_ID,
            studentId: STUDENT_ID,
            reviewedById: 'reviewer-1',
            outcome: overrides.reviewOutcome,
            note: 'Reviewed',
            noteAr: null,
            reviewedAt: now,
            metadata: null,
            createdAt: now,
            updatedAt: now,
          };

    return {
      id: 'submission-1',
      schoolId: SCHOOL_ID,
      assignmentId: ASSIGNMENT_ID,
      taskId: TASK_ID,
      stageId: STAGE_ID,
      studentId: STUDENT_ID,
      enrollmentId: ENROLLMENT_ID,
      status: overrides?.status ?? ReinforcementSubmissionStatus.SUBMITTED,
      proofFileId: null,
      proofText: null,
      submittedById: 'reviewer-1',
      submittedAt: now,
      currentReviewId: review?.id ?? null,
      reviewedAt: review ? now : null,
      metadata: null,
      createdAt: now,
      updatedAt: now,
      proofFile: null,
      task: {
        id: TASK_ID,
        academicYearId: 'year-1',
        termId: 'term-1',
        subjectId: null,
        titleEn: 'Read daily',
        titleAr: null,
        source: ReinforcementSource.TEACHER,
        status: ReinforcementTaskStatus.IN_PROGRESS,
        rewardType: ReinforcementRewardType.XP,
        rewardValue: new Prisma.Decimal(10),
        rewardLabelEn: '10 XP',
        rewardLabelAr: null,
        dueDate: null,
        deletedAt: null,
      },
      stage: {
        id: STAGE_ID,
        taskId: TASK_ID,
        sortOrder: 1,
        titleEn: 'Upload proof',
        titleAr: null,
        descriptionEn: null,
        descriptionAr: null,
        proofType: ReinforcementProofType.NONE,
        requiresApproval: true,
        deletedAt: null,
      },
      assignment: {
        id: ASSIGNMENT_ID,
        taskId: TASK_ID,
        academicYearId: 'year-1',
        termId: 'term-1',
        studentId: STUDENT_ID,
        enrollmentId: ENROLLMENT_ID,
        status: overrides?.assignmentStatus ?? ReinforcementTaskStatus.UNDER_REVIEW,
        progress: overrides?.assignmentProgress ?? 0,
        assignedAt: now,
        startedAt: now,
        completedAt:
          overrides?.assignmentStatus === ReinforcementTaskStatus.COMPLETED
            ? now
            : null,
        cancelledAt: null,
        createdAt: now,
        updatedAt: now,
        task: {
          id: TASK_ID,
          status: ReinforcementTaskStatus.IN_PROGRESS,
          deletedAt: null,
        },
      },
      student: {
        id: STUDENT_ID,
        firstName: 'Student',
        lastName: 'One',
        status: StudentStatus.ACTIVE,
      },
      enrollment: {
        id: ENROLLMENT_ID,
        academicYearId: 'year-1',
        termId: 'term-1',
        classroomId: 'classroom-1',
        status: StudentEnrollmentStatus.ACTIVE,
        classroom: {
          id: 'classroom-1',
          nameAr: 'Classroom AR',
          nameEn: 'Classroom 1',
          sectionId: 'section-1',
          section: {
            id: 'section-1',
            nameAr: 'Section AR',
            nameEn: 'Section 1',
            gradeId: 'grade-1',
            grade: {
              id: 'grade-1',
              nameAr: 'Grade AR',
              nameEn: 'Grade 1',
              stageId: 'academic-stage-1',
              stage: {
                id: 'academic-stage-1',
                nameAr: 'Stage AR',
                nameEn: 'Stage 1',
              },
            },
          },
        },
      },
      currentReview: review,
      reviews: review ? [review] : [],
    } as never;
  }
});
