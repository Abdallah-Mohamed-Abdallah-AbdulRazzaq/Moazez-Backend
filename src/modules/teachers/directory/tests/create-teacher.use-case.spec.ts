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
import type { UserLoginIdentityResolver } from '../../../settings/users/application/user-login-identity.resolver';
import type {
  TeacherLifecycleMembershipState,
  TeacherLifecycleProfileState,
  TeacherLifecycleRoleState,
  TeacherLifecycleTransactionContext,
  TeacherLifecycleUnitOfWork,
  TeacherLifecycleUserState,
} from '../../lifecycle/application/teacher-lifecycle-unit-of-work';
import { CreateTeacherUseCase } from '../application/create-teacher.use-case';
import type { CreateTeacherDto } from '../dto/teacher-directory.dto';

const IDS = {
  actor: '51000000-0000-4000-8000-000000000001',
  organization: '51000000-0000-4000-8000-000000000002',
  school: '51000000-0000-4000-8000-000000000003',
  otherSchool: '51000000-0000-4000-8000-000000000004',
  user: '51000000-0000-4000-8000-000000000005',
  membership: '51000000-0000-4000-8000-000000000006',
  profile: '51000000-0000-4000-8000-000000000007',
  role: '51000000-0000-4000-8000-000000000008',
};

function command(overrides: Partial<CreateTeacherDto> = {}): CreateTeacherDto {
  return {
    loginEmail: ' Teacher@Example.Test ',
    contactEmail: ' Contact@Example.Test ',
    phone: ' +201001234567 ',
    teacherCode: ' t 001 ',
    firstNameAr: 'نور',
    lastNameAr: 'علي',
    firstNameEn: 'Nour',
    lastNameEn: 'Ali',
    preferredDisplayLanguage: 'EN',
    gender: TeacherGender.FEMALE,
    employmentStatus: TeacherEmploymentStatus.ACTIVE,
    workingDays: ['FRIDAY', 'SUNDAY'],
    ...overrides,
  };
}

function role(
  overrides: Partial<TeacherLifecycleRoleState> = {},
): TeacherLifecycleRoleState {
  return {
    id: IDS.role,
    key: 'teacher',
    schoolId: null,
    deletedAt: null,
    ...overrides,
  };
}

function createdUser(
  overrides: Partial<TeacherLifecycleUserState> = {},
): TeacherLifecycleUserState {
  return {
    id: IDS.user,
    loginEmail: 'teacher@example.test',
    username: null,
    contactEmail: 'contact@example.test',
    phone: '+201001234567',
    firstName: 'Nour',
    lastName: 'Ali',
    userType: UserType.TEACHER,
    status: UserStatus.INVITED,
    deletedAt: null,
    credential: {
      hasPassword: false,
      status: 'missing',
      mustChangePassword: false,
      passwordProvisionedAt: null,
      passwordChangedAt: null,
      credentialVersion: 0,
    },
    ...overrides,
  };
}

function createdMembership(): TeacherLifecycleMembershipState {
  return {
    id: IDS.membership,
    userId: IDS.user,
    organizationId: IDS.organization,
    schoolId: IDS.school,
    roleId: IDS.role,
    userType: UserType.TEACHER,
    status: MembershipStatus.ACTIVE,
    startedAt: new Date('2026-07-19T00:00:00.000Z'),
    endedAt: null,
    deletedAt: null,
    role: role(),
    user: { userType: UserType.TEACHER, deletedAt: null },
  };
}

function createdProfile(
  employmentStatus = TeacherEmploymentStatus.ACTIVE,
): TeacherLifecycleProfileState {
  return {
    id: IDS.profile,
    schoolId: IDS.school,
    userId: IDS.user,
    teacherCode: 'T001',
    firstNameAr: 'نور',
    lastNameAr: 'علي',
    firstNameEn: 'Nour',
    lastNameEn: 'Ali',
    gender: TeacherGender.FEMALE,
    employmentStatus,
    department: null,
    specialization: null,
    employmentType: null,
    experienceYears: null,
    hireDate: null,
    workingDays: ['SUNDAY', 'FRIDAY'],
    workStartTime: null,
    workEndTime: null,
    notesAr: null,
    notesEn: null,
    createdAt: new Date('2026-07-19T00:00:00.000Z'),
    updatedAt: new Date('2026-07-19T00:00:00.000Z'),
    deletedAt: null,
  };
}

