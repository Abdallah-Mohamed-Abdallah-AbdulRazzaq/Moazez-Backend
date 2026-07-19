import {
  MembershipStatus,
  SchoolLoginSettingsStatus,
  TeacherEmploymentStatus,
  TeacherGender,
  UserStatus,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
} from '../../../../common/context/request-context';
import type { LoginIdentityRepository } from '../../../settings/login-identity/infrastructure/login-identity.repository';
import type {
  TeacherLifecycleProfileState,
  TeacherLifecycleTransactionContext,
  TeacherLifecycleUserState,
  TeacherLifecycleUnitOfWork,
} from '../../lifecycle/application/teacher-lifecycle-unit-of-work';
import type { TeacherLifecycleMembershipState } from '../../lifecycle/application/teacher-lifecycle-unit-of-work';
import { UpdateTeacherUseCase } from '../application/update-teacher.use-case';

const IDS = {
  actor: '42000000-0000-4000-8000-000000000001',
  organization: '42000000-0000-4000-8000-000000000002',
  school: '42000000-0000-4000-8000-000000000003',
  otherSchool: '42000000-0000-4000-8000-000000000004',
  user: '42000000-0000-4000-8000-000000000005',
  profile: '42000000-0000-4000-8000-000000000006',
  membership: '42000000-0000-4000-8000-000000000007',
  role: '42000000-0000-4000-8000-000000000008',
};

function user(
  overrides: Partial<TeacherLifecycleUserState> = {},
): TeacherLifecycleUserState {
  return {
    id: IDS.user,
    loginEmail: 'teacher@login.example',
    username: 'teacher',
    contactEmail: null,
    phone: null,
    firstName: 'Nour',
    lastName: 'Ali',
    userType: UserType.TEACHER,
    status: UserStatus.ACTIVE,
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
  overrides: Partial<TeacherLifecycleProfileState> = {},
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
    employmentStatus: TeacherEmploymentStatus.ACTIVE,
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
  overrides: Partial<TeacherLifecycleMembershipState> = {},
): TeacherLifecycleMembershipState {
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
    ...overrides,
  };
}

function setup(
  overrides: {
    profile?: TeacherLifecycleProfileState | null;
    user?: TeacherLifecycleUserState | null;
    membership?: TeacherLifecycleMembershipState | null;
    conflicts?: string[];
    updateUserError?: Error;
    updateProfileError?: Error;
    auditError?: Error;
  } = {},
) {
  const currentProfile =
    overrides.profile === undefined ? profile() : overrides.profile;
  const currentUser = overrides.user === undefined ? user() : overrides.user;
  const currentMembership =
    overrides.membership === undefined ? membership() : overrides.membership;
  const findState = jest.fn().mockResolvedValue(currentUser);
  const findIdentityConflicts = jest
    .fn()
    .mockResolvedValue(overrides.conflicts ?? []);
  const updateIdentityFields = overrides.updateUserError
    ? jest.fn().mockRejectedValue(overrides.updateUserError)
    : jest.fn(async ({ fields }) => ({ ...currentUser!, ...fields }));
  const updateDisplayNames = jest.fn(async (input) => ({
    ...currentUser!,
    firstName: input.firstName,
    lastName: input.lastName,
  }));
  const updateProfile = overrides.updateProfileError
    ? jest.fn().mockRejectedValue(overrides.updateProfileError)
    : jest.fn(async ({ fields }) => ({ ...currentProfile!, ...fields }));
  const writeSuccessful = overrides.auditError
    ? jest.fn().mockRejectedValue(overrides.auditError)
    : jest.fn().mockResolvedValue(undefined);
  const context = {
    user: {
      findState,
      findIdentityConflicts,
      updateIdentityFields,
      updateDisplayNames,
    },
    membership: {
      findCurrentSchoolState: jest.fn().mockResolvedValue(currentMembership),
    },
    profile: {
      findLiveById: jest.fn().mockResolvedValue(currentProfile),
      update: updateProfile,
    },
    audit: { writeSuccessful },
  } as unknown as TeacherLifecycleTransactionContext;
  const execute = jest.fn((callback) => callback(context));
  const unitOfWork = { execute } as unknown as TeacherLifecycleUnitOfWork;
  const loginIdentityRepository = {
    findCurrentSettings: jest.fn().mockResolvedValue({
      loginDomain: 'school.example',
      usernameMinLength: 3,
      usernameMaxLength: 40,
      reservedUsernames: [],
      status: SchoolLoginSettingsStatus.ACTIVE,
    }),
  } as unknown as LoginIdentityRepository;
  return {
    useCase: new UpdateTeacherUseCase(unitOfWork, loginIdentityRepository),
    context,
    execute,
    findIdentityConflicts,
    updateIdentityFields,
    updateDisplayNames,
    updateProfile,
    writeSuccessful,
  };
}

