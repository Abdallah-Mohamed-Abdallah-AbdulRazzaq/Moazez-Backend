import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import {
  TeacherLifecycleUnitOfWork,
  type TeacherLifecycleTransactionContext,
} from '../application/teacher-lifecycle-unit-of-work';
import { PrismaTeacherLifecycleTransactionOperations } from './prisma-teacher-lifecycle-transaction.operations';

@Injectable()
export class PrismaTeacherLifecycleUnitOfWork extends TeacherLifecycleUnitOfWork {
  constructor(
    private readonly prisma: PrismaService,
    private readonly operations: PrismaTeacherLifecycleTransactionOperations,
  ) {
    super();
  }

  execute<T>(
    callback: (context: TeacherLifecycleTransactionContext) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(
      (transaction) => callback(this.createContext(transaction)),
      { isolationLevel: 'Serializable', maxWait: 5_000, timeout: 30_000 },
    );
  }

  private createContext(
    transaction: Prisma.TransactionClient,
  ): TeacherLifecycleTransactionContext {
    const context: TeacherLifecycleTransactionContext = {
      user: {
        findState: (userId: string) =>
          this.operations.findUser(transaction, userId),
        findProvisioningIdentityConflicts: (fields) =>
          this.operations.findProvisioningUserIdentityConflicts(
            transaction,
            fields,
          ),
        findIdentityConflicts: (input) =>
          this.operations.findUserIdentityConflicts(transaction, input),
        updateIdentityFields: (input) =>
          this.operations.updateUserIdentityFields(transaction, input),
        updateDisplayNames: (input) =>
          this.operations.updateUserDisplayNames(transaction, input),
        createInvitedTeacher: (input) =>
          this.operations.createInvitedTeacherUser(transaction, input),
        setStatus: (userId, status) =>
          this.operations.setUserStatus(transaction, userId, status),
        setType: (userId, userType) =>
          this.operations.setUserType(transaction, userId, userType),
      },
      membership: {
        resolveExactTeacherRole: (schoolId) =>
          this.operations.resolveTeacherRole(transaction, schoolId),
        findCurrentSchoolState: (input) =>
          this.operations.findMembership(transaction, input),
        listTeacherFootprints: (userId) =>
          this.operations.listMembershipFootprints(transaction, userId),
        createExactTeacher: (input) =>
          this.operations.createMembership(transaction, input),
        setRoleAndTypeForReviewedTransition: (input) =>
          this.operations.setMembershipRoleAndType(transaction, input),
        setActive: (input) =>
          this.operations.setMembershipActive(transaction, input),
        setSuspended: (input) =>
          this.operations.setMembershipSuspended(transaction, input),
        setInactive: (input) =>
          this.operations.setMembershipInactive(transaction, input),
        setTransferred: (input) =>
          this.operations.setMembershipTransferred(transaction, input),
        softDelete: (input) =>
          this.operations.softDeleteMembership(transaction, input),
      },
      profile: {
        findLiveById: (input) =>
          this.operations.findLiveProfile(transaction, input),
        findArchivedById: (input) =>
          this.operations.findArchivedProfile(transaction, input),
        findTrustedByIdIncludingArchived: (input) =>
          this.operations.findTrustedProfileIncludingArchived(
            transaction,
            input,
          ),
        listLiveFootprintsForUser: (userId) =>
          this.operations.listLiveProfileFootprints(transaction, userId),
        findExactSchoolUserFootprint: (input) =>
          this.operations.findExactProfileFootprint(transaction, input),
        create: (input) => this.operations.createProfile(transaction, input),
        update: (input) => this.operations.updateProfile(transaction, input),
        restore: (input) => this.operations.restoreProfile(transaction, input),
        setEmploymentStatus: (input) =>
          this.operations.setProfileEmploymentStatus(transaction, input),
        archive: (input) => this.operations.archiveProfile(transaction, input),
      },
      audit: {
        writeSuccessful: (entry) =>
          this.operations.writeSuccessfulAudit(transaction, entry),
      },
      sessions: {
        revokeUserSessions: (userId, revokedAt) =>
          this.operations.revokeUserSessions(transaction, userId, revokedAt),
      },
    };

    Object.freeze(context.user);
    Object.freeze(context.membership);
    Object.freeze(context.profile);
    Object.freeze(context.audit);
    Object.freeze(context.sessions);
    return Object.freeze(context);
  }
}
