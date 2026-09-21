/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/unbound-method */
import {
  Prisma,
  ReinforcementProofType,
  ReinforcementSource,
  ReinforcementTargetScope,
  ReinforcementTaskStatus,
  StudentEnrollmentStatus,
  StudentStatus,
  UserType,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import {
  LockedTeacherAllocation,
  TeacherAllocationOperationalWriteGate,
} from '../../../academics/teacher-allocation/application/teacher-allocation-operational-write-gate';
import { ReinforcementTaskInvalidScopeException } from '../domain/reinforcement-task-domain';
import {
  CreateTaskWithChildrenInput,
  ReinforcementTasksRepository,
} from '../infrastructure/reinforcement-tasks.repository';

const SCHOOL_ID = 'school-a';
const YEAR_ID = 'year-1';
const TERM_ID = 'term-1';
const SUBJECT_ID = 'subject-1';
const TEACHER_ID = 'teacher-a';
const MANAGEMENT_ID = 'management-a';
const CLASSROOM_A = 'classroom-a';
const CLASSROOM_B = 'classroom-b';

describe('Core Reinforcement allocation write coordination', () => {
  it('gates a current allocation for a suspended or disabled Teacher without lifecycle lookup', async () => {
    const harness = repositoryHarness({ teacherIdentityIds: [] });

    await harness.repository.createTaskWithTargetsStagesAssignments(
      baseInput(),
    );

    expect(
      harness.transaction.teacherSubjectAllocation.findMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          schoolId: SCHOOL_ID,
          termId: TERM_ID,
          classroomId: { in: [CLASSROOM_A] },
          subjectId: SUBJECT_ID,
          teacherUserId: { in: [TEACHER_ID, MANAGEMENT_ID] },
        }),
      }),
    );
    expect(harness.gate.lock).toHaveBeenCalledWith(harness.transaction, {
      schoolId: SCHOOL_ID,
      allocationIds: ['allocation-a'],
    });
    expect(harness.transaction.user.findMany).not.toHaveBeenCalled();
    expect(harness.transaction.reinforcementTask.create).toHaveBeenCalledTimes(
      1,
    );
  });

  it('gates every subject allocation for a subject-null task', async () => {
    const harness = repositoryHarness({
      allocationIds: ['allocation-a', 'allocation-b'],
      lockedAllocations: [
        lockedAllocation('allocation-a', SUBJECT_ID, CLASSROOM_A),
        lockedAllocation('allocation-b', 'subject-2', CLASSROOM_A),
      ],
    });

    await harness.repository.createTaskWithTargetsStagesAssignments(
      baseInput({ subjectId: null }),
    );

    expect(
      harness.transaction.teacherSubjectAllocation.findMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.not.objectContaining({ subjectId: expect.anything() }),
      }),
    );
    expect(harness.gate.lock).toHaveBeenCalledWith(harness.transaction, {
      schoolId: SCHOOL_ID,
      allocationIds: ['allocation-a', 'allocation-b'],
    });
  });

  it('collects all allocations across materialized assignment classrooms', async () => {
    const harness = repositoryHarness({
      enrollments: [
        activeEnrollment('enrollment-a', CLASSROOM_A),
        activeEnrollment('enrollment-b', CLASSROOM_B),
      ],
      allocationIds: ['allocation-a', 'allocation-b'],
      lockedAllocations: [
        lockedAllocation('allocation-a', SUBJECT_ID, CLASSROOM_A),
        lockedAllocation('allocation-b', SUBJECT_ID, CLASSROOM_B),
      ],
    });

    await harness.repository.createTaskWithTargetsStagesAssignments(
      baseInput({
        assignments: [
          { studentId: 'student-a', enrollmentId: 'enrollment-a' },
          { studentId: 'student-b', enrollmentId: 'enrollment-b' },
        ],
      }),
    );

    expect(
      harness.transaction.teacherSubjectAllocation.findMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { id: 'asc' },
        where: expect.objectContaining({
          classroomId: { in: [CLASSROOM_A, CLASSROOM_B] },
        }),
      }),
    );
    expect(harness.gate.lock).toHaveBeenCalledWith(harness.transaction, {
      schoolId: SCHOOL_ID,
      allocationIds: ['allocation-a', 'allocation-b'],
    });
  });

  it('rejects a non-active Teacher identity with no current matching allocation before insert', async () => {
    const harness = repositoryHarness({ allocationIds: [] });

    await expect(
      harness.repository.createTaskWithTargetsStagesAssignments(baseInput()),
    ).rejects.toBeInstanceOf(ReinforcementTaskInvalidScopeException);

    expect(
      harness.transaction.teacherSubjectAllocation.findMany.mock
        .invocationCallOrder[0],
    ).toBeLessThan(
      harness.transaction.user.findMany.mock.invocationCallOrder[0],
    );
    expect(harness.transaction.user.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: [TEACHER_ID, MANAGEMENT_ID] },
        userType: UserType.TEACHER,
        deletedAt: null,
      },
      select: { id: true },
    });
    expect(harness.gate.lock).not.toHaveBeenCalled();
    expect(harness.transaction.reinforcementTask.create).not.toHaveBeenCalled();
  });

  it('preserves management-owned source=TEACHER creation without a false allocation requirement', async () => {
    const harness = repositoryHarness({
      teacherIdentityIds: [],
      allocationIds: [],
    });

    await harness.repository.createTaskWithTargetsStagesAssignments(
      baseInput({ assignedById: MANAGEMENT_ID, createdById: MANAGEMENT_ID }),
    );

    expect(harness.transaction.enrollment.findMany).toHaveBeenCalledTimes(1);
    expect(
      harness.transaction.teacherSubjectAllocation.findMany,
    ).toHaveBeenCalledTimes(1);
    expect(harness.transaction.user.findMany).toHaveBeenCalledTimes(1);
    expect(harness.gate.lock).not.toHaveBeenCalled();
    expect(harness.transaction.reinforcementTask.create).toHaveBeenCalledTimes(
      1,
    );
  });

  it('rejects cross-school Teacher allocation scope without exposing or locking it', async () => {
    const harness = repositoryHarness({ allocationIds: [] });

    await expect(
      harness.repository.createTaskWithTargetsStagesAssignments(baseInput()),
    ).rejects.toMatchObject({
      code: 'reinforcement.task.invalid_scope',
      httpStatus: 422,
    });

    expect(
      harness.transaction.teacherSubjectAllocation.findMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ schoolId: SCHOOL_ID }),
      }),
    );
    expect(harness.gate.lock).not.toHaveBeenCalled();
    expect(harness.transaction.reinforcementTask.create).not.toHaveBeenCalled();
  });

  it('rejects when the locked allocation owner changed after discovery', async () => {
    const harness = repositoryHarness({
      lockedAllocations: [
        {
          ...lockedAllocation('allocation-a', SUBJECT_ID, CLASSROOM_A),
          teacherUserId: 'teacher-b',
        },
      ],
    });

    await expect(
      harness.repository.createTaskWithTargetsStagesAssignments(baseInput()),
    ).rejects.toBeInstanceOf(ReinforcementTaskInvalidScopeException);

    expect(harness.gate.lock).toHaveBeenCalledTimes(1);
    expect(harness.transaction.user.findMany).not.toHaveBeenCalled();
    expect(harness.transaction.reinforcementTask.create).not.toHaveBeenCalled();
  });

  it('preserves the explicit Teacher App gate IDs and expected owner behavior', async () => {
    const harness = repositoryHarness();
    const explicitGate = {
      allocationIds: ['teacher-app-allocation'],
      expectedTeacherUserId: TEACHER_ID,
    };

    await harness.repository.createTaskWithTargetsStagesAssignments(
      baseInput({ operationalWriteGate: explicitGate }),
    );

    expect(harness.gate.lock).toHaveBeenCalledWith(harness.transaction, {
      schoolId: SCHOOL_ID,
      ...explicitGate,
    });
    expect(harness.transaction.user.findMany).not.toHaveBeenCalled();
    expect(harness.transaction.enrollment.findMany).not.toHaveBeenCalled();
    expect(
      harness.transaction.teacherSubjectAllocation.findMany,
    ).not.toHaveBeenCalled();
    expect(harness.transaction.reinforcementTask.create).toHaveBeenCalledTimes(
      1,
    );
  });
});

