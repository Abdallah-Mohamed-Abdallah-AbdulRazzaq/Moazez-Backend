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
import type {
  TeacherLifecycleMembershipState,
  TeacherLifecycleProfileState,
  TeacherLifecycleTransactionContext,
  TeacherLifecycleUnitOfWork,
  TeacherLifecycleUserState,
} from '../../lifecycle/application/teacher-lifecycle-unit-of-work';
import { TeacherProfileLifecycleInvariantError } from '../../profile/infrastructure/teacher-profile-lifecycle.operations';
import { RehireTeacherUseCase } from '../application/rehire-teacher.use-case';
import type { RehireTeacherDto } from '../dto/teacher-directory.dto';

const IDS = {
  actor: '62000000-0000-4000-8000-000000000001',
  organization: '62000000-0000-4000-8000-000000000002',
  school: '62000000-0000-4000-8000-000000000003',
  user: '62000000-0000-4000-8000-000000000004',
  membership: '62000000-0000-4000-8000-000000000005',
  role: '62000000-0000-4000-8000-000000000006',
  profile: '62000000-0000-4000-8000-000000000007',
};

const command: RehireTeacherDto = {
  teacherCode: ' t 001 ',
  firstNameAr: 'آمنة',
  lastNameAr: 'معلمة',
  firstNameEn: 'Safe',
  lastNameEn: 'Teacher',
  preferredDisplayLanguage: 'EN',
  gender: TeacherGender.FEMALE,
};

function user(hasPassword = false): TeacherLifecycleUserState {
  return {
    id: IDS.user,
    loginEmail: 'redacted@example.test',
    username: null,
    contactEmail: null,
    phone: null,
    firstName: 'Legacy',
    lastName: 'Display',
    userType: UserType.TEACHER,
    status: UserStatus.DISABLED,
    deletedAt: null,
    credential: {
      hasPassword,
      status: hasPassword ? 'set' : 'missing',
      mustChangePassword: false,
      passwordProvisionedAt: null,
      passwordChangedAt: null,
      credentialVersion: 0,
    },
  };
}

function profile(): TeacherLifecycleProfileState {
  return {
    id: IDS.profile,
    schoolId: IDS.school,
    userId: IDS.user,
    teacherCode: 'OLD',
    firstNameAr: null,
    lastNameAr: null,
    firstNameEn: null,
    lastNameEn: null,
    gender: null,
    employmentStatus: TeacherEmploymentStatus.TERMINATED,
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
    updatedAt: new Date('2026-02-01T00:00:00.000Z'),
    deletedAt: new Date('2026-03-01T00:00:00.000Z'),
  };
}

function membership(): TeacherLifecycleMembershipState {
  return {
    id: IDS.membership,
    userId: IDS.user,
    organizationId: IDS.organization,
    schoolId: IDS.school,
    roleId: IDS.role,
    userType: UserType.TEACHER,
    status: MembershipStatus.INACTIVE,
    startedAt: new Date('2026-01-01T00:00:00.000Z'),
    endedAt: new Date('2026-03-01T00:00:00.000Z'),
    deletedAt: null,
    role: { id: IDS.role, key: 'teacher', schoolId: null, deletedAt: null },
    user: { userType: UserType.TEACHER, deletedAt: null },
  };
}

