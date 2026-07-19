import {
  AuditOutcome,
  MembershipStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../../common/context/request-context';
import type { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import type { TeacherAccountDisableCoordinator } from '../../../teachers/lifecycle/application/teacher-account-disable.coordinator';
import type { TeacherSettingsBypassService } from '../application/teacher-settings-bypass.service';
import { UpdateUserStatusUseCase } from '../application/update-user-status.use-case';
import type {
  ScopedMembershipRecord,
  UsersRepository,
} from '../infrastructure/users.repository';

const IDS = {
  actor: '56000000-0000-4000-8000-000000000001',
  organization: '56000000-0000-4000-8000-000000000002',
  school: '56000000-0000-4000-8000-000000000003',
  actorMembership: '56000000-0000-4000-8000-000000000004',
  targetMembership: '56000000-0000-4000-8000-000000000005',
  targetUser: '56000000-0000-4000-8000-000000000006',
  role: '56000000-0000-4000-8000-000000000007',
};

function inSettingsScope<T>(callback: () => T): T {
  const context = createRequestContext('settings-status-test');
  return runWithRequestContext(context, () => {
    setActor({ id: IDS.actor, userType: UserType.SCHOOL_USER });
    setActiveMembership({
      membershipId: IDS.actorMembership,
      organizationId: IDS.organization,
      schoolId: IDS.school,
      roleId: IDS.role,
      permissions: ['settings.users.manage'],
    });
    return callback();
  });
}

function membership(userType = UserType.SCHOOL_USER): ScopedMembershipRecord {
  const now = new Date('2026-07-19T00:00:00.000Z');
  return {
    id: IDS.targetMembership,
    userId: IDS.targetUser,
    organizationId: IDS.organization,
    schoolId: IDS.school,
    roleId: IDS.role,
    userType,
    status: MembershipStatus.ACTIVE,
    startedAt: now,
    endedAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    role: {
      id: IDS.role,
      schoolId: IDS.school,
      key: userType === UserType.TEACHER ? 'teacher' : 'school_admin',
      name: 'Managed role',
      description: null,
      isSystem: false,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    },
    user: {
      id: IDS.targetUser,
      email: 'redacted@example.test',
      username: null,
      contactEmail: null,
      phone: null,
      passwordHash: null,
      firstName: 'Managed',
      lastName: 'User',
      userType,
      status: UserStatus.ACTIVE,
      lastLoginAt: null,
      mustChangePassword: false,
      passwordChangedAt: null,
      passwordProvisionedAt: null,
      credentialVersion: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    },
  };
}

function buildUseCase(target: ScopedMembershipRecord) {
  const findScopedMembershipForStatusChangeByUserId = jest
    .fn()
    .mockResolvedValue(target);
  const updateUserAndMembership = jest.fn().mockImplementation(({ status }) => {
    const updated = membership(target.user.userType);
    updated.user.status = status;
    return updated;
  });
  const usersRepository = {
    findScopedMembershipForStatusChangeByUserId,
    updateUserAndMembership,
  } as unknown as UsersRepository;
  const createAuditLog = jest.fn().mockResolvedValue(undefined);
  const revokeUserSessions = jest.fn().mockResolvedValue({ count: 1 });
  const authRepository = {
    createAuditLog,
    revokeUserSessions,
  } as unknown as AuthRepository;
  const disable = jest.fn().mockResolvedValue({
    userId: IDS.targetUser,
    accountStatus: UserStatus.DISABLED,
    revokedSessionCount: 1,
  });
  const teacherAccountDisable = {
    execute: disable,
  } as unknown as TeacherAccountDisableCoordinator;
  const rejectActivation = jest.fn(async () => {
    throw Object.assign(new Error('rejected'), {
      code: 'teachers.lifecycle.invalid_transition',
      httpStatus: 409,
      details: { reasonCode: 'teacher_activation_requires_lifecycle' },
    });
  });
  const teacherBypass = {
    rejectActivation,
  } as unknown as TeacherSettingsBypassService;
  return {
    useCase: new UpdateUserStatusUseCase(
      usersRepository,
      authRepository,
      teacherAccountDisable,
      teacherBypass,
    ),
    findScopedMembershipForStatusChangeByUserId,
    updateUserAndMembership,
    createAuditLog,
    revokeUserSessions,
    disable,
    rejectActivation,
  };
}

describe('UpdateUserStatusUseCase', () => {
  it('delegates Teacher disable to the transactional account coordinator only', async () => {
    const fixture = buildUseCase(membership(UserType.TEACHER));
    const result = await inSettingsScope(() =>
      fixture.useCase.execute(IDS.targetUser, { status: 'inactive' }),
    );

    expect(fixture.disable).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: IDS.actor,
        schoolId: IDS.school,
        userId: IDS.targetUser,
        membershipId: IDS.targetMembership,
        effectiveAt: expect.any(Date),
      }),
    );
    expect(fixture.updateUserAndMembership).not.toHaveBeenCalled();
    expect(fixture.createAuditLog).not.toHaveBeenCalled();
    expect(fixture.revokeUserSessions).not.toHaveBeenCalled();
    expect(result).toEqual({ id: IDS.targetUser, status: 'inactive' });
  });

  it('rejects generic Teacher activation before any state or Session write', async () => {
    const target = membership(UserType.TEACHER);
    target.user.status = UserStatus.DISABLED;
    target.status = MembershipStatus.SUSPENDED;
    const fixture = buildUseCase(target);

    await expect(
      inSettingsScope(() =>
        fixture.useCase.execute(IDS.targetUser, { status: 'active' }),
      ),
    ).rejects.toMatchObject({
      code: 'teachers.lifecycle.invalid_transition',
      httpStatus: 409,
      details: { reasonCode: 'teacher_activation_requires_lifecycle' },
    });
    expect(fixture.rejectActivation).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceId: IDS.targetUser,
        previousStatus: UserStatus.DISABLED,
      }),
    );
    expect(fixture.disable).not.toHaveBeenCalled();
    expect(fixture.updateUserAndMembership).not.toHaveBeenCalled();
    expect(fixture.revokeUserSessions).not.toHaveBeenCalled();
  });

  it.each([
    ['disable', 'inactive', UserStatus.DISABLED],
    ['activate', 'active', UserStatus.ACTIVE],
  ] as const)(
    'keeps non-Teacher %s behavior unchanged',
    async (_label, status, expectedStatus) => {
      const target = membership(UserType.STUDENT);
      target.user.status =
        status === 'active' ? UserStatus.DISABLED : UserStatus.ACTIVE;
      const fixture = buildUseCase(target);
      const result = await inSettingsScope(() =>
        fixture.useCase.execute(IDS.targetUser, { status }),
      );

      expect(fixture.updateUserAndMembership).toHaveBeenCalledWith({
        userId: IDS.targetUser,
        membershipId: IDS.targetMembership,
        status: expectedStatus,
      });
      expect(fixture.disable).not.toHaveBeenCalled();
      expect(fixture.rejectActivation).not.toHaveBeenCalled();
      expect(fixture.revokeUserSessions).toHaveBeenCalledTimes(
        status === 'inactive' ? 1 : 0,
      );
      const auditEntry = fixture.createAuditLog.mock.calls[0][0];
      expect(auditEntry).toEqual(
        expect.objectContaining({
          actorId: IDS.actor,
          schoolId: IDS.school,
          action: 'iam.user.status.change',
          outcome: AuditOutcome.SUCCESS,
        }),
      );
      expect(result).toEqual({ id: IDS.targetUser, status });
    },
  );
});
