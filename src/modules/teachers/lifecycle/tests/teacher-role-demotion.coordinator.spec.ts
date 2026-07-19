import {
  MembershipStatus,
  TeacherEmploymentStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import { summarizeTeacherAllocationLifecycleStates } from '../../../academics/teacher-allocation/domain/teacher-allocation-lifecycle-state';
import { TeacherLifecycleMembershipInvariantError } from '../../../settings/users/infrastructure/teacher-lifecycle-membership.operations';
import type {
  TeacherLifecycleMembershipState,
  TeacherLifecycleProfileState,
  TeacherLifecycleTransactionContext,
  TeacherLifecycleUnitOfWork,
  TeacherLifecycleUserState,
} from '../application/teacher-lifecycle-unit-of-work';
import { TeacherRoleDemotionCoordinator } from '../application/teacher-role-demotion.coordinator';
import type { TeacherRejectedTransitionAuditService } from '../application/teacher-rejected-transition-audit.service';

const IDS = {
  actor: '63000000-0000-4000-8000-000000000001',
  organization: '63000000-0000-4000-8000-000000000002',
  school: '63000000-0000-4000-8000-000000000003',
  user: '63000000-0000-4000-8000-000000000004',
  teacherMembership: '63000000-0000-4000-8000-000000000005',
  targetMembership: '63000000-0000-4000-8000-000000000006',
  teacherRole: '63000000-0000-4000-8000-000000000007',
  targetRole: '63000000-0000-4000-8000-000000000008',
  profile: '63000000-0000-4000-8000-000000000009',
};
const EFFECTIVE_AT = new Date('2026-07-19T12:00:00.000Z');

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

function teacherMembership(
  overrides: Partial<TeacherLifecycleMembershipState> = {},
): TeacherLifecycleMembershipState {
  return {
    id: IDS.teacherMembership,
    userId: IDS.user,
    organizationId: IDS.organization,
    schoolId: IDS.school,
    roleId: IDS.teacherRole,
    userType: UserType.TEACHER,
    status: MembershipStatus.ACTIVE,
    startedAt: new Date('2026-01-01T00:00:00.000Z'),
    endedAt: null,
    deletedAt: null,
    role: {
      id: IDS.teacherRole,
      key: 'teacher',
      schoolId: null,
      deletedAt: null,
    },
    user: { userType: UserType.TEACHER, deletedAt: null },
    ...overrides,
  };
}

function profile(): TeacherLifecycleProfileState {
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
  sourceMembership: TeacherLifecycleMembershipState = teacherMembership(),
) {
  const user = teacherUser();
  const membership = sourceMembership;
  const archived = jest
    .fn()
    .mockResolvedValue({ ...profile(), deletedAt: EFFECTIVE_AT });
  const setInactive = jest.fn().mockResolvedValue({
    ...membership,
    status: MembershipStatus.INACTIVE,
    endedAt: EFFECTIVE_AT,
  });
  const createReviewedNonTeacher = jest.fn().mockResolvedValue({
    ...membership,
    id: IDS.targetMembership,
    roleId: IDS.targetRole,
    userType: UserType.SCHOOL_USER,
    status: MembershipStatus.ACTIVE,
    role: {
      id: IDS.targetRole,
      key: 'school_admin',
      name: 'School Admin',
      schoolId: IDS.school,
      deletedAt: null,
    },
  });
  const restoreReviewedNonTeacher = jest.fn();
  const setTypeForReviewedTransition = jest.fn().mockResolvedValue({
    ...user,
    userType: UserType.SCHOOL_USER,
  });
  const revokeUserSessions = jest.fn().mockResolvedValue(2);
  const writeSuccessful = jest.fn().mockResolvedValue(undefined);
  const transaction = {
    user: {
      findState: jest.fn().mockResolvedValue(user),
      setTypeForReviewedTransition,
    },
    membership: {
      findCurrentSchoolState: jest.fn().mockResolvedValue(membership),
      resolveAssignableNonTeacherRole: jest.fn().mockResolvedValue({
        id: IDS.targetRole,
        key: 'school_admin',
        name: 'School Admin',
        schoolId: IDS.school,
        deletedAt: null,
      }),
      listCurrentSchoolHistory: jest.fn().mockResolvedValue([membership]),
      setInactive,
      createReviewedNonTeacher,
      restoreReviewedNonTeacher,
    },
    profile: {
      findExactSchoolUserFootprint: jest.fn().mockResolvedValue(profile()),
      archive: archived,
    },
    allocation: {
      classify: jest
        .fn()
        .mockResolvedValue(summarizeTeacherAllocationLifecycleStates(states)),
    },
    sessions: { revokeUserSessions },
    audit: { writeSuccessful },
  } as unknown as TeacherLifecycleTransactionContext;
  const execute = jest.fn((callback) => callback(transaction));
  const auditAndThrow = jest.fn(async ({ error }) => {
    throw error;
  });
  const coordinator = new TeacherRoleDemotionCoordinator(
    { execute } as unknown as TeacherLifecycleUnitOfWork,
    { auditAndThrow } as unknown as TeacherRejectedTransitionAuditService,
  );
  return {
    coordinator,
    archived,
    setInactive,
    createReviewedNonTeacher,
    restoreReviewedNonTeacher,
    setTypeForReviewedTransition,
    revokeUserSessions,
    writeSuccessful,
    auditAndThrow,
  };
}

function invoke(coordinator: TeacherRoleDemotionCoordinator) {
  return coordinator.execute({
    actorId: IDS.actor,
    actorUserType: UserType.SCHOOL_USER,
    organizationId: IDS.organization,
    schoolId: IDS.school,
    userId: IDS.user,
    teacherMembershipId: IDS.teacherMembership,
    targetRoleId: IDS.targetRole,
    effectiveAt: EFFECTIVE_AT,
  });
}

describe('TeacherRoleDemotionCoordinator', () => {
  it('archives Teacher history, ends its Membership, creates target Membership, changes type, and revokes Sessions', async () => {
    const fixture = setup(['historical']);
    const result = await invoke(fixture.coordinator);
    expect(fixture.archived).toHaveBeenCalledWith({
      schoolId: IDS.school,
      profileId: IDS.profile,
      deletedAt: EFFECTIVE_AT,
    });
    expect(fixture.setInactive).toHaveBeenCalledWith(
      expect.objectContaining({ endedAt: EFFECTIVE_AT }),
    );
    expect(fixture.createReviewedNonTeacher).toHaveBeenCalledTimes(1);
    expect(fixture.setTypeForReviewedTransition).toHaveBeenCalledWith({
      userId: IDS.user,
      expectedUserType: UserType.TEACHER,
      userType: UserType.SCHOOL_USER,
    });
    expect(fixture.revokeUserSessions).toHaveBeenCalledWith(
      IDS.user,
      EFFECTIVE_AT,
    );
    expect(result.user.status).toBe(UserStatus.ACTIVE);
  });

  it.each(['current_active', 'future'] as const)(
    'blocks %s allocation and attempts sanitized rejection audit',
    async (state) => {
      const fixture = setup([state]);
      await expect(invoke(fixture.coordinator)).rejects.toMatchObject({
        code: 'teachers.lifecycle.active_assignments',
      });
      expect(fixture.auditAndThrow).toHaveBeenCalledWith(
        expect.objectContaining({
          audit: expect.objectContaining({
            metadata: { reasonCode: 'active_or_future_allocations' },
          }),
        }),
      );
      expect(fixture.archived).not.toHaveBeenCalled();
    },
  );

  it.each(['current_inactive', 'inconsistent', 'invalid'] as const)(
    'fails closed for %s allocation integrity and audits rejection',
    async (state) => {
      const fixture = setup([state]);
      await expect(invoke(fixture.coordinator)).rejects.toMatchObject({
        code: 'teachers.account.role_transition_conflict',
        details: { reasonCode: 'teacher_allocation_state_unproven' },
      });
      expect(fixture.auditAndThrow).toHaveBeenCalledWith(
        expect.objectContaining({
          audit: expect.objectContaining({
            metadata: { reasonCode: 'allocation_integrity_risk' },
          }),
        }),
      );
    },
  );

  it.each([[[]], [['historical']]] as const)(
    'permits non-blocking footprint %p and preserves status',
    async (states) => {
      const fixture = setup([...states]);
      const result = await invoke(fixture.coordinator);
      expect(result.user.status).toBe(UserStatus.ACTIVE);
      expect(
        fixture.writeSuccessful.mock.calls.map(([entry]) => entry.action),
      ).toEqual(['teachers.profile.archive', 'teachers.role.demote']);
    },
  );

  it.each([
    [MembershipStatus.SUSPENDED, null],
    [MembershipStatus.INACTIVE, EFFECTIVE_AT],
  ] as const)(
    'demotes a non-operational %s Teacher footprint after allocations are remediated',
    async (status, endedAt) => {
      const fixture = setup(
        ['historical'],
        teacherMembership({ status, endedAt }),
      );
      await expect(invoke(fixture.coordinator)).resolves.toMatchObject({
        user: { userType: UserType.SCHOOL_USER },
      });
      expect(fixture.setInactive).toHaveBeenCalledWith(
        expect.objectContaining({
          expectedStatus: status,
          endedAt: EFFECTIVE_AT,
        }),
      );
    },
  );

  it('maps Session failure to safe retryable failure with no alternate action', async () => {
    const fixture = setup();
    fixture.revokeUserSessions.mockRejectedValueOnce(new Error('private'));
    await expect(invoke(fixture.coordinator)).rejects.toMatchObject({
      code: 'teachers.lifecycle.revocation_failed',
      details: { retryable: true, reasonCode: 'revocation_failed' },
    });
  });

  it('fails closed when the Teacher Membership moves before demotion', async () => {
    const fixture = setup();
    fixture.setInactive.mockRejectedValueOnce(
      new TeacherLifecycleMembershipInvariantError(
        'membership_not_found_or_not_writable',
      ),
    );
    await expect(invoke(fixture.coordinator)).rejects.toMatchObject({
      code: 'teachers.account.role_transition_conflict',
    });
    expect(fixture.createReviewedNonTeacher).not.toHaveBeenCalled();
    expect(fixture.writeSuccessful).not.toHaveBeenCalled();
  });
});