function setup(
  options: {
    missing?: boolean;
    liveProfiles?: Array<{ id: string; schoolId: string; userId: string }>;
    history?: TeacherLifecycleMembershipState[];
    operationalMemberships?: TeacherLifecycleMembershipState[];
    hasPassword?: boolean;
    userType?: UserType;
  } = {},
) {
  const archivedProfile = profile();
  const currentUser = {
    ...user(options.hasPassword),
    userType: options.userType ?? UserType.TEACHER,
  };
  const history = options.history ?? [membership()];
  const restore = jest.fn().mockImplementation(({ fields }) =>
    Promise.resolve({
      ...archivedProfile,
      ...fields,
      employmentStatus: TeacherEmploymentStatus.INACTIVE,
      deletedAt: null,
    }),
  );
  const restoreExactTeacher = jest.fn().mockResolvedValue({
    ...membership(),
    status: MembershipStatus.SUSPENDED,
    endedAt: null,
  });
  const createExactTeacherForRehire = jest.fn().mockResolvedValue({
    ...membership(),
    status: MembershipStatus.SUSPENDED,
    endedAt: null,
  });
  const updateDisplayNames = jest
    .fn()
    .mockImplementation((names) =>
      Promise.resolve({ ...currentUser, ...names }),
    );
  const setTypeForReviewedTransition = jest.fn().mockResolvedValue(currentUser);
  const setStatus = jest.fn().mockResolvedValue({
    ...currentUser,
    firstName: 'Safe',
    lastName: 'Teacher',
    status: UserStatus.DISABLED,
  });
  const revokeUserSessions = jest.fn().mockResolvedValue(0);
  const writeSuccessful = jest.fn().mockResolvedValue(undefined);
  const transaction = {
    profile: {
      findArchivedById: jest
        .fn()
        .mockResolvedValue(options.missing ? null : archivedProfile),
      listLiveFootprintsForUser: jest
        .fn()
        .mockResolvedValue(options.liveProfiles ?? []),
      restore,
    },
    user: {
      findState: jest.fn().mockResolvedValue(currentUser),
      setTypeForReviewedTransition,
      updateDisplayNames,
      setStatus,
    },
    membership: {
      listOperationalFootprints: jest
        .fn()
        .mockResolvedValue(options.operationalMemberships ?? []),
      listCurrentSchoolHistory: jest.fn().mockResolvedValue(history),
      resolveExactTeacherRole: jest.fn().mockResolvedValue({
        id: IDS.role,
        key: 'teacher',
        schoolId: null,
        deletedAt: null,
      }),
      restoreExactTeacher,
      createExactTeacherForRehire,
    },
    sessions: { revokeUserSessions },
    audit: { writeSuccessful },
  } as unknown as TeacherLifecycleTransactionContext;
  const execute = jest.fn((callback) => callback(transaction));
  return {
    useCase: new RehireTeacherUseCase({
      execute,
    } as unknown as TeacherLifecycleUnitOfWork),
    restore,
    restoreExactTeacher,
    createExactTeacherForRehire,
    setTypeForReviewedTransition,
    updateDisplayNames,
    setStatus,
    revokeUserSessions,
    writeSuccessful,
  };
}

function invoke(useCase: RehireTeacherUseCase) {
  const context = createRequestContext('rehire-teacher-test');
  context.actor = { id: IDS.actor, userType: UserType.SCHOOL_USER };
  context.activeMembership = {
    membershipId: IDS.membership,
    organizationId: IDS.organization,
    schoolId: IDS.school,
    roleId: IDS.role,
    permissions: ['teachers.records.manage'],
  };
  return runWithRequestContext(context, () =>
    useCase.execute(IDS.profile, command),
  );
}

