import { Injectable } from '@nestjs/common';
import { MembershipStatus, UserStatus, UserType } from '@prisma/client';
import {
  evaluateTeacherAllocationLifecycleGate,
  teacherAllocationAuditCounts,
  teacherAllocationStateLabels,
  type TeacherAllocationLifecycleSummary,
} from '../../../academics/teacher-allocation/domain/teacher-allocation-lifecycle-state';
import { TeacherLifecycleMembershipInvariantError } from '../../../settings/users/infrastructure/teacher-lifecycle-membership.operations';
import { TeacherLifecycleUserInvariantError } from '../../../settings/users/infrastructure/teacher-lifecycle-user.operations';
import { TeacherLifecycleUnitOfWork } from '../../lifecycle/application/teacher-lifecycle-unit-of-work';
import { isTeacherLifecycleSerializationConflict } from '../../lifecycle/application/teacher-lifecycle-transaction-error';
import { isExactTeacherMembership } from '../../lifecycle/domain/teacher-membership-state';
import {
  TeacherLifecycleRevocationFailedException,
  TeacherLifecycleSessionRevocationError,
} from '../../lifecycle/domain/teacher-lifecycle.errors';
import { TeacherProfileLifecycleInvariantError } from '../../profile/infrastructure/teacher-profile-lifecycle.operations';
import {
  TeacherActiveAssignmentsException,
  TeacherArchiveConflictException,
  TeacherProfileNotFoundException,
  TeacherRoleTransitionConflictException,
} from '../domain/teacher-directory.errors';
import { requireTeacherDirectoryScope } from '../teacher-directory.context';

@Injectable()
export class ArchiveTeacherUseCase {
  constructor(private readonly unitOfWork: TeacherLifecycleUnitOfWork) {}

  async execute(teacherId: string): Promise<void> {
    const scope = requireTeacherDirectoryScope();
    const lifecycleAt = new Date();
    try {
      await this.unitOfWork.execute(async (transaction) => {
        const profile = await transaction.profile.findLiveById({
          schoolId: scope.schoolId,
          profileId: teacherId,
        });
        if (!profile) throw new TeacherProfileNotFoundException();
        const [user, membership] = await Promise.all([
          transaction.user.findState(profile.userId),
          transaction.membership.findCurrentSchoolState({
            schoolId: scope.schoolId,
            userId: profile.userId,
          }),
        ]);
        if (
          !user ||
          user.userType !== UserType.TEACHER ||
          user.deletedAt !== null ||
          !isExactTeacherMembership(membership) ||
          membership.userId !== profile.userId ||
          membership.schoolId !== profile.schoolId
        ) {
          throw new TeacherRoleTransitionConflictException();
        }

        const allocationSummary = await transaction.allocation.classify({
          schoolId: scope.schoolId,
          teacherUserId: user.id,
          asOf: lifecycleAt,
        });
        assertArchiveAllocationGate(allocationSummary);

        await transaction.profile.archive({
          schoolId: scope.schoolId,
          profileId: profile.id,
          deletedAt: lifecycleAt,
        });
        await transaction.user.setStatus({
          userId: user.id,
          expectedStatus: user.status,
          status: UserStatus.DISABLED,
        });
        await transaction.membership.setInactive({
          membershipId: membership.id,
          schoolId: scope.schoolId,
          expectedStatus: membership.status,
          expectedEndedAt: membership.endedAt,
          endedAt: lifecycleAt,
        });
        try {
          await transaction.sessions.revokeUserSessions(user.id, lifecycleAt);
        } catch {
          throw new TeacherLifecycleSessionRevocationError();
        }
        await transaction.audit.writeSuccessful({
          actorId: scope.actorId,
          actorUserType: scope.actorUserType,
          organizationId: scope.organizationId,
          schoolId: scope.schoolId,
          action: 'teachers.profile.archive',
          resourceType: 'teacher_profile',
          resourceId: profile.id,
          metadata: {
            userId: user.id,
            membershipId: membership.id,
            teacherProfileId: profile.id,
            changedFields: ['deletedAt', 'membershipStatus', 'endedAt'],
            previousValue: membership.status,
            nextValue: MembershipStatus.INACTIVE,
            allocationDependencyCounts:
              teacherAllocationAuditCounts(allocationSummary),
            termStateLabels: teacherAllocationStateLabels(allocationSummary),
          },
        });
        await transaction.audit.writeSuccessful({
          actorId: scope.actorId,
          actorUserType: scope.actorUserType,
          organizationId: scope.organizationId,
          schoolId: scope.schoolId,
          action: 'teachers.account.disable',
          resourceType: 'user',
          resourceId: user.id,
          metadata: {
            userId: user.id,
            teacherProfileId: profile.id,
            changedFields:
              user.status === UserStatus.DISABLED ? [] : ['status'],
            previousValue: user.status,
            nextValue: UserStatus.DISABLED,
          },
        });
      });
    } catch (error) {
      if (
        error instanceof TeacherProfileNotFoundException ||
        error instanceof TeacherRoleTransitionConflictException ||
        error instanceof TeacherActiveAssignmentsException ||
        error instanceof TeacherArchiveConflictException
      ) {
        throw error;
      }
      if (error instanceof TeacherLifecycleSessionRevocationError) {
        throw new TeacherLifecycleRevocationFailedException();
      }
      if (
        error instanceof TeacherLifecycleMembershipInvariantError ||
        error instanceof TeacherLifecycleUserInvariantError ||
        error instanceof TeacherProfileLifecycleInvariantError ||
        isTeacherLifecycleSerializationConflict(error)
      ) {
        throw new TeacherArchiveConflictException('lifecycle_state_moved');
      }
      throw error;
    }
  }
}

export function assertArchiveAllocationGate(
  summary: TeacherAllocationLifecycleSummary,
): void {
  const gate = evaluateTeacherAllocationLifecycleGate(
    summary,
    'profile_archive',
  );
  if (!gate.blocked) return;
  if (gate.reason === 'active_or_future_allocations') {
    throw new TeacherActiveAssignmentsException({
      currentActiveCount: summary.currentActiveCount,
      futureCount: summary.futureCount,
      termStateLabels: teacherAllocationStateLabels(summary),
    });
  }
  throw new TeacherArchiveConflictException('allocation_state_unproven');
}
