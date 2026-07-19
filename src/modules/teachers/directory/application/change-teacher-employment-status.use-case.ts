import { Inject, Injectable } from '@nestjs/common';
import {
  MembershipStatus,
  TeacherEmploymentStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import {
  TEACHER_ALLOCATION_LIFECYCLE_READER,
  type TeacherAllocationLifecycleReader,
} from '../../../academics/teacher-allocation/application/teacher-allocation-lifecycle-read.service';
import type { TeacherAllocationLifecycleSummary } from '../../../academics/teacher-allocation/domain/teacher-allocation-lifecycle-state';
import {
  TeacherLifecycleUnitOfWork,
  type TeacherLifecycleMembershipState,
  type TeacherLifecycleTransactionContext,
} from '../../lifecycle/application/teacher-lifecycle-unit-of-work';
import { rethrowTeacherLifecycleTransactionError } from '../../lifecycle/application/teacher-lifecycle-transaction-error';
import {
  isAllowedTeacherEmploymentTransition,
  resolveTeacherEmploymentEffectiveAt,
} from '../../lifecycle/domain/teacher-employment-transition';
import { isExactTeacherMembership } from '../../lifecycle/domain/teacher-membership-state';
import {
  TeacherLifecycleIdentityStateException,
  TeacherLifecycleInvalidTransitionException,
  TeacherLifecycleSessionRevocationError,
} from '../../lifecycle/domain/teacher-lifecycle.errors';
import type {
  TeacherAllocationTermStateLabel,
  TeacherLifecycleAuditMetadataInput,
} from '../../lifecycle/domain/teacher-lifecycle-audit';
import { projectTeacherProfileCompleteness } from '../../profile/domain/teacher-profile.integrity';
import {
  TeacherProfileIncompleteException,
  TeacherProfileNotFoundException,
} from '../domain/teacher-directory.errors';
import { composeTeacherDirectoryRecord } from '../domain/teacher-directory.types';
import type {
  TeacherEmploymentStatusResponseDto,
  UpdateTeacherEmploymentStatusDto,
} from '../dto/teacher-directory.dto';
import { presentTeacherDirectoryDetail } from '../presenters/teacher-directory.presenter';
import { requireTeacherDirectoryScope } from '../teacher-directory.context';

@Injectable()
export class ChangeTeacherEmploymentStatusUseCase {
  constructor(
    private readonly unitOfWork: TeacherLifecycleUnitOfWork,
    @Inject(TEACHER_ALLOCATION_LIFECYCLE_READER)
    private readonly allocationReader: TeacherAllocationLifecycleReader,
  ) {}

  async execute(
    teacherId: string,
    command: UpdateTeacherEmploymentStatusDto,
  ): Promise<TeacherEmploymentStatusResponseDto> {
    const scope = requireTeacherDirectoryScope();
    const effectiveAt = resolveTeacherEmploymentEffectiveAt(
      command.effectiveAt,
      new Date(),
    );
    let previousStatus = command.employmentStatus;

    try {
      return await this.unitOfWork.execute(async (transaction) => {
        const profile = await transaction.profile.findLiveById({
          schoolId: scope.schoolId,
          profileId: teacherId,
        });
        if (!profile) throw new TeacherProfileNotFoundException();
        previousStatus = profile.employmentStatus;
        if (
          !isAllowedTeacherEmploymentTransition(
            profile.employmentStatus,
            command.employmentStatus,
          )
        ) {
          throw new TeacherLifecycleInvalidTransitionException(
            profile.employmentStatus,
            command.employmentStatus,
            'invalid_employment_edge',
          );
        }

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
          profile.schoolId !== scope.schoolId
        ) {
          throw new TeacherLifecycleIdentityStateException();
        }
        assertSourceState(profile.employmentStatus, command.employmentStatus, {
          userStatus: user.status,
          membershipStatus: membership.status,
          membershipEndedAt: membership.endedAt,
          completeness: projectTeacherProfileCompleteness(profile),
          hasPassword: user.credential.hasPassword,
          credentialStatus: user.credential.status,
        });

        const allocationSummary =
          await this.allocationReader.classifyTeacherAllocationLifecycleState(
            scope.schoolId,
            user.id,
            effectiveAt,
          );
        const updatedProfile = await transaction.profile.setEmploymentStatus({
          schoolId: scope.schoolId,
          profileId: profile.id,
          expectedEmploymentStatus: profile.employmentStatus,
          employmentStatus: command.employmentStatus,
        });
        const nextUserStatus =
          command.employmentStatus === TeacherEmploymentStatus.ACTIVE
            ? UserStatus.ACTIVE
            : UserStatus.DISABLED;
        const updatedUser = await transaction.user.setStatus({
          userId: user.id,
          expectedStatus: user.status,
          status: nextUserStatus,
        });
        const updatedMembership = await updateMembershipForEmployment(
          transaction,
          membership,
          command.employmentStatus,
          effectiveAt,
        );
        let revokedSessionCount: number;
        try {
          revokedSessionCount = await transaction.sessions.revokeUserSessions(
            user.id,
            effectiveAt,
          );
        } catch {
          throw new TeacherLifecycleSessionRevocationError();
        }

        await transaction.audit.writeSuccessful({
          actorId: scope.actorId,
          actorUserType: scope.actorUserType,
          organizationId: scope.organizationId,
          schoolId: scope.schoolId,
          action: 'teachers.employment_status.change',
          resourceType: 'teacher_profile',
          resourceId: profile.id,
          metadata: employmentAuditMetadata(
            user.id,
            membership.id,
            profile.id,
            profile.employmentStatus,
            command.employmentStatus,
            allocationSummary,
          ),
        });
        await transaction.audit.writeSuccessful({
          actorId: scope.actorId,
          actorUserType: scope.actorUserType,
          organizationId: scope.organizationId,
          schoolId: scope.schoolId,
          action:
            command.employmentStatus === TeacherEmploymentStatus.ACTIVE
              ? 'teachers.account.activate'
              : 'teachers.account.disable',
          resourceType: 'user',
          resourceId: user.id,
          metadata: {
            userId: user.id,
            teacherProfileId: profile.id,
            changedFields: user.status === nextUserStatus ? [] : ['status'],
            previousValue: user.status,
            nextValue: nextUserStatus,
          },
        });
        if (command.employmentStatus === TeacherEmploymentStatus.INACTIVE) {
          await transaction.audit.writeSuccessful({
            actorId: scope.actorId,
            actorUserType: scope.actorUserType,
            organizationId: scope.organizationId,
            schoolId: scope.schoolId,
            action: 'teachers.membership.suspend',
            resourceType: 'membership',
            resourceId: membership.id,
            metadata: {
              userId: user.id,
              membershipId: membership.id,
              teacherProfileId: profile.id,
              changedFields: ['membershipStatus'],
              previousValue: membership.status,
              nextValue: MembershipStatus.SUSPENDED,
            },
          });
        }

        const completeness = projectTeacherProfileCompleteness(updatedProfile);
        const teacher = presentTeacherDirectoryDetail(
          composeTeacherDirectoryRecord({
            user: updatedUser,
            profile: updatedProfile,
            membershipStatus: updatedMembership.status,
            membershipEndedAt: updatedMembership.endedAt,
            profileCompleteness: completeness,
          }),
        );
        return {
          teacher,
          transition: {
            previousEmploymentStatus: profile.employmentStatus,
            employmentStatus: updatedProfile.employmentStatus,
            accountStatus: updatedUser.status,
            membershipStatus: updatedMembership.status,
            membershipEndedAt: updatedMembership.endedAt?.toISOString() ?? null,
            effectiveAt: effectiveAt.toISOString(),
            revokedSessionCount,
            reassignmentRequired: allocationSummary.reassignmentRequired,
            allocationSummary: presentAllocationSummary(allocationSummary),
          },
        };
      });
    } catch (error) {
      if (
        error instanceof TeacherProfileNotFoundException ||
        error instanceof TeacherProfileIncompleteException ||
        error instanceof TeacherLifecycleIdentityStateException ||
        error instanceof TeacherLifecycleInvalidTransitionException
      ) {
        throw error;
      }
      rethrowTeacherLifecycleTransactionError(
        error,
        previousStatus,
        command.employmentStatus,
      );
    }
  }
}

