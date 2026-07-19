import {
  MembershipStatus,
  TeacherEmploymentStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
} from '../../../../common/context/request-context';
import { summarizeTeacherAllocationLifecycleStates } from '../../../academics/teacher-allocation/domain/teacher-allocation-lifecycle-state';
import type {
  TeacherLifecycleMembershipState,
  TeacherLifecycleProfileState,
  TeacherLifecycleTransactionContext,
  TeacherLifecycleUnitOfWork,
  TeacherLifecycleUserState,
} from '../../lifecycle/application/teacher-lifecycle-unit-of-work';
import { TeacherProfileLifecycleInvariantError } from '../../profile/infrastructure/teacher-profile-lifecycle.operations';
import { ArchiveTeacherUseCase } from '../application/archive-teacher.use-case';

const IDS = {
  actor: '61000000-0000-4000-8000-000000000001',
  organization: '61000000-0000-4000-8000-000000000002',
  school: '61000000-0000-4000-8000-000000000003',
  user: '61000000-0000-4000-8000-000000000004',
  membership: '61000000-0000-4000-8000-000000000005',
  role: '61000000-0000-4000-8000-000000000006',
  profile: '61000000-0000-4000-8000-000000000007',
};

function teacherUser(): TeacherLifecycleUserState {
  return {
    id: IDS.user,
    loginEmail: 'redacted@example.test',
    username: null,
    contactEmail: null,
    phone: null,
    firstName: 'Safe',
    lastName: 'Teacher',
    userType: UserType.TEACHER,
    status: UserStatus.ACTIVE,
    deletedAt: null,
    credential: {
      hasPassword: true,
      status: 'set',
      mustChangePassword: false,
      passwordProvisionedAt: null,
      passwordChangedAt: null,
      credentialVersion: 1,
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

function teacherProfile(): TeacherLifecycleProfileState {
  return {
    id: IDS.profile,
    schoolId: IDS.school,
    userId: IDS.user,
    teacherCode: 'T001',
    firstNameAr: 'آمن',
    lastNameAr: 'معلم',
    firstNameEn: 'Safe',
    lastNameEn: 'Teacher',
    gender: 'MALE',
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
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    deletedAt: null,
  };
}

function setup(
  states: Parameters<typeof summarizeTeacherAllocationLifecycleStates>[0] = [],
  missingProfile = false,
) {
  const user = teacherUser();
  const membership = teacherMembership();
  const profile = teacherProfile();
  const archive = jest
    .fn()
    .mockResolvedValue({ ...profile, deletedAt: new Date() });
  const setStatus = jest.fn().mockResolvedValue({
    ...user,
    status: UserStatus.DISABLED,
  });
  const setInactive = jest.fn().mockImplementation(({ endedAt }) =>
    Promise.resolve({
      ...membership,
      status: MembershipStatus.INACTIVE,
      endedAt,
    }),
  );
  const revokeUserSessions = jest.fn().mockResolvedValue(2);
  const writeSuccessful = jest.fn().mockResolvedValue(undefined);
  const classify = jest
    .fn()
    .mockResolvedValue(summarizeTeacherAllocationLifecycleStates(states));
  const transaction = {
    profile: {
      findLiveById: jest
        .fn()
        .mockResolvedValue(missingProfile ? null : profile),
      archive,
    },
    user: { findState: jest.fn().mockResolvedValue(user), setStatus },
    membership: {
      findCurrentSchoolState: jest.fn().mockResolvedValue(membership),
      setInactive,
    },
    allocation: { classify },
    sessions: { revokeUserSessions },
    audit: { writeSuccessful },
  } as unknown as TeacherLifecycleTransactionContext;
  const execute = jest.fn((callback) => callback(transaction));
  return {
    useCase: new ArchiveTeacherUseCase({
      execute,
    } as unknown as TeacherLifecycleUnitOfWork),
    archive,
    setStatus,
    setInactive,
    classify,
    revokeUserSessions,
    writeSuccessful,
  };
}

function invoke(useCase: ArchiveTeacherUseCase) {
  const context = createRequestContext('archive-teacher-test');
  context.actor = { id: IDS.actor, userType: UserType.SCHOOL_USER };
  context.activeMembership = {
    membershipId: IDS.membership,
    organizationId: IDS.organization,
    schoolId: IDS.school,
    roleId: IDS.role,
    permissions: ['teachers.records.manage'],
  };
  return runWithRequestContext(context, () => useCase.execute(IDS.profile));
}

describe('ArchiveTeacherUseCase', () => {
  it('soft-archives, disables, ends Membership, revokes Sessions, and audits atomically', async () => {
    const fixture = setup(['historical']);
    await expect(invoke(fixture.useCase)).resolves.toBeUndefined();
    expect(fixture.archive).toHaveBeenCalledWith(
      expect.objectContaining({ schoolId: IDS.school, profileId: IDS.profile }),
    );
    expect(fixture.setStatus).toHaveBeenCalledWith(
      expect.objectContaining({ status: UserStatus.DISABLED }),
    );
    const endedAt = fixture.setInactive.mock.calls[0][0].endedAt;
    expect(endedAt).toBeInstanceOf(Date);
    expect(fixture.revokeUserSessions).toHaveBeenCalledWith(IDS.user, endedAt);
    expect(
      fixture.writeSuccessful.mock.calls.map(([entry]) => entry.action),
    ).toEqual(['teachers.profile.archive', 'teachers.account.disable']);
  });

  it.each(['current_active', 'future'] as const)(
    'blocks %s allocations without state mutation',
    async (state) => {
      const fixture = setup([state]);
      await expect(invoke(fixture.useCase)).rejects.toMatchObject({
        code: 'teachers.lifecycle.active_assignments',
        details: expect.objectContaining({ termStateLabels: [state] }),
      });
      expect(fixture.archive).not.toHaveBeenCalled();
      expect(fixture.revokeUserSessions).not.toHaveBeenCalled();
    },
  );

  it.each(['current_inactive', 'inconsistent', 'invalid'] as const)(
    'fails closed for %s allocation integrity',
    async (state) => {
      const fixture = setup([state]);
      await expect(invoke(fixture.useCase)).rejects.toMatchObject({
        code: 'teachers.lifecycle.archive_conflict',
        details: { reasonCode: 'allocation_state_unproven' },
      });
      expect(fixture.archive).not.toHaveBeenCalled();
    },
  );

  it.each([[[]], [['historical']]] as const)(
    'allows non-blocking allocation footprint %p',
    async (states) => {
      const fixture = setup([...states]);
      await expect(invoke(fixture.useCase)).resolves.toBeUndefined();
      expect(fixture.archive).toHaveBeenCalledTimes(1);
    },
  );

  it('uses safe 404 for missing, archived, or foreign scoped resolution', async () => {
    const fixture = setup([], true);
    await expect(invoke(fixture.useCase)).rejects.toMatchObject({
      code: 'teachers.profile.not_found',
      httpStatus: 404,
      details: undefined,
    });
    expect(fixture.classify).not.toHaveBeenCalled();
  });

  it('maps Session failure to safe retryable revocation failure', async () => {
    const fixture = setup();
    fixture.revokeUserSessions.mockRejectedValueOnce(new Error('private'));
    await expect(invoke(fixture.useCase)).rejects.toMatchObject({
      code: 'teachers.lifecycle.revocation_failed',
      details: { retryable: true, reasonCode: 'revocation_failed' },
    });
  });

  it('uses the transaction-local allocation reader and never mutates allocations', async () => {
    const fixture = setup();
    await invoke(fixture.useCase);
    expect(fixture.classify).toHaveBeenCalledWith({
      schoolId: IDS.school,
      teacherUserId: IDS.user,
      asOf: expect.any(Date),
    });
    expect(Object.keys(fixture)).not.toEqual(
      expect.arrayContaining(['deleteAllocation', 'clearAllocations']),
    );
  });

  it('fails closed when allocation state moves inside the serializable transaction', async () => {
    const fixture = setup();
    fixture.classify.mockRejectedValueOnce({ code: 'P2034' });
    await expect(invoke(fixture.useCase)).rejects.toMatchObject({
      code: 'teachers.lifecycle.archive_conflict',
      details: { reasonCode: 'lifecycle_state_moved' },
    });
    expect(fixture.archive).not.toHaveBeenCalled();
  });

  it('fails closed when the Profile source predicate moves before archive', async () => {
    const fixture = setup();
    fixture.archive.mockRejectedValueOnce(
      new TeacherProfileLifecycleInvariantError(
        'profile_not_found_or_not_writable',
      ),
    );
    await expect(invoke(fixture.useCase)).rejects.toMatchObject({
      code: 'teachers.lifecycle.archive_conflict',
      details: { reasonCode: 'lifecycle_state_moved' },
    });
    expect(fixture.setStatus).not.toHaveBeenCalled();
  });
});
