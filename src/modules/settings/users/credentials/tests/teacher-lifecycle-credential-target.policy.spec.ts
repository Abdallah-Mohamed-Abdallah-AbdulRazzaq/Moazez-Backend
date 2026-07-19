import {
  MembershipStatus,
  TeacherEmploymentStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import {
  TEACHER_REHIRE_CREDENTIAL_AUTHORIZATION_MODE,
  authorizeTeacherRehireCredentialTarget,
  type TeacherRehireCredentialTargetInput,
} from '../application/teacher-lifecycle-credential-target.policy';
import { partitionCredentialTargets } from '../application/credential-targeting';
import type { CredentialMembershipRecord } from '../infrastructure/user-credentials.repository';

const IDS = {
  school: '30000000-0000-4000-8000-000000000001',
  otherSchool: '30000000-0000-4000-8000-000000000002',
  user: '30000000-0000-4000-8000-000000000003',
};

function validInput(): TeacherRehireCredentialTargetInput {
  return {
    mode: TEACHER_REHIRE_CREDENTIAL_AUTHORIZATION_MODE,
    actorSchoolId: IDS.school,
    user: {
      id: IDS.user,
      userType: UserType.TEACHER,
      status: UserStatus.DISABLED,
      deletedAt: null,
    },
    membership: {
      userId: IDS.user,
      schoolId: IDS.school,
      userType: UserType.TEACHER,
      status: MembershipStatus.SUSPENDED,
      endedAt: null,
      deletedAt: null,
      role: { key: 'teacher', schoolId: null, deletedAt: null },
    },
    profile: {
      userId: IDS.user,
      schoolId: IDS.school,
      employmentStatus: TeacherEmploymentStatus.INACTIVE,
      deletedAt: null,
      teacherCode: 'T01',
      firstNameAr: 'معلم',
      lastNameAr: 'مكتمل',
      firstNameEn: 'Complete',
      lastNameEn: 'Teacher',
      gender: 'MALE',
    },
  };
}

describe('Teacher rehire credential target policy', () => {
  it('leaves ordinary credential target behavior unchanged', () => {
    const ordinaryTarget = {
      user: { status: UserStatus.ACTIVE, passwordHash: null },
    } as CredentialMembershipRecord;
    const result = partitionCredentialTargets([ordinaryTarget], {
      scope: 'selected',
      userIds: [IDS.user],
      includeDisabledUsers: false,
      includeUsersWithPassword: false,
    });
    expect(result.eligible).toEqual([ordinaryTarget]);
    expect(result.skipped).toEqual([]);
  });

  it('requires explicit Teacher lifecycle authorization mode', () => {
    const input = validInput();
    delete input.mode;
    expect(authorizeTeacherRehireCredentialTarget(input)).toEqual({
      authorized: false,
      reason: 'lifecycle_mode_required',
    });
  });

  it('allows only the exact disabled, suspended, inactive same-school state', () => {
    expect(authorizeTeacherRehireCredentialTarget(validInput())).toEqual({
      authorized: true,
      reason: 'exact_rehire_state',
    });
  });

  it.each([UserStatus.ACTIVE, UserStatus.INVITED, UserStatus.SUSPENDED])(
    'rejects User status %s',
    (status) => {
      const input = validInput();
      if (input.user) input.user.status = status;
      expect(authorizeTeacherRehireCredentialTarget(input)).toMatchObject({
        authorized: false,
        reason: 'teacher_user_state_required',
      });
    },
  );

  it('rejects a deleted, non-Teacher, or missing User', () => {
    for (const mutate of [
      (input: TeacherRehireCredentialTargetInput) => {
        if (input.user) input.user.deletedAt = new Date();
      },
      (input: TeacherRehireCredentialTargetInput) => {
        if (input.user) input.user.userType = UserType.SCHOOL_USER;
      },
      (input: TeacherRehireCredentialTargetInput) => {
        input.user = null;
      },
    ]) {
      const input = validInput();
      mutate(input);
      expect(authorizeTeacherRehireCredentialTarget(input).authorized).toBe(
        false,
      );
    }
  });

  it.each([
    MembershipStatus.ACTIVE,
    MembershipStatus.INACTIVE,
    MembershipStatus.TRANSFERRED,
  ])('rejects Membership status %s', (status) => {
    const input = validInput();
    if (input.membership) input.membership.status = status;
    expect(authorizeTeacherRehireCredentialTarget(input)).toMatchObject({
      authorized: false,
      reason: 'exact_suspended_membership_required',
    });
  });

  it('rejects ended or deleted Memberships', () => {
    const ended = validInput();
    if (ended.membership) ended.membership.endedAt = new Date();
    const deleted = validInput();
    if (deleted.membership) deleted.membership.deletedAt = new Date();
    expect(authorizeTeacherRehireCredentialTarget(ended).authorized).toBe(
      false,
    );
    expect(authorizeTeacherRehireCredentialTarget(deleted).authorized).toBe(
      false,
    );
  });

  it('rejects wrong Role key, deleted Role, type mismatch, and cross-school Role', () => {
    const mutations = [
      (input: TeacherRehireCredentialTargetInput) => {
        if (input.membership?.role) input.membership.role.key = 'school_admin';
      },
      (input: TeacherRehireCredentialTargetInput) => {
        if (input.membership?.role)
          input.membership.role.deletedAt = new Date();
      },
      (input: TeacherRehireCredentialTargetInput) => {
        if (input.membership) input.membership.userType = UserType.SCHOOL_USER;
      },
      (input: TeacherRehireCredentialTargetInput) => {
        if (input.membership?.role)
          input.membership.role.schoolId = IDS.otherSchool;
      },
    ];
    for (const mutate of mutations) {
      const input = validInput();
      mutate(input);
      expect(authorizeTeacherRehireCredentialTarget(input).authorized).toBe(
        false,
      );
    }
  });

  it('rejects missing, incomplete, deleted, active, or terminated Profiles', () => {
    const mutations = [
      (input: TeacherRehireCredentialTargetInput) => {
        input.profile = null;
      },
      (input: TeacherRehireCredentialTargetInput) => {
        if (input.profile) input.profile.firstNameAr = null;
      },
      (input: TeacherRehireCredentialTargetInput) => {
        if (input.profile) input.profile.deletedAt = new Date();
      },
      (input: TeacherRehireCredentialTargetInput) => {
        if (input.profile)
          input.profile.employmentStatus = TeacherEmploymentStatus.ACTIVE;
      },
      (input: TeacherRehireCredentialTargetInput) => {
        if (input.profile)
          input.profile.employmentStatus = TeacherEmploymentStatus.TERMINATED;
      },
    ];
    for (const mutate of mutations) {
      const input = validInput();
      mutate(input);
      expect(authorizeTeacherRehireCredentialTarget(input).authorized).toBe(
        false,
      );
    }
  });

  it('rejects a foreign-school actor or Profile', () => {
    const actorMismatch = validInput();
    actorMismatch.actorSchoolId = IDS.otherSchool;
    const profileMismatch = validInput();
    if (profileMismatch.profile)
      profileMismatch.profile.schoolId = IDS.otherSchool;
    expect(authorizeTeacherRehireCredentialTarget(actorMismatch)).toMatchObject(
      { authorized: false, reason: 'school_scope_mismatch' },
    );
    expect(
      authorizeTeacherRehireCredentialTarget(profileMismatch),
    ).toMatchObject({ authorized: false, reason: 'school_scope_mismatch' });
  });

  it('is pure and performs no credential or lifecycle mutation', () => {
    const input = validInput();
    const before = structuredClone(input);
    authorizeTeacherRehireCredentialTarget(input);
    expect(input).toEqual(before);
  });
});
