import { Injectable } from '@nestjs/common';
import type {
  Prisma,
  TeacherEmploymentStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import { revokeTeacherLifecycleUserSessionsInTransaction } from '../../../iam/auth/infrastructure/teacher-lifecycle-session.operations';
import {
  createExactTeacherLifecycleMembership,
  findTeacherLifecycleCurrentSchoolMembership,
  listTeacherLifecycleMembershipFootprints,
  resolveExactTeacherLifecycleRole,
  setTeacherLifecycleMembershipActive,
  setTeacherLifecycleMembershipInactive,
  setTeacherLifecycleMembershipRoleAndType,
  setTeacherLifecycleMembershipSuspended,
  setTeacherLifecycleMembershipTransferred,
  softDeleteTeacherLifecycleMembership,
} from '../../../settings/users/infrastructure/teacher-lifecycle-membership.operations';
import {
  createTeacherLifecycleInvitedUser,
  findTeacherLifecycleUserState,
  findTeacherLifecycleIdentityConflicts,
  findTeacherLifecycleProvisioningIdentityConflicts,
  setTeacherLifecycleUserStatus,
  setTeacherLifecycleUserType,
  updateTeacherLifecycleDisplayNames,
  updateTeacherLifecycleIdentityFields,
} from '../../../settings/users/infrastructure/teacher-lifecycle-user.operations';
import {
  archiveTeacherProfileInTransaction,
  createTeacherProfileInTransaction,
  findArchivedTeacherProfileByIdInTransaction,
  findExactSchoolUserTeacherProfileFootprintInTransaction,
  findLiveTeacherProfileByIdInTransaction,
  findTrustedTeacherProfileByIdIncludingArchivedInTransaction,
  listLiveTeacherProfileFootprintsForUserInTransaction,
  restoreArchivedTeacherProfileInTransaction,
  setTeacherProfileEmploymentStatusInTransaction,
  updateTeacherProfileInTransaction,
} from '../../profile/infrastructure/teacher-profile-lifecycle.operations';
import type {
  TeacherLifecycleUserIdentityFields,
  TeacherLifecycleInvitedUserInput,
  TeacherLifecycleProfileManagedFields,
  TeacherLifecycleTransactionContext,
} from '../application/teacher-lifecycle-unit-of-work';
import type { TeacherLifecycleSuccessfulAuditEntry } from '../domain/teacher-lifecycle-audit';
import { TeacherLifecycleAuditWriter } from './teacher-lifecycle-audit.writer';

@Injectable()
export class PrismaTeacherLifecycleTransactionOperations {
  constructor(private readonly auditWriter: TeacherLifecycleAuditWriter) {}

  findUser(transaction: Prisma.TransactionClient, userId: string) {
    return findTeacherLifecycleUserState(transaction, userId);
  }

  findUserIdentityConflicts(
    transaction: Prisma.TransactionClient,
    input: { userId: string; fields: TeacherLifecycleUserIdentityFields },
  ) {
    return findTeacherLifecycleIdentityConflicts(transaction, input);
  }

  findProvisioningUserIdentityConflicts(
    transaction: Prisma.TransactionClient,
    fields: TeacherLifecycleUserIdentityFields,
  ) {
    return findTeacherLifecycleProvisioningIdentityConflicts(
      transaction,
      fields,
    );
  }

  createInvitedTeacherUser(
    transaction: Prisma.TransactionClient,
    input: TeacherLifecycleInvitedUserInput,
  ) {
    return createTeacherLifecycleInvitedUser(transaction, input);
  }

  updateUserIdentityFields(
    transaction: Prisma.TransactionClient,
    input: { userId: string; fields: TeacherLifecycleUserIdentityFields },
  ) {
    return updateTeacherLifecycleIdentityFields(transaction, input);
  }

  updateUserDisplayNames(
    transaction: Prisma.TransactionClient,
    input: { userId: string; firstName: string; lastName: string },
  ) {
    return updateTeacherLifecycleDisplayNames(transaction, input);
  }

  setUserStatus(
    transaction: Prisma.TransactionClient,
    userId: string,
    status: UserStatus,
  ) {
    return setTeacherLifecycleUserStatus(transaction, userId, status);
  }

  setUserType(
    transaction: Prisma.TransactionClient,
    userId: string,
    userType: UserType,
  ) {
    return setTeacherLifecycleUserType(transaction, userId, userType);
  }

  findMembership(
    transaction: Prisma.TransactionClient,
    input: { schoolId: string; userId: string },
  ) {
    return findTeacherLifecycleCurrentSchoolMembership(transaction, input);
  }

  resolveTeacherRole(transaction: Prisma.TransactionClient, schoolId: string) {
    return resolveExactTeacherLifecycleRole(transaction, schoolId);
  }

  listMembershipFootprints(
    transaction: Prisma.TransactionClient,
    userId: string,
  ) {
    return listTeacherLifecycleMembershipFootprints(transaction, userId);
  }

  createMembership(
    transaction: Prisma.TransactionClient,
    input: {
      userId: string;
      organizationId: string;
      schoolId: string;
      roleId: string;
      status: 'ACTIVE' | 'SUSPENDED';
    },
  ) {
    return createExactTeacherLifecycleMembership(transaction, input);
  }

  setMembershipRoleAndType(
    transaction: Prisma.TransactionClient,
    input: {
      membershipId: string;
      schoolId: string;
      roleId: string;
      userType: UserType;
    },
  ) {
    return setTeacherLifecycleMembershipRoleAndType(transaction, input);
  }

  setMembershipActive(
    transaction: Prisma.TransactionClient,
    input: { membershipId: string; schoolId: string },
  ) {
    return setTeacherLifecycleMembershipActive(transaction, input);
  }

  setMembershipSuspended(
    transaction: Prisma.TransactionClient,
    input: { membershipId: string; schoolId: string },
  ) {
    return setTeacherLifecycleMembershipSuspended(transaction, input);
  }

  setMembershipInactive(
    transaction: Prisma.TransactionClient,
    input: { membershipId: string; schoolId: string; endedAt: Date },
  ) {
    return setTeacherLifecycleMembershipInactive(transaction, input);
  }

  setMembershipTransferred(
    transaction: Prisma.TransactionClient,
    input: { membershipId: string; schoolId: string; endedAt: Date },
  ) {
    return setTeacherLifecycleMembershipTransferred(transaction, input);
  }

  softDeleteMembership(
    transaction: Prisma.TransactionClient,
    input: {
      membershipId: string;
      schoolId: string;
      endedAt: Date;
      deletedAt: Date;
    },
  ) {
    return softDeleteTeacherLifecycleMembership(transaction, input);
  }

  findLiveProfile(
    transaction: Prisma.TransactionClient,
    input: { schoolId: string; profileId: string },
  ) {
    return findLiveTeacherProfileByIdInTransaction(transaction, input);
  }

  findArchivedProfile(
    transaction: Prisma.TransactionClient,
    input: { schoolId: string; profileId: string },
  ) {
    return findArchivedTeacherProfileByIdInTransaction(transaction, input);
  }

  findTrustedProfileIncludingArchived(
    transaction: Prisma.TransactionClient,
    input: { schoolId: string; profileId: string },
  ) {
    return findTrustedTeacherProfileByIdIncludingArchivedInTransaction(
      transaction,
      input,
    );
  }

  listLiveProfileFootprints(
    transaction: Prisma.TransactionClient,
    userId: string,
  ) {
    return listLiveTeacherProfileFootprintsForUserInTransaction(
      transaction,
      userId,
    );
  }

  findExactProfileFootprint(
    transaction: Prisma.TransactionClient,
    input: { schoolId: string; userId: string },
  ) {
    return findExactSchoolUserTeacherProfileFootprintInTransaction(
      transaction,
      input,
    );
  }

  createProfile(
    transaction: Prisma.TransactionClient,
    input: {
      schoolId: string;
      userId: string;
      employmentStatus: TeacherEmploymentStatus;
      fields: TeacherLifecycleProfileManagedFields;
    },
  ) {
    return createTeacherProfileInTransaction(transaction, input);
  }

  updateProfile(
    transaction: Prisma.TransactionClient,
    input: {
      schoolId: string;
      profileId: string;
      fields: TeacherLifecycleProfileManagedFields;
    },
  ) {
    return updateTeacherProfileInTransaction(transaction, input);
  }

  restoreProfile(
    transaction: Prisma.TransactionClient,
    input: {
      schoolId: string;
      profileId: string;
      userId: string;
      fields: TeacherLifecycleProfileManagedFields;
    },
  ) {
    return restoreArchivedTeacherProfileInTransaction(transaction, input);
  }

  setProfileEmploymentStatus(
    transaction: Prisma.TransactionClient,
    input: {
      schoolId: string;
      profileId: string;
      employmentStatus: TeacherEmploymentStatus;
    },
  ) {
    return setTeacherProfileEmploymentStatusInTransaction(transaction, input);
  }

  archiveProfile(
    transaction: Prisma.TransactionClient,
    input: { schoolId: string; profileId: string; deletedAt: Date },
  ) {
    return archiveTeacherProfileInTransaction(transaction, input);
  }

  writeSuccessfulAudit(
    transaction: Prisma.TransactionClient,
    entry: TeacherLifecycleSuccessfulAuditEntry,
  ): Promise<void> {
    return this.auditWriter.writeSuccessfulInTransaction(transaction, entry);
  }

  revokeUserSessions(
    transaction: Prisma.TransactionClient,
    userId: string,
    revokedAt: Date,
  ): Promise<number> {
    return revokeTeacherLifecycleUserSessionsInTransaction(
      transaction,
      userId,
      revokedAt,
    );
  }
}

export type TeacherLifecycleContextFactory = (
  transaction: Prisma.TransactionClient,
) => TeacherLifecycleTransactionContext;
