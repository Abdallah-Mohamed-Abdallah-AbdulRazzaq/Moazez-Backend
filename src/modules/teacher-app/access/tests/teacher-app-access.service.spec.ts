import { UserType } from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../../common/context/request-context';
import {
  TeacherAppAllocationNotFoundException,
  TeacherAppRequiredTeacherException,
} from '../../shared/teacher-app.errors';
import type { TeacherAppAllocationRecord } from '../../shared/teacher-app.types';
import { toTeacherAppClassId } from '../teacher-app-access.domain';
import { TeacherAppAccessService } from '../teacher-app-access.service';
import { TeacherAppAllocationReadAdapter } from '../teacher-app-allocation-read.adapter';

const TEACHER_ID = 'teacher-1';
const SCHOOL_ID = 'school-1';
const ORGANIZATION_ID = 'org-1';

describe('TeacherAppAccessService', () => {
  it('rejects a non-teacher actor', async () => {
    const { service } = createService();

    await expect(
      withRequestContext(
        { actorUserType: UserType.SCHOOL_USER },
        () => service.getTeacherAppContext(),
      ),
    ).rejects.toBeInstanceOf(TeacherAppRequiredTeacherException);
  });

  it('rejects missing active membership or school context', async () => {
    const { service } = createService();

    await expect(
      withRequestContext({ activeMembership: null }, () =>
        service.getTeacherAppContext(),
      ),
    ).rejects.toBeInstanceOf(TeacherAppRequiredTeacherException);

    await expect(
      withRequestContext(
        {
          activeMembership: {
            membershipId: 'membership-1',
            organizationId: ORGANIZATION_ID,
            schoolId: null,
            roleId: 'role-1',
            permissions: [],
          },
        },
        () => service.getTeacherAppContext(),
      ),
    ).rejects.toBeInstanceOf(TeacherAppRequiredTeacherException);
  });

  it('returns compact Teacher App context for a valid teacher', async () => {
    const { service } = createService();

    const result = await withRequestContext({}, () =>
      service.getTeacherAppContext(),
    );

    expect(result).toEqual({
      teacherUserId: TEACHER_ID,
      schoolId: SCHOOL_ID,
      organizationId: ORGANIZATION_ID,
      membershipId: 'membership-1',
      roleId: 'role-1',
      permissions: ['teacher.classes.view', 'reinforcement.tasks.view'],
    });
    expect(result).not.toHaveProperty('scheduleId');
  });

  it('uses TeacherSubjectAllocation.id as the app-facing classId', async () => {
    const { service, adapter } = createService();
    adapter.findOwnedAllocationById.mockResolvedValue(
      allocationFixture({ id: 'allocation-class-1' }),
    );

    const result = await withRequestContext({}, () =>
      service.assertTeacherOwnsAllocation('allocation-class-1'),
    );

    expect(adapter.findOwnedAllocationById).toHaveBeenCalledWith({
      allocationId: 'allocation-class-1',
      teacherUserId: TEACHER_ID,
    });
    expect(toTeacherAppClassId(result)).toBe('allocation-class-1');
  });

  it('passes owned allocations', async () => {
    const { service, adapter } = createService();
    adapter.findOwnedAllocationById.mockResolvedValue(allocationFixture());

    await expect(
      withRequestContext({}, () =>
        service.assertTeacherOwnsAllocation('allocation-1'),
      ),
    ).resolves.toMatchObject({
      id: 'allocation-1',
      teacherUserId: TEACHER_ID,
      schoolId: SCHOOL_ID,
    });
  });

  it('rejects another teacher allocation in the same school without exposing it', async () => {
    const { service, adapter } = createService();
    adapter.findOwnedAllocationById.mockResolvedValue(null);

    await expect(
      withRequestContext({}, () =>
        service.assertTeacherOwnsAllocation('other-teacher-allocation'),
      ),
    ).rejects.toMatchObject({
      code: 'teacher_app.allocation.not_found',
    });
    expect(adapter.findOwnedAllocationById).toHaveBeenCalledWith({
      allocationId: 'other-teacher-allocation',
      teacherUserId: TEACHER_ID,
    });
  });

  it('rejects cross-school guessed allocation ids as not found', async () => {
    const { service, adapter } = createService();
    adapter.findOwnedAllocationById.mockResolvedValue(null);

    await expect(
      withRequestContext({}, () =>
        service.assertTeacherOwnsAllocation('cross-school-allocation'),
      ),
    ).rejects.toBeInstanceOf(TeacherAppAllocationNotFoundException);
  });

  it('lists only allocation ids returned for the current teacher', async () => {
    const { service, adapter } = createService();
    adapter.listOwnedAllocationIds.mockResolvedValue([
      'allocation-1',
      'allocation-2',
    ]);

    const result = await withRequestContext({}, () =>
      service.listOwnedTeacherAllocationIds(),
    );

    expect(result).toEqual(['allocation-1', 'allocation-2']);
    expect(adapter.listOwnedAllocationIds).toHaveBeenCalledWith(TEACHER_ID);
  });

  it('does not introduce scheduleId behavior or perform mutations', async () => {
    const mutationMocks = {
      createAllocation: jest.fn(),
      updateAllocation: jest.fn(),
      deleteAllocation: jest.fn(),
    };
    const { service, adapter } = createService(mutationMocks);
    adapter.findOwnedAllocationById.mockResolvedValue(allocationFixture());
    adapter.listOwnedAllocationIds.mockResolvedValue(['allocation-1']);

    await withRequestContext({}, () =>
      service.assertTeacherOwnsAllocation('allocation-1'),
    );
    await withRequestContext({}, () => service.listOwnedTeacherAllocationIds());

    const context = await withRequestContext({}, () =>
      service.getTeacherAppContext(),
    );
    expect(context).not.toHaveProperty('scheduleId');
    expect(mutationMocks.createAllocation).not.toHaveBeenCalled();
    expect(mutationMocks.updateAllocation).not.toHaveBeenCalled();
    expect(mutationMocks.deleteAllocation).not.toHaveBeenCalled();
  });
});

