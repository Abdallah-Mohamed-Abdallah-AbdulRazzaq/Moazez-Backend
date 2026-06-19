import { StudentStatus, UserStatus, UserType } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type { ParentAppContext } from '../../shared/parent-app.types';
import { ParentProfileReadAdapter } from '../infrastructure/parent-profile-read.adapter';

describe('ParentProfileReadAdapter', () => {
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

  it('reads only current parent guardian summaries through scoped Prisma', async () => {
    const { adapter, scopedGuardianMocks } = createAdapter();
    scopedGuardianMocks.findMany.mockResolvedValue([]);

    await adapter.listGuardians(contextFixture());

    const query = scopedGuardianMocks.findMany.mock.calls[0][0];
    expect(query.where).toMatchObject({
      id: { in: ['guardian-1', 'guardian-2'] },
      userId: 'parent-user-1',
      deletedAt: null,
    });
    expect(query.where).not.toHaveProperty('schoolId');
    expect(query.select).toEqual({
      relation: true,
      isPrimary: true,
    });
  });

  it('reads current-school child summaries through scoped Prisma', async () => {
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
      scopedGuardianMocks,
      scopedEnrollmentMocks,
      scopedSchoolProfileMocks,
    } = createAdapter();
    scopedUserMocks.findFirst.mockResolvedValue(null);
    scopedGuardianMocks.findMany.mockResolvedValue([]);
    scopedEnrollmentMocks.findMany.mockResolvedValue([]);
    scopedSchoolProfileMocks.findFirst.mockResolvedValue(null);

    await adapter.findParentIdentity(contextFixture());
    await adapter.listGuardians(contextFixture());
    await adapter.listChildren(contextFixture());
    await adapter.findSchoolDisplay(contextFixture());

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
    guardianIds: ['guardian-1', 'guardian-2'],
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
  adapter: ParentProfileReadAdapter;
  scopedUserMocks: ReturnType<typeof modelMocks>;
  scopedGuardianMocks: ReturnType<typeof modelMocks>;
  scopedEnrollmentMocks: ReturnType<typeof modelMocks>;
  scopedSchoolProfileMocks: ReturnType<typeof modelMocks>;
  scopedSchoolMocks: ReturnType<typeof modelMocks>;
  baseUserMocks: { findFirst: jest.Mock };
  mutationMocks: Record<string, jest.Mock>;
  platformBypass: jest.Mock;
} {
  const scopedUserMocks = modelMocks();
  const scopedGuardianMocks = modelMocks();
  const scopedEnrollmentMocks = modelMocks();
  const scopedSchoolProfileMocks = modelMocks();
  const scopedSchoolMocks = modelMocks();
  const baseUserMocks = { findFirst: jest.fn() };
  const platformBypass = jest.fn();

  const prisma = {
    user: baseUserMocks,
    platformBypass,
    scoped: {
      user: scopedUserMocks,
      guardian: scopedGuardianMocks,
      enrollment: scopedEnrollmentMocks,
      schoolProfile: scopedSchoolProfileMocks,
      school: scopedSchoolMocks,
    },
  } as unknown as PrismaService;

  return {
    adapter: new ParentProfileReadAdapter(prisma),
    scopedUserMocks,
    scopedGuardianMocks,
    scopedEnrollmentMocks,
    scopedSchoolProfileMocks,
    scopedSchoolMocks,
    baseUserMocks,
    mutationMocks: {
      userCreate: scopedUserMocks.create,
      userUpdate: scopedUserMocks.update,
      guardianCreate: scopedGuardianMocks.create,
      guardianUpdate: scopedGuardianMocks.update,
      guardianDelete: scopedGuardianMocks.delete,
      enrollmentCreate: scopedEnrollmentMocks.create,
      enrollmentUpdate: scopedEnrollmentMocks.update,
      enrollmentDelete: scopedEnrollmentMocks.delete,
    },
    platformBypass,
  };
}
