import {
  MembershipStatus,
  TeacherEmploymentStatus,
  TeacherGender,
  UserStatus,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
} from '../../../../common/context/request-context';
import { summarizeTeacherAllocationLifecycleStates } from '../../../academics/teacher-allocation/domain/teacher-allocation-lifecycle-state';
import { TeacherLifecycleUserInvariantError } from '../../../settings/users/infrastructure/teacher-lifecycle-user.operations';
import type {
  TeacherLifecycleMembershipState,
  TeacherLifecycleProfileState,
  TeacherLifecycleTransactionContext,
  TeacherLifecycleUnitOfWork,
  TeacherLifecycleUserState,
} from '../../lifecycle/application/teacher-lifecycle-unit-of-work';
import { ChangeTeacherEmploymentStatusUseCase } from '../application/change-teacher-employment-status.use-case';

const IDS = {
  actor: '58000000-0000-4000-8000-000000000001',
  organization: '58000000-0000-4000-8000-000000000002',
  school: '58000000-0000-4000-8000-000000000003',
  otherSchool: '58000000-0000-4000-8000-000000000004',
  user: '58000000-0000-4000-8000-000000000005',
  profile: '58000000-0000-4000-8000-000000000006',
  membership: '58000000-0000-4000-8000-000000000007',
  role: '58000000-0000-4000-8000-000000000008',
};
const EFFECTIVE_AT = '2026-07-18T16:36:19.198Z';

function user(
  status: UserStatus,
  overrides: Partial<TeacherLifecycleUserState> = {},
): TeacherLifecycleUserState {
  return {
    id: IDS.user,
    loginEmail: 'redacted@example.test',
    username: 'teacher',
    contactEmail: null,
    phone: null,
    firstName: 'Nour',
    lastName: 'Ali',
    userType: UserType.TEACHER,
    status,
    deletedAt: null,
    credential: {
      hasPassword: true,
      status: 'set',
      mustChangePassword: false,
      passwordProvisionedAt: new Date('2026-01-01T00:00:00.000Z'),
      passwordChangedAt: new Date('2026-01-02T00:00:00.000Z'),
      credentialVersion: 2,
    },
    ...overrides,
  };
}

function profile(
  employmentStatus: TeacherEmploymentStatus,
  overrides: Partial<TeacherLifecycleProfileState> = {},
): TeacherLifecycleProfileState {
  return {
    id: IDS.profile,
    schoolId: IDS.school,
    userId: IDS.user,
    teacherCode: 'T001',
    firstNameAr: 'Nour-Ar',
    lastNameAr: 'Ali-Ar',
    firstNameEn: 'Nour',
    lastNameEn: 'Ali',
    gender: TeacherGender.FEMALE,
    employmentStatus,
    department: null,
    specialization: null,
    employmentType: null,
    experienceYears: null,
    hireDate: null,
    workingDays: [],
    workStartTime: null,
    workEndTime: null,
    notesAr: null,
    notesEn: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  };
}

function membership(
  status: MembershipStatus,
  overrides: Partial<TeacherLifecycleMembershipState> = {},
): TeacherLifecycleMembershipState {
  return {
    id: IDS.membership,
    userId: IDS.user,
    organizationId: IDS.organization,
    schoolId: IDS.school,
    roleId: IDS.role,
    userType: UserType.TEACHER,
    status,
    startedAt: new Date('2026-01-01T00:00:00.000Z'),
    endedAt: null,
    deletedAt: null,
    role: { id: IDS.role, key: 'teacher', schoolId: null, deletedAt: null },
    user: { userType: UserType.TEACHER, deletedAt: null },
    ...overrides,
  };
}

type SetupOptions = {
  previous?: TeacherEmploymentStatus;
  currentProfile?: TeacherLifecycleProfileState | null;
  currentUser?: TeacherLifecycleUserState | null;
  currentMembership?: TeacherLifecycleMembershipState | null;
  allocationStates?: Array<
    | 'future'
    | 'historical'
    | 'current_active'
    | 'current_inactive'
    | 'inconsistent'
    | 'invalid'
  >;
  failAt?: 'profile' | 'user' | 'membership' | 'session' | 'audit';
  auditFailureAt?: number;
  allocationError?: unknown;
};

type SetEmploymentStatusInput = Parameters<
  TeacherLifecycleTransactionContext['profile']['setEmploymentStatus']
