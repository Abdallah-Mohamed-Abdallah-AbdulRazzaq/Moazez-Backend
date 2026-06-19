import {
  FileVisibility,
  ReinforcementProofType,
  ReinforcementSubmissionStatus,
  ReinforcementTaskStatus,
  StudentEnrollmentStatus,
  StudentStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import { StudentAppRequiredStudentException } from '../../shared/student-app-errors';
import type {
  StudentAppContext,
  StudentAppCurrentStudentWithEnrollment,
} from '../../shared/student-app.types';
import { SubmitReinforcementStageUseCase } from '../../../reinforcement/reviews/application/submit-reinforcement-stage.use-case';
import { GetStudentTaskUseCase } from '../application/get-student-task.use-case';
import { ListStudentTaskSubmissionsUseCase } from '../application/list-student-task-submissions.use-case';
import { ListStudentTasksUseCase } from '../application/list-student-tasks.use-case';
import { SubmitStudentTaskStageUseCase } from '../application/submit-student-task-stage.use-case';
import { StudentTasksReadAdapter } from '../infrastructure/student-tasks-read.adapter';

describe('Student Tasks use-cases', () => {
  it('rejects non-student actors through StudentAppAccessService', async () => {
    const { listUseCase, accessService, readAdapter } = createUseCases();
    accessService.getCurrentStudentWithEnrollment.mockRejectedValue(
      new StudentAppRequiredStudentException({ reason: 'actor_not_student' }),
    );

    await expect(listUseCase.execute()).rejects.toMatchObject({
      code: 'student_app.actor.required_student',
    });
    expect(readAdapter.listTasks).not.toHaveBeenCalled();
  });

  it('lists visible tasks for the current student context only', async () => {
    const { listUseCase, readAdapter } = createUseCasesWithValidAccess();
    readAdapter.listTasks.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 50,
    });
    readAdapter.getSummary.mockResolvedValue(summaryFixture());

    await listUseCase.execute({ status: 'pending' });

    expect(readAdapter.listTasks).toHaveBeenCalledWith({
      context: contextFixture(),
      query: { status: 'pending' },
    });
    expect(readAdapter.getSummary).toHaveBeenCalledWith(contextFixture());
  });

  it('returns safe 404 for inaccessible task detail', async () => {
    const { getUseCase, readAdapter } = createUseCasesWithValidAccess();
    readAdapter.findTask.mockResolvedValue(null);

    await expect(getUseCase.execute('task-1')).rejects.toBeInstanceOf(
      NotFoundDomainException,
    );
  });

  it('returns safe 404 for inaccessible task submissions', async () => {
    const { submissionsUseCase, readAdapter } = createUseCasesWithValidAccess();
    readAdapter.listTaskSubmissions.mockResolvedValue(null);

    await expect(submissionsUseCase.execute('task-1')).rejects.toMatchObject({
      code: 'not_found',
    });
  });

  it('submits the current student task stage through core with resolved assignment id', async () => {
    const { submitUseCase, readAdapter, submitCoreUseCase } =
      createUseCasesWithValidAccess();
    readAdapter.findTask.mockResolvedValue(taskFixture());
    submitCoreUseCase.execute.mockResolvedValue({ id: 'submission-1' } as never);
    readAdapter.findTaskSubmission.mockResolvedValue(
      submissionFixture({ proofText: 'Done' }) as never,
    );

    const result = await submitUseCase.execute({
      taskId: 'task-1',
      stageId: 'stage-1',
      dto: {
        proofText: '  Done  ',
        studentId: 'other-student',
        assignmentId: 'other-assignment',
        status: 'approved',
      } as never,
    });

    expect(submitCoreUseCase.execute).toHaveBeenCalledWith(
      'assignment-1',
      'stage-1',
      {
        proofText: 'Done',
        proofFileId: null,
      },
    );
    expect(readAdapter.findTaskSubmission).toHaveBeenCalledWith({
      context: contextFixture(),
      taskId: 'task-1',
      submissionId: 'submission-1',
    });
    expect(result.submission).toMatchObject({
      submissionId: 'submission-1',
      status: 'submitted',
      proofText: 'Done',
    });
    expect(JSON.stringify(result)).not.toContain('studentId');
    expect(JSON.stringify(result)).not.toContain('assignmentId');
  });

  it('validates student-owned proof files before file-backed submission', async () => {
    const { submitUseCase, readAdapter, submitCoreUseCase } =
      createUseCasesWithValidAccess();
    readAdapter.findTask.mockResolvedValue(
      taskFixture({ proofType: ReinforcementProofType.IMAGE }),
    );
    readAdapter.findOwnedProofFile.mockResolvedValue(proofFileFixture() as never);
    submitCoreUseCase.execute.mockResolvedValue({ id: 'submission-1' } as never);
    readAdapter.findTaskSubmission.mockResolvedValue(
      submissionFixture({ proofFile: proofFileFixture() }) as never,
    );

    await submitUseCase.execute({
      taskId: 'task-1',
      stageId: 'stage-1',
      dto: { proofFileId: 'file-1' },
    });

    expect(readAdapter.findOwnedProofFile).toHaveBeenCalledWith({
      context: contextFixture(),
      proofFileId: 'file-1',
    });
    expect(submitCoreUseCase.execute).toHaveBeenCalledWith(
      'assignment-1',
      'stage-1',
      {
        proofText: null,
        proofFileId: 'file-1',
      },
    );
  });

  it('rejects proof files not owned by the current student', async () => {
    const { submitUseCase, readAdapter, submitCoreUseCase } =
      createUseCasesWithValidAccess();
    readAdapter.findTask.mockResolvedValue(
      taskFixture({ proofType: ReinforcementProofType.IMAGE }),
    );
    readAdapter.findOwnedProofFile.mockResolvedValue(null);

    await expect(
      submitUseCase.execute({
        taskId: 'task-1',
        stageId: 'stage-1',
        dto: { proofFileId: 'file-1' },
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
    expect(submitCoreUseCase.execute).not.toHaveBeenCalled();
  });

  it('rejects inaccessible tasks and invalid stages without calling core', async () => {
    const { submitUseCase, readAdapter, submitCoreUseCase } =
      createUseCasesWithValidAccess();
    readAdapter.findTask.mockResolvedValue(null);

    await expect(
      submitUseCase.execute({
        taskId: 'task-1',
        stageId: 'stage-1',
        dto: { proofText: 'Done' },
      }),
    ).rejects.toMatchObject({ code: 'not_found' });

    readAdapter.findTask.mockResolvedValue(taskFixture({ stages: [] }));
    await expect(
      submitUseCase.execute({
        taskId: 'task-1',
        stageId: 'stage-1',
        dto: { proofText: 'Done' },
      }),
    ).rejects.toMatchObject({ code: 'not_found' });

    expect(submitCoreUseCase.execute).not.toHaveBeenCalled();
  });

  it('requires proofFileId for file-backed stages and does not auto-write XP, behavior, or rewards', async () => {
    const { submitUseCase, readAdapter, submitCoreUseCase } =
      createUseCasesWithValidAccess();
    readAdapter.findTask.mockResolvedValue(
      taskFixture({ proofType: ReinforcementProofType.DOCUMENT }),
    );

    await expect(
      submitUseCase.execute({
        taskId: 'task-1',
        stageId: 'stage-1',
        dto: { proofText: 'Done' },
      }),
    ).rejects.toMatchObject({ code: 'validation.failed' });

    expect(submitCoreUseCase.execute).not.toHaveBeenCalled();
    expect((readAdapter as unknown as Record<string, unknown>).xpLedger).toBeUndefined();
    expect(
      (readAdapter as unknown as Record<string, unknown>).behaviorPointLedger,
    ).toBeUndefined();
    expect(
      (readAdapter as unknown as Record<string, unknown>).rewardRedemption,
    ).toBeUndefined();
  });
});

function createUseCases(): {
  listUseCase: ListStudentTasksUseCase;
  getUseCase: GetStudentTaskUseCase;
  submissionsUseCase: ListStudentTaskSubmissionsUseCase;
  submitUseCase: SubmitStudentTaskStageUseCase;
  accessService: jest.Mocked<StudentAppAccessService>;
  readAdapter: jest.Mocked<StudentTasksReadAdapter>;
  submitCoreUseCase: jest.Mocked<SubmitReinforcementStageUseCase>;
} {
  const accessService = {
    getCurrentStudentWithEnrollment: jest.fn(),
  } as unknown as jest.Mocked<StudentAppAccessService>;
  const readAdapter = {
    listTasks: jest.fn(),
    getSummary: jest.fn(),
    findTask: jest.fn(),
    listTaskSubmissions: jest.fn(),
    findTaskSubmission: jest.fn(),
    findOwnedProofFile: jest.fn(),
  } as unknown as jest.Mocked<StudentTasksReadAdapter>;
  const submitCoreUseCase = {
    execute: jest.fn(),
  } as unknown as jest.Mocked<SubmitReinforcementStageUseCase>;

  return {
    listUseCase: new ListStudentTasksUseCase(accessService, readAdapter),
    getUseCase: new GetStudentTaskUseCase(accessService, readAdapter),
    submissionsUseCase: new ListStudentTaskSubmissionsUseCase(
      accessService,
      readAdapter,
    ),
    submitUseCase: new SubmitStudentTaskStageUseCase(
      accessService,
      readAdapter,
      submitCoreUseCase,
    ),
    accessService,
    readAdapter,
    submitCoreUseCase,
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
    student: {
      id: 'student-1',
      schoolId: 'school-1',
      organizationId: 'org-1',
      userId: 'student-user-1',
      status: StudentStatus.ACTIVE,
      deletedAt: null,
      user: {
        id: 'student-user-1',
        userType: UserType.STUDENT,
        status: UserStatus.ACTIVE,
        deletedAt: null,
      },
    },
    enrollment: {
      id: 'enrollment-1',
      schoolId: 'school-1',
      studentId: 'student-1',
      academicYearId: 'year-1',
      termId: 'term-1',
      classroomId: 'classroom-1',
      status: StudentEnrollmentStatus.ACTIVE,
      deletedAt: null,
    },
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
    permissions: [],
    enrollmentId: 'enrollment-1',
    classroomId: 'classroom-1',
    academicYearId: 'year-1',
    requestedAcademicYearId: 'year-1',
    requestedTermId: 'term-1',
    termId: 'term-1',
  };
}

function summaryFixture() {
  return {
    total: 0,
    pending: 0,
    inProgress: 0,
    underReview: 0,
    completed: 0,
    overdue: 0,
  };
}

function taskFixture(
  overrides?: Partial<{
    status: ReinforcementTaskStatus;
    taskStatus: ReinforcementTaskStatus;
    proofType: ReinforcementProofType;
    stages: Array<Record<string, unknown>>;
  }>,
) {
  return {
    id: 'assignment-1',
    taskId: 'task-1',
    academicYearId: 'year-1',
    termId: 'term-1',
    studentId: 'student-1',
    enrollmentId: 'enrollment-1',
    status: overrides?.status ?? ReinforcementTaskStatus.NOT_COMPLETED,
    progress: 0,
    assignedAt: new Date('2026-01-01T08:00:00.000Z'),
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    task: {
      id: 'task-1',
      titleEn: 'Read chapter',
      titleAr: null,
      descriptionEn: 'Complete the reading',
      descriptionAr: null,
      source: 'TEACHER',
      status: overrides?.taskStatus ?? ReinforcementTaskStatus.NOT_COMPLETED,
      rewardType: null,
      rewardValue: null,
      rewardLabelEn: null,
      rewardLabelAr: null,
      dueDate: null,
      assignedByName: 'Teacher',
      subject: null,
      stages:
        overrides?.stages ??
        [
          {
            id: 'stage-1',
            sortOrder: 1,
            titleEn: 'Proof',
            titleAr: null,
            descriptionEn: null,
            descriptionAr: null,
            proofType: overrides?.proofType ?? ReinforcementProofType.NONE,
            requiresApproval: true,
          },
        ],
    },
    submissions: [],
  } as never;
}

function submissionFixture(
  overrides?: Partial<{
    proofText: string | null;
    proofFile: ReturnType<typeof proofFileFixture> | null;
  }>,
) {
  return {
    id: 'submission-1',
    assignmentId: 'assignment-1',
    taskId: 'task-1',
    stageId: 'stage-1',
    studentId: 'student-1',
    enrollmentId: 'enrollment-1',
    status: ReinforcementSubmissionStatus.SUBMITTED,
    proofText: overrides?.proofText ?? null,
    submittedAt: new Date('2026-01-02T08:00:00.000Z'),
    reviewedAt: null,
    proofFile: overrides?.proofFile ?? null,
  };
}

function proofFileFixture() {
  return {
    id: 'file-1',
    originalName: 'proof.png',
    mimeType: 'image/png',
    sizeBytes: 123n,
    visibility: FileVisibility.PRIVATE,
    createdAt: new Date('2026-01-02T08:00:00.000Z'),
  };
}
