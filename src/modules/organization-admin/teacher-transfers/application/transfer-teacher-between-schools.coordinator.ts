import { Injectable } from '@nestjs/common';
import {
  MembershipStatus,
  Prisma,
  TeacherEmploymentStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import {
  getTrustedOrganizationScope,
  type TrustedOrganizationScope,
} from '../../../../common/context/request-context';
import { ScopeMissingException } from '../../../iam/auth/domain/auth.exceptions';
import {
  teacherAllocationAuditCounts,
  teacherAllocationStateLabels,
} from '../../../academics/teacher-allocation/domain/teacher-allocation-lifecycle-state';
import {
  TeacherLifecycleUnitOfWork,
  type TeacherLifecycleMembershipState,
  type TeacherLifecycleProfileState,
  type TeacherLifecycleTransactionContext,
  type TeacherLifecycleUserState,
} from '../../../teachers/lifecycle/application/teacher-lifecycle-unit-of-work';
import type { TeacherAllocationLifecycleSummary } from '../../../academics/teacher-allocation/domain/teacher-allocation-lifecycle-state';
import { isTeacherLifecycleSerializationConflict } from '../../../teachers/lifecycle/application/teacher-lifecycle-transaction-error';
import {
  TeacherLifecycleRevocationFailedException,
  TeacherLifecycleSessionRevocationError,
} from '../../../teachers/lifecycle/domain/teacher-lifecycle.errors';
import { projectTeacherProfileCompleteness } from '../../../teachers/profile/domain/teacher-profile.integrity';
import { TeacherProfileLifecycleInvariantError } from '../../../teachers/profile/infrastructure/teacher-profile-lifecycle.operations';
import { TeacherLifecycleMembershipInvariantError } from '../../../settings/users/infrastructure/teacher-lifecycle-membership.operations';
import { TeacherLifecycleUserInvariantError } from '../../../settings/users/infrastructure/teacher-lifecycle-user.operations';
import {
  buildTeacherProfileManagedFields,
  selectTeacherDisplayNames,
} from '../../../teachers/directory/domain/teacher-directory-input';
import { composeTeacherDirectoryRecord } from '../../../teachers/directory/domain/teacher-directory.types';
import {
  TeacherProfileCodeConflictException,
  TeacherProfileIncompleteException,
  TeacherRoleRequiredException,
} from '../../../teachers/directory/domain/teacher-directory.errors';
import { presentTeacherDirectoryDetail } from '../../../teachers/directory/presenters/teacher-directory.presenter';
import type { TransferTeacherToSchoolDto } from '../dto/transfer-teacher-to-school.dto';
import {
  TeacherTransferConflictException,
  TeacherTransferNotFoundException,
} from '../domain/organization-teacher-transfer.errors';
import {
  selectDestinationMembership,
  selectDestinationProfile,
  selectExactSourceMembership,
} from '../domain/organization-teacher-transfer-state';
import { OrganizationTeacherTransferInvariantError } from '../infrastructure/organization-teacher-transfer-transaction.operations';
import {
  presentOrganizationTeacherTransfer,
  type OrganizationTeacherTransferResponse,
} from '../presenters/organization-teacher-transfer.presenter';

@Injectable()
export class TransferTeacherBetweenSchoolsCoordinator {
  constructor(private readonly unitOfWork: TeacherLifecycleUnitOfWork) {}

  async execute(
    sourceTeacherProfileId: string,
    command: TransferTeacherToSchoolDto,
  ): Promise<OrganizationTeacherTransferResponse> {
    const scope = getTrustedOrganizationScope();
    if (!scope) throw new ScopeMissingException();
    const lifecycleAt = new Date();

    try {
      return await this.unitOfWork.execute(async (transaction) => {
        if (
          !(await transaction.organizationTransfer.revalidateActorScope(scope))
        ) {
          throw new TeacherTransferConflictException('actor_scope_moved');
        }

        const resources =
          await transaction.organizationTransfer.resolveAndLockOwnedResources({
            scope,
            sourceTeacherProfileId,
            destinationSchoolId: command.destinationSchoolId,
          });
        if (!resources) throw new TeacherTransferNotFoundException();
        if (resources.source.schoolId === resources.destination.schoolId) {
          throw new TeacherTransferConflictException('same_school_transfer');
        }

        const sourceMembershipFootprints =
          await transaction.organizationTransfer.listAndLockSourceMembershipFootprints(
            { source: resources.source },
          );
        const sourceMembership = selectExactSourceMembership({
          source: resources.source,
          organizationId: scope.organizationId,
          footprints: sourceMembershipFootprints,
        });

        const allocation = await transaction.allocation.classify({
          schoolId: resources.source.schoolId,
          teacherUserId: resources.source.user.id,
          asOf: lifecycleAt,
        });
        const profileFootprints =
          await transaction.organizationTransfer.listAndLockProfileFootprints({
            source: resources.source,
            destination: resources.destination,
          });
        const destinationProfileFootprint = selectDestinationProfile({
          sourceProfileId: resources.source.profile.id,
          destinationSchoolId: resources.destination.schoolId,
          footprints: profileFootprints,
        });
        const membershipFootprints =
          await transaction.organizationTransfer.listAndLockMembershipFootprints(
            {
              source: resources.source,
              destination: resources.destination,
            },
          );
        const destinationMembershipFootprint = selectDestinationMembership({
          sourceMembershipId: sourceMembership.id,
          destinationSchoolId: resources.destination.schoolId,
          footprints: membershipFootprints,
        });

        const destinationRole =
          await transaction.organizationTransfer.resolveDestinationTeacherRole(
            resources.destination,
          );
        if (!destinationRole) {
          throw new TeacherRoleRequiredException(
            'destination_teacher_role_required',
          );
        }

        const profileFields = buildDestinationProfileFields(command);
        const completeness = projectTeacherProfileCompleteness({
          teacherCode: profileFields.teacherCode ?? null,
          firstNameAr: profileFields.firstNameAr ?? null,
          lastNameAr: profileFields.lastNameAr ?? null,
          firstNameEn: profileFields.firstNameEn ?? null,
          lastNameEn: profileFields.lastNameEn ?? null,
          gender: profileFields.gender ?? null,
        });
        if (!completeness.isComplete) {
          throw new TeacherProfileIncompleteException(
            completeness.missingFields,
          );
        }
        const displayNames = selectTeacherDisplayNames(
          {
            firstNameAr: profileFields.firstNameAr ?? null,
            lastNameAr: profileFields.lastNameAr ?? null,
            firstNameEn: profileFields.firstNameEn ?? null,
            lastNameEn: profileFields.lastNameEn ?? null,
          },
          command.preferredDisplayLanguage,
        );
        const teacherCodeAvailable =
          await transaction.organizationTransfer.isDestinationTeacherCodeAvailable(
            {
              destination: resources.destination,
              teacherCode: profileFields.teacherCode!,
              destinationProfileId: destinationProfileFootprint?.id,
            },
          );
        if (!teacherCodeAvailable) {
          throw new TeacherProfileCodeConflictException();
        }

        const transferredMembership =
          await transaction.membership.setTransferred({
            membershipId: sourceMembership.id,
            schoolId: resources.source.schoolId,
            expectedStatus: sourceMembership.status,
            expectedEndedAt: sourceMembership.endedAt,
            endedAt: lifecycleAt,
          });
        await transaction.profile.archive({
          schoolId: resources.source.schoolId,
          profileId: resources.source.profile.id,
          deletedAt: lifecycleAt,
        });

        const destinationProfile = destinationProfileFootprint
          ? await transaction.profile.restore({
              schoolId: resources.destination.schoolId,
              profileId: destinationProfileFootprint.id,
              userId: resources.source.user.id,
              employmentStatus: TeacherEmploymentStatus.INACTIVE,
              fields: profileFields,
            })
          : await transaction.profile.create({
              schoolId: resources.destination.schoolId,
              userId: resources.source.user.id,
              employmentStatus: TeacherEmploymentStatus.INACTIVE,
              fields: profileFields,
            });
        const destinationMembership = destinationMembershipFootprint
          ? await transaction.organizationTransfer.restoreDestinationMembership(
              {
                membershipId: destinationMembershipFootprint.id,
                sourceUserId: resources.source.user.id,
                organizationId: scope.organizationId,
                destinationSchoolId: resources.destination.schoolId,
                destinationRoleId: destinationRole.id,
                expectedStatus: destinationMembershipFootprint.status,
                expectedEndedAt: destinationMembershipFootprint.endedAt,
              },
            )
          : await transaction.organizationTransfer.createDestinationMembership({
              sourceUserId: resources.source.user.id,
              organizationId: scope.organizationId,
              destinationSchoolId: resources.destination.schoolId,
              destinationRoleId: destinationRole.id,
            });

        await transaction.user.updateDisplayNames({
          userId: resources.source.user.id,
          ...displayNames,
        });
        const destinationUser = await transaction.user.setStatus({
          userId: resources.source.user.id,
          expectedStatus: resources.source.user.status,
          status: UserStatus.DISABLED,
        });
        let revokedSessionCount: number;
        try {
          revokedSessionCount = await transaction.sessions.revokeUserSessions(
            resources.source.user.id,
            lifecycleAt,
          );
        } catch {
          throw new TeacherLifecycleSessionRevocationError();
        }

        await writeTransferAudits({
          transaction,
          scope,
          sourceProfileId: resources.source.profile.id,
          sourceSchoolId: resources.source.schoolId,
          sourceMembership,
          transferredMembership,
          destinationSchoolId: resources.destination.schoolId,
          destinationProfile,
          destinationProfileRestored: destinationProfileFootprint !== null,
          destinationMembership,
          destinationMembershipPreviousStatus:
            destinationMembershipFootprint?.status,
          user: resources.source.user,
          allocation,
        });

        const persistedCompleteness =
          projectTeacherProfileCompleteness(destinationProfile);
        if (!persistedCompleteness.isComplete) {
          throw new TeacherProfileIncompleteException(
            persistedCompleteness.missingFields,
          );
        }
        const teacher = presentTeacherDirectoryDetail(
          composeTeacherDirectoryRecord({
            user: destinationUser,
            profile: destinationProfile,
            membershipStatus: destinationMembership.status,
            membershipEndedAt: destinationMembership.endedAt,
            profileCompleteness: persistedCompleteness,
          }),
        );
        return presentOrganizationTeacherTransfer({
          teacher,
          lifecycleAt,
          revokedSessionCount,
          allocation,
        });
      });
    } catch (error) {
      mapTransferError(error);
    }
  }
}

function buildDestinationProfileFields(command: TransferTeacherToSchoolDto) {
  return buildTeacherProfileManagedFields({
    teacherCode: command.teacherCode,
    firstNameAr: command.firstNameAr,
    lastNameAr: command.lastNameAr,
    firstNameEn: command.firstNameEn,
    lastNameEn: command.lastNameEn,
    gender: command.gender,
    department: command.department ?? null,
    specialization: command.specialization ?? null,
    employmentType: command.employmentType ?? null,
    experienceYears: command.experienceYears ?? null,
    hireDate: command.hireDate ?? null,
    workingDays: command.workingDays ?? [],
    workStartTime: command.workStartTime ?? null,
    workEndTime: command.workEndTime ?? null,
    notesAr: command.notesAr ?? null,
    notesEn: command.notesEn ?? null,
  });
}

async function writeTransferAudits(input: {
  transaction: TeacherLifecycleTransactionContext;
  scope: TrustedOrganizationScope;
  sourceProfileId: string;
  sourceSchoolId: string;
  sourceMembership: TeacherLifecycleMembershipState;
  transferredMembership: TeacherLifecycleMembershipState;
  destinationSchoolId: string;
  destinationProfile: TeacherLifecycleProfileState;
  destinationProfileRestored: boolean;
  destinationMembership: TeacherLifecycleMembershipState;
  destinationMembershipPreviousStatus?: MembershipStatus;
  user: TeacherLifecycleUserState;
  allocation: TeacherAllocationLifecycleSummary;
}): Promise<void> {
  const common = {
    actorId: input.scope.actorId,
    actorUserType: UserType.ORGANIZATION_USER,
    organizationId: input.scope.organizationId,
  } as const;
  await input.transaction.audit.writeSuccessful({
    ...common,
    schoolId: input.sourceSchoolId,
    action: 'teachers.profile.archive',
    resourceType: 'teacher_profile',
    resourceId: input.sourceProfileId,
    metadata: {
      userId: input.user.id,
      membershipId: input.sourceMembership.id,
      teacherProfileId: input.sourceProfileId,
      changedFields: ['deletedAt'],
    },
  });
  await input.transaction.audit.writeSuccessful({
    ...common,
    schoolId: input.sourceSchoolId,
    action: 'teachers.membership.transfer',
    resourceType: 'membership',
    resourceId: input.sourceMembership.id,
    metadata: {
      userId: input.user.id,
      membershipId: input.sourceMembership.id,
      teacherProfileId: input.sourceProfileId,
      changedFields: ['membershipStatus', 'endedAt'],
      previousValue: input.sourceMembership.status,
      nextValue: input.transferredMembership.status,
    },
  });
  await input.transaction.audit.writeSuccessful({
    ...common,
    schoolId: input.destinationSchoolId,
    action: input.destinationProfileRestored
      ? 'teachers.profile.restore'
      : 'teachers.profile.create',
    resourceType: 'teacher_profile',
    resourceId: input.destinationProfile.id,
    metadata: {
      userId: input.user.id,
      teacherProfileId: input.destinationProfile.id,
      changedFields: [
        'deletedAt',
        'employmentStatus',
        'teacherCode',
        'firstNameAr',
        'lastNameAr',
        'firstNameEn',
        'lastNameEn',
        'gender',
      ],
      nextValue: TeacherEmploymentStatus.INACTIVE,
    },
  });
  await input.transaction.audit.writeSuccessful({
    ...common,
    schoolId: input.destinationSchoolId,
    action: 'teachers.membership.transfer',
    resourceType: 'membership',
    resourceId: input.destinationMembership.id,
    metadata: {
      userId: input.user.id,
      membershipId: input.destinationMembership.id,
      teacherProfileId: input.destinationProfile.id,
      changedFields: ['roleId', 'membershipStatus', 'endedAt'],
      ...(input.destinationMembershipPreviousStatus
        ? { previousValue: input.destinationMembershipPreviousStatus }
        : {}),
      nextValue: MembershipStatus.SUSPENDED,
    },
  });
  await input.transaction.audit.writeSuccessful({
    ...common,
    schoolId: input.destinationSchoolId,
    action: 'teachers.account.transfer',
    resourceType: 'user',
    resourceId: input.user.id,
    metadata: {
      userId: input.user.id,
      membershipId: input.destinationMembership.id,
      teacherProfileId: input.destinationProfile.id,
      changedFields: ['firstName', 'lastName', 'status'],
      previousValue: input.user.status,
      nextValue: UserStatus.DISABLED,
      allocationDependencyCounts: teacherAllocationAuditCounts(
        input.allocation,
      ),
      termStateLabels: teacherAllocationStateLabels(input.allocation),
      hasPassword: input.user.credential.hasPassword,
      mustChangePassword: input.user.credential.mustChangePassword,
      credentialVersion: input.user.credential.credentialVersion,
    },
  });
}

function mapTransferError(error: unknown): never {
  if (
    error instanceof TeacherTransferNotFoundException ||
    error instanceof TeacherTransferConflictException ||
    error instanceof TeacherProfileIncompleteException ||
    error instanceof TeacherProfileCodeConflictException ||
    error instanceof TeacherRoleRequiredException
  ) {
    throw error;
  }
  if (error instanceof TeacherLifecycleSessionRevocationError) {
    throw new TeacherLifecycleRevocationFailedException();
  }
  if (isTeacherCodeUniqueConflict(error)) {
    throw new TeacherTransferConflictException(
      'destination_teacher_code_conflict',
    );
  }
  if (
    error instanceof OrganizationTeacherTransferInvariantError ||
    error instanceof TeacherLifecycleMembershipInvariantError ||
    error instanceof TeacherLifecycleUserInvariantError ||
    error instanceof TeacherProfileLifecycleInvariantError ||
    isPrismaUniqueConflict(error) ||
    isTeacherLifecycleSerializationConflict(error)
  ) {
    throw new TeacherTransferConflictException('transfer_concurrency_conflict');
  }
  throw error;
}

function isPrismaUniqueConflict(error: unknown): boolean {
  return (
    (error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002') ||
    (typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002')
  );
}

function isTeacherCodeUniqueConflict(error: unknown): boolean {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) &&
    !(typeof error === 'object' && error !== null && 'code' in error)
  ) {
    return false;
  }
  const candidate = error as { code?: unknown; meta?: unknown };
  return (
    candidate.code === 'P2002' &&
    JSON.stringify(candidate.meta).toLowerCase().includes('teacher_code')
  );
}