>[0];
type SetUserStatusInput = Parameters<
  TeacherLifecycleTransactionContext['user']['setStatus']
>[0];
type SetMembershipStateInput = {
  status: MembershipStatus;
  endedAt?: Date | null;
};
type SuccessfulAuditEntry = Parameters<
  TeacherLifecycleTransactionContext['audit']['writeSuccessful']
>[0];

function setup(options: SetupOptions = {}) {
  const previous = options.previous ?? TeacherEmploymentStatus.ACTIVE;
  const currentProfile =
    options.currentProfile === undefined
      ? profile(previous)
      : options.currentProfile;
  const currentUser =
    options.currentUser === undefined
      ? user(
          previous === TeacherEmploymentStatus.INACTIVE
            ? UserStatus.DISABLED
            : UserStatus.ACTIVE,
        )
      : options.currentUser;
  const currentMembership =
    options.currentMembership === undefined
      ? membership(
          previous === TeacherEmploymentStatus.INACTIVE
            ? MembershipStatus.SUSPENDED
            : MembershipStatus.ACTIVE,
        )
      : options.currentMembership;
  const setEmploymentStatus = jest.fn(
    ({ employmentStatus }: SetEmploymentStatusInput) => {
      if (options.failAt === 'profile') throw new Error('profile write failed');
      return Promise.resolve({
        ...(currentProfile as TeacherLifecycleProfileState),
        employmentStatus,
      });
    },
  );
  const setStatus = jest.fn(({ status }: SetUserStatusInput) => {
    if (options.failAt === 'user') throw new Error('user write failed');
    return Promise.resolve({
      ...(currentUser as TeacherLifecycleUserState),
      status,
    });
  });
  const updateMembership = jest.fn(
    ({ status, endedAt }: SetMembershipStateInput) => {
      if (options.failAt === 'membership') {
        throw new Error('membership write failed');
      }
      return Promise.resolve({
        ...(currentMembership as TeacherLifecycleMembershipState),
        status,
        endedAt: endedAt ?? null,
      });
    },
  );
  const setActive = jest.fn(
    (
      input: Parameters<
        TeacherLifecycleTransactionContext['membership']['setActive']
      >[0],
    ) =>
      updateMembership({
        ...input,
        status: MembershipStatus.ACTIVE,
      }),
  );
  const setSuspended = jest.fn(
    (
      input: Parameters<
        TeacherLifecycleTransactionContext['membership']['setSuspended']
      >[0],
    ) =>
      updateMembership({
        ...input,
        status: MembershipStatus.SUSPENDED,
      }),
  );
  const setInactive = jest.fn(
    (
      input: Parameters<
        TeacherLifecycleTransactionContext['membership']['setInactive']
      >[0],
    ) => updateMembership({ ...input, status: MembershipStatus.INACTIVE }),
  );
  const revokeUserSessions = jest.fn(() => {
    if (options.failAt === 'session') throw new Error('session write failed');
    return Promise.resolve(3);
  });
  let auditWriteNumber = 0;
  const writeSuccessful = jest.fn((entry: SuccessfulAuditEntry) => {
    void entry;
    auditWriteNumber += 1;
    if (
      options.failAt === 'audit' ||
      options.auditFailureAt === auditWriteNumber
    ) {
      throw new Error('audit write failed');
    }
    return Promise.resolve();
  });
  const allocationSummary = summarizeTeacherAllocationLifecycleStates(
    options.allocationStates ?? [],
  );
  const classifyAllocation = jest.fn().mockResolvedValue(allocationSummary);
  if (options.allocationError !== undefined) {
    classifyAllocation.mockRejectedValue(options.allocationError);
  }
  const transaction = {
    user: {
      findState: jest.fn().mockResolvedValue(currentUser),
      setStatus,
    },
    membership: {
      findCurrentSchoolState: jest.fn().mockResolvedValue(currentMembership),
      setActive,
      setSuspended,
      setInactive,
    },
    profile: {
      findLiveById: jest.fn().mockResolvedValue(currentProfile),
      setEmploymentStatus,
    },
    sessions: { revokeUserSessions },
    audit: { writeSuccessful },
    allocation: { classify: classifyAllocation },
  } as unknown as TeacherLifecycleTransactionContext;
  const execute = jest.fn(
    <T>(
      callback: (context: TeacherLifecycleTransactionContext) => Promise<T>,
    ) => callback(transaction),
  );
  const logOperationalError = jest.fn();
  const useCase = new ChangeTeacherEmploymentStatusUseCase(
    { execute } as unknown as TeacherLifecycleUnitOfWork,
    { error: logOperationalError },
  );
  return {
    useCase,
    transaction,
    execute,
    setEmploymentStatus,
    setStatus,
    setActive,
    setSuspended,
    setInactive,
    revokeUserSessions,
    writeSuccessful,
    classifyAllocation,
    logOperationalError,
  };
}

