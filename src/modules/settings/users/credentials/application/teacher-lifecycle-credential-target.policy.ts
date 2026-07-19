import {
  MembershipStatus,
  TeacherEmploymentStatus,
  UserStatus,
  UserType,
  type TeacherGender,
} from '@prisma/client';
import { projectTeacherProfileCompleteness } from '../../../../teachers/profile/domain/teacher-profile.integrity';
import { isExactTeacherRoleForSchool } from '../../../../teachers/lifecycle/domain/teacher-membership-state';

export const TEACHER_REHIRE_CREDENTIAL_AUTHORIZATION_MODE =
  'TEACHER_REHIRE' as const;

export interface TeacherRehireCredentialTargetInput {
  mode?: typeof TEACHER_REHIRE_CREDENTIAL_AUTHORIZATION_MODE;
  actorSchoolId: string;
  user: {
    id: string;
    userType: UserType;
    status: UserStatus;
    deletedAt: Date | null;
  } | null;
  membership: {
    userId: string;
    schoolId: string | null;
    userType: UserType;
    status: MembershipStatus;
    endedAt: Date | null;
    deletedAt: Date | null;
    role: {
      key: string;
      schoolId: string | null;
      deletedAt: Date | null;
    } | null;
  } | null;
  profile: {
    userId: string;
    schoolId: string;
    employmentStatus: TeacherEmploymentStatus;
    deletedAt: Date | null;
    teacherCode: string | null;
    firstNameAr: string | null;
    lastNameAr: string | null;
    firstNameEn: string | null;
    lastNameEn: string | null;
    gender: TeacherGender | null;
  } | null;
}

export type TeacherRehireCredentialTargetDecision =
  | { authorized: true; reason: 'exact_rehire_state' }
  | {
      authorized: false;
      reason:
        | 'lifecycle_mode_required'
        | 'teacher_user_state_required'
        | 'exact_suspended_membership_required'
        | 'complete_inactive_profile_required'
        | 'school_scope_mismatch';
    };

export function authorizeTeacherRehireCredentialTarget(
  input: TeacherRehireCredentialTargetInput,
): TeacherRehireCredentialTargetDecision {
  if (input.mode !== TEACHER_REHIRE_CREDENTIAL_AUTHORIZATION_MODE) {
    return { authorized: false, reason: 'lifecycle_mode_required' };
  }

  const user = input.user;
  if (
    user === null ||
    user.deletedAt !== null ||
    user.userType !== UserType.TEACHER ||
    user.status !== UserStatus.DISABLED
  ) {
    return { authorized: false, reason: 'teacher_user_state_required' };
  }

  const membership = input.membership;
  if (
    membership === null ||
    membership.userId !== user.id ||
    membership.schoolId === null ||
    membership.userType !== UserType.TEACHER ||
    membership.status !== MembershipStatus.SUSPENDED ||
    membership.endedAt !== null ||
    membership.deletedAt !== null ||
    !isExactTeacherRoleForSchool(membership.role, membership.schoolId)
  ) {
    return {
      authorized: false,
      reason: 'exact_suspended_membership_required',
    };
  }

  const profile = input.profile;
  if (
    profile === null ||
    profile.userId !== user.id ||
    profile.deletedAt !== null ||
    profile.employmentStatus !== TeacherEmploymentStatus.INACTIVE ||
    !projectTeacherProfileCompleteness(profile).isComplete
  ) {
    return {
      authorized: false,
      reason: 'complete_inactive_profile_required',
    };
  }

  if (
    input.actorSchoolId !== membership.schoolId ||
    profile.schoolId !== membership.schoolId
  ) {
    return { authorized: false, reason: 'school_scope_mismatch' };
  }

  return { authorized: true, reason: 'exact_rehire_state' };
}
