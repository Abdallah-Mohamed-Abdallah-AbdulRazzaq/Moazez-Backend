import { Injectable } from '@nestjs/common';
import { MembershipStatus, UserType } from '@prisma/client';
import { getRequestContext } from '../../../../common/context/request-context';
import {
  evaluateTeacherAllocationLifecycleGate,
  teacherAllocationAuditCounts,
  teacherAllocationStateLabels,
  type TeacherAllocationLifecycleSummary,
} from '../../../academics/teacher-allocation/domain/teacher-allocation-lifecycle-state';
import { userTypeFromRoleKey } from '../../../settings/users/domain/user-type-from-role';
import { TeacherLifecycleMembershipInvariantError } from '../../../settings/users/infrastructure/teacher-lifecycle-membership.operations';
import { TeacherLifecycleUserInvariantError } from '../../../settings/users/infrastructure/teacher-lifecycle-user.operations';
import {
  TeacherActiveAssignmentsException,
  TeacherRoleTransitionConflictException,
} from '../../directory/domain/teacher-directory.errors';
import { TeacherProfileLifecycleInvariantError } from '../../profile/infrastructure/teacher-profile-lifecycle.operations';
import { isExactTeacherMembership } from '../domain/teacher-membership-state';
import {
  TeacherLifecycleRevocationFailedException,
  TeacherLifecycleSessionRevocationError,
} from '../domain/teacher-lifecycle.errors';
import { isTeacherLifecycleSerializationConflict } from './teacher-lifecycle-transaction-error';
import {
  TeacherLifecycleUnitOfWork,
  type TeacherLifecycleMembershipState,
  type TeacherLifecycleRoleState,
  type TeacherLifecycleUserState,
} from './teacher-lifecycle-unit-of-work';
import { TeacherRejectedTransitionAuditService } from './teacher-rejected-transition-audit.service';

export interface TeacherRoleDemotionInput {
  actorId: string;
  actorUserType: UserType;
  organizationId: string;
  schoolId: string;
  userId: string;
  teacherMembershipId: string;
  targetRoleId: string;
  effectiveAt: Date;
}

export interface TeacherRoleDemotionResult {
  user: TeacherLifecycleUserState;
  membership: TeacherLifecycleMembershipState;
  role: TeacherLifecycleRoleState;
  revokedSessionCount: number;
}

@Injectable()
export class TeacherRoleDemotionCoordinator {
  constructor(
    private readonly unitOfWork: TeacherLifecycleUnitOfWork,
    private readonly rejectedAudit: TeacherRejectedTransitionAuditService,
  ) {}

