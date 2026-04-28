import {
  AuditOutcome,
  Prisma,
  ReinforcementProofType,
  ReinforcementRewardType,
  ReinforcementSource,
  ReinforcementTargetScope,
  ReinforcementTaskStatus,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../../common/context/request-context';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { CancelReinforcementTaskUseCase } from '../application/cancel-reinforcement-task.use-case';
import { CreateReinforcementTaskUseCase } from '../application/create-reinforcement-task.use-case';
import { DuplicateReinforcementTaskUseCase } from '../application/duplicate-reinforcement-task.use-case';
import { ListReinforcementTasksUseCase } from '../application/list-reinforcement-tasks.use-case';
import { ReinforcementTasksRepository } from '../infrastructure/reinforcement-tasks.repository';

const SCHOOL_ID = 'school-1';
const YEAR_ID = 'year-1';
const TERM_ID = 'term-1';
const CLASSROOM_ID = 'classroom-1';
const STUDENT_ID = 'student-1';

describe('Reinforcement task use cases', () => {
  async function withScope<T>(fn: () => Promise<T>): Promise<T> {
    return runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: 'user-1', userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: 'membership-1',
        organizationId: 'org-1',
        schoolId: SCHOOL_ID,
        roleId: 'role-1',
        permissions: [
          'reinforcement.tasks.view',
          'reinforcement.tasks.manage',
        ],
      });

      return fn();
    });
  }

  it('creates a task with a student target and materializes one assignment', async () => {
    const repository = baseRepository();
    const auth = authRepository();
    const useCase = new CreateReinforcementTaskUseCase(repository, auth);

    const result = await withScope(() =>
      useCase.execute({
        yearId: YEAR_ID,
        termId: TERM_ID,
        titleEn: 'Read daily',
        targets: [{ scopeType: 'student', scopeId: STUDENT_ID }],
      }),
    );

    expect(repository.createTaskWithTargetsStagesAssignments).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: SCHOOL_ID,
        targets: [
          expect.objectContaining({
            scopeType: ReinforcementTargetScope.STUDENT,
            studentId: STUDENT_ID,
          }),
        ],
        assignments: [{ studentId: STUDENT_ID, enrollmentId: 'enrollment-1' }],
      }),
    );
    expect(result.assignmentSummary.total).toBe(1);
    expect(auth.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'reinforcement.task.create',
        resourceType: 'reinforcement_task',
        outcome: AuditOutcome.SUCCESS,
        after: expect.objectContaining({ assignmentCount: 1 }),
      }),
    );
  });

  it('creates a classroom task and materializes active enrolled students', async () => {
    const repository = baseRepository({
      findTargetResource: jest.fn().mockResolvedValue({
        scopeType: ReinforcementTargetScope.CLASSROOM,
        scopeKey: CLASSROOM_ID,
        stageId: 'stage-1',
        gradeId: 'grade-1',
        sectionId: 'section-1',
        classroomId: CLASSROOM_ID,
        studentId: null,
      }),
      resolveEnrollmentsForTargets: jest
        .fn()
        .mockResolvedValue([
          enrollment('enrollment-1', 'student-1'),
          enrollment('enrollment-2', 'student-2'),
        ]),
    });
    const useCase = new CreateReinforcementTaskUseCase(
      repository,
      authRepository(),
    );

    await withScope(() =>
      useCase.execute({
        yearId: YEAR_ID,
        termId: TERM_ID,
        titleEn: 'Class reading',
        targets: [{ scopeType: 'classroom', scopeId: CLASSROOM_ID }],
      }),
    );

    expect(repository.createTaskWithTargetsStagesAssignments).toHaveBeenCalledWith(
      expect.objectContaining({
        assignments: [
          { studentId: 'student-1', enrollmentId: 'enrollment-1' },
          { studentId: 'student-2', enrollmentId: 'enrollment-2' },
        ],
      }),
    );
  });

  it('dedupes overlapping target enrollment results by student', async () => {
    const repository = baseRepository({
      resolveEnrollmentsForTargets: jest
        .fn()
        .mockResolvedValue([
          enrollment('enrollment-1', 'student-1'),
          enrollment('enrollment-1', 'student-1'),
        ]),
    });
    const useCase = new CreateReinforcementTaskUseCase(
      repository,
      authRepository(),
    );

    await withScope(() =>
      useCase.execute({
        yearId: YEAR_ID,
        termId: TERM_ID,
        titleEn: 'Overlap',
        targets: [{ scopeType: 'student', scopeId: STUDENT_ID }],
      }),
    );

    expect(repository.createTaskWithTargetsStagesAssignments).toHaveBeenCalledWith(
      expect.objectContaining({
        assignments: [{ studentId: 'student-1', enrollmentId: 'enrollment-1' }],
      }),
    );
  });

  it('rejects invalid cross-school targets through repository ownership behavior', async () => {
    const repository = baseRepository({
      findTargetResource: jest.fn().mockResolvedValue(null),
      createTaskWithTargetsStagesAssignments: jest.fn(),
    });
    const useCase = new CreateReinforcementTaskUseCase(
      repository,
      authRepository(),
    );

    await expect(
      withScope(() =>
        useCase.execute({
          yearId: YEAR_ID,
          termId: TERM_ID,
          titleEn: 'Bad target',
          targets: [{ scopeType: 'student', scopeId: 'school-b-student' }],
        }),
      ),
    ).rejects.toBeInstanceOf(NotFoundDomainException);
    expect(repository.createTaskWithTargetsStagesAssignments).not.toHaveBeenCalled();
  });

  it('lists tasks excluding cancelled rows by default', async () => {
    const repository = baseRepository({
      listTasks: jest.fn().mockResolvedValue({
        items: [taskRecord({ id: 'task-active' })],
        total: 1,
      }),
    });
    const useCase = new ListReinforcementTasksUseCase(repository);

    const result = await withScope(() => useCase.execute({ yearId: YEAR_ID }));

    expect(repository.listTasks).toHaveBeenCalledWith(
      expect.objectContaining({ includeCancelled: false }),
    );
    expect(result.items.map((task) => task.id)).toEqual(['task-active']);
  });

  it('duplicates a task as not completed and re-materializes assignments', async () => {
    const source = taskRecord({
      id: 'source-task',
      status: ReinforcementTaskStatus.CANCELLED,
      assignments: [assignment('old-assignment', 'old-student')],
    });
    const repository = baseRepository({
      findTaskById: jest.fn().mockResolvedValue(source),
      resolveEnrollmentsForTargets: jest
        .fn()
        .mockResolvedValue([enrollment('new-enrollment', 'new-student')]),
      duplicateTaskWithTargetsStagesAssignments: jest
        .fn()
        .mockImplementation((input) =>
          Promise.resolve(
            taskRecord({
              id: 'duplicated-task',
              status: input.task.status,
              assignments: input.assignments.map(
                (item: { enrollmentId: string; studentId: string }) =>
                  assignment(item.enrollmentId, item.studentId),
              ),
            }),
          ),
        ),
    });
    const auth = authRepository();
    const useCase = new DuplicateReinforcementTaskUseCase(repository, auth);

    const result = await withScope(() => useCase.execute('source-task', {}));

    expect(repository.duplicateTaskWithTargetsStagesAssignments).toHaveBeenCalledWith(
      expect.objectContaining({
        task: expect.objectContaining({
          status: ReinforcementTaskStatus.NOT_COMPLETED,
        }),
        assignments: [{ studentId: 'new-student', enrollmentId: 'new-enrollment' }],
      }),
    );
    expect(result).toMatchObject({
      id: 'duplicated-task',
      status: 'not_completed',
      assignmentSummary: { total: 1, notCompleted: 1 },
    });
    expect(auth.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'reinforcement.task.duplicate',
        before: expect.objectContaining({ status: ReinforcementTaskStatus.CANCELLED }),
        after: expect.objectContaining({
          sourceTaskId: 'source-task',
          newTaskId: 'duplicated-task',
        }),
      }),
    );
  });

  it('cancels active assignments while completed assignments remain completed', async () => {
    const existing = taskRecord({
      assignments: [
        assignment('assignment-1', 'student-1', ReinforcementTaskStatus.IN_PROGRESS),
        assignment('assignment-2', 'student-2', ReinforcementTaskStatus.COMPLETED),
      ],
    });
    const repository = baseRepository({
      findTaskById: jest.fn().mockResolvedValue(existing),
      cancelTaskAndAssignments: jest.fn().mockResolvedValue({
        task: taskRecord({
          status: ReinforcementTaskStatus.CANCELLED,
          assignments: [
            assignment('assignment-1', 'student-1', ReinforcementTaskStatus.CANCELLED),
            assignment('assignment-2', 'student-2', ReinforcementTaskStatus.COMPLETED),
          ],
        }),
        affectedAssignmentCount: 1,
      }),
    });
    const auth = authRepository();
    const useCase = new CancelReinforcementTaskUseCase(repository, auth);

    const result = await withScope(() =>
      useCase.execute('task-1', { reason: 'No longer needed' }),
    );

    expect(repository.cancelTaskAndAssignments).toHaveBeenCalledWith({
      schoolId: SCHOOL_ID,
      taskId: 'task-1',
      actorId: 'user-1',
      reason: 'No longer needed',
    });
    expect(result.assignmentSummary).toMatchObject({
      completed: 1,
      cancelled: 1,
    });
    expect(auth.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'reinforcement.task.cancel',
        before: expect.objectContaining({ status: ReinforcementTaskStatus.NOT_COMPLETED }),
        after: expect.objectContaining({
          afterStatus: ReinforcementTaskStatus.CANCELLED,
          affectedAssignmentCount: 1,
        }),
      }),
    );
  });

  function baseRepository(overrides?: Partial<Record<string, jest.Mock>>) {
    const repository = {
      findAcademicYear: jest.fn().mockResolvedValue({ id: YEAR_ID }),
      findTerm: jest.fn().mockResolvedValue({
        id: TERM_ID,
        academicYearId: YEAR_ID,
        isActive: true,
      }),
      findSubject: jest.fn().mockResolvedValue(null),
      findTargetResource: jest.fn().mockResolvedValue({
        scopeType: ReinforcementTargetScope.STUDENT,
        scopeKey: STUDENT_ID,
        stageId: null,
        gradeId: null,
        sectionId: null,
        classroomId: null,
        studentId: STUDENT_ID,
      }),
      resolveEnrollmentsForTargets: jest
        .fn()
        .mockResolvedValue([enrollment('enrollment-1', STUDENT_ID)]),
      createTaskWithTargetsStagesAssignments: jest
        .fn()
        .mockImplementation((input) =>
          Promise.resolve(
            taskRecord({
              targets: input.targets.map(
                (target: {
                  scopeType: ReinforcementTargetScope;
                  scopeKey: string;
                  stageId: string | null;
                  gradeId: string | null;
                  sectionId: string | null;
                  classroomId: string | null;
                  studentId: string | null;
                }) => targetRecord(target),
              ),
              stages: input.stages.map(
                (stage: {
                  sortOrder: number;
                  titleEn: string | null;
                  titleAr: string | null;
                  proofType: ReinforcementProofType;
                  requiresApproval: boolean;
                }) => stageRecord(stage),
              ),
              assignments: input.assignments.map(
                (item: { enrollmentId: string; studentId: string }) =>
                  assignment(item.enrollmentId, item.studentId),
              ),
            }),
          ),
        ),
      duplicateTaskWithTargetsStagesAssignments: jest.fn(),
      cancelTaskAndAssignments: jest.fn(),
      findTaskById: jest.fn().mockResolvedValue(taskRecord()),
      listTasks: jest.fn().mockResolvedValue({
        items: [taskRecord()],
        total: 1,
      }),
      ...overrides,
    };

    return repository as unknown as ReinforcementTasksRepository;
  }

  function authRepository(overrides?: Partial<Record<string, jest.Mock>>) {
    return {
      createAuditLog: jest.fn().mockResolvedValue(undefined),
      ...overrides,
    } as unknown as AuthRepository;
  }

  function enrollment(id: string, studentId: string) {
    return {
      id,
      studentId,
      classroomId: CLASSROOM_ID,
      classroom: {
        sectionId: 'section-1',
        section: {
          gradeId: 'grade-1',
          grade: { stageId: 'stage-1' },
        },
      },
      student: {
        id: studentId,
        firstName: 'Student',
        lastName: studentId,
        status: 'ACTIVE',
      },
    };
  }

  function taskRecord(
    overrides?: Partial<{
      id: string;
      status: ReinforcementTaskStatus;
      targets: ReturnType<typeof targetRecord>[];
      stages: ReturnType<typeof stageRecord>[];
      assignments: ReturnType<typeof assignment>[];
    }>,
  ) {
    const now = new Date('2026-04-28T10:00:00.000Z');
    return {
      id: overrides?.id ?? 'task-1',
      schoolId: SCHOOL_ID,
      academicYearId: YEAR_ID,
      termId: TERM_ID,
      subjectId: null,
      titleEn: 'Read daily',
      titleAr: null,
      descriptionEn: null,
      descriptionAr: null,
      source: ReinforcementSource.TEACHER,
      status: overrides?.status ?? ReinforcementTaskStatus.NOT_COMPLETED,
      rewardType: ReinforcementRewardType.XP,
      rewardValue: new Prisma.Decimal(10),
      rewardLabelEn: '10 XP',
      rewardLabelAr: null,
      dueDate: null,
      assignedById: 'user-1',
      assignedByName: 'Teacher',
      createdById: 'user-1',
      cancelledById: null,
      cancelledAt: null,
      cancellationReason: null,
      metadata: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      targets:
        overrides?.targets ??
        [
          targetRecord({
            scopeType: ReinforcementTargetScope.STUDENT,
            scopeKey: STUDENT_ID,
            stageId: null,
            gradeId: null,
            sectionId: null,
            classroomId: null,
            studentId: STUDENT_ID,
          }),
        ],
      stages:
        overrides?.stages ??
        [
          stageRecord({
            sortOrder: 1,
            titleEn: 'Read daily',
            titleAr: null,
            proofType: ReinforcementProofType.NONE,
            requiresApproval: true,
          }),
        ],
      assignments:
        overrides?.assignments ?? [assignment('enrollment-1', STUDENT_ID)],
    } as never;
  }

  function targetRecord(target: {
    scopeType: ReinforcementTargetScope;
    scopeKey: string;
    stageId: string | null;
    gradeId: string | null;
    sectionId: string | null;
    classroomId: string | null;
    studentId: string | null;
  }) {
    const now = new Date('2026-04-28T10:00:00.000Z');
    return {
      id: `${target.scopeType}-${target.scopeKey}`,
      ...target,
      createdAt: now,
      updatedAt: now,
    };
  }

  function stageRecord(stage: {
    sortOrder: number;
    titleEn: string | null;
    titleAr: string | null;
    proofType: ReinforcementProofType;
    requiresApproval: boolean;
  }) {
    const now = new Date('2026-04-28T10:00:00.000Z');
    return {
      id: `stage-${stage.sortOrder}`,
      descriptionEn: null,
      descriptionAr: null,
      metadata: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      ...stage,
    };
  }

  function assignment(
    enrollmentId: string,
    studentId: string,
    status = ReinforcementTaskStatus.NOT_COMPLETED,
  ) {
    const now = new Date('2026-04-28T10:00:00.000Z');
    return {
      id: `assignment-${enrollmentId}`,
      studentId,
      enrollmentId,
      status,
      progress: 0,
      assignedAt: now,
      startedAt: null,
      completedAt: status === ReinforcementTaskStatus.COMPLETED ? now : null,
      cancelledAt: status === ReinforcementTaskStatus.CANCELLED ? now : null,
      createdAt: now,
      updatedAt: now,
    };
  }
});