function setup(options: {
  resolvedRole?: TeacherLifecycleRoleState | null;
  conflicts?: Array<'loginEmail' | 'username' | 'contactEmail' | 'phone'>;
  failAt?: 'user' | 'membership' | 'profile' | 'firstAudit' | 'secondAudit';
  user?: TeacherLifecycleUserState;
  profile?: TeacherLifecycleProfileState;
  identity?: {
    email: string;
    username: string | null;
    contactEmail: string | null;
    generatedLoginEmail: boolean;
  };
}) {
  const events: string[] = [];
  const resolveExactTeacherRole = jest
    .fn()
    .mockResolvedValue(
      options.resolvedRole === undefined ? role() : options.resolvedRole,
    );
  const findProvisioningIdentityConflicts = jest
    .fn()
    .mockResolvedValue(options.conflicts ?? []);
  const createInvitedTeacher = jest.fn(async () => {
    events.push('user');
    if (options.failAt === 'user') throw new Error('user_write_failed');
    return options.user ?? createdUser();
  });
  const createExactTeacher = jest.fn(async () => {
    events.push('membership');
    if (options.failAt === 'membership') {
      throw new Error('membership_write_failed');
    }
    return createdMembership();
  });
  const createProfile = jest.fn(async (input) => {
    events.push('profile');
    if (options.failAt === 'profile') throw new Error('profile_write_failed');
    return options.profile ?? createdProfile(input.employmentStatus);
  });
  let auditCount = 0;
  const writeSuccessful = jest.fn(async () => {
    auditCount += 1;
    events.push(`audit${auditCount}`);
    if (
      (options.failAt === 'firstAudit' && auditCount === 1) ||
      (options.failAt === 'secondAudit' && auditCount === 2)
    ) {
      throw new Error('audit_write_failed');
    }
  });
  const context = {
    user: {
      findProvisioningIdentityConflicts,
      createInvitedTeacher,
    },
    membership: { resolveExactTeacherRole, createExactTeacher },
    profile: { create: createProfile },
    audit: { writeSuccessful },
    sessions: { revokeUserSessions: jest.fn() },
  } as unknown as TeacherLifecycleTransactionContext;
  let committed = false;
  const execute = jest.fn(async (callback) => {
    const result = await callback(context);
    committed = true;
    return result;
  });
  const unitOfWork = { execute } as unknown as TeacherLifecycleUnitOfWork;
  const normalize = jest.fn().mockResolvedValue(
    options.identity ?? {
      email: 'teacher@example.test',
      username: null,
      contactEmail: 'contact@example.test',
      generatedLoginEmail: false,
    },
  );
  const loginIdentityResolver = {
    normalize,
  } as unknown as UserLoginIdentityResolver;
  return {
    useCase: new CreateTeacherUseCase(unitOfWork, loginIdentityResolver),
    context,
    events,
    execute,
    normalize,
    resolveExactTeacherRole,
    findProvisioningIdentityConflicts,
    createInvitedTeacher,
    createExactTeacher,
    createProfile,
    writeSuccessful,
    isCommitted: () => committed,
  };
}

function invoke(state: ReturnType<typeof setup>, input = command()) {
  const context = createRequestContext('teacher-provisioning-test');
  context.actor = { id: IDS.actor, userType: UserType.SCHOOL_USER };
  context.activeMembership = {
    membershipId: IDS.membership,
    schoolId: IDS.school,
    organizationId: IDS.organization,
    roleId: IDS.role,
    permissions: ['teachers.records.manage'],
  };
  return runWithRequestContext(context, () => state.useCase.execute(input));
}