  async execute(
    input: TeacherRoleDemotionInput,
  ): Promise<TeacherRoleDemotionResult> {
    try {
      return await this.unitOfWork.execute(async (transaction) => {
        const [user, membership, profile, targetRole, history] =
          await Promise.all([
            transaction.user.findState(input.userId),
            transaction.membership.findCurrentSchoolState({
              schoolId: input.schoolId,
              userId: input.userId,
            }),
            transaction.profile.findExactSchoolUserFootprint({
              schoolId: input.schoolId,
              userId: input.userId,
            }),
            transaction.membership.resolveAssignableNonTeacherRole({
              schoolId: input.schoolId,
              roleId: input.targetRoleId,
            }),
            transaction.membership.listCurrentSchoolHistory({
              schoolId: input.schoolId,
              userId: input.userId,
            }),
          ]);
        if (
          !user ||
          user.userType !== UserType.TEACHER ||
          user.deletedAt !== null ||
          !isExactTeacherMembership(membership) ||
          membership.id !== input.teacherMembershipId ||
          !profile ||
          profile.deletedAt !== null ||
          profile.userId !== user.id ||
          !targetRole
        ) {
          throw new TeacherRoleTransitionConflictException();
        }
        const targetUserType = userTypeFromRoleKey(targetRole.key);
        if (targetUserType === UserType.TEACHER) {
          throw new TeacherRoleTransitionConflictException();
        }
        const allocationSummary = await transaction.allocation.classify({
          schoolId: input.schoolId,
          teacherUserId: user.id,
          asOf: input.effectiveAt,
        });
        assertDemotionAllocationGate(allocationSummary);

        const operationalConflict = history.some(
          (candidate) =>
            candidate.id !== membership.id &&
            candidate.deletedAt === null &&
            candidate.status === MembershipStatus.ACTIVE &&
            candidate.endedAt === null,
        );
        if (operationalConflict) {
          throw new TeacherRoleTransitionConflictException();
        }
        const restorable = history.filter(
          (candidate) =>
            candidate.id !== membership.id &&
            candidate.deletedAt === null &&
            candidate.roleId === targetRole.id &&
            candidate.userType === targetUserType &&
            !(
              candidate.status === MembershipStatus.ACTIVE &&
              candidate.endedAt === null
            ),
        );
        if (restorable.length > 1) {
          throw new TeacherRoleTransitionConflictException(
            'teacher_membership_history_ambiguous',
          );
        }

        await transaction.profile.archive({
          schoolId: input.schoolId,
          profileId: profile.id,
          deletedAt: input.effectiveAt,
        });
        await transaction.membership.setInactive({
          membershipId: membership.id,
          schoolId: input.schoolId,
          expectedStatus: membership.status,
          expectedEndedAt: membership.endedAt,
          endedAt: input.effectiveAt,
        });
        const targetMembership = restorable[0]
          ? await transaction.membership.restoreReviewedNonTeacher({
              membershipId: restorable[0].id,
              userId: user.id,
              schoolId: input.schoolId,
              roleId: targetRole.id,
              userType: targetUserType,
              expectedStatus: restorable[0].status,
              expectedEndedAt: restorable[0].endedAt,
            })
          : await transaction.membership.createReviewedNonTeacher({
              userId: user.id,
              organizationId: input.organizationId,
              schoolId: input.schoolId,
              roleId: targetRole.id,
              userType: targetUserType,
            });
        const updatedUser = await transaction.user.setTypeForReviewedTransition(
          {
            userId: user.id,
            expectedUserType: UserType.TEACHER,
            userType: targetUserType,
          },
        );
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
          actorId: input.actorId,
          actorUserType: input.actorUserType,
          organizationId: input.organizationId,
          schoolId: input.schoolId,
          action: 'teachers.role.demote',
          resourceType: 'user',
          resourceId: user.id,
          metadata: {
            userId: user.id,
            membershipId: targetMembership.id,
            teacherProfileId: profile.id,
            changedFields: ['userType', 'roleId', 'membershipStatus'],
            previousValue: UserType.TEACHER,
            nextValue: targetUserType,
          },
        });
        return {
          user: updatedUser,
          membership: targetMembership,
          role: targetRole,
          revokedSessionCount,
        };
      });
    } catch (error) {
      if (
        error instanceof TeacherActiveAssignmentsException ||
        (error instanceof TeacherRoleTransitionConflictException &&
          error.details?.reasonCode === 'teacher_allocation_state_unproven')
      ) {
        const reasonCode =
          error instanceof TeacherActiveAssignmentsException
            ? 'active_or_future_allocations'
            : 'allocation_integrity_risk';
        return this.rejectedAudit.auditAndThrow({
          error,
          audit: {
            actorId: input.actorId,
            actorUserType: input.actorUserType,
            organizationId: input.organizationId,
            schoolId: input.schoolId,
            resourceType: 'membership',
            resourceId: input.teacherMembershipId,
            metadata: { reasonCode },
          },
          traceId: getRequestContext()?.requestId ?? 'unavailable',
        });
      }
      if (error instanceof TeacherRoleTransitionConflictException) throw error;
      if (error instanceof TeacherLifecycleSessionRevocationError) {
        throw new TeacherLifecycleRevocationFailedException();
      }
      if (
        error instanceof TeacherLifecycleMembershipInvariantError ||
        error instanceof TeacherLifecycleUserInvariantError ||
        error instanceof TeacherProfileLifecycleInvariantError ||
        isTeacherLifecycleSerializationConflict(error)
      ) {
        throw new TeacherRoleTransitionConflictException();
      }
      throw error;
    }
  }
}

export function assertDemotionAllocationGate(
  summary: TeacherAllocationLifecycleSummary,
): void {
  const gate = evaluateTeacherAllocationLifecycleGate(summary, 'role_demotion');
  if (!gate.blocked) return;
  if (gate.reason === 'active_or_future_allocations') {
    throw new TeacherActiveAssignmentsException({
      currentActiveCount: summary.currentActiveCount,
      futureCount: summary.futureCount,
      termStateLabels: teacherAllocationStateLabels(summary),
    });
  }
  throw new TeacherRoleTransitionConflictException(
    'teacher_allocation_state_unproven',
  );
}
