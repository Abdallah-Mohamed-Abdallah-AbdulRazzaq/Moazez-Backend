import { MembershipStatus, UserStatus, UserType } from '@prisma/client';
import { TeacherAccountDisableCoordinator } from '../application/teacher-account-disable.coordinator';
import type {
  TeacherLifecycleMembershipState,
  TeacherLifecycleTransactionContext,
  TeacherLifecycleUnitOfWork,
  TeacherLifecycleUserState,
} from '../application/teacher-lifecycle-unit-of-work';

const IDS = {
  actor: '57000000-0000-4000-8000-000000000001',
  organization: '57000000-0000-4000-8000-000000000002',
  school: '57000000-0000-4000-8000-000000000003',
  user: '57000000-0000-4000-8000-000000000004',
  membership: '57000000-0000-4000-8000-000000000005',
  role: '57000000-0000-4000-8000-000000000006',
};

function teacherUser(): TeacherLifecycleUserState {
  return {
    id: IDS.user,
    loginEmail: 'redacted@example.test',
    username: null,
    contactEmail: null,
    phone: null,
    firstName: 'Managed',
    lastName: 'Teacher',
    userType: UserType.TEACHER,
    status: UserStatus.ACTIVE,
    deletedAt: null,
    credential: {
      hasPassword: false,
      status: 'missing',
      mustChangePassword: false,
      passwordProvisionedAt: null,
      passwordChangedAt: null,
      credentialVersion: 0,
    },
  };
}

function teacherMembership(): TeacherLifecycleMembershipState {
  return {
    id: IDS.membership,
    userId: IDS.user,
    organizationId: IDS.organization,
    schoolId: IDS.school,
    roleId: IDS.role,
    userType: UserType.TEACHER,
    status: MembershipStatus.ACTIVE,
    startedAt: new Date('2026-01-01T00:00:00.000Z'),
    endedAt: null,
    deletedAt: null,
    role: { id: IDS.role, key: 'teacher', schoolId: null, deletedAt: null },
    user: { userType: UserType.TEACHER, deletedAt: null },
  };
}

function setup(revocationError?: Error) {
  const user = teacherUser();
  const membership = teacherMembership();
  const setStatus = jest.fn().mockResolvedValue({
    ...user,
    status: UserStatus.DISABLED,
  });
  const revokeUserSessions = revocationError
    ? jest.fn().mockRejectedValue(revocationError)
    : jest.fn().mockResolvedValue(2);
  const writeSuccessful = jest.fn().mockResolvedValue(undefined);
  const transaction = {
    user: { findState: jest.fn().mockResolvedValue(user), setStatus },
    membership: {
      findCurrentSchoolState: jest.fn().mockResolvedValue(membership),
    },
    profile: {},
    sessions: { revokeUserSessions },
    audit: { writeSuccessful },
  } as unknown as TeacherLifecycleTransactionContext;
  const execute = jest.fn((callback) => callback(transaction));
  const coordinator = new TeacherAccountDisableCoordinator({
    execute,
  } as unknown as TeacherLifecycleUnitOfWork);
  return {
    coordinator,
    transaction,
    execute,
    setStatus,
    revokeUserSessions,
    writeSuccessful,
  };
}

function input() {
  return {
    actorId: IDS.actor,
    actorUserType: UserType.SCHOOL_USER,
    organizationId: IDS.organization,
    schoolId: IDS.school,
    userId: IDS.user,
    membershipId: IDS.membership,
    effectiveAt: new Date('2026-07-19T12:00:00.000Z'),
  };
}

describe('TeacherAccountDisableCoordinator', () => {
  it('changes only User status, Sessions, and the account audit in one transaction', async () => {
    const state = setup();
    await expect(state.coordinator.execute(input())).resolves.toEqual({
      userId: IDS.user,
      accountStatus: UserStatus.DISABLED,
      revokedSessionCount: 2,
    });
    expect(state.execute).toHaveBeenCalledTimes(1);
    expect(state.setStatus).toHaveBeenCalledWith({
      userId: IDS.user,
      expectedStatus: UserStatus.ACTIVE,
      status: UserStatus.DISABLED,
    });
    expect(state.revokeUserSessions).toHaveBeenCalledWith(
      IDS.user,
      input().effectiveAt,
    );
    expect(state.writeSuccessful).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'teachers.account.disable',
        resourceType: 'user',
      }),
    );
    expect(Object.keys(state.transaction)).not.toContain('allocation');
    expect(state.writeSuccessful).toHaveBeenCalledTimes(1);
  });

  it('treats zero unrevoked Sessions as a successful result', async () => {
    const state = setup();
    state.revokeUserSessions.mockResolvedValue(0);
    await expect(state.coordinator.execute(input())).resolves.toMatchObject({
      revokedSessionCount: 0,
    });
  });

  it('maps a Session write failure to the stable retryable public error', async () => {
    const state = setup(new Error('raw database detail'));
    await expect(state.coordinator.execute(input())).rejects.toMatchObject({
      code: 'teachers.lifecycle.revocation_failed',
      httpStatus: 503,
      details: { retryable: true, reasonCode: 'revocation_failed' },
    });
    expect(state.writeSuccessful).not.toHaveBeenCalled();
  });

  it('rejects a non-exact Teacher Membership without writing', async () => {
    const state = setup();
    (
      state.transaction.membership.findCurrentSchoolState as jest.Mock
    ).mockResolvedValue({ ...teacherMembership(), endedAt: new Date() });
    await expect(state.coordinator.execute(input())).rejects.toMatchObject({
      code: 'teachers.account.role_transition_conflict',
    });
    expect(state.setStatus).not.toHaveBeenCalled();
    expect(state.revokeUserSessions).not.toHaveBeenCalled();
  });
});