function invoke(
  useCase: ChangeTeacherEmploymentStatusUseCase,
  employmentStatus: TeacherEmploymentStatus,
) {
  const context = createRequestContext('employment-transition-test');
  context.actor = { id: IDS.actor, userType: UserType.SCHOOL_USER };
  context.activeMembership = {
    membershipId: IDS.membership,
    schoolId: IDS.school,
    organizationId: IDS.organization,
    roleId: IDS.role,
    permissions: ['teachers.records.manage'],
  };
  return runWithRequestContext(context, () =>
    useCase.execute(IDS.profile, {
      employmentStatus,
      effectiveAt: EFFECTIVE_AT,
    }),
  );
}

describe('ChangeTeacherEmploymentStatusUseCase', () => {
  it.each([
    [
      TeacherEmploymentStatus.ACTIVE,
      TeacherEmploymentStatus.INACTIVE,
      UserStatus.DISABLED,
      MembershipStatus.SUSPENDED,
    ],
    [
      TeacherEmploymentStatus.ACTIVE,
      TeacherEmploymentStatus.TERMINATED,
      UserStatus.DISABLED,
      MembershipStatus.INACTIVE,
    ],
    [
      TeacherEmploymentStatus.INACTIVE,
      TeacherEmploymentStatus.ACTIVE,
      UserStatus.ACTIVE,
      MembershipStatus.ACTIVE,
    ],
    [
      TeacherEmploymentStatus.INACTIVE,
      TeacherEmploymentStatus.TERMINATED,
      UserStatus.DISABLED,
      MembershipStatus.INACTIVE,
    ],
  ])(
    'coordinates %s -> %s in one transaction',
    async (previous, next, accountStatus, membershipStatus) => {
      const state = setup({ previous });
      const result = await invoke(state.useCase, next);
      expect(state.execute).toHaveBeenCalledTimes(1);
      expect(state.setEmploymentStatus).toHaveBeenCalledWith({
        schoolId: IDS.school,
        profileId: IDS.profile,
        expectedEmploymentStatus: previous,
        employmentStatus: next,
      });
      expect(state.setStatus).toHaveBeenCalledWith({
        userId: IDS.user,
        expectedStatus:
          previous === TeacherEmploymentStatus.INACTIVE
            ? UserStatus.DISABLED
            : UserStatus.ACTIVE,
        status: accountStatus,
      });
      expect(result.transition).toMatchObject({
        previousEmploymentStatus: previous,
        employmentStatus: next,
        accountStatus,
        membershipStatus,
        revokedSessionCount: 3,
      });
      expect(state.revokeUserSessions).toHaveBeenCalledWith(
        IDS.user,
        new Date(EFFECTIVE_AT),
      );
      expect(state.classifyAllocation).toHaveBeenCalledWith({
        schoolId: IDS.school,
        teacherUserId: IDS.user,
        asOf: new Date(EFFECTIVE_AT),
      });
    },
  );

  it.each([
    [TeacherEmploymentStatus.ACTIVE, TeacherEmploymentStatus.ACTIVE],
    [TeacherEmploymentStatus.INACTIVE, TeacherEmploymentStatus.INACTIVE],
    [TeacherEmploymentStatus.TERMINATED, TeacherEmploymentStatus.TERMINATED],
    [TeacherEmploymentStatus.TERMINATED, TeacherEmploymentStatus.ACTIVE],
    [TeacherEmploymentStatus.TERMINATED, TeacherEmploymentStatus.INACTIVE],
  ])(
    'rejects invalid edge %s -> %s before mutation',
    async (previous, next) => {
      const state = setup({ previous });
      await expect(invoke(state.useCase, next)).rejects.toMatchObject({
        code: 'teachers.lifecycle.invalid_transition',
        httpStatus: 409,
        details: { previousValue: previous, nextValue: next },
      });
      expect(state.setEmploymentStatus).not.toHaveBeenCalled();
      expect(state.revokeUserSessions).not.toHaveBeenCalled();
    },
  );

  it('suspends without ending INACTIVE Membership and uses the three approved audits', async () => {
    const state = setup({
      allocationStates: [
        'current_active',
        'future',
        'historical',
        'current_inactive',
        'inconsistent',
        'invalid',
      ],
    });
    const result = await invoke(
      state.useCase,
      TeacherEmploymentStatus.INACTIVE,
    );
    expect(state.setSuspended).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedStatus: MembershipStatus.ACTIVE,
        expectedEndedAt: null,
      }),
    );
    expect(result.transition.membershipEndedAt).toBeNull();
    expect(result.transition.reassignmentRequired).toBe(true);
    expect(result.transition.allocationSummary).toEqual({
      currentActiveCount: 1,
      futureCount: 1,
      historicalCount: 1,
      currentInactiveCount: 1,
      inconsistentCount: 1,
      invalidCount: 1,
      integrityRiskCount: 3,
      integrityReason: 'invalid_term_state',
    });
    expect(
      state.writeSuccessful.mock.calls.map(([entry]) => entry.action),
    ).toEqual([
      'teachers.employment_status.change',
      'teachers.account.disable',
      'teachers.membership.suspend',
    ]);
    expect(state.revokeUserSessions.mock.invocationCallOrder[0]).toBeLessThan(
      state.writeSuccessful.mock.invocationCallOrder[0],
    );
    expect(JSON.stringify(result.transition.allocationSummary)).not.toMatch(
      /allocationId|schoolId|termId|subjectId|classroomId/iu,
    );
  });

  it('ends TERMINATED Membership at the one fixed effective timestamp without archiving', async () => {
    const state = setup({ allocationStates: ['historical'] });
    const result = await invoke(
      state.useCase,
      TeacherEmploymentStatus.TERMINATED,
    );
    expect(state.setInactive).toHaveBeenCalledWith(
      expect.objectContaining({
        endedAt: new Date(EFFECTIVE_AT),
        expectedStatus: MembershipStatus.ACTIVE,
      }),
    );
    expect(result.transition.membershipEndedAt).toBe(EFFECTIVE_AT);
    expect(result.transition.reassignmentRequired).toBe(false);
    expect(
      state.writeSuccessful.mock.calls.map(([entry]) => entry.action),
    ).toEqual([
      'teachers.employment_status.change',
      'teachers.account.disable',
    ]);
    expect(state.writeSuccessful.mock.calls[0][0].metadata).toMatchObject({
      changedFields: ['employmentStatus', 'membershipStatus', 'endedAt'],
    });
    expect(result.teacher.credentialSummary).toEqual(
      expect.objectContaining({ hasPassword: true, status: 'set' }),
    );
  });

  it.each(['current_active', 'future'] as const)(
    'reports reassignment for %s allocations without mutation',
    async (allocationState) => {
      const state = setup({ allocationStates: [allocationState] });
      const result = await invoke(
        state.useCase,
        TeacherEmploymentStatus.INACTIVE,
      );
      expect(result.transition.reassignmentRequired).toBe(true);
      expect(result.transition.allocationSummary).toMatchObject({
        currentActiveCount: allocationState === 'current_active' ? 1 : 0,
        futureCount: allocationState === 'future' ? 1 : 0,
      });
      expect(state.classifyAllocation).toHaveBeenCalledTimes(1);
    },
  );

  it('requires a complete Profile and password credential for reactivation', async () => {
    const incomplete = setup({
      previous: TeacherEmploymentStatus.INACTIVE,
      currentProfile: profile(TeacherEmploymentStatus.INACTIVE, {
        teacherCode: null,
      }),
    });
    await expect(
      invoke(incomplete.useCase, TeacherEmploymentStatus.ACTIVE),
    ).rejects.toMatchObject({ code: 'teachers.profile.incomplete' });

    const missingCredential = setup({
      previous: TeacherEmploymentStatus.INACTIVE,
      currentUser: user(UserStatus.DISABLED, {
        credential: {
          hasPassword: false,
          status: 'missing',
          mustChangePassword: false,
          passwordProvisionedAt: null,
          passwordChangedAt: null,
          credentialVersion: 0,
        },
      }),
    });
    await expect(
      invoke(missingCredential.useCase, TeacherEmploymentStatus.ACTIVE),
    ).rejects.toMatchObject({
      code: 'teachers.lifecycle.invalid_transition',
      details: { reasonCode: 'credential_required' },
    });
    expect(missingCredential.setStatus).not.toHaveBeenCalled();
  });

  it.each([
    [
      'deleted User',
      user(UserStatus.ACTIVE, { deletedAt: new Date() }),
      undefined,
    ],
    [
      'wrong User type',
      user(UserStatus.ACTIVE, { userType: UserType.STUDENT }),
      undefined,
    ],
    ['missing Membership', undefined, null],
    [
      'ended Membership',
      undefined,
      membership(MembershipStatus.ACTIVE, { endedAt: new Date() }),
    ],
    [
      'deleted Membership',
      undefined,
      membership(MembershipStatus.ACTIVE, { deletedAt: new Date() }),
    ],
    [
      'wrong Membership type',
      undefined,
      membership(MembershipStatus.ACTIVE, { userType: UserType.STUDENT }),
    ],
    [
      'wrong Role',
      undefined,
      membership(MembershipStatus.ACTIVE, {
        role: { id: IDS.role, key: 'student', schoolId: null, deletedAt: null },
      }),
    ],
    [
      'deleted Role',
      undefined,
      membership(MembershipStatus.ACTIVE, {
        role: {
          id: IDS.role,
          key: 'teacher',
          schoolId: null,
          deletedAt: new Date(),
        },
      }),
    ],
    [
      'foreign Role',
      undefined,
      membership(MembershipStatus.ACTIVE, {
        role: {
          id: IDS.role,
          key: 'teacher',
          schoolId: IDS.otherSchool,
          deletedAt: null,
        },
      }),
    ],
  ])(
    'rejects %s identity inconsistency without repair',
    async (_label, badUser, badMembership) => {
      const state = setup({
        currentUser: badUser,
        currentMembership: badMembership,
      });
      await expect(
        invoke(state.useCase, TeacherEmploymentStatus.INACTIVE),
      ).rejects.toMatchObject({
        code: 'teachers.account.role_transition_conflict',
      });
      expect(state.setEmploymentStatus).not.toHaveBeenCalled();
    },
  );

  it.each(['nonexistent', 'archived', 'foreign-school'])(
    'uses the same safe 404 when scoped Profile resolution returns %s',
    async () => {
      const state = setup({ currentProfile: null });
      await expect(
        invoke(state.useCase, TeacherEmploymentStatus.INACTIVE),
      ).rejects.toMatchObject({
        code: 'teachers.profile.not_found',
        httpStatus: 404,
        details: undefined,
      });
      expect(state.setEmploymentStatus).not.toHaveBeenCalled();
    },
  );

  it.each(['profile', 'user', 'membership', 'audit'] as const)(
    'propagates a %s write failure and does not return success',
    async (failAt) => {
      const state = setup({ failAt });
      await expect(
        invoke(state.useCase, TeacherEmploymentStatus.INACTIVE),
      ).rejects.toThrow();
      if (failAt !== 'audit') {
        expect(state.writeSuccessful).not.toHaveBeenCalled();
      }
    },
  );

  it.each([1, 2, 3])(
    'fails the INACTIVE transaction when approved audit write %i fails',
    async (auditFailureAt) => {
      const state = setup({ auditFailureAt });
      await expect(
        invoke(state.useCase, TeacherEmploymentStatus.INACTIVE),
      ).rejects.toThrow('audit write failed');
      expect(state.writeSuccessful).toHaveBeenCalledTimes(auditFailureAt);
    },
  );

  it('maps Session revocation failure to a retryable 503 before any success audit', async () => {
    const state = setup({ failAt: 'session' });
    await expect(
      invoke(state.useCase, TeacherEmploymentStatus.INACTIVE),
    ).rejects.toMatchObject({
      code: 'teachers.lifecycle.revocation_failed',
      httpStatus: 503,
      details: { retryable: true, reasonCode: 'revocation_failed' },
    });
    expect(state.writeSuccessful).not.toHaveBeenCalled();
    expect(state.logOperationalError).not.toHaveBeenCalled();
  });

  it('uses conditional source-state predicates and maps moved state to a stable conflict', async () => {
    const state = setup();
    state.setStatus.mockRejectedValue(
      new TeacherLifecycleUserInvariantError('lifecycle_state_moved'),
    );
    await expect(
      invoke(state.useCase, TeacherEmploymentStatus.INACTIVE),
    ).rejects.toMatchObject({
      code: 'teachers.lifecycle.invalid_transition',
      details: { reasonCode: 'lifecycle_state_moved' },
    });
    expect(state.setEmploymentStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedEmploymentStatus: TeacherEmploymentStatus.ACTIVE,
      }),
    );
    expect(state.setStatus).toHaveBeenCalledWith(
      expect.objectContaining({ expectedStatus: UserStatus.ACTIVE }),
    );
    expect(state.logOperationalError).not.toHaveBeenCalled();
  });

  it('classifies allocations through the lifecycle transaction and returns no credential or Session material', async () => {
    const state = setup({ allocationStates: ['future'] });
    const result = await invoke(
      state.useCase,
      TeacherEmploymentStatus.INACTIVE,
    );
    expect(state.classifyAllocation).toHaveBeenCalledWith({
      schoolId: IDS.school,
      teacherUserId: IDS.user,
      asOf: new Date(EFFECTIVE_AT),
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(
      /passwordHash|refreshToken|sessionId|roleId|membershipId|schoolId|organizationId|allocationId/iu,
    );
  });

  it('rethrows an allocation infrastructure failure before later writes or success audits', async () => {
    const failure = new Error('synthetic allocation infrastructure failure');
    const state = setup({ allocationError: failure });

    await expect(
      invoke(state.useCase, TeacherEmploymentStatus.INACTIVE),
    ).rejects.toBe(failure);

    expect(state.classifyAllocation).toHaveBeenCalledWith({
      schoolId: IDS.school,
      teacherUserId: IDS.user,
      asOf: new Date(EFFECTIVE_AT),
    });
    expect(state.setEmploymentStatus).not.toHaveBeenCalled();
    expect(state.setStatus).not.toHaveBeenCalled();
    expect(state.setSuspended).not.toHaveBeenCalled();
    expect(state.revokeUserSessions).not.toHaveBeenCalled();
    expect(state.writeSuccessful).not.toHaveBeenCalled();
  });

  it.each(['P2024', 'P2028'])(
    'logs safe %s metadata and rethrows the original unexpected error',
    async (code) => {
      const sentinels = {
        message: `message-secret-${code}`,
        meta: `meta-secret-${code}`,
        stack: `stack-secret-${code}`,
      };
      const failure = {
        code,
        name: 'PrismaClientKnownRequestError',
        message: sentinels.message,
        meta: { confidential: sentinels.meta },
        stack: sentinels.stack,
      };
      const state = setup({ allocationError: failure });

      await expect(
        invoke(state.useCase, TeacherEmploymentStatus.INACTIVE),
      ).rejects.toBe(failure);

      expect(state.logOperationalError).toHaveBeenCalledWith({
        event: 'teachers.employment_status.change.unexpected_failure',
        operation: 'employment_status_change',
        traceId: 'employment-transition-test',
        errorName: 'PrismaClientKnownRequestError',
        prismaCode: code,
      });
      const serializedEvent = JSON.stringify(
        state.logOperationalError.mock.calls,
      );
      expect(serializedEvent).not.toContain(sentinels.message);
      expect(serializedEvent).not.toContain(sentinels.meta);
      expect(serializedEvent).not.toContain(sentinels.stack);
      expect(state.setEmploymentStatus).not.toHaveBeenCalled();
      expect(state.writeSuccessful).not.toHaveBeenCalled();
    },
  );

  it('preserves P2034 conflict mapping without unexpected-failure logging', async () => {
    const state = setup({
      allocationError: {
        code: 'P2034',
        name: 'PrismaClientKnownRequestError',
      },
    });

    await expect(
      invoke(state.useCase, TeacherEmploymentStatus.INACTIVE),
    ).rejects.toMatchObject({
      code: 'teachers.lifecycle.invalid_transition',
      details: { reasonCode: 'lifecycle_state_moved' },
    });
    expect(state.logOperationalError).not.toHaveBeenCalled();
    expect(state.setEmploymentStatus).not.toHaveBeenCalled();
    expect(state.writeSuccessful).not.toHaveBeenCalled();
  });
});
