import { StudentStatus } from '@prisma/client';
import { TeacherAppAccessService } from '../../access/teacher-app-access.service';
import { TeacherAppAllocationNotFoundException } from '../../shared/teacher-app.errors';
import type { TeacherAppAllocationRecord } from '../../shared/teacher-app.types';
import { ListTeacherClassroomRosterUseCase } from '../application/list-teacher-classroom-roster.use-case';
import {
  TeacherClassroomReadAdapter,
  TeacherClassroomRosterStudentRecord,
} from '../infrastructure/teacher-classroom-read.adapter';

describe('ListTeacherClassroomRosterUseCase', () => {
  it('lists only students from the owned classroom', async () => {
    const { useCase, classroomReadAdapter } = createUseCase();

    const result = await useCase.execute('allocation-1', {});

    expect(classroomReadAdapter.listActiveRoster).toHaveBeenCalledWith({
      classroomId: 'classroom-1',
      filters: {},
    });
    expect(result.classId).toBe('allocation-1');
    expect(result.students.map((student) => student.id)).toEqual([
      'student-owned-1',
      'student-owned-2',
    ]);
    expect(JSON.stringify(result)).not.toContain('student-other-classroom');
  });

  it('passes safe search and pagination filters to the roster adapter', async () => {
    const { useCase, classroomReadAdapter } = createUseCase();

    await useCase.execute('allocation-1', {
      search: 'Mona',
      page: 2,
      limit: 10,
    });

    expect(classroomReadAdapter.listActiveRoster).toHaveBeenCalledWith({
      classroomId: 'classroom-1',
      filters: {
        search: 'Mona',
        page: 2,
        limit: 10,
      },
    });
  });

  it('rejects same-school other teacher classes before roster reads', async () => {
    const { useCase, accessService, classroomReadAdapter } = createUseCase();
    accessService.assertTeacherOwnsAllocation.mockRejectedValue(
      new TeacherAppAllocationNotFoundException({
        classId: 'same-school-other-teacher',
      }),
    );

    await expect(
      useCase.execute('same-school-other-teacher', {}),
    ).rejects.toMatchObject({
      code: 'teacher_app.allocation.not_found',
    });
    expect(classroomReadAdapter.listActiveRoster).not.toHaveBeenCalled();
  });

  it('rejects cross-school class ids as safe not-found', async () => {
    const { useCase, accessService, classroomReadAdapter } = createUseCase();
    accessService.assertTeacherOwnsAllocation.mockRejectedValue(
      new TeacherAppAllocationNotFoundException({
        classId: 'cross-school-class',
      }),
    );

    await expect(useCase.execute('cross-school-class', {})).rejects.toMatchObject(
      {
        code: 'teacher_app.allocation.not_found',
      },
    );
    expect(classroomReadAdapter.listActiveRoster).not.toHaveBeenCalled();
  });

  it('does not expose guardian, medical, private, school, or schedule fields', async () => {
    const { useCase } = createUseCase();

    const result = await useCase.execute('allocation-1', {});
    const json = JSON.stringify(result);

    expect(result.students[0]).toEqual({
      id: 'student-owned-1',
      displayName: 'Mona Ahmed',
      studentNumber: null,
      avatarUrl: null,
      status: 'active',
      attendanceToday: null,
      latestGrade: null,
      behaviorSummary: null,
    });
    expect(json).not.toContain('schoolId');
    expect(json).not.toContain('scheduleId');
    expect(json).not.toContain('guardian');
    expect(json).not.toContain('medical');
    expect(json).not.toContain('private');
  });

  it('does not call mutation-capable adapter methods', async () => {
    const mutationMocks = {
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };
    const { useCase } = createUseCase(mutationMocks);

    await useCase.execute('allocation-1', {});

    expect(mutationMocks.create).not.toHaveBeenCalled();
    expect(mutationMocks.update).not.toHaveBeenCalled();
    expect(mutationMocks.delete).not.toHaveBeenCalled();
  });
});

function createUseCase(
  extraAdapterMethods?: Record<string, jest.Mock>,
): {
  useCase: ListTeacherClassroomRosterUseCase;
  accessService: jest.Mocked<TeacherAppAccessService>;
  classroomReadAdapter: jest.Mocked<TeacherClassroomReadAdapter>;
} {
  const accessService = {
    assertTeacherOwnsAllocation: jest.fn(() =>
      Promise.resolve(allocationFixture()),
    ),
  } as unknown as jest.Mocked<TeacherAppAccessService>;
  const classroomReadAdapter = {
    listActiveRoster: jest.fn(({ classroomId }) =>
      Promise.resolve({
        items: rosterFixture().filter(
          (student) => student.classroomId === classroomId,
        ),
        page: 1,
        limit: 20,
        total: 2,
      }),
    ),
    ...extraAdapterMethods,
  } as unknown as jest.Mocked<TeacherClassroomReadAdapter>;

  return {
    useCase: new ListTeacherClassroomRosterUseCase(
      accessService,
      classroomReadAdapter,
    ),
    accessService,
    classroomReadAdapter,
  };
}

function rosterFixture(): Array<
  TeacherClassroomRosterStudentRecord & { classroomId: string }
> {
  return [
    {
      id: 'student-owned-1',
      classroomId: 'classroom-1',
      firstName: 'Mona',
      lastName: 'Ahmed',
      status: StudentStatus.ACTIVE,
    },
    {
      id: 'student-owned-2',
      classroomId: 'classroom-1',
      firstName: 'Omar',
      lastName: 'Hassan',
      status: StudentStatus.ACTIVE,
    },
    {
      id: 'student-other-classroom',
      classroomId: 'classroom-2',
      firstName: 'Other',
      lastName: 'Student',
      status: StudentStatus.ACTIVE,
    },
  ];
}

function allocationFixture(
  overrides?: Partial<TeacherAppAllocationRecord>,
): TeacherAppAllocationRecord {
  const schoolId = 'school-1';

  return {
    id: 'allocation-1',
    schoolId,
    teacherUserId: 'teacher-1',
    subjectId: 'subject-1',
    classroomId: 'classroom-1',
    termId: 'term-1',
    subject: null,
    classroom: null,
    term: null,
    ...overrides,
  };
}
