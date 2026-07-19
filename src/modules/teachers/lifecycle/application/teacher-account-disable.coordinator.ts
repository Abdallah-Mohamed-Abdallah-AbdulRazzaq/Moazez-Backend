import { Injectable } from '@nestjs/common';
import { MembershipStatus, UserStatus, UserType } from '@prisma/client';
import {
  TeacherLifecycleIdentityStateException,
  TeacherLifecycleSessionRevocationError,
} from '../domain/teacher-lifecycle.errors';
import { TeacherLifecycleUnitOfWork } from './teacher-lifecycle-unit-of-work';
import { rethrowTeacherLifecycleTransactionError } from './teacher-lifecycle-transaction-error';

export interface TeacherAccountDisableInput {
  actorId: string;
  actorUserType: UserType;
  organizationId: string;
  schoolId: string;
  userId: string;
  membershipId: string;
  effectiveAt: Date;
}

export interface TeacherAccountDisableResult {
  userId: string;
  accountStatus: UserStatus;
  revokedSessionCount: number;
}

@Injectable()
export class TeacherAccountDisableCoordinator {
  constructor(private readonly unitOfWork: TeacherLifecycleUnitOfWork) {}

  async execute(
    input: TeacherAccountDisableInput,
  ): Promise<TeacherAccountDisableResult> {
    let previousStatus: UserStatus = UserStatus.DISABLED;
    try {
      return await this.unitOfWork.execute(async (transaction) => {
        const [user, membership] = await Promise.all([
          transaction.user.findState(input.userId),
          transaction.membership.findCurrentSchoolState({
            schoolId: input.schoolId,
            userId: input.userId,
          }),
        ]);
        if (
          !user ||
          user.userType !== UserType.TEACHER ||
          user.deletedAt !== null ||
          !membership ||
          membership.id !== input.membershipId ||
          membership.schoolId !== input.schoolId ||
          membership.userId !== input.userId ||
          membership.deletedAt !== null ||
          membership.endedAt !== null ||
          (membership.status !== MembershipStatus.ACTIVE &&
            membership.status !== MembershipStatus.SUSPENDED &&
            membership.status !== MembershipStatus.INACTIVE)
        ) {
          throw new TeacherLifecycleIdentityStateException();
        }
        previousStatus = user.status;
        const updatedUser = await transaction.user.setStatus({
          userId: user.id,
          expectedStatus: user.status,
          status: UserStatus.DISABLED,
        });
        let revokedSessionCount: number;
        try {
          revokedSessionCount = await transaction.sessions.revokeUserSessions(
            user.id,
            input.effectiveAt,
          );
        } catch {
          throw new TeacherLifecycleSessionRevocationError();
        }
        await transaction.audit.writeSuccessful({
          actorId: input.actorId,
          actorUserType: input.actorUserType,
          organizationId: input.organizationId,
          schoolId: input.schoolId,
          action: 'teachers.account.disable',
          resourceType: 'user',
          resourceId: user.id,
          metadata: {
            userId: user.id,
            membershipId: membership.id,
            changedFields:
              user.status === UserStatus.DISABLED ? [] : ['status'],
            previousValue: user.status,
            nextValue: UserStatus.DISABLED,
          },
        });
        return {
          userId: updatedUser.id,
          accountStatus: UserStatus.DISABLED,
          revokedSessionCount,
        };
      });
    } catch (error) {
      if (error instanceof TeacherLifecycleIdentityStateException) throw error;
      rethrowTeacherLifecycleTransactionError(
        error,
        previousStatus,
        UserStatus.DISABLED,
      );
    }
  }
}
