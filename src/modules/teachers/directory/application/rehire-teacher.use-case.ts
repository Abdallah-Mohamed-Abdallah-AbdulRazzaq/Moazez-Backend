import { Injectable } from '@nestjs/common';
import {
  MembershipStatus,
  Prisma,
  TeacherEmploymentStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';
import { TeacherLifecycleMembershipInvariantError } from '../../../settings/users/infrastructure/teacher-lifecycle-membership.operations';
import { TeacherLifecycleUserInvariantError } from '../../../settings/users/infrastructure/teacher-lifecycle-user.operations';
import {
  TeacherLifecycleUnitOfWork,
  type TeacherLifecycleMembershipState,
} from '../../lifecycle/application/teacher-lifecycle-unit-of-work';
import { isTeacherLifecycleSerializationConflict } from '../../lifecycle/application/teacher-lifecycle-transaction-error';
import { isExactTeacherRoleForSchool } from '../../lifecycle/domain/teacher-membership-state';
import {
  TeacherLifecycleRevocationFailedException,
  TeacherLifecycleSessionRevocationError,
} from '../../lifecycle/domain/teacher-lifecycle.errors';
import { projectTeacherProfileCompleteness } from '../../profile/domain/teacher-profile.integrity';
import { TeacherProfileLifecycleInvariantError } from '../../profile/infrastructure/teacher-profile-lifecycle.operations';
import {
  TeacherProfileCodeConflictException,
  TeacherProfileIncompleteException,
  TeacherProfileNotFoundException,
  TeacherRoleRequiredException,
  TeacherRoleTransitionConflictException,
} from '../domain/teacher-directory.errors';
import {
  buildTeacherProfileManagedFields,
  selectTeacherDisplayNames,
} from '../domain/teacher-directory-input';
import { composeTeacherDirectoryRecord } from '../domain/teacher-directory.types';
import type {
  RehireTeacherDto,
  TeacherDirectoryDetailDto,
} from '../dto/teacher-directory.dto';
import { presentTeacherDirectoryDetail } from '../presenters/teacher-directory.presenter';
import { requireTeacherDirectoryScope } from '../teacher-directory.context';

@Injectable()
export class RehireTeacherUseCase {
  constructor(private readonly unitOfWork: TeacherLifecycleUnitOfWork) {}

  async execute(
    teacherId: string,
    command: RehireTeacherDto,
  ): Promise<TeacherDirectoryDetailDto> {
    const scope = requireTeacherDirectoryScope();
    const lifecycleAt = new Date();
    const fields = buildTeacherProfileManagedFields(command);
    const completeness = projectTeacherProfileCompleteness({
      teacherCode: fields.teacherCode ?? null,
      firstNameAr: fields.firstNameAr ?? null,
      lastNameAr: fields.lastNameAr ?? null,
      firstNameEn: fields.firstNameEn ?? null,
      lastNameEn: fields.lastNameEn ?? null,
      gender: fields.gender ?? null,
    });
    if (!completeness.isComplete) {
      throw new TeacherProfileIncompleteException(completeness.missingFields);
    }
    if (
      command.preferredDisplayLanguage !== 'AR' &&
      command.preferredDisplayLanguage !== 'EN'
    ) {
      throw new ValidationDomainException(
        'preferredDisplayLanguage is required for Teacher rehire',
        { field: 'preferredDisplayLanguage' },
      );
    }
    const displayNames = selectTeacherDisplayNames(
      {
        firstNameAr: fields.firstNameAr ?? null,
        lastNameAr: fields.lastNameAr ?? null,
        firstNameEn: fields.firstNameEn ?? null,
        lastNameEn: fields.lastNameEn ?? null,
      },
      command.preferredDisplayLanguage,
    );

    try {
      return await this.unitOfWork.execute(async (transaction) => {
        const profile = await transaction.profile.findArchivedById({
          schoolId: scope.schoolId,
          profileId: teacherId,
        });
        if (!profile) throw new TeacherProfileNotFoundException();
        const [
          user,
          liveProfiles,
          operationalMemberships,
          schoolHistory,
          role,
        ] = await Promise.all([
          transaction.user.findState(profile.userId),
          transaction.profile.listLiveFootprintsForUser(profile.userId),
          transaction.membership.listOperationalFootprints(profile.userId),
          transaction.membership.listCurrentSchoolHistory({
            schoolId: scope.schoolId,
            userId: profile.userId,
          }),
          transaction.membership.resolveExactTeacherRole(scope.schoolId),
        ]);
        if (!user || user.deletedAt !== null) {
          throw new TeacherRoleTransitionConflictException(
            'teacher_rehire_state_conflict',
          );
        }
        if (liveProfiles.length > 0) {
          throw new TeacherRoleTransitionConflictException(
            'teacher_live_identity_exists',
          );
        }
        if (operationalMemberships.length > 0) {
          throw new TeacherRoleTransitionConflictException(
            'teacher_operational_membership_exists',
          );
        }
        if (!role || !isExactTeacherRoleForSchool(role, scope.schoolId)) {
          throw new TeacherRoleRequiredException();
        }

        const restorable = schoolHistory.filter(isRestorableTeacherMembership);
        if (restorable.length > 1) {
          throw new TeacherRoleTransitionConflictException(
            'teacher_membership_history_ambiguous',
          );
        }

        const restoredProfile = await transaction.profile.restore({
          schoolId: scope.schoolId,
          profileId: profile.id,
          userId: user.id,
          employmentStatus: TeacherEmploymentStatus.INACTIVE,
          fields,
        });
        const restoredMembership = restorable[0]
          ? await transaction.membership.restoreExactTeacher({
              membershipId: restorable[0].id,
              userId: user.id,
              schoolId: scope.schoolId,
              roleId: role.id,
              expectedStatus: restorable[0].status,
              expectedEndedAt: restorable[0].endedAt,
            })
          : await transaction.membership.createExactTeacherForRehire({
              userId: user.id,
              organizationId: scope.organizationId,
              schoolId: scope.schoolId,
              roleId: role.id,
            });
        await transaction.user.setTypeForReviewedTransition({
          userId: user.id,
          expectedUserType: user.userType,
          userType: UserType.TEACHER,
        });
        await transaction.user.updateDisplayNames({
          userId: user.id,
          ...displayNames,
        });
        const restoredUser = await transaction.user.setStatus({
          userId: user.id,
          expectedStatus: user.status,
          status: UserStatus.DISABLED,
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
          action: 'teachers.profile.restore',
          resourceType: 'teacher_profile',
          resourceId: profile.id,
          metadata: {
            userId: user.id,
            membershipId: restoredMembership.id,
            teacherProfileId: profile.id,
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
            previousValue: profile.employmentStatus,
            nextValue: TeacherEmploymentStatus.INACTIVE,
          },
        });
        await transaction.audit.writeSuccessful({
          actorId: scope.actorId,
          actorUserType: scope.actorUserType,
          organizationId: scope.organizationId,
          schoolId: scope.schoolId,
          action: 'teachers.account.rehire',
          resourceType: 'user',
          resourceId: user.id,
          metadata: {
            userId: user.id,
            membershipId: restoredMembership.id,
            teacherProfileId: profile.id,
            changedFields: [
              'status',
              'userType',
              'membershipStatus',
              'endedAt',
            ],
            previousValue: user.status,
            nextValue: UserStatus.DISABLED,
            hasPassword: user.credential.hasPassword,
            mustChangePassword: user.credential.mustChangePassword,
            credentialVersion: user.credential.credentialVersion,
          },
        });

        const persistedCompleteness =
          projectTeacherProfileCompleteness(restoredProfile);
        if (!persistedCompleteness.isComplete) {
          throw new TeacherProfileIncompleteException(
            persistedCompleteness.missingFields,
          );
        }
        return presentTeacherDirectoryDetail(
          composeTeacherDirectoryRecord({
            user: restoredUser,
            profile: restoredProfile,
            membershipStatus: restoredMembership.status,
            membershipEndedAt: restoredMembership.endedAt,
            profileCompleteness: persistedCompleteness,
          }),
        );
      });
    } catch (error) {
      if (
        error instanceof TeacherProfileNotFoundException ||
        error instanceof TeacherProfileIncompleteException ||
        error instanceof TeacherRoleRequiredException ||
        error instanceof TeacherRoleTransitionConflictException
      ) {
        throw error;
      }
      if (error instanceof TeacherLifecycleSessionRevocationError) {
        throw new TeacherLifecycleRevocationFailedException();
      }
      if (isTeacherCodeConflict(error)) {
        throw new TeacherProfileCodeConflictException();
      }
      if (
        error instanceof TeacherLifecycleMembershipInvariantError ||
        error instanceof TeacherLifecycleUserInvariantError ||
        error instanceof TeacherProfileLifecycleInvariantError ||
        isTeacherLifecycleSerializationConflict(error)
      ) {
        throw new TeacherRoleTransitionConflictException(
          'teacher_rehire_state_conflict',
        );
      }
      throw error;
    }
  }
}

function isRestorableTeacherMembership(
  membership: TeacherLifecycleMembershipState,
): boolean {
  return (
    membership.deletedAt === null &&
    !(
      membership.status === MembershipStatus.ACTIVE &&
      membership.endedAt === null
    ) &&
    (membership.userType === UserType.TEACHER ||
      membership.role.key === 'teacher')
  );
}

function isTeacherCodeConflict(error: unknown): boolean {
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