describe('CreateTeacherUseCase', () => {
  it('atomically provisions an invited Teacher aggregate and safe response', async () => {
    const state = setup({});
    const result = await invoke(state);

    expect(state.execute).toHaveBeenCalledTimes(1);
    expect(state.createInvitedTeacher).toHaveBeenCalledWith({
      loginEmail: 'teacher@example.test',
      username: null,
      contactEmail: 'contact@example.test',
      phone: '+201001234567',
      firstName: 'Nour',
      lastName: 'Ali',
    });
    expect(state.createExactTeacher).toHaveBeenCalledWith({
      userId: IDS.user,
      organizationId: IDS.organization,
      schoolId: IDS.school,
      roleId: IDS.role,
      status: 'ACTIVE',
    });
    expect(state.createProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: IDS.school,
        userId: IDS.user,
        employmentStatus: TeacherEmploymentStatus.ACTIVE,
        fields: expect.objectContaining({
          teacherCode: 'T001',
          workingDays: ['SUNDAY', 'FRIDAY'],
        }),
      }),
    );
    expect(result).toMatchObject({
      id: IDS.profile,
      userId: IDS.user,
      accountStatus: UserStatus.INVITED,
      membershipStatus: MembershipStatus.ACTIVE,
      membershipEndedAt: null,
      employmentStatus: TeacherEmploymentStatus.ACTIVE,
      profileCompleteness: { isComplete: true, missingFields: [] },
      credentialSummary: {
        hasPassword: false,
        status: 'missing',
        mustChangePassword: false,
        passwordProvisionedAt: null,
        passwordChangedAt: null,
        credentialVersion: 0,
      },
    });
    for (const forbidden of [
      'password',
      'passwordHash',
      'roleId',
      'membershipId',
      'schoolId',
      'organizationId',
      'sessions',
    ]) {
      expect(result).not.toHaveProperty(forbidden);
    }
  });

  it.each([TeacherEmploymentStatus.ACTIVE, TeacherEmploymentStatus.INACTIVE])(
    'requires and persists explicit supported employment state %s',
    async (status) => {
      const state = setup({ profile: createdProfile(status) });
      const result = await invoke(state, command({ employmentStatus: status }));
      expect(state.createProfile).toHaveBeenCalledWith(
        expect.objectContaining({ employmentStatus: status }),
      );
      expect(result.employmentStatus).toBe(status);
    },
  );

  it.each([
    ['AR', 'نور', 'علي'],
    ['EN', 'Nour', 'Ali'],
  ] as const)(
    'uses %s managed names for the compatibility display projection',
    async (language, firstName, lastName) => {
      const state = setup({});
      await invoke(state, command({ preferredDisplayLanguage: language }));
      expect(state.createInvitedTeacher).toHaveBeenCalledWith(
        expect.objectContaining({ firstName, lastName }),
      );
    },
  );

  it('validates role and identity before any state write and preserves write order', async () => {
    const state = setup({});
    await invoke(state);
    expect(state.resolveExactTeacherRole).toHaveBeenCalledWith(IDS.school);
    expect(state.events).toEqual([
      'user',
      'membership',
      'profile',
      'audit1',
      'audit2',
    ]);
    expect(
      state.writeSuccessful.mock.calls.map((call) => call[0].action),
    ).toEqual(['teachers.account.provision', 'teachers.profile.create']);
  });

  it.each([
    ['user', ['user']],
    ['membership', ['user', 'membership']],
    ['profile', ['user', 'membership', 'profile']],
    ['firstAudit', ['user', 'membership', 'profile', 'audit1']],
    ['secondAudit', ['user', 'membership', 'profile', 'audit1', 'audit2']],
  ] as const)('does not commit when %s fails', async (failAt, events) => {
    const state = setup({ failAt });
    await expect(invoke(state)).rejects.toThrow();
    expect(state.events).toEqual(events);
    expect(state.isCommitted()).toBe(false);
  });

  it('does not commit when safe response composition fails', async () => {
    const badProfile = createdProfile();
    badProfile.createdAt = new Date('invalid');
    const state = setup({ profile: badProfile });
    await expect(invoke(state)).rejects.toThrow();
    expect(state.writeSuccessful).toHaveBeenCalledTimes(2);
    expect(state.isCommitted()).toBe(false);
  });

  it.each([
    ['missing', null],
    ['deleted', role({ deletedAt: new Date() })],
    ['foreign-school', role({ schoolId: IDS.otherSchool })],
    ['wrong-key', role({ key: 'school_admin' })],
  ])(
    'rejects a %s Teacher Role before state writes',
    async (_label, resolvedRole) => {
      const state = setup({ resolvedRole });
      await expect(invoke(state)).rejects.toMatchObject({
        code: 'teachers.account.teacher_role_required',
        httpStatus: 422,
      });
      expect(state.createInvitedTeacher).not.toHaveBeenCalled();
    },
  );

  it('reports identity conflicts with fixed keys and no attempted values', async () => {
    const state = setup({ conflicts: ['phone', 'username'] });
    const attempted = command({ username: 'Teacher.One' });
    await expect(invoke(state, attempted)).rejects.toMatchObject({
      code: 'teachers.account.identity_conflict',
      details: { fields: ['phone', 'username'] },
    });
    expect(state.createInvitedTeacher).not.toHaveBeenCalled();
    expect(JSON.stringify(state.writeSuccessful.mock.calls)).not.toContain(
      attempted.phone,
    );
  });

  it.each([
    [{ teacherCode: undefined }, ['teacherCode']],
    [{ firstNameAr: undefined }, ['firstNameAr']],
    [{ lastNameAr: undefined }, ['lastNameAr']],
    [{ firstNameEn: undefined }, ['firstNameEn']],
    [{ lastNameEn: undefined }, ['lastNameEn']],
    [{ gender: undefined }, ['gender']],
  ] as const)(
    'rejects incomplete provisioning input %s',
    async (override, missing) => {
      const state = setup({});
      await expect(
        invoke(state, command(override as Partial<CreateTeacherDto>)),
      ).rejects.toMatchObject({
        code: 'teachers.profile.incomplete',
        details: { missingFields: missing },
      });
      expect(state.execute).not.toHaveBeenCalled();
    },
  );

  it.each([
    [{ preferredDisplayLanguage: undefined }, 'preferredDisplayLanguage'],
    [{ preferredDisplayLanguage: 'OTHER' }, 'preferredDisplayLanguage'],
    [{ employmentStatus: undefined }, 'employmentStatus'],
    [
      { employmentStatus: TeacherEmploymentStatus.TERMINATED },
      'employmentStatus',
    ],
    [{ teacherCode: '   ' }, 'teacherCode'],
    [{ firstNameEn: 'x'.repeat(51) }, 'firstNameEn'],
    [{ gender: 'OTHER' }, 'gender'],
    [{ employmentType: 'OTHER' }, 'employmentType'],
    [{ experienceYears: 61 }, 'experienceYears'],
    [{ hireDate: '2025-02-29' }, 'hireDate'],
    [{ workingDays: ['MONDAY', 'MONDAY'] }, 'workingDays'],
    [{ workStartTime: '08:00' }, 'workStartTime'],
    [{ workStartTime: '15:00', workEndTime: '08:00' }, 'workEndTime'],
    [{ notesEn: 'x'.repeat(501) }, 'notesEn'],
  ] as const)('rejects invalid managed command %s', async (override, field) => {
    const state = setup({});
    await expect(
      invoke(state, command(override as Partial<CreateTeacherDto>)),
    ).rejects.toMatchObject({
      code: 'validation.failed',
      details: { field },
    });
    expect(state.createInvitedTeacher).not.toHaveBeenCalled();
  });

  it('reuses IAM username and explicit login override normalization', async () => {
    const state = setup({
      identity: {
        email: 'teacher.one@school.example',
        username: 'teacher.one',
        contactEmail: 'contact@example.test',
        generatedLoginEmail: true,
      },
    });
    await invoke(
      state,
      command({
        username: ' Teacher.One ',
        loginEmail: 'teacher.one@school.example',
      }),
    );
    expect(state.normalize).toHaveBeenCalledWith({
      email: 'teacher.one@school.example',
      username: ' Teacher.One ',
      contactEmail: ' Contact@Example.Test ',
    });
    expect(state.findProvisioningIdentityConflicts).toHaveBeenCalledWith(
      expect.objectContaining({
        loginEmail: 'teacher.one@school.example',
        username: 'teacher.one',
      }),
    );
  });

  it.each([
    [
      { target: ['school_id', 'teacher_code'] },
      'teachers.profile.code_conflict',
    ],
    [{ target: ['email'] }, 'teachers.account.identity_conflict'],
    [{ target: ['phone'] }, 'teachers.account.identity_conflict'],
    [
      { target: ['school_id', 'user_id'] },
      'teachers.account.role_transition_conflict',
    ],
  ])('maps uniqueness race %j to one safe conflict', async (meta, code) => {
    const state = setup({ failAt: 'profile' });
    state.createProfile.mockRejectedValueOnce(
      Object.assign(new Error('private database detail'), {
        code: 'P2002',
        meta,
      }),
    );
    await expect(invoke(state)).rejects.toMatchObject({ code });
  });

  it('uses only trusted current-school scope and invokes no credential or Session writer', async () => {
    const state = setup({});
    await invoke(state);
    expect(state.resolveExactTeacherRole).toHaveBeenCalledWith(IDS.school);
    expect(state.createProfile).toHaveBeenCalledWith(
      expect.objectContaining({ schoolId: IDS.school }),
    );
    expect(state.context.sessions.revokeUserSessions).not.toHaveBeenCalled();
    expect(JSON.stringify(state.createInvitedTeacher.mock.calls)).not.toMatch(
      /password|credential|session/iu,
    );
  });
});