function repositoryHarness(options?: {
  teacherIdentityIds?: string[];
  enrollments?: ReturnType<typeof activeEnrollment>[];
  allocationIds?: string[];
  lockedAllocations?: LockedTeacherAllocation[];
}) {
  const teacherIdentityIds = options?.teacherIdentityIds ?? [TEACHER_ID];
  const enrollments = options?.enrollments ?? [
    activeEnrollment('enrollment-a', CLASSROOM_A),
  ];
  const allocationIds = options?.allocationIds ?? ['allocation-a'];
  const lockedAllocations = options?.lockedAllocations ?? [
    lockedAllocation('allocation-a', SUBJECT_ID, CLASSROOM_A),
  ];
  const transaction = {
    user: {
      findMany: jest
        .fn()
        .mockResolvedValue(teacherIdentityIds.map((id) => ({ id }))),
    },
    enrollment: { findMany: jest.fn().mockResolvedValue(enrollments) },
    teacherSubjectAllocation: {
      findMany: jest
        .fn()
        .mockResolvedValue(allocationIds.map((id) => ({ id }))),
    },
    reinforcementTask: {
      create: jest.fn().mockResolvedValue({ id: 'task-1' }),
      findFirst: jest.fn().mockResolvedValue(taskRecord()),
    },
    reinforcementTaskTarget: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    reinforcementTaskStage: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    reinforcementAssignment: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const prisma = {
    $transaction: jest.fn(
      (callback: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
        callback(transaction as unknown as Prisma.TransactionClient),
    ),
  } as unknown as PrismaService;
  const gate = {
    lock: jest.fn().mockResolvedValue(lockedAllocations),
  } as unknown as jest.Mocked<TeacherAllocationOperationalWriteGate>;

  return {
    transaction,
    gate,
    repository: new ReinforcementTasksRepository(prisma, gate),
  };
}

function baseInput(
  overrides?: Partial<
    Pick<
      CreateTaskWithChildrenInput,
      'assignments' | 'operationalWriteGate'
    > & {
      subjectId: string | null;
      assignedById: string;
      createdById: string;
    }
  >,
): CreateTaskWithChildrenInput {
  return {
    schoolId: SCHOOL_ID,
    task: {
      academicYearId: YEAR_ID,
      termId: TERM_ID,
      subjectId:
        overrides?.subjectId === undefined ? SUBJECT_ID : overrides.subjectId,
      titleEn: 'Core teacher task',
      titleAr: null,
      descriptionEn: null,
      descriptionAr: null,
      source: ReinforcementSource.TEACHER,
      status: ReinforcementTaskStatus.NOT_COMPLETED,
      rewardType: null,
      rewardValue: null,
      rewardLabelEn: null,
      rewardLabelAr: null,
      dueDate: null,
      assignedById: overrides?.assignedById ?? TEACHER_ID,
      assignedByName: null,
      createdById: overrides?.createdById ?? MANAGEMENT_ID,
      metadata: undefined,
    },
    targets: [
      {
        scopeType: ReinforcementTargetScope.CLASSROOM,
        scopeKey: CLASSROOM_A,
        stageId: 'stage-1',
        gradeId: 'grade-1',
        sectionId: 'section-1',
        classroomId: CLASSROOM_A,
        studentId: null,
      },
    ],
    stages: [
      {
        sortOrder: 1,
        titleEn: 'Core teacher task',
        titleAr: null,
        descriptionEn: null,
        descriptionAr: null,
        proofType: ReinforcementProofType.NONE,
        requiresApproval: true,
      },
    ],
    assignments: overrides?.assignments ?? [
      { studentId: 'student-a', enrollmentId: 'enrollment-a' },
    ],
    ...(overrides?.operationalWriteGate
      ? { operationalWriteGate: overrides.operationalWriteGate }
      : {}),
  };
}

function activeEnrollment(id: string, classroomId: string) {
  return {
    id,
    academicYearId: YEAR_ID,
    termId: TERM_ID,
    classroomId,
    status: StudentEnrollmentStatus.ACTIVE,
    deletedAt: null,
    student: { status: StudentStatus.ACTIVE, deletedAt: null },
  };
}

function lockedAllocation(
  id: string,
  subjectId: string,
  classroomId: string,
): LockedTeacherAllocation {
  return {
    id,
    schoolId: SCHOOL_ID,
    teacherUserId: TEACHER_ID,
    subjectId,
    classroomId,
    termId: TERM_ID,
  };
}

function taskRecord() {
  const now = new Date('2026-09-21T00:00:00.000Z');
  return {
    id: 'task-1',
    schoolId: SCHOOL_ID,
    academicYearId: YEAR_ID,
    termId: TERM_ID,
    subjectId: SUBJECT_ID,
    titleEn: 'Core teacher task',
    titleAr: null,
    descriptionEn: null,
    descriptionAr: null,
    source: ReinforcementSource.TEACHER,
    status: ReinforcementTaskStatus.NOT_COMPLETED,
    rewardType: null,
    rewardValue: null,
    rewardLabelEn: null,
    rewardLabelAr: null,
    dueDate: null,
    assignedById: TEACHER_ID,
    assignedByName: null,
    createdById: MANAGEMENT_ID,
    cancelledById: null,
    cancelledAt: null,
    cancellationReason: null,
    metadata: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    targets: [],
    stages: [],
    assignments: [],
  };
}
