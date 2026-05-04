import { UserStatus, UserType } from '@prisma/client';
import { TeacherAppAllocationReadAdapter } from '../../access/teacher-app-allocation-read.adapter';
import { TeacherAppAccessService } from '../../access/teacher-app-access.service';
import { TeacherAppRequiredTeacherException } from '../../shared/teacher-app.errors';
import type { TeacherAppAllocationRecord } from '../../shared/teacher-app.types';
import { TeacherAppCompositionReadAdapter } from '../../shared/infrastructure/teacher-app-composition-read.adapter';
import { GetTeacherHomeUseCase } from '../application/get-teacher-home.use-case';

const TEACHER_ID = 'teacher-1';

describe('GetTeacherHomeUseCase', () => {
  it('rejects non-teacher actors through the Teacher App access service', async () => {
    const { useCase, accessService } = createUseCase();
    accessService.assertCurrentTeacher.mockImplementation(() => {
      throw new TeacherAppRequiredTeacherException({
        reason: 'actor_not_teacher',
      });
    });

    await expect(useCase.execute()).rejects.toBeInstanceOf(
      TeacherAppRequiredTeacherException,
    );
  });

  it('returns current teacher identity and safe home summary data', async () => {
    const { useCase, allocationReadAdapter, compositionReadAdapter } =
      createUseCase();
    allocationReadAdapter.listAllOwnedAllocations.mockResolvedValue([
      allocationFixture({ id: 'allocation-1', classroomId: 'classroom-1' }),
      allocationFixture({ id: 'allocation-2', classroomId: 'classroom-2' }),
    ]);
    compositionReadAdapter.countActiveStudentsAcrossClassrooms.mockResolvedValue(
      42,
    );
    compositionReadAdapter.countPendingTeacherTaskAssignments.mockResolvedValue(
      3,
    );

    const result = await useCase.execute();

    expect(result.teacher).toEqual({
      id: TEACHER_ID,
      name: 'Test Teacher',
      email: 'teacher@moazez.local',
      userType: 'teacher',
    });
    expect(result.summary).toMatchObject({
      classesCount: 2,
      studentsCount: 42,
      pendingTasksCount: 3,
      unreadMessagesCount: null,
      unreadNotificationsCount: null,
    });
    expect(allocationReadAdapter.listAllOwnedAllocations).toHaveBeenCalledWith(
      TEACHER_ID,
    );
    expect(
      compositionReadAdapter.countActiveStudentsAcrossClassrooms,
    ).toHaveBeenCalledWith(['classroom-1', 'classroom-2']);
    expect(
      compositionReadAdapter.countPendingTeacherTaskAssignments,
    ).toHaveBeenCalledWith({
      teacherUserId: TEACHER_ID,
      classroomIds: ['classroom-1', 'classroom-2'],
    });
  });

  it('marks schedule as unavailable and never fabricates schedule ids', async () => {
    const { useCase } = createUseCase();

    const result = await useCase.execute();
    const json = JSON.stringify(result);

    expect(result.schedule).toEqual({
      available: false,
      reason: 'timetable_not_available',
      items: [],
    });
    expect(result.weeklySchedule).toEqual([]);
    expect(json).not.toContain('scheduleId');
  });

  it('does not expose schoolId and handles teachers without allocations', async () => {
    const { useCase, allocationReadAdapter, compositionReadAdapter } =
      createUseCase();
    allocationReadAdapter.listAllOwnedAllocations.mockResolvedValue([]);
    compositionReadAdapter.countActiveStudentsAcrossClassrooms.mockResolvedValue(
      0,
    );
    compositionReadAdapter.countPendingTeacherTaskAssignments.mockResolvedValue(
      0,
    );

    const result = await useCase.execute();
    const json = JSON.stringify(result);

    expect(result.summary.classesCount).toBe(0);
    expect(result.summary.studentsCount).toBe(0);
    expect(result.summary.pendingTasksCount).toBe(0);
    expect(json).not.toContain('schoolId');
  });

  it('does not perform mutations while composing home data', async () => {
    const mutationMocks = {
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    };
    const { useCase } = createUseCase(mutationMocks);

    await useCase.execute();

    expect(mutationMocks.create).not.toHaveBeenCalled();
    expect(mutationMocks.update).not.toHaveBeenCalled();
    expect(mutationMocks.updateMany).not.toHaveBeenCalled();
    expect(mutationMocks.delete).not.toHaveBeenCalled();
    expect(mutationMocks.deleteMany).not.toHaveBeenCalled();
  });
});

function createUseCase(extraCompositionMethods?: Record<string, jest.Mock>): {
  useCase: GetTeacherHomeUseCase;
  accessService: jest.Mocked<TeacherAppAccessService>;
  allocationReadAdapter: jest.Mocked<TeacherAppAllocationReadAdapter>;
  compositionReadAdapter: jest.Mocked<TeacherAppCompositionReadAdapter>;
} {
  const accessService = {
    assertCurrentTeacher: jest.fn(() => ({
      teacherUserId: TEACHER_ID,
      schoolId: 'school-1',
      organizationId: 'org-1',
      membershipId: 'membership-1',
      roleId: 'role-1',
      permissions: [],
    })),
  } as unknown as jest.Mocked<TeacherAppAccessService>;
  const allocationReadAdapter = {
    listAllOwnedAllocations: jest.fn(() =>
      Promise.resolve([allocationFixture()]),
    ),
  } as unknown as jest.Mocked<TeacherAppAllocationReadAdapter>;
  const compositionReadAdapter = {
    findTeacherIdentity: jest.fn(() =>
      Promise.resolve({
        id: TEACHER_ID,
        email: 'teacher@moazez.local',
        firstName: 'Test',
        lastName: 'Teacher',
        userType: UserType.TEACHER,
        status: UserStatus.ACTIVE,
      }),
    ),
    findSchoolSummary: jest.fn(() =>
      Promise.resolve({ name: 'Moazez Academy', logoUrl: null }),
    ),
    countActiveStudentsAcrossClassrooms: jest.fn(() => Promise.resolve(12)),
    countPendingTeacherTaskAssignments: jest.fn(() => Promise.resolve(1)),
    ...extraCompositionMethods,
  } as unknown as jest.Mocked<TeacherAppCompositionReadAdapter>;

  return {
    useCase: new GetTeacherHomeUseCase(
      accessService,
      allocationReadAdapter,
      compositionReadAdapter,
    ),
    accessService,
    allocationReadAdapter,
    compositionReadAdapter,
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
