import {
  MembershipStatus,
  TeacherEmploymentStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import type {
  MembershipFootprint,
  ProfileFootprint,
  SourceMembershipFootprint,
  OwnedTransferSource,
} from '../infrastructure/organization-teacher-transfer-transaction.operations';
import { isExactTeacherRoleForSchool } from '../../../teachers/lifecycle/domain/teacher-membership-state';
import { projectTeacherProfileCompleteness } from '../../../teachers/profile/domain/teacher-profile.integrity';
import { TeacherTransferConflictException } from './organization-teacher-transfer.errors';

export function selectExactSourceMembership(input: {
  source: OwnedTransferSource;
  organizationId: string;
  footprints: SourceMembershipFootprint[];
}): SourceMembershipFootprint {
  const { source } = input;
  if (
    source.user.deletedAt !== null ||
    source.user.userType !== UserType.TEACHER
  ) {
    throw new TeacherTransferConflictException('source_membership_conflict');
  }
  if (source.profile.employmentStatus === TeacherEmploymentStatus.TERMINATED) {
    throw new TeacherTransferConflictException('source_state_conflict');
  }

  const sourceOpenRows = input.footprints.filter(
    (membership) =>
      membership.schoolId === source.schoolId &&
      membership.userId === source.user.id &&
      membership.deletedAt === null &&
      membership.endedAt === null &&
      (membership.status === MembershipStatus.ACTIVE ||
        membership.status === MembershipStatus.SUSPENDED),
  );
  if (
    sourceOpenRows.some(
      (membership) =>
        membership.organizationId !== input.organizationId ||
        membership.userType !== UserType.TEACHER ||
        !isExactTeacherRoleForSchool(membership.role, source.schoolId),
    )
  ) {
    throw new TeacherTransferConflictException('source_membership_conflict');
  }
  if (sourceOpenRows.length !== 1) {
    throw new TeacherTransferConflictException('source_membership_conflict');
  }

  const membership = sourceOpenRows[0];
  const competingOperational = input.footprints.some(
    (candidate) =>
      candidate.id !== membership.id &&
      candidate.status === MembershipStatus.ACTIVE &&
      candidate.endedAt === null &&
      candidate.deletedAt === null,
  );
  if (competingOperational) {
    throw new TeacherTransferConflictException('source_membership_conflict');
  }

  const allowed = isAllowedSourceTuple(source, membership.status);
  if (!allowed) {
    throw new TeacherTransferConflictException('source_state_conflict');
  }
  const completeness = projectTeacherProfileCompleteness(source.profile);
  const incompleteExceptionTuple =
    source.profile.employmentStatus === TeacherEmploymentStatus.INACTIVE &&
    source.user.status === UserStatus.DISABLED &&
    membership.status === MembershipStatus.SUSPENDED;
  if (!completeness.isComplete && !incompleteExceptionTuple) {
    throw new TeacherTransferConflictException('source_state_conflict');
  }
  return membership;
}

function isAllowedSourceTuple(
  source: OwnedTransferSource,
  membershipStatus: MembershipStatus,
): boolean {
  const profileStatus = source.profile.employmentStatus;
  const userStatus = source.user.status;
  if (membershipStatus === MembershipStatus.ACTIVE) {
    return (
      (profileStatus === TeacherEmploymentStatus.ACTIVE &&
        (userStatus === UserStatus.ACTIVE ||
          userStatus === UserStatus.INVITED ||
          userStatus === UserStatus.DISABLED)) ||
      (profileStatus === TeacherEmploymentStatus.INACTIVE &&
        (userStatus === UserStatus.INVITED ||
          userStatus === UserStatus.DISABLED))
    );
  }
  return (
    membershipStatus === MembershipStatus.SUSPENDED &&
    profileStatus === TeacherEmploymentStatus.INACTIVE &&
    userStatus === UserStatus.DISABLED
  );
}

export function selectDestinationProfile(input: {
  sourceProfileId: string;
  destinationSchoolId: string;
  footprints: ProfileFootprint[];
}): ProfileFootprint | null {
  const live = input.footprints.filter((profile) => profile.deletedAt === null);
  if (live.length !== 1 || live[0].id !== input.sourceProfileId) {
    throw new TeacherTransferConflictException(
      'destination_live_profile_exists',
    );
  }
  const destination = input.footprints.filter(
    (profile) => profile.schoolId === input.destinationSchoolId,
  );
  if (destination.some((profile) => profile.deletedAt === null)) {
    throw new TeacherTransferConflictException(
      'destination_live_profile_exists',
    );
  }
  if (destination.length > 1) {
    throw new TeacherTransferConflictException(
      'destination_profile_history_ambiguous',
    );
  }
  return destination[0] ?? null;
}

export function selectDestinationMembership(input: {
  sourceMembershipId: string;
  destinationSchoolId: string;
  footprints: MembershipFootprint[];
}): MembershipFootprint | null {
  const competingOperational = input.footprints.some(
    (membership) =>
      membership.id !== input.sourceMembershipId &&
      membership.status === MembershipStatus.ACTIVE &&
      membership.endedAt === null &&
      membership.deletedAt === null,
  );
  if (competingOperational) {
    throw new TeacherTransferConflictException(
      'destination_membership_conflict',
    );
  }

  const destination = input.footprints.filter(
    (membership) =>
      membership.schoolId === input.destinationSchoolId &&
      membership.deletedAt === null,
  );
  if (destination.length === 0) return null;
  const restorable = destination.filter(
    (membership) =>
      membership.userType === UserType.TEACHER &&
      isExactTeacherRoleForSchool(membership.role, input.destinationSchoolId) &&
      (membership.status === MembershipStatus.SUSPENDED ||
        membership.status === MembershipStatus.INACTIVE ||
        membership.status === MembershipStatus.TRANSFERRED),
  );
  if (restorable.length > 1) {
    throw new TeacherTransferConflictException(
      'destination_membership_history_ambiguous',
    );
  }
  if (restorable.length !== destination.length) {
    throw new TeacherTransferConflictException(
      'destination_membership_conflict',
    );
  }
  return restorable[0];
}
