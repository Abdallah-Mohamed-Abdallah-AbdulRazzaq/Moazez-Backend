import {
  ReinforcementProofType,
  ReinforcementRewardType,
  ReinforcementSource,
  ReinforcementTaskStatus,
  StudentStatus,
} from '@prisma/client';
import { TeacherAppAllocationReadAdapter } from '../../access/teacher-app-allocation-read.adapter';
import { TeacherAppAccessService } from '../../access/teacher-app-access.service';
import {
  TeacherAppAllocationNotFoundException,
  TeacherAppRequiredTeacherException,
} from '../../shared/teacher-app.errors';
import type { TeacherAppAllocationRecord } from '../../shared/teacher-app.types';
import { GetTeacherTaskSelectorsUseCase } from '../application/get-teacher-task-selectors.use-case';
import { GetTeacherTaskUseCase } from '../application/get-teacher-task.use-case';
import { GetTeacherTasksDashboardUseCase } from '../application/get-teacher-tasks-dashboard.use-case';
import { ListTeacherTasksUseCase } from '../application/list-teacher-tasks.use-case';
import { TeacherTaskStatusQueryValue } from '../dto/teacher-tasks.dto';
import {
  TeacherTaskRecord,
  TeacherTasksReadAdapter,
} from '../infrastructure/teacher-tasks-read.adapter';

const TEACHER_ID = 'teacher-1';

describe('Teacher Tasks use cases', () => {
  it('dashboard rejects non-teacher actors through the access service', async () => {
    const { dashboardUseCase, accessService } = createUseCases();
    accessService.assertCurrentTeacher.mockImplementation(() => {
      throw new TeacherAppRequiredTeacherException({
        reason: 'actor_not_teacher',
      });
    });

    await expect(dashboardUseCase.execute()).rejects.toBeInstanceOf(
      TeacherAppRequiredTeacherException,
    );
  });

  it('dashboard includes only owned classes and task aggregates', async () => {
    const { dashboardUseCase, tasksReadAdapter } = createUseCases();

    const result = await dashboardUseCase.execute();

    expect(result.summary).toMatchObject({
      totalTasks: 1,
      pendingTasks: 1,
    });
    expect(result.byClass).toEqual([
      expect.objectContaining({
        classId: 'allocation-1',
        studentsCount: 1,
        activeTasksCount: 1,
      }),
    ]);
    expect(tasksReadAdapter.listAllVisibleTasks).toHaveBeenCalledWith({
      teacherUserId: TEACHER_ID,
      allocations: [allocationFixture()],
      filters: { source: ReinforcementSource.TEACHER },
    });
  });

  it('list rejects non-teacher actors through the access service', async () => {
    const { listUseCase, accessService } = createUseCases();
    accessService.assertCurrentTeacher.mockImplementation(() => {
      throw new TeacherAppRequiredTeacherException({
        reason: 'actor_not_teacher',
      });
    });

    await expect(listUseCase.execute({})).rejects.toBeInstanceOf(
      TeacherAppRequiredTeacherException,
    );
  });

  it('list filters by an owned classId', async () => {
    const { listUseCase, accessService, tasksReadAdapter } = createUseCases();

    await listUseCase.execute({
      classId: 'allocation-1',
      status: TeacherTaskStatusQueryValue.PENDING,
    });

    expect(accessService.assertTeacherOwnsAllocation).toHaveBeenCalledWith(
      'allocation-1',
    );
    expect(tasksReadAdapter.listTasks).toHaveBeenCalledWith(
      expect.objectContaining({
        teacherUserId: TEACHER_ID,
        allocations: [allocationFixture()],
        filters: expect.objectContaining({
          status: ReinforcementTaskStatus.NOT_COMPLETED,
        }),
      }),
    );
  });

  it('list rejects unowned classId before querying tasks', async () => {
    const { listUseCase, accessService, tasksReadAdapter } = createUseCases();
    accessService.assertTeacherOwnsAllocation.mockRejectedValue(
      new TeacherAppAllocationNotFoundException({ classId: 'other-class' }),
    );

    await expect(listUseCase.execute({ classId: 'other-class' })).rejects
      .toMatchObject({
        code: 'teacher_app.allocation.not_found',
      });
    expect(tasksReadAdapter.listTasks).not.toHaveBeenCalled();
  });

  it('list filters by owned studentId and rejects students outside owned classes', async () => {
    const { listUseCase, tasksReadAdapter } = createUseCases();

    await listUseCase.execute({ studentId: 'student-1' });

    expect(tasksReadAdapter.findOwnedStudent).toHaveBeenCalledWith({
      allocations: [allocationFixture()],
      studentId: 'student-1',
    });
    expect(tasksReadAdapter.listTasks).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: expect.objectContaining({ studentId: 'student-1' }),
      }),
    );

    tasksReadAdapter.findOwnedStudent.mockResolvedValueOnce(null);

    await expect(listUseCase.execute({ studentId: 'outside-student' })).rejects
      .toMatchObject({
        code: 'not_found',
      });
  });

  it('detail returns visible owned task and rejects other teacher or cross-school tasks', async () => {
    const { detailUseCase, tasksReadAdapter } = createUseCases();

    const detail = await detailUseCase.execute('task-1');

    expect(detail.task.taskId).toBe('task-1');
    expect(detail.task.target.classId).toBe('allocation-1');
    expect(tasksReadAdapter.findVisibleTaskById).toHaveBeenCalledWith({
      teacherUserId: TEACHER_ID,
      allocations: [allocationFixture()],
      taskId: 'task-1',
    });

    tasksReadAdapter.findVisibleTaskById.mockResolvedValueOnce(null);

    await expect(detailUseCase.execute('other-task')).rejects.toMatchObject({
      code: 'not_found',
    });
  });

  it('selectors include only owned classes and students', async () => {
    const { selectorsUseCase } = createUseCases();

    const selectors = await selectorsUseCase.execute();
    const json = JSON.stringify(selectors);

    expect(selectors.classes).toEqual([
      expect.objectContaining({
        classId: 'allocation-1',
        subjectId: 'subject-1',
        studentsCount: 1,
      }),
    ]);
    expect(selectors.students).toEqual([
      {
        studentId: 'student-1',
        displayName: 'Mona Ahmed',
        classIds: ['allocation-1'],
      },
    ]);
    expect(json).not.toContain('schoolId');
    expect(json).not.toContain('scheduleId');
  });
});

