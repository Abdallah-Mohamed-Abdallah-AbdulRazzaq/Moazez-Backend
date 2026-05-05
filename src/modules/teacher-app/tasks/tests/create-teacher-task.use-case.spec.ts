import {
  ReinforcementProofType,
  ReinforcementRewardType,
  ReinforcementSource,
  ReinforcementTaskStatus,
  StudentEnrollmentStatus,
  StudentStatus,
} from '@prisma/client';
import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';
import { CreateReinforcementTaskUseCase } from '../../../reinforcement/tasks/application/create-reinforcement-task.use-case';
import { TeacherAppAccessService } from '../../access/teacher-app-access.service';
import {
  TeacherAppAllocationNotFoundException,
  TeacherAppRequiredTeacherException,
} from '../../shared/teacher-app.errors';
import type { TeacherAppAllocationRecord } from '../../shared/teacher-app.types';
import { CreateTeacherTaskUseCase } from '../application/create-teacher-task.use-case';
import {
  TeacherTaskCreateProofType,
  TeacherTaskCreateRewardType,
} from '../dto/teacher-tasks.dto';
import {
  TeacherTaskRecord,
  TeacherTasksReadAdapter,
} from '../infrastructure/teacher-tasks-read.adapter';

const TEACHER_ID = 'teacher-1';

describe('CreateTeacherTaskUseCase', () => {
  it('rejects non-teacher actors through the access service', async () => {
    const { useCase, accessService, coreCreateUseCase } = createUseCase();
    accessService.assertCurrentTeacher.mockImplementation(() => {
      throw new TeacherAppRequiredTeacherException({
        reason: 'actor_not_teacher',
      });
    });

    await expect(useCase.execute(validCreateDto())).rejects.toBeInstanceOf(
      TeacherAppRequiredTeacherException,
    );
    expect(coreCreateUseCase.execute).not.toHaveBeenCalled();
  });

  it('validates every classId ownership before delegating to Reinforcement core', async () => {
    const allocationTwo = allocationFixture({
      id: 'allocation-2',
      classroomId: 'classroom-2',
    });
    const { useCase, accessService, coreCreateUseCase } = createUseCase({
      allocations: [allocationFixture(), allocationTwo],
    });

    await useCase.execute(
      validCreateDto({ classIds: ['allocation-1', 'allocation-2'] }),
    );

    expect(accessService.assertTeacherOwnsAllocation).toHaveBeenNthCalledWith(
      1,
      'allocation-1',
    );
    expect(accessService.assertTeacherOwnsAllocation).toHaveBeenNthCalledWith(
      2,
      'allocation-2',
    );
    expect(coreCreateUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        academicYearId: 'year-1',
        termId: 'term-1',
        subjectId: 'subject-1',
        source: ReinforcementSource.TEACHER,
        assignedById: TEACHER_ID,
        targets: [
          { scopeType: 'CLASSROOM', scopeId: 'classroom-1' },
          { scopeType: 'CLASSROOM', scopeId: 'classroom-2' },
        ],
      }),
    );
  });

  it('rejects same-school other-teacher and cross-school class ids before core creation', async () => {
    const { useCase, accessService, coreCreateUseCase } = createUseCase();
    accessService.assertTeacherOwnsAllocation.mockRejectedValueOnce(
      new TeacherAppAllocationNotFoundException({
        classId: 'other-teacher-allocation',
      }),
    );

    await expect(
      useCase.execute(validCreateDto({ classIds: ['other-teacher-allocation'] })),
    ).rejects.toMatchObject({ code: 'teacher_app.allocation.not_found' });
    expect(coreCreateUseCase.execute).not.toHaveBeenCalled();

    accessService.assertTeacherOwnsAllocation.mockRejectedValueOnce(
      new TeacherAppAllocationNotFoundException({
        classId: 'cross-school-allocation',
      }),
    );

    await expect(
      useCase.execute(validCreateDto({ classIds: ['cross-school-allocation'] })),
    ).rejects.toMatchObject({ code: 'teacher_app.allocation.not_found' });
    expect(coreCreateUseCase.execute).not.toHaveBeenCalled();
  });

  it('validates every studentId inside selected owned allocation classrooms', async () => {
    const { useCase, tasksReadAdapter, coreCreateUseCase } = createUseCase();

    await useCase.execute(
      validCreateDto({
        studentIds: ['student-1'],
        reward: { type: TeacherTaskCreateRewardType.XP, value: 10 },
      }),
    );

    expect(tasksReadAdapter.findOwnedStudent).toHaveBeenCalledWith({
      allocations: [allocationFixture()],
      studentId: 'student-1',
    });
    expect(coreCreateUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        rewardType: ReinforcementRewardType.XP,
        rewardValue: 10,
        rewardLabelEn: '10 XP',
        targets: [{ scopeType: 'STUDENT', scopeId: 'student-1' }],
      }),
    );
  });

  it('rejects students outside owned classes without creating a task', async () => {
    const { useCase, tasksReadAdapter, coreCreateUseCase } = createUseCase();
    tasksReadAdapter.findOwnedStudent.mockResolvedValueOnce(null);

    await expect(
      useCase.execute(validCreateDto({ studentIds: ['outside-student'] })),
    ).rejects.toMatchObject({ code: 'not_found' });
    expect(coreCreateUseCase.execute).not.toHaveBeenCalled();
  });

  it('rejects mixed subject or term class targets before creating a task', async () => {
    const { useCase, coreCreateUseCase } = createUseCase({
      allocations: [
        allocationFixture(),
        allocationFixture({ id: 'allocation-2', subjectId: 'subject-2' }),
      ],
    });

    await expect(
      useCase.execute(
        validCreateDto({ classIds: ['allocation-1', 'allocation-2'] }),
      ),
    ).rejects.toBeInstanceOf(ValidationDomainException);
    expect(coreCreateUseCase.execute).not.toHaveBeenCalled();
  });

  it('delegates creation once boundaries pass and returns the safe Teacher App presenter shape', async () => {
    const { useCase } = createUseCase();

    const result = await useCase.execute(
      validCreateDto({
        reward: { type: TeacherTaskCreateRewardType.POINTS, value: 5 },
        stages: [
          {
            title: 'Submit proof',
            proofType: TeacherTaskCreateProofType.FILE,
            order: 1,
          },
        ],
      }),
    );
    const json = JSON.stringify(result);

    expect(result.task).toMatchObject({
      taskId: 'task-1',
      title: 'Practice kindness',
      source: 'teacher',
      target: {
        classId: 'allocation-1',
      },
    });
    expect(json).not.toContain('schoolId');
    expect(json).not.toContain('scheduleId');
    expect(json).not.toContain('bucket');
    expect(json).not.toContain('objectKey');
    expect(json).not.toContain('raw-storage-key');
  });
});

