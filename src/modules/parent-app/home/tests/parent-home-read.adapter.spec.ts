import {
  ReinforcementTaskStatus,
  StudentStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type { ParentAppContext } from '../../shared/parent-app.types';
import { ParentHomeReadAdapter } from '../infrastructure/parent-home-read.adapter';

describe('ParentHomeReadAdapter', () => {
  it('reads parent identity through scoped Prisma without hand-crafted schoolId', async () => {
    const { adapter, scopedUserMocks, baseUserMocks } = createAdapter();
    scopedUserMocks.findFirst.mockResolvedValue(null);

    await adapter.findParentIdentity(contextFixture());

    const query = scopedUserMocks.findFirst.mock.calls[0][0];
    expect(query.where).toMatchObject({
      id: 'parent-user-1',
      userType: UserType.PARENT,
      status: UserStatus.ACTIVE,
      deletedAt: null,
    });
    expect(query.where).not.toHaveProperty('schoolId');
    expect(baseUserMocks.findFirst).not.toHaveBeenCalled();
  });

  it('reads current-school child hierarchy through scoped Prisma', async () => {
    const { adapter, scopedEnrollmentMocks } = createAdapter();
    scopedEnrollmentMocks.findMany.mockResolvedValue([]);

    await adapter.listChildren(contextFixture());

    const query = scopedEnrollmentMocks.findMany.mock.calls[0][0];
    expect(query.where).toMatchObject({
      id: { in: ['enrollment-1', 'enrollment-2'] },
      studentId: { in: ['student-1', 'student-2'] },
      student: {
        is: {
          status: StudentStatus.ACTIVE,
          deletedAt: null,
        },
      },
    });
    expect(query.where).not.toHaveProperty('schoolId');
    expect(
      query.select.classroom.select.section.select.grade.select.stage,
    ).toBeDefined();
  });

  it('derives pending task counts from reinforcement assignments only', async () => {
    const { adapter, scopedReinforcementAssignmentMocks } = createAdapter();
    scopedReinforcementAssignmentMocks.findMany.mockResolvedValue([
      { studentId: 'student-1' },
      { studentId: 'student-1' },
      { studentId: 'student-2' },
    ]);

    await expect(
      adapter.countPendingTasksForChildren(contextFixture()),
    ).resolves.toEqual([
      { studentId: 'student-1', count: 2 },
      { studentId: 'student-2', count: 1 },
    ]);

    const query = scopedReinforcementAssignmentMocks.findMany.mock.calls[0][0];
    expect(query.where).toMatchObject({
      OR: [
        {
          studentId: 'student-1',
          enrollmentId: 'enrollment-1',
          academicYearId: 'year-1',
          termId: 'term-1',
        },
        {
          studentId: 'student-2',
          enrollmentId: 'enrollment-2',
          academicYearId: 'year-1',
        },
      ],
      status: {
        in: [
          ReinforcementTaskStatus.NOT_COMPLETED,
          ReinforcementTaskStatus.IN_PROGRESS,
          ReinforcementTaskStatus.UNDER_REVIEW,
        ],
      },
      task: {
        is: {
          deletedAt: null,
          status: { not: ReinforcementTaskStatus.CANCELLED },
        },
      },
    });
    expect(query.where).not.toHaveProperty('schoolId');
  });

  it('reads school display without exposing profile logo storage data', async () => {
    const { adapter, scopedSchoolProfileMocks, scopedSchoolMocks } =
      createAdapter();
    scopedSchoolProfileMocks.findFirst.mockResolvedValue({
      schoolName: 'Profile School',
      shortName: 'PS',
    });

    await expect(adapter.findSchoolDisplay(contextFixture())).resolves.toEqual({
      name: 'Profile School',
      logoUrl: null,
    });
    expect(scopedSchoolMocks.findFirst).not.toHaveBeenCalled();
  });

  it('performs no mutations or platform bypass calls', async () => {
    const {
      adapter,
      mutationMocks,
      platformBypass,
      scopedUserMocks,
      scopedEnrollmentMocks,
      scopedSchoolProfileMocks,
      scopedReinforcementAssignmentMocks,
    } = createAdapter();
    scopedUserMocks.findFirst.mockResolvedValue(null);
    scopedEnrollmentMocks.findMany.mockResolvedValue([]);
    scopedSchoolProfileMocks.findFirst.mockResolvedValue(null);
    scopedReinforcementAssignmentMocks.findMany.mockResolvedValue([]);

    await adapter.findParentIdentity(contextFixture());
    await adapter.findSchoolDisplay(contextFixture());
    await adapter.listChildren(contextFixture());
    await adapter.countPendingTasksForChildren(contextFixture());

    for (const mutation of Object.values(mutationMocks)) {
      expect(mutation).not.toHaveBeenCalled();
    }
    expect(platformBypass).not.toHaveBeenCalled();
  });
});

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
      {
        studentId: 'student-2',
        enrollmentId: 'enrollment-2',
        classroomId: 'classroom-2',
        academicYearId: 'year-1',
        termId: null,
      },
    ],
  };
}

function modelMocks(): {
  findFirst: jest.Mock;
  findMany: jest.Mock;
  create: jest.Mock;
  update: jest.Mock;
  updateMany: jest.Mock;
  delete: jest.Mock;
  deleteMany: jest.Mock;
} {
  return {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  };
}

function createAdapter(): {
  adapter: ParentHomeReadAdapter;
  scopedUserMocks: ReturnType<typeof modelMocks>;
  scopedEnrollmentMocks: ReturnType<typeof modelMocks>;
  scopedSchoolProfileMocks: ReturnType<typeof modelMocks>;
  scopedSchoolMocks: ReturnType<typeof modelMocks>;
  scopedReinforcementAssignmentMocks: ReturnType<typeof modelMocks>;
  baseUserMocks: { findFirst: jest.Mock };
  mutationMocks: Record<string, jest.Mock>;
  platformBypass: jest.Mock;
} {
  const scopedUserMocks = modelMocks();
  const scopedEnrollmentMocks = modelMocks();
  const scopedSchoolProfileMocks = modelMocks();
  const scopedSchoolMocks = modelMocks();
  const scopedReinforcementAssignmentMocks = modelMocks();
  const baseUserMocks = { findFirst: jest.fn() };
  const platformBypass = jest.fn();

  const prisma = {
    user: baseUserMocks,
    platformBypass,
    scoped: {
      user: scopedUserMocks,
      enrollment: scopedEnrollmentMocks,
      schoolProfile: scopedSchoolProfileMocks,
      school: scopedSchoolMocks,
      reinforcementAssignment: scopedReinforcementAssignmentMocks,
    },
  } as unknown as PrismaService;

  return {
    adapter: new ParentHomeReadAdapter(prisma),
    scopedUserMocks,
    scopedEnrollmentMocks,
    scopedSchoolProfileMocks,
    scopedSchoolMocks,
    scopedReinforcementAssignmentMocks,
    baseUserMocks,
    mutationMocks: {
      userCreate: scopedUserMocks.create,
      userUpdate: scopedUserMocks.update,
      enrollmentCreate: scopedEnrollmentMocks.create,
      enrollmentUpdate: scopedEnrollmentMocks.update,
      assignmentCreate: scopedReinforcementAssignmentMocks.create,
      assignmentUpdate: scopedReinforcementAssignmentMocks.update,
      assignmentDelete: scopedReinforcementAssignmentMocks.delete,
    },
    platformBypass,
  };
}