type RequestContextOptions = {
  actorUserType?: UserType;
  activeMembership?:
    | {
        membershipId: string;
        organizationId: string;
        schoolId: string | null;
        roleId: string;
        permissions: string[];
      }
    | null;
};

async function withRequestContext<T>(
  options: RequestContextOptions,
  fn: () => T | Promise<T>,
): Promise<T> {
  return runWithRequestContext(createRequestContext(), async () => {
    setActor({
      id: TEACHER_ID,
      userType: options.actorUserType ?? UserType.TEACHER,
    });

    if (options.activeMembership !== null) {
      setActiveMembership(
        options.activeMembership ?? {
          membershipId: 'membership-1',
          organizationId: ORGANIZATION_ID,
          schoolId: SCHOOL_ID,
          roleId: 'role-1',
          permissions: ['teacher.classes.view', 'reinforcement.tasks.view'],
        },
      );
    }

    return fn();
  });
}

function createService(
  extraAdapterMethods?: Record<string, jest.Mock>,
): {
  service: TeacherAppAccessService;
  adapter: jest.Mocked<TeacherAppAllocationReadAdapter>;
} {
  const adapter = {
    findOwnedAllocationById: jest.fn(),
    listOwnedAllocationIds: jest.fn(),
    ...extraAdapterMethods,
  } as unknown as jest.Mocked<TeacherAppAllocationReadAdapter>;

  return {
    service: new TeacherAppAccessService(adapter),
    adapter,
  };
}

function allocationFixture(
  overrides?: Partial<TeacherAppAllocationRecord>,
): TeacherAppAllocationRecord {
  const schoolId = overrides?.schoolId ?? SCHOOL_ID;

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