function assertSourceState(
  previousStatus: TeacherEmploymentStatus,
  nextStatus: TeacherEmploymentStatus,
  state: {
    userStatus: UserStatus;
    membershipStatus: MembershipStatus;
    membershipEndedAt: Date | null;
    completeness: ReturnType<typeof projectTeacherProfileCompleteness>;
    hasPassword: boolean;
    credentialStatus: string;
  },
): void {
  if (previousStatus === TeacherEmploymentStatus.ACTIVE) {
    if (
      state.membershipStatus !== MembershipStatus.ACTIVE ||
      state.membershipEndedAt !== null
    ) {
      throw new TeacherLifecycleIdentityStateException();
    }
    return;
  }
  if (
    state.userStatus !== UserStatus.DISABLED ||
    state.membershipStatus !== MembershipStatus.SUSPENDED ||
    state.membershipEndedAt !== null
  ) {
    throw new TeacherLifecycleIdentityStateException();
  }
  if (nextStatus === TeacherEmploymentStatus.ACTIVE) {
    if (!state.completeness.isComplete) {
      throw new TeacherProfileIncompleteException(
        state.completeness.missingFields,
      );
    }
    if (!state.hasPassword || state.credentialStatus === 'missing') {
      throw new TeacherLifecycleInvalidTransitionException(
        previousStatus,
        nextStatus,
        'credential_required',
      );
    }
  }
}