function invoke(
  useCase: UpdateTeacherUseCase,
  command: Parameters<UpdateTeacherUseCase['execute']>[1],
) {
  const context = createRequestContext('teacher-directory-test');
  context.actor = { id: IDS.actor, userType: UserType.SCHOOL_USER };
  context.activeMembership = {
    membershipId: IDS.membership,
    schoolId: IDS.school,
    organizationId: IDS.organization,
    roleId: IDS.role,
    permissions: ['teachers.records.manage'],
  };
  return runWithRequestContext(context, () =>
    useCase.execute(IDS.profile, command),
  );
}

describe('UpdateTeacherUseCase', () => {
  it('updates Profile fields and writes one sanitized audit in one Unit of Work', async () => {
    const state = setup();
    const result = await invoke(state.useCase, { department: ' Science ' });
    expect(state.execute).toHaveBeenCalledTimes(1);
    expect(state.updateProfile).toHaveBeenCalledWith({
      schoolId: IDS.school,
      profileId: IDS.profile,
      fields: { department: 'Science' },
    });
    expect(state.writeSuccessful).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'teachers.profile.update',
        resourceType: 'teacher_profile',
        metadata: expect.objectContaining({ changedFields: ['department'] }),
      }),
    );
    expect(result.department).toBe('Science');
    expect(JSON.stringify(state.writeSuccessful.mock.calls)).not.toContain(
      'Science',
    );
  });

  it('normalizes and updates IAM contact identity through the same transaction context', async () => {
    const state = setup();
    await invoke(state.useCase, {
      loginEmail: ' NEW@EXAMPLE.TEST ',
      contactEmail: ' CONTACT@EXAMPLE.TEST ',
      phone: ' +201001234567 ',
    });
    expect(state.findIdentityConflicts).toHaveBeenCalledWith({
      userId: IDS.user,
      fields: {
        loginEmail: 'new@example.test',
        contactEmail: 'contact@example.test',
        phone: '+201001234567',
      },
    });
    expect(state.updateIdentityFields).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['AR', { firstNameAr: 'سارة', lastNameAr: 'حسن' }, 'سارة', 'حسن'],
    ['EN', { firstNameEn: 'Sara', lastNameEn: 'Hassan' }, 'Sara', 'Hassan'],
  ] as const)(
    'updates managed names and %s compatibility projections atomically',
    async (preferredDisplayLanguage, names, firstName, lastName) => {
      const state = setup();
      await invoke(state.useCase, { ...names, preferredDisplayLanguage });
      expect(state.updateDisplayNames).toHaveBeenCalledWith({
        userId: IDS.user,
        firstName,
        lastName,
      });
      expect(state.updateProfile).toHaveBeenCalledWith(
        expect.objectContaining({ fields: names }),
      );
    },
  );

  it('rejects managed name changes without preferred display language', async () => {
    const state = setup();
    await expect(
      invoke(state.useCase, { firstNameEn: 'Sara' }),
    ).rejects.toMatchObject({ code: 'validation.failed' });
    expect(state.execute).not.toHaveBeenCalled();
  });

  it('validates the preferred language against the final composed names', async () => {
    const state = setup({ profile: profile({ firstNameAr: null }) });
    await expect(
      invoke(state.useCase, {
        lastNameAr: 'حسن',
        preferredDisplayLanguage: 'AR',
      }),
    ).rejects.toMatchObject({ code: 'validation.failed' });
  });

  it('normalizes Teacher code and canonical working-day order', async () => {
    const state = setup();
    await invoke(state.useCase, {
      teacherCode: ' t 009 ',
      workingDays: ['FRIDAY', 'SUNDAY', 'TUESDAY'],
    });
    expect(state.updateProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        fields: expect.objectContaining({
          teacherCode: 'T009',
          workingDays: ['SUNDAY', 'TUESDAY', 'FRIDAY'],
        }),
      }),
    );
  });

  it('maps a school teacher-code uniqueness race to the safe conflict', async () => {
    const conflict = Object.assign(new Error('private database detail'), {
      code: 'P2002',
      meta: { target: ['school_id', 'teacher_code'] },
    });
    const state = setup({ updateProfileError: conflict });
    await expect(
      invoke(state.useCase, { teacherCode: 'T009' }),
    ).rejects.toMatchObject({
      code: 'teachers.profile.code_conflict',
      details: { field: 'teacherCode' },
    });
  });

  it('reports identity conflicts using fixed field keys only', async () => {
    const state = setup({ conflicts: ['phone'] });
    await expect(
      invoke(state.useCase, { phone: '+201001234567' }),
    ).rejects.toMatchObject({
      code: 'teachers.account.identity_conflict',
      details: { fields: ['phone'] },
    });
    expect(JSON.stringify(state.writeSuccessful.mock.calls)).not.toContain(
      '+201001234567',
    );
  });

  it('derives normalized login email when username is managed', async () => {
    const state = setup();
    await invoke(state.useCase, { username: ' New.Teacher ' });
    expect(state.updateIdentityFields).toHaveBeenCalledWith({
      userId: IDS.user,
      fields: {
        username: 'new.teacher',
        loginEmail: 'new.teacher@school.example',
      },
    });
  });

  it.each([
    [{ experienceYears: -1 }, 'experienceYears'],
    [{ hireDate: '2025-02-29' }, 'hireDate'],
    [{ workingDays: ['MONDAY', 'MONDAY'] }, 'workingDays'],
    [{ workStartTime: '08:00' }, 'workStartTime'],
    [{ workStartTime: '15:00', workEndTime: '08:00' }, 'workEndTime'],
  ] as const)('rejects invalid final input for %s', async (command, field) => {
    const state = setup();
    await expect(invoke(state.useCase, command as never)).rejects.toMatchObject(
      { code: 'validation.failed', details: { field } },
    );
  });

  it('denies missing, archived, or cross-school Profile with one safe 404', async () => {
    for (const currentProfile of [null, profile({ deletedAt: new Date() })]) {
      const state = setup({
        profile: currentProfile?.deletedAt ? null : currentProfile,
      });
      await expect(
        invoke(state.useCase, { department: 'Science' }),
      ).rejects.toMatchObject({ code: 'teachers.profile.not_found' });
    }
  });

  it.each([
    ['deleted User', { user: user({ deletedAt: new Date() }) }],
    ['non-Teacher User', { user: user({ userType: UserType.SCHOOL_USER }) }],
    [
      'deleted Role',
      {
        membership: membership({
          role: { ...membership().role, deletedAt: new Date() },
        }),
      },
    ],
    [
      'cross-school Role',
      {
        membership: membership({
          role: { ...membership().role, schoolId: IDS.otherSchool },
        }),
      },
    ],
    [
      'deleted Membership',
      { membership: membership({ deletedAt: new Date() }) },
    ],
  ] as const)(
    'denies inconsistent %s without repair',
    async (_label, overrides) => {
      const state = setup(overrides);
      await expect(
        invoke(state.useCase, { department: 'Science' }),
      ).rejects.toMatchObject({ code: 'teachers.profile.not_found' });
      expect(state.updateProfile).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['User', { updateUserError: new Error('user failure') }],
    ['Profile', { updateProfileError: new Error('profile failure') }],
    ['audit', { auditError: new Error('audit failure') }],
  ] as const)(
    'propagates %s transaction failure without a success response',
    async (_stage, override) => {
      const state = setup(override);
      await expect(
        invoke(state.useCase, {
          loginEmail: 'new@example.test',
          department: 'Science',
        }),
      ).rejects.toThrow();
      expect(state.execute).toHaveBeenCalledTimes(1);
    },
  );

  it('never revokes Sessions for an ordinary managed record update', async () => {
    const state = setup();
    await invoke(state.useCase, { department: 'Science' });
    expect(
      (state.context as unknown as { sessions?: unknown }).sessions,
    ).toBeUndefined();
  });
});