describe('RehireTeacherUseCase', () => {
  it('restores the exact Profile and historical Membership into fail-closed state', async () => {
    const fixture = setup();
    const result = await invoke(fixture.useCase);
    expect(fixture.restore).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: IDS.profile,
        userId: IDS.user,
        employmentStatus: TeacherEmploymentStatus.INACTIVE,
        fields: expect.objectContaining({ teacherCode: 'T001' }),
      }),
    );
    expect(fixture.restoreExactTeacher).toHaveBeenCalledWith(
      expect.objectContaining({ membershipId: IDS.membership }),
    );
    expect(fixture.createExactTeacherForRehire).not.toHaveBeenCalled();
    expect(result.id).toBe(IDS.profile);
    expect(result.accountStatus).toBe(UserStatus.DISABLED);
    expect(result.membershipStatus).toBe(MembershipStatus.SUSPENDED);
    expect(result.membershipEndedAt).toBeNull();
    expect(result.employmentStatus).toBe(TeacherEmploymentStatus.INACTIVE);
    expect(result.profileCompleteness.isComplete).toBe(true);
  });

  it('creates one suspended Teacher Membership only when no restorable history exists', async () => {
    const fixture = setup({ history: [], operationalMemberships: [] });
    await invoke(fixture.useCase);
    expect(fixture.restoreExactTeacher).not.toHaveBeenCalled();
    expect(fixture.createExactTeacherForRehire).toHaveBeenCalledTimes(1);
  });

  it('keeps missing credentials and does not block rehire', async () => {
    const fixture = setup({ hasPassword: false });
    const result = await invoke(fixture.useCase);
    expect(result.credentialSummary).toMatchObject({
      hasPassword: false,
      status: 'missing',
    });
    expect(result.accountStatus).toBe(UserStatus.DISABLED);
  });

  it('updates compatibility display names from the approved language', async () => {
    const fixture = setup();
    await invoke(fixture.useCase);
    expect(fixture.updateDisplayNames).toHaveBeenCalledWith({
      userId: IDS.user,
      firstName: 'Safe',
      lastName: 'Teacher',
    });
  });

  it('revokes stale Sessions and writes only restore/rehire audits', async () => {
    const fixture = setup();
    await invoke(fixture.useCase);
    expect(fixture.revokeUserSessions).toHaveBeenCalledWith(
      IDS.user,
      expect.any(Date),
    );
    expect(
      fixture.writeSuccessful.mock.calls.map(([entry]) => entry.action),
    ).toEqual(['teachers.profile.restore', 'teachers.account.rehire']);
  });

  it('rejects a second live Profile without restoring anything', async () => {
    const fixture = setup({
      liveProfiles: [{ id: 'live', schoolId: IDS.school, userId: IDS.user }],
    });
    await expect(invoke(fixture.useCase)).rejects.toMatchObject({
      code: 'teachers.account.role_transition_conflict',
      details: { reasonCode: 'teacher_live_identity_exists' },
    });
    expect(fixture.restore).not.toHaveBeenCalled();
  });

  it('rejects an operational Membership conflict', async () => {
    const active = {
      ...membership(),
      status: MembershipStatus.ACTIVE,
      endedAt: null,
    };
    const fixture = setup({
      history: [active],
      operationalMemberships: [active],
    });
    await expect(invoke(fixture.useCase)).rejects.toMatchObject({
      details: { reasonCode: 'teacher_operational_membership_exists' },
    });
    expect(fixture.restore).not.toHaveBeenCalled();
  });

  it('rejects an operational non-Teacher Membership in another school', async () => {
    const operational = {
      ...membership(),
      id: '62000000-0000-4000-8000-000000000099',
      schoolId: '62000000-0000-4000-8000-000000000098',
      userType: UserType.SCHOOL_USER,
      status: MembershipStatus.ACTIVE,
      endedAt: null,
      role: {
        id: '62000000-0000-4000-8000-000000000097',
        key: 'school_admin',
        schoolId: '62000000-0000-4000-8000-000000000098',
        deletedAt: null,
      },
    };
    const fixture = setup({ operationalMemberships: [operational] });
    await expect(invoke(fixture.useCase)).rejects.toMatchObject({
      details: { reasonCode: 'teacher_operational_membership_exists' },
    });
    expect(fixture.restore).not.toHaveBeenCalled();
  });

  it('restores Teacher type for a non-deleted User after prior demotion when no Membership is operational', async () => {
    const fixture = setup({ userType: UserType.SCHOOL_USER });
    await expect(invoke(fixture.useCase)).resolves.toMatchObject({
      accountStatus: UserStatus.DISABLED,
      employmentStatus: TeacherEmploymentStatus.INACTIVE,
    });
    expect(fixture.setTypeForReviewedTransition).toHaveBeenCalledWith({
      userId: IDS.user,
      expectedUserType: UserType.SCHOOL_USER,
      userType: UserType.TEACHER,
    });
  });

  it('rejects ambiguous same-school Teacher history', async () => {
    const second = { ...membership(), id: `${IDS.membership.slice(0, -1)}8` };
    const fixture = setup({ history: [membership(), second] });
    await expect(invoke(fixture.useCase)).rejects.toMatchObject({
      details: { reasonCode: 'teacher_membership_history_ambiguous' },
    });
  });

  it('returns the same safe 404 for missing, live, or foreign scoped resolution', async () => {
    const fixture = setup({ missing: true });
    await expect(invoke(fixture.useCase)).rejects.toMatchObject({
      code: 'teachers.profile.not_found',
      httpStatus: 404,
      details: undefined,
    });
  });

  it('maps Session failure to retryable safe revocation failure', async () => {
    const fixture = setup();
    fixture.revokeUserSessions.mockRejectedValueOnce(new Error('private'));
    await expect(invoke(fixture.useCase)).rejects.toMatchObject({
      code: 'teachers.lifecycle.revocation_failed',
      details: { retryable: true, reasonCode: 'revocation_failed' },
    });
  });

  it('never calls a credential writer or activation coordinator', async () => {
    const fixture = setup();
    await invoke(fixture.useCase);
    expect(Object.keys(fixture)).not.toEqual(
      expect.arrayContaining(['credentialWriter', 'activationCoordinator']),
    );
  });

  it('allows only one of two concurrent restore attempts to succeed', async () => {
    const fixture = setup();
    fixture.restore.mockRejectedValueOnce(
      new TeacherProfileLifecycleInvariantError(
        'archived_same_school_profile_required',
      ),
    );

    const results = await Promise.allSettled([
      invoke(fixture.useCase),
      invoke(fixture.useCase),
    ]);

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected).toMatchObject({
      status: 'rejected',
      reason: {
        code: 'teachers.account.role_transition_conflict',
        details: { reasonCode: 'teacher_rehire_state_conflict' },
      },
    });
    expect(fixture.writeSuccessful).toHaveBeenCalledTimes(2);
  });
});