async function updateMembershipForEmployment(
  transaction: TeacherLifecycleTransactionContext,
  membership: TeacherLifecycleMembershipState,
  employmentStatus: TeacherEmploymentStatus,
  effectiveAt: Date,
) {
  const expected = {
    membershipId: membership.id,
    schoolId: membership.schoolId as string,
    expectedStatus: membership.status,
    expectedEndedAt: membership.endedAt,
  };
  if (employmentStatus === TeacherEmploymentStatus.ACTIVE) {
    return transaction.membership.setActive(expected);
  }
  if (employmentStatus === TeacherEmploymentStatus.INACTIVE) {
    return transaction.membership.setSuspended(expected);
  }
  return transaction.membership.setInactive({
    ...expected,
    endedAt: effectiveAt,
  });
}

function employmentAuditMetadata(
  userId: string,
  membershipId: string,
  teacherProfileId: string,
  previousValue: TeacherEmploymentStatus,
  nextValue: TeacherEmploymentStatus,
  summary: TeacherAllocationLifecycleSummary,
): TeacherLifecycleAuditMetadataInput {
  return {
    userId,
    membershipId,
    teacherProfileId,
    changedFields:
      nextValue === TeacherEmploymentStatus.TERMINATED
        ? ['employmentStatus', 'membershipStatus', 'endedAt']
        : nextValue === TeacherEmploymentStatus.ACTIVE
          ? ['employmentStatus', 'membershipStatus']
          : ['employmentStatus'],
    previousValue,
    nextValue,
    allocationDependencyCounts: {
      currentActive: summary.currentActiveCount,
      future: summary.futureCount,
      currentInactive: summary.currentInactiveCount,
      inconsistent: summary.inconsistentCount,
      invalid: summary.invalidCount,
      historical: summary.historicalCount,
      timetableEntries: summary.dependencyCounts.timetableEntries,
      lessonPlans: summary.dependencyCounts.lessonPlans,
      homeworkAssignments: summary.dependencyCounts.homeworkAssignments,
    },
    termStateLabels: allocationTermStateLabels(summary),
  };
}

function allocationTermStateLabels(
  summary: TeacherAllocationLifecycleSummary,
): TeacherAllocationTermStateLabel[] {
  const labels: TeacherAllocationTermStateLabel[] = [];
  for (const [key, value] of Object.entries(summary.counts)) {
    if (value > 0) labels.push(key as TeacherAllocationTermStateLabel);
  }
  return labels;
}

function presentAllocationSummary(summary: TeacherAllocationLifecycleSummary) {
  return {
    currentActiveCount: summary.currentActiveCount,
    futureCount: summary.futureCount,
    historicalCount: summary.historicalCount,
    currentInactiveCount: summary.currentInactiveCount,
    inconsistentCount: summary.inconsistentCount,
    invalidCount: summary.invalidCount,
    integrityRiskCount: summary.integrityRiskCount,
    integrityReason: summary.integrityReason,
  };
}
