import { StudentStatus, UserStatus, UserType } from '@prisma/client';
import { ParentAppAccessService } from '../../access/parent-app-access.service';
import { ParentAppRequiredParentException } from '../../shared/parent-app-errors';
import type { ParentAppContext } from '../../shared/parent-app.types';
import { GetParentHomeUseCase } from '../application/get-parent-home.use-case';
import {
  ParentHomeReadAdapter,
  type ParentHomeChildRecord,
  type ParentHomeIdentityRecord,
} from '../infrastructure/parent-home-read.adapter';

describe('GetParentHomeUseCase', () => {
  it('rejects non-parent actors through ParentAppAccessService', async () => {
    const { useCase, accessService, readAdapter } = createUseCase();
    accessService.getParentAppContext.mockRejectedValue(
      new ParentAppRequiredParentException({ reason: 'actor_not_parent' }),
    );

    await expect(useCase.execute()).rejects.toMatchObject({
      code: 'parent_app.actor.required_parent',
    });
    expect(readAdapter.findParentIdentity).not.toHaveBeenCalled();
  });

  it('returns current parent identity and current-school children only', async () => {
    const { useCase, accessService, readAdapter } =
      createUseCaseWithValidAccess();
    accessService.getParentAppContext.mockResolvedValue({
      ...contextFixture(),
      children: [
        contextFixture().children[0],
        {
          studentId: 'student-2',
          enrollmentId: 'enrollment-2',
          classroomId: 'classroom-2',
          academicYearId: 'year-1',
          termId: 'term-1',
        },
      ],
    });
    readAdapter.findParentIdentity.mockResolvedValue(parentIdentityFixture());
    readAdapter.findSchoolDisplay.mockResolvedValue({
      name: 'Moazez Demo School',
      logoUrl: null,
    });
    readAdapter.listChildren.mockResolvedValue([
      childFixture(),
      childFixture({
        id: 'enrollment-2',
        studentId: 'student-2',
        student: {
          id: 'student-2',
          firstName: 'Omar',
          lastName: 'Child',
          status: StudentStatus.ACTIVE,
        },
      }),
    ]);
    readAdapter.countPendingTasksForChildren.mockResolvedValue([
      { studentId: 'student-1', count: 2 },
    ]);

    const result = await useCase.execute();

    expect(result.parent).toEqual({
      userId: 'parent-user-1',
      displayName: 'Mona Parent',
      email: 'parent@example.test',
      phone: null,
    });
    expect(result.children).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          studentId: 'student-1',
          displayName: 'Sara Child',
          enrollmentId: 'enrollment-1',
        }),
        expect.objectContaining({
          studentId: 'student-2',
          displayName: 'Omar Child',
          enrollmentId: 'enrollment-2',
        }),
      ]),
    );
    expect(JSON.stringify(result)).not.toContain('cross-school-student');
    expect(result.summaries).toMatchObject({
      childrenCount: 2,
      pendingTasksCount: 2,
      unreadMessagesCount: null,
      announcementsCount: null,
    });
  });

  it('returns schedule unavailable with timetable_not_available', async () => {
    const { useCase, readAdapter } = createUseCaseWithValidAccess();
    readAdapter.findParentIdentity.mockResolvedValue(parentIdentityFixture());
    readAdapter.findSchoolDisplay.mockResolvedValue({
      name: 'Moazez Demo School',
      logoUrl: null,
    });
    readAdapter.listChildren.mockResolvedValue([childFixture()]);
    readAdapter.countPendingTasksForChildren.mockResolvedValue([]);

    const result = await useCase.execute();

    expect(result.schedule).toEqual({
      available: false,
      reason: 'timetable_not_available',
    });
    expect(result.children[0].summaries).toMatchObject({
      attendanceToday: null,
      gradesAverage: null,
      behaviorPoints: null,
      pendingTasksCount: 0,
      unreadMessagesCount: null,
    });
  });

  it('does not expose tenant, schedule, medical, document, internal, or security fields', async () => {
    const { useCase, readAdapter } = createUseCaseWithValidAccess();
    readAdapter.findParentIdentity.mockResolvedValue(parentIdentityFixture());
    readAdapter.findSchoolDisplay.mockResolvedValue({
      name: 'Moazez Demo School',
      logoUrl: null,
    });
    readAdapter.listChildren.mockResolvedValue([childFixture()]);
    readAdapter.countPendingTasksForChildren.mockResolvedValue([]);

    const serialized = JSON.stringify(await useCase.execute());

    for (const forbidden of [
      'schoolId',
      'organizationId',
      'scheduleId',
      'medical',
      'document',
      'internalNote',
      'password',
      'session',
      'token',
      'applicationId',
      'bucket',
      'objectKey',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('does not mutate data', async () => {
    const mutationMocks = {
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    };
    const { useCase, readAdapter } =
      createUseCaseWithValidAccess(mutationMocks);
    readAdapter.findParentIdentity.mockResolvedValue(parentIdentityFixture());
    readAdapter.findSchoolDisplay.mockResolvedValue({
      name: 'Moazez Demo School',
      logoUrl: null,
    });
    readAdapter.listChildren.mockResolvedValue([childFixture()]);
    readAdapter.countPendingTasksForChildren.mockResolvedValue([]);

    await useCase.execute();

    for (const mutation of Object.values(mutationMocks)) {
      expect(mutation).not.toHaveBeenCalled();
    }
  });
});

function createUseCase(extraAdapterMethods?: Record<string, jest.Mock>): {
  useCase: GetParentHomeUseCase;
  accessService: jest.Mocked<ParentAppAccessService>;
  readAdapter: jest.Mocked<ParentHomeReadAdapter>;
} {
  const accessService = {
    getParentAppContext: jest.fn(),
  } as unknown as jest.Mocked<ParentAppAccessService>;
  const readAdapter = {
    findParentIdentity: jest.fn(),
    findSchoolDisplay: jest.fn(),
    listChildren: jest.fn(),
    countPendingTasksForChildren: jest.fn(),
    ...extraAdapterMethods,
  } as unknown as jest.Mocked<ParentHomeReadAdapter>;

  return {
    useCase: new GetParentHomeUseCase(accessService, readAdapter),
    accessService,
    readAdapter,
  };
}

function createUseCaseWithValidAccess(
  extraAdapterMethods?: Record<string, jest.Mock>,
): {
  useCase: GetParentHomeUseCase;
  accessService: jest.Mocked<ParentAppAccessService>;
  readAdapter: jest.Mocked<ParentHomeReadAdapter>;
} {
  const created = createUseCase(extraAdapterMethods);
  created.accessService.getParentAppContext.mockResolvedValue(contextFixture());

  return created;
}

function contextFixture(): ParentAppContext {
  return {
    parentUserId: 'parent-user-1',
    schoolId: 'school-1',
    organizationId: 'org-1',
    membershipId: 'membership-1',
    roleId: 'role-1',
    permissions: ['students.records.view'],
    guardianIds: ['guardian-1'],
    children: [
      {
        studentId: 'student-1',
        enrollmentId: 'enrollment-1',
        classroomId: 'classroom-1',
        academicYearId: 'year-1',
        termId: 'term-1',
      },
    ],
  };
}

function parentIdentityFixture(): ParentHomeIdentityRecord {
  return {
    id: 'parent-user-1',
    email: 'parent@example.test',
    phone: null,
    firstName: 'Mona',
    lastName: 'Parent',
    userType: UserType.PARENT,
    status: UserStatus.ACTIVE,
    deletedAt: null,
  };
}

function childFixture(
  overrides?: Partial<ParentHomeChildRecord>,
): ParentHomeChildRecord {
  return {
    id: 'enrollment-1',
    studentId: 'student-1',
    academicYearId: 'year-1',
    termId: 'term-1',
    student: {
      id: 'student-1',
      firstName: 'Sara',
      lastName: 'Child',
      status: StudentStatus.ACTIVE,
    },
    classroom: {
      id: 'classroom-1',
      nameAr: 'Grade 4A AR',
      nameEn: 'Grade 4A',
      section: {
        id: 'section-1',
        nameAr: 'Section A AR',
        nameEn: 'Section A',
        grade: {
          id: 'grade-1',
          nameAr: 'Grade 4 AR',
          nameEn: 'Grade 4',
          stage: {
            id: 'stage-1',
            nameAr: 'Primary AR',
            nameEn: 'Primary',
          },
        },
      },
    },
    ...overrides,
  };
}
