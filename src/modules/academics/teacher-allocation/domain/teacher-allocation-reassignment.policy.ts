import { TeacherEmploymentStatus, UserStatus, UserType } from '@prisma/client';
import { isOperationalTeacherMembership } from '../../../teachers/lifecycle/domain/teacher-membership-state';
import { projectTeacherProfileCompleteness } from '../../../teachers/profile/domain/teacher-profile.integrity';
import type { ReassignmentTargetRecord } from '../infrastructure/teacher-allocation-reassignment-read.repository';
import type { TeacherAllocationReassignmentTargetIneligibleReason } from './teacher-allocation-reassignment.types';

export function evaluateReassignmentTargetEligibility(params: {
  schoolId: string;
  target: ReassignmentTargetRecord;
}):
  | { eligible: true }
  | {
      eligible: false;
      reasonCode: TeacherAllocationReassignmentTargetIneligibleReason;
    } {
  const { schoolId, target } = params;

  if (target.userType !== UserType.TEACHER || target.deletedAt !== null) {
    return { eligible: false, reasonCode: 'incompatible_identity' };
  }

  if (
    target.status !== UserStatus.ACTIVE &&
    target.status !== UserStatus.INVITED
  ) {
    return { eligible: false, reasonCode: 'account_status_ineligible' };
  }

  const membership = target.memberships.find((item) => {
    const state = {
      ...item,
      user: {
        userType: target.userType,
        deletedAt: target.deletedAt,
      },
    };
    return isOperationalTeacherMembership(state);
  });
  if (!membership) {
    return { eligible: false, reasonCode: 'membership_ineligible' };
  }

  const profile = target.teacherProfiles.find(
    (item) =>
      item.schoolId === schoolId &&
      item.userId === target.id &&
      item.deletedAt === null,
  );
  if (!profile) {
    return { eligible: false, reasonCode: 'profile_missing' };
  }

  if (profile.employmentStatus !== TeacherEmploymentStatus.ACTIVE) {
    return { eligible: false, reasonCode: 'employment_inactive' };
  }

  if (!projectTeacherProfileCompleteness(profile).isComplete) {
    return { eligible: false, reasonCode: 'profile_incomplete' };
  }

  return { eligible: true };
}