function createUseCases(): {
  dashboardUseCase: GetTeacherTasksDashboardUseCase;
  listUseCase: ListTeacherTasksUseCase;
  detailUseCase: GetTeacherTaskUseCase;
  selectorsUseCase: GetTeacherTaskSelectorsUseCase;
  accessService: jest.Mocked<TeacherAppAccessService>;
  allocationReadAdapter: jest.Mocked<TeacherAppAllocationReadAdapter>;
  tasksReadAdapter: jest.Mocked<TeacherTasksReadAdapter>;
} {
  const allocation = allocationFixture();
  const task = taskFixture();
  const accessService = {
    assertCurrentTeacher: jest.fn(() => ({
      teacherUserId: TEACHER_ID,
      schoolId: 'school-1',
      organizationId: 'org-1',
      membershipId: 'membership-1',
      roleId: 'role-1',
      permissions: [],
    })),
    assertTeacherOwnsAllocation: jest.fn(() => Promise.resolve(allocation)),
  } as unknown as jest.Mocked<TeacherAppAccessService>;
  const allocationReadAdapter = {
    listAllOwnedAllocations: jest.fn(() => Promise.resolve([allocation])),
  } as unknown as jest.Mocked<TeacherAppAllocationReadAdapter>;
  const tasksReadAdapter = {
    listOwnedStudents: jest.fn(() =>
      Promise.resolve([
        {
          studentId: 'student-1',
          firstName: 'Mona',
          lastName: 'Ahmed',
          classIds: ['allocation-1'],
        },
      ]),
    ),
    findOwnedStudent: jest.fn(() =>
      Promise.resolve({
        studentId: 'student-1',
        firstName: 'Mona',
        lastName: 'Ahmed',
        classIds: ['allocation-1'],
      }),
    ),
    listAllVisibleTasks: jest.fn(() => Promise.resolve([task])),
    listTasks: jest.fn(() =>
      Promise.resolve({
        items: [task],
        total: 1,
        page: 1,
        limit: 20,
      }),
    ),
    findVisibleTaskById: jest.fn(() => Promise.resolve(task)),
  } as unknown as jest.Mocked<TeacherTasksReadAdapter>;

  return {
    dashboardUseCase: new GetTeacherTasksDashboardUseCase(
      accessService,
      allocationReadAdapter,
      tasksReadAdapter,
    ),
    listUseCase: new ListTeacherTasksUseCase(
      accessService,
      allocationReadAdapter,
      tasksReadAdapter,
    ),
    detailUseCase: new GetTeacherTaskUseCase(
      accessService,
      allocationReadAdapter,
      tasksReadAdapter,
    ),
    selectorsUseCase: new GetTeacherTaskSelectorsUseCase(
      accessService,
      allocationReadAdapter,
      tasksReadAdapter,
    ),
    accessService,
    allocationReadAdapter,
    tasksReadAdapter,
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
        proofType: ReinforcementProofType.IMAGE,
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
          status: 'ACTIVE',
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