function createUseCase(options?: {
  allocations?: TeacherAppAllocationRecord[];
}): {
  useCase: CreateTeacherTaskUseCase;
  accessService: jest.Mocked<TeacherAppAccessService>;
  tasksReadAdapter: jest.Mocked<TeacherTasksReadAdapter>;
  coreCreateUseCase: jest.Mocked<CreateReinforcementTaskUseCase>;
} {
  const allocations = options?.allocations ?? [allocationFixture()];
  const allocationById = new Map(
    allocations.map((allocation) => [allocation.id, allocation]),
  );
  const accessService = {
    assertCurrentTeacher: jest.fn(() => ({
      teacherUserId: TEACHER_ID,
      schoolId: 'school-1',
      organizationId: 'org-1',
      membershipId: 'membership-1',
      roleId: 'role-1',
      permissions: [],
    })),
    assertTeacherOwnsAllocation: jest.fn((classId: string) =>
      Promise.resolve(allocationById.get(classId) ?? allocationFixture()),
    ),
  } as unknown as jest.Mocked<TeacherAppAccessService>;
  const tasksReadAdapter = {
    findOwnedStudent: jest.fn(() =>
      Promise.resolve({
        studentId: 'student-1',
        firstName: 'Mona',
        lastName: 'Ahmed',
        classIds: ['allocation-1'],
      }),
    ),
    findVisibleTaskById: jest.fn(() => Promise.resolve(taskFixture())),
  } as unknown as jest.Mocked<TeacherTasksReadAdapter>;
  const coreCreateUseCase = {
    execute: jest.fn(() => Promise.resolve({ id: 'task-1' })),
  } as unknown as jest.Mocked<CreateReinforcementTaskUseCase>;

  return {
    useCase: new CreateTeacherTaskUseCase(
      accessService,
      tasksReadAdapter,
      coreCreateUseCase,
    ),
    accessService,
    tasksReadAdapter,
    coreCreateUseCase,
  };
}

function validCreateDto(overrides?: {
  classIds?: string[];
  studentIds?: string[];
  reward?: { type: TeacherTaskCreateRewardType; value?: number };
  stages?: Array<{
    title: string;
    proofType?: TeacherTaskCreateProofType;
    order?: number;
  }>;
}) {
  return {
    title: 'Practice kindness',
    description: 'Help classmates',
    classIds: overrides?.classIds ?? ['allocation-1'],
    studentIds: overrides?.studentIds,
    reward: overrides?.reward ?? {
      type: TeacherTaskCreateRewardType.NONE,
    },
    stages: overrides?.stages ?? [
      {
        title: 'Stage one',
        proofType: TeacherTaskCreateProofType.TEXT,
        order: 1,
      },
    ],
    dueAt: '2026-09-20T00:00:00.000Z',
  };
}

