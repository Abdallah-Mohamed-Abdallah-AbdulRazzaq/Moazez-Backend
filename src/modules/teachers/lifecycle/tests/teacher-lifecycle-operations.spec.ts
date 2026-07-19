import {
  MembershipStatus,
  TeacherEmploymentStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import { readFileSync } from 'node:fs';
import { revokeTeacherLifecycleUserSessionsInTransaction } from '../../../iam/auth/infrastructure/teacher-lifecycle-session.operations';
import {
  findTeacherLifecycleCurrentSchoolMembership,
  setTeacherLifecycleMembershipSuspended,
} from '../../../settings/users/infrastructure/teacher-lifecycle-membership.operations';
import {
  findTeacherLifecycleIdentityConflicts,
  projectTeacherLifecycleUserState,
  setTeacherLifecycleUserStatus,
  updateTeacherLifecycleDisplayNames,
  updateTeacherLifecycleIdentityFields,
} from '../../../settings/users/infrastructure/teacher-lifecycle-user.operations';
import {
  TeacherProfileLifecycleInvariantError,
  createTeacherProfileInTransaction,
  findArchivedTeacherProfileByIdInTransaction,
  findExactSchoolUserTeacherProfileFootprintInTransaction,
  listLiveTeacherProfileFootprintsForUserInTransaction,
  restoreArchivedTeacherProfileInTransaction,
  updateTeacherProfileInTransaction,
} from '../../profile/infrastructure/teacher-profile-lifecycle.operations';
import type { TeacherLifecycleMembershipState } from '../application/teacher-lifecycle-unit-of-work';
import {
  isExactTeacherMembership,
  isOperationalTeacherMembership,
} from '../domain/teacher-membership-state';

const IDS = {
  school: '20000000-0000-4000-8000-000000000001',
  otherSchool: '20000000-0000-4000-8000-000000000002',
  user: '20000000-0000-4000-8000-000000000003',
  role: '20000000-0000-4000-8000-000000000004',
  membership: '20000000-0000-4000-8000-000000000005',
  profile: '20000000-0000-4000-8000-000000000006',
};

function membership(
  overrides: Partial<TeacherLifecycleMembershipState> = {},
): TeacherLifecycleMembershipState {
  return {
    id: IDS.membership,
    userId: IDS.user,
    organizationId: '20000000-0000-4000-8000-000000000007',
    schoolId: IDS.school,
    roleId: IDS.role,
    userType: UserType.TEACHER,
    status: MembershipStatus.ACTIVE,
    startedAt: new Date('2026-01-01T00:00:00.000Z'),
    endedAt: null,
    deletedAt: null,
    role: {
      id: IDS.role,
      key: 'teacher',
      schoolId: null,
      deletedAt: null,
    },
    user: { userType: UserType.TEACHER, deletedAt: null },
    ...overrides,
  };
}

function rawUser(passwordHash: string | null = 'private-hash') {
  return {
    id: IDS.user,
    email: 'teacher@example.test',
    username: 'teacher',
    contactEmail: null,
    phone: null,
    firstName: 'Display',
    lastName: 'Projection',
    userType: UserType.TEACHER,
    status: UserStatus.DISABLED,
    passwordHash,
    mustChangePassword: true,
    passwordProvisionedAt: new Date('2026-01-01T00:00:00.000Z'),
    passwordChangedAt: null,
    credentialVersion: 2,
    deletedAt: null,
  };
}

describe('Teacher lifecycle User, Membership, Profile, and Session operations', () => {
  it('reduces passwordHash to a boolean credential projection at the boundary', () => {
    const projected = projectTeacherLifecycleUserState(rawUser());
    expect(projected.credential).toEqual({
      hasPassword: true,
      status: 'temporary_or_must_change',
      mustChangePassword: true,
      passwordProvisionedAt: new Date('2026-01-01T00:00:00.000Z'),
      passwordChangedAt: null,
      credentialVersion: 2,
    });
    expect(projected).not.toHaveProperty('passwordHash');
    expect(JSON.stringify(projected)).not.toContain('private-hash');
  });

  it('updates only owned display or account-state fields through explicit methods', async () => {
    const update = jest.fn().mockResolvedValue(rawUser());
    const transaction = { user: { update } } as never;

    await updateTeacherLifecycleDisplayNames(transaction, {
      userId: IDS.user,
      firstName: 'Approved',
      lastName: 'Display',
    });
    await setTeacherLifecycleUserStatus(
      transaction,
      IDS.user,
      UserStatus.DISABLED,
    );

    expect(update.mock.calls[0][0].data).toEqual({
      firstName: 'Approved',
      lastName: 'Display',
    });
    expect(update.mock.calls[1][0].data).toEqual({
      status: UserStatus.DISABLED,
    });
  });

  it('updates only managed IAM identity fields and returns no password hash', async () => {
    const update = jest.fn().mockResolvedValue(rawUser());
    const transaction = { user: { update } } as never;
    const result = await updateTeacherLifecycleIdentityFields(transaction, {
      userId: IDS.user,
      fields: {
        loginEmail: 'managed@example.test',
        username: 'managed',
        contactEmail: null,
        phone: '+201001234567',
      },
    });
    expect(update.mock.calls[0][0].data).toEqual({
      email: 'managed@example.test',
      username: 'managed',
      contactEmail: null,
      phone: '+201001234567',
    });
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('reduces identity conflict reads to safe fixed field keys', async () => {
    const findMany = jest
      .fn()
      .mockResolvedValue([
        { email: 'managed@example.test', phone: '+201001234567' },
      ]);
    const transaction = { user: { findMany } } as never;
    await expect(
      findTeacherLifecycleIdentityConflicts(transaction, {
        userId: IDS.user,
        fields: {
          loginEmail: 'managed@example.test',
          username: 'managed',
          phone: '+201001234567',
        },
      }),
    ).resolves.toEqual(['phone', 'username']);
    expect(findMany.mock.calls[0][0]).toMatchObject({
      orderBy: { id: 'asc' },
      take: 2,
      select: { email: true, phone: true },
    });
  });

  it('validates global and same-school Teacher Roles exactly', () => {
    expect(isExactTeacherMembership(membership())).toBe(true);
    expect(
      isExactTeacherMembership(
        membership({
          role: {
            id: IDS.role,
            key: 'teacher',
            schoolId: IDS.school,
            deletedAt: null,
          },
        }),
      ),
    ).toBe(true);
    expect(
      isExactTeacherMembership(
        membership({
          role: {
            id: IDS.role,
            key: 'teacher',
            schoolId: IDS.otherSchool,
            deletedAt: null,
          },
        }),
      ),
    ).toBe(false);
    expect(
      isExactTeacherMembership(
        membership({
          role: {
            id: IDS.role,
            key: 'teacher',
            schoolId: null,
            deletedAt: new Date(),
          },
        }),
      ),
    ).toBe(false);
  });

  it('does not treat ended, deleted, mismatched, or non-active Memberships as operational', () => {
    expect(isOperationalTeacherMembership(membership())).toBe(true);
    expect(
      isOperationalTeacherMembership(membership({ endedAt: new Date() })),
    ).toBe(false);
    expect(
      isOperationalTeacherMembership(membership({ deletedAt: new Date() })),
    ).toBe(false);
    expect(
      isOperationalTeacherMembership(
        membership({ status: MembershipStatus.SUSPENDED }),
      ),
    ).toBe(false);
    expect(
      isOperationalTeacherMembership(
        membership({
          user: { userType: UserType.SCHOOL_USER, deletedAt: null },
        }),
      ),
    ).toBe(false);
  });

  it('reads current-school Membership state explicitly and keeps rehire suspension unended', async () => {
    const findFirst = jest.fn().mockResolvedValue(membership());
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const findFirstOrThrow = jest
      .fn()
      .mockResolvedValue(membership({ status: MembershipStatus.SUSPENDED }));
    const transaction = {
      membership: { findFirst, updateMany, findFirstOrThrow },
    } as never;

    await findTeacherLifecycleCurrentSchoolMembership(transaction, {
      schoolId: IDS.school,
      userId: IDS.user,
    });
    await setTeacherLifecycleMembershipSuspended(transaction, {
      membershipId: IDS.membership,
      schoolId: IDS.school,
    });

    expect(findFirst.mock.calls[0][0]).toMatchObject({
      where: { schoolId: IDS.school, userId: IDS.user, deletedAt: null },
      orderBy: [{ startedAt: 'desc' }, { id: 'asc' }],
    });
    expect(updateMany.mock.calls[0][0].data).toEqual({
      status: MembershipStatus.SUSPENDED,
      endedAt: null,
    });
  });

  it('uses deterministic archived and uniqueness Profile footprints', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const findUnique = jest.fn().mockResolvedValue(null);
    const findMany = jest.fn().mockResolvedValue([]);
    const transaction = {
      teacherProfile: { findFirst, findUnique, findMany },
    } as never;

    await findArchivedTeacherProfileByIdInTransaction(transaction, {
      schoolId: IDS.school,
      profileId: IDS.profile,
    });
    await findExactSchoolUserTeacherProfileFootprintInTransaction(transaction, {
      schoolId: IDS.school,
      userId: IDS.user,
    });
    await listLiveTeacherProfileFootprintsForUserInTransaction(
      transaction,
      IDS.user,
    );

    expect(findFirst.mock.calls[0][0].where).toEqual({
      id: IDS.profile,
      schoolId: IDS.school,
      deletedAt: { not: null },
    });
    expect(findUnique.mock.calls[0][0].where).toEqual({
      schoolId_userId: { schoolId: IDS.school, userId: IDS.user },
    });
    expect(findMany.mock.calls[0][0]).toMatchObject({
      where: { userId: IDS.user, deletedAt: null },
      orderBy: { id: 'asc' },
      select: { id: true, schoolId: true, userId: true },
    });
  });

  it('restores only the exact archived same-school Profile and never mutates schoolId', async () => {
    const findUnique = jest.fn().mockResolvedValue({
      id: IDS.profile,
      deletedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    const findFirst = jest.fn().mockResolvedValue(null);
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const findFirstOrThrow = jest.fn().mockResolvedValue({ id: IDS.profile });
    const transaction = {
      teacherProfile: {
        findUnique,
        findFirst,
        updateMany,
        findFirstOrThrow,
      },
    } as never;

    await restoreArchivedTeacherProfileInTransaction(transaction, {
      schoolId: IDS.school,
      profileId: IDS.profile,
      userId: IDS.user,
      fields: { department: 'Managed' },
    });

    expect(updateMany.mock.calls[0][0].where).toEqual({
      id: IDS.profile,
      schoolId: IDS.school,
      userId: IDS.user,
      deletedAt: { not: null },
    });
    expect(updateMany.mock.calls[0][0].data).toEqual({
      department: 'Managed',
      deletedAt: null,
    });
    expect(updateMany.mock.calls[0][0].data).not.toHaveProperty('schoolId');
    expect(updateMany.mock.calls[0][0].data).not.toHaveProperty('userId');
  });

  it.each([
    {
      label: 'same-school historical footprint',
      exactFootprint: { id: IDS.profile },
      liveFootprint: null,
      reasonCode: 'same_school_profile_must_be_restored',
    },
    {
      label: 'global live footprint',
      exactFootprint: null,
      liveFootprint: { id: IDS.profile },
      reasonCode: 'live_teacher_profile_conflict',
    },
  ])('rejects create for a $label', async (scenario) => {
    const create = jest.fn();
    const transaction = {
      teacherProfile: {
        findUnique: jest.fn().mockResolvedValue(scenario.exactFootprint),
        findFirst: jest.fn().mockResolvedValue(scenario.liveFootprint),
        create,
      },
    } as never;

    await expect(
      createTeacherProfileInTransaction(transaction, {
        schoolId: IDS.school,
        userId: IDS.user,
        employmentStatus: TeacherEmploymentStatus.INACTIVE,
        fields: {},
      }),
    ).rejects.toMatchObject<TeacherProfileLifecycleInvariantError>({
      reasonCode: scenario.reasonCode,
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('updates approved Profile fields without school, User, avatar, or assignment mutation', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const findFirstOrThrow = jest.fn().mockResolvedValue({ id: IDS.profile });
    const transaction = {
      teacherProfile: { updateMany, findFirstOrThrow },
    } as never;

    await updateTeacherProfileInTransaction(transaction, {
      schoolId: IDS.school,
      profileId: IDS.profile,
      fields: { teacherCode: 'T01', workingDays: ['SUNDAY'] },
    });

    expect(updateMany.mock.calls[0][0].data).toEqual({
      teacherCode: 'T01',
      workingDays: ['SUNDAY'],
    });
    expect(updateMany.mock.calls[0][0].data).not.toHaveProperty('schoolId');
    expect(updateMany.mock.calls[0][0].data).not.toHaveProperty('userId');
    expect(updateMany.mock.calls[0][0].data).not.toHaveProperty('avatarFileId');
  });

  it('revokes only currently unrevoked Sessions and returns an aggregate count', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 3 });
    const revokedAt = new Date('2026-07-19T00:00:00.000Z');

    await expect(
      revokeTeacherLifecycleUserSessionsInTransaction(
        { session: { updateMany } } as never,
        IDS.user,
        revokedAt,
      ),
    ).resolves.toBe(3);
    expect(updateMany).toHaveBeenCalledWith({
      where: { userId: IDS.user, revokedAt: null },
      data: { revokedAt },
    });
    expect(JSON.stringify(updateMany.mock.calls)).not.toContain('sessionId');
    expect(JSON.stringify(updateMany.mock.calls)).not.toContain('token');
  });

  it('requires an explicit transaction parameter and contains no base-client fallback', () => {
    for (const modulePath of [
      '../../../settings/users/infrastructure/teacher-lifecycle-user.operations',
      '../../../settings/users/infrastructure/teacher-lifecycle-membership.operations',
      '../../profile/infrastructure/teacher-profile-lifecycle.operations',
      '../../../iam/auth/infrastructure/teacher-lifecycle-session.operations',
    ]) {
      const source = readFileSync(require.resolve(modulePath), 'utf8');
      expect(source).not.toContain('PrismaService');
      expect(source).not.toContain('transaction?:');
      expect(source).not.toMatch(
        /prisma\.(user|membership|teacherProfile|session)/u,
      );
    }
  });
});
