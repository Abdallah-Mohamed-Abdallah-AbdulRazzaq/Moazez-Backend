import { MembershipStatus, UserType } from '@prisma/client';
import type { TeacherLifecycleMembershipState } from '../application/teacher-lifecycle-unit-of-work';

export function isExactTeacherRoleForSchool(
  role: Pick<
    TeacherLifecycleMembershipState['role'],
    'key' | 'schoolId' | 'deletedAt'
  > | null,
  schoolId: string | null,
): boolean {
  return (
    schoolId !== null &&
    role !== null &&
    role.key === 'teacher' &&
    role.deletedAt === null &&
    (role.schoolId === null || role.schoolId === schoolId)
  );
}

export function isExactTeacherMembership(
  membership: TeacherLifecycleMembershipState | null,
): membership is TeacherLifecycleMembershipState {
  return (
    membership !== null &&
    membership.schoolId !== null &&
    membership.userType === UserType.TEACHER &&
    membership.deletedAt === null &&
    membership.user.userType === UserType.TEACHER &&
    membership.user.deletedAt === null &&
    isExactTeacherRoleForSchool(membership.role, membership.schoolId)
  );
}

export function isOperationalTeacherMembership(
  membership: TeacherLifecycleMembershipState | null,
): membership is TeacherLifecycleMembershipState {
  return (
    isExactTeacherMembership(membership) &&
    membership.status === MembershipStatus.ACTIVE &&
    membership.endedAt === null
  );
}