function allocationFixture(
  overrides?: Partial<TeacherAppAllocationRecord>,
): TeacherAppAllocationRecord {
  const schoolId = 'school-1';

  return {
    id: 'allocation-1',
    schoolId,
    teacherUserId: TEACHER_ID,
    subjectId: 'subject-1',
    classroomId: 'classroom-1',
    termId: 'term-1',
    subject: {
      id: 'subject-1',
      schoolId,
      nameAr: 'Math AR',
      nameEn: 'Math',
      code: 'MATH',
    },
    classroom: {
      id: 'classroom-1',
      schoolId,
      sectionId: 'section-1',
      roomId: null,
      nameAr: 'Classroom AR',
      nameEn: 'Classroom',
      room: null,
      section: {
        id: 'section-1',
        schoolId,
        gradeId: 'grade-1',
        nameAr: 'Section AR',
        nameEn: 'Section',
        grade: {
          id: 'grade-1',
          schoolId,
          stageId: 'stage-1',
          nameAr: 'Grade AR',
          nameEn: 'Grade',
          stage: {
            id: 'stage-1',
            schoolId,
            nameAr: 'Stage AR',
            nameEn: 'Stage',
          },
        },
      },
    },
    term: {
      id: 'term-1',
      schoolId,
      academicYearId: 'year-1',
      nameAr: 'Term AR',
      nameEn: 'Term',
      isActive: true,
    },
    ...overrides,
  };
}

function taskFixture(
  overrides?: Partial<TeacherTaskRecord>,
): TeacherTaskRecord {
  return {
    id: 'task-1',
    academicYearId: 'year-1',
    termId: 'term-1',
    subjectId: 'subject-1',
    titleEn: 'Practice kindness',
    titleAr: null,
    descriptionEn: 'Help classmates',
    descriptionAr: null,
    source: ReinforcementSource.TEACHER,
    status: ReinforcementTaskStatus.NOT_COMPLETED,
    rewardType: ReinforcementRewardType.MORAL,
    rewardValue: null,
    rewardLabelEn: 'Certificate',
    rewardLabelAr: null,
    dueDate: null,
    createdAt: new Date('2026-09-01T08:00:00.000Z'),
    updatedAt: new Date('2026-09-01T08:00:00.000Z'),
    subject: {
      id: 'subject-1',
      nameAr: 'Math AR',
      nameEn: 'Math',
      code: 'MATH',
    },
    targets: [],
    stages: [
      {
        id: 'stage-1',
        sortOrder: 1,
        titleEn: 'Stage one',
        titleAr: null,
        descriptionEn: null,
        descriptionAr: null,
        proofType: ReinforcementProofType.DOCUMENT,
        requiresApproval: true,
        createdAt: new Date('2026-09-01T08:00:00.000Z'),
        updatedAt: new Date('2026-09-01T08:00:00.000Z'),
      },
    ],
    assignments: [
      {
        id: 'assignment-1',
        studentId: 'student-1',
        enrollmentId: 'enrollment-1',
        status: ReinforcementTaskStatus.NOT_COMPLETED,
        progress: 0,
        assignedAt: new Date('2026-09-01T08:00:00.000Z'),
        startedAt: null,
        completedAt: null,
        cancelledAt: null,
        createdAt: new Date('2026-09-01T08:00:00.000Z'),
        updatedAt: new Date('2026-09-01T08:00:00.000Z'),
        student: {
          id: 'student-1',
          firstName: 'Mona',
          lastName: 'Ahmed',
          status: StudentStatus.ACTIVE,
        },
        enrollment: {
          id: 'enrollment-1',
          academicYearId: 'year-1',
          termId: 'term-1',
          classroomId: 'classroom-1',
          status: StudentEnrollmentStatus.ACTIVE,
          classroom: {
            id: 'classroom-1',
            nameAr: 'Classroom AR',
            nameEn: 'Classroom',
            section: {
              id: 'section-1',
              nameAr: 'Section AR',
              nameEn: 'Section',
              grade: {
                id: 'grade-1',
                nameAr: 'Grade AR',
                nameEn: 'Grade',
                stage: {
                  id: 'stage-1',
                  nameAr: 'Stage AR',
                  nameEn: 'Stage',
                },
              },
            },
          },
        },
      },
    ],
    submissions: [],
    ...overrides,
  } as TeacherTaskRecord;
}
