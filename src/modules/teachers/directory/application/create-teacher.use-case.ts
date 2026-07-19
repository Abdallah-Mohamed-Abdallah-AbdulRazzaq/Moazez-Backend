import { Injectable } from '@nestjs/common';
import {
  Prisma,
  TeacherEmploymentStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';
import { UserLoginIdentityResolver } from '../../../settings/users/application/user-login-identity.resolver';
import { TeacherLifecycleUnitOfWork } from '../../lifecycle/application/teacher-lifecycle-unit-of-work';
import {
  isExactTeacherRoleForSchool,
  isOperationalTeacherMembership,
} from '../../lifecycle/domain/teacher-membership-state';
import type { TeacherLifecycleChangedField } from '../../lifecycle/domain/teacher-lifecycle-audit';
import { TeacherLifecycleMembershipInvariantError } from '../../../settings/users/infrastructure/teacher-lifecycle-membership.operations';
import { projectTeacherProfileCompleteness } from '../../profile/domain/teacher-profile.integrity';
import { TeacherProfileLifecycleInvariantError } from '../../profile/infrastructure/teacher-profile-lifecycle.operations';
import {
  TeacherIdentityConflictException,
  TeacherProfileCodeConflictException,
  TeacherProfileIncompleteException,
  TeacherRoleRequiredException,
  TeacherRoleTransitionConflictException,
  type TeacherIdentityField,
} from '../domain/teacher-directory.errors';
import {
  buildTeacherProfileManagedFields,
  normalizeNullableText,
  selectTeacherDisplayNames,
} from '../domain/teacher-directory-input';
import { composeTeacherDirectoryRecord } from '../domain/teacher-directory.types';
import type {
  CreateTeacherDto,
  TeacherDirectoryDetailDto,
} from '../dto/teacher-directory.dto';
import { presentTeacherDirectoryDetail } from '../presenters/teacher-directory.presenter';
import { requireTeacherDirectoryScope } from '../teacher-directory.context';

@Injectable()
export class CreateTeacherUseCase {
  constructor(
    private readonly unitOfWork: TeacherLifecycleUnitOfWork,
    private readonly loginIdentityResolver: UserLoginIdentityResolver,
  ) {}

  async execute(command: CreateTeacherDto): Promise<TeacherDirectoryDetailDto> {
    const scope = requireTeacherDirectoryScope();
    const identity = await this.loginIdentityResolver.normalize({
      email: command.loginEmail,
      username: command.username,
      contactEmail: command.contactEmail ?? undefined,
    });
    const identityFields = {
      loginEmail: identity.email,
      ...(identity.username ? { username: identity.username } : {}),
      contactEmail: identity.contactEmail,
      phone: normalizeNullableText(command.phone) ?? null,
    };
    const profileFields = buildTeacherProfileManagedFields(command);
    const completeness = projectTeacherProfileCompleteness({
      teacherCode: profileFields.teacherCode ?? null,
      firstNameAr: profileFields.firstNameAr ?? null,
      lastNameAr: profileFields.lastNameAr ?? null,
      firstNameEn: profileFields.firstNameEn ?? null,
      lastNameEn: profileFields.lastNameEn ?? null,
      gender: profileFields.gender ?? null,
    });
    if (!completeness.isComplete) {
      throw new TeacherProfileIncompleteException(completeness.missingFields);
    }
    if (
      command.preferredDisplayLanguage !== 'AR' &&
      command.preferredDisplayLanguage !== 'EN'
    ) {
      throw new ValidationDomainException(
        'preferredDisplayLanguage is required for Teacher provisioning',
        { field: 'preferredDisplayLanguage' },
      );
    }
    if (
      command.employmentStatus !== TeacherEmploymentStatus.ACTIVE &&
      command.employmentStatus !== TeacherEmploymentStatus.INACTIVE
    ) {
      throw new ValidationDomainException(
        'An explicit provisioning employment status is required',
        { field: 'employmentStatus' },
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

    try {
      return await this.unitOfWork.execute(async (transaction) => {
        const role = await transaction.membership.resolveExactTeacherRole(
          scope.schoolId,
        );
        if (!role || !isExactTeacherRoleForSchool(role, scope.schoolId)) {
          throw new TeacherRoleRequiredException();
        }

        const conflicts =
          await transaction.user.findProvisioningIdentityConflicts(
            identityFields,
          );
        if (conflicts.length > 0) {
          throw new TeacherIdentityConflictException(conflicts);
        }

        const user = await transaction.user.createInvitedTeacher({
          ...identityFields,
          username: identity.username,
          ...displayNames,
        });
        if (
          user.status !== UserStatus.INVITED ||
          user.userType !== UserType.TEACHER ||
          user.deletedAt !== null
        ) {
          throw new TeacherRoleTransitionConflictException();
        }
        const membership = await transaction.membership.createExactTeacher({
          userId: user.id,
          organizationId: scope.organizationId,
          schoolId: scope.schoolId,
          roleId: role.id,
          status: 'ACTIVE',
        });
        if (!isOperationalTeacherMembership(membership)) {
          throw new TeacherRoleTransitionConflictException();
        }
        const profile = await transaction.profile.create({
          schoolId: scope.schoolId,
          userId: user.id,
          employmentStatus: command.employmentStatus,
          fields: profileFields,
        });
        const persistedCompleteness =
          projectTeacherProfileCompleteness(profile);
        if (
          profile.schoolId !== scope.schoolId ||
          profile.userId !== user.id ||
          profile.deletedAt !== null ||
          !persistedCompleteness.isComplete
        ) {
          throw new TeacherRoleTransitionConflictException();
        }
        const profileChangedFields = [
          ...Object.keys(profileFields),
          'employmentStatus',
        ] as TeacherLifecycleChangedField[];

        await transaction.audit.writeSuccessful({
          actorId: scope.actorId,
          actorUserType: scope.actorUserType,
          organizationId: scope.organizationId,
          schoolId: scope.schoolId,
          action: 'teachers.account.provision',
          resourceType: 'user',
          resourceId: user.id,
          metadata: {
            userId: user.id,
            membershipId: membership.id,
            changedFields: [
              'loginEmail',
              'username',
              'contactEmail',
              'phone',
              'firstName',
              'lastName',
              'status',
              'userType',
              'roleId',
              'membershipStatus',
            ],
            hasPassword: user.credential.hasPassword,
            mustChangePassword: user.credential.mustChangePassword,
            credentialVersion: user.credential.credentialVersion,
          },
        });
        await transaction.audit.writeSuccessful({
          actorId: scope.actorId,
          actorUserType: scope.actorUserType,
          organizationId: scope.organizationId,
          schoolId: scope.schoolId,
          action: 'teachers.profile.create',
          resourceType: 'teacher_profile',
          resourceId: profile.id,
          metadata: {
            userId: user.id,
            teacherProfileId: profile.id,
            changedFields: profileChangedFields,
          },
        });

        return presentTeacherDirectoryDetail(
          composeTeacherDirectoryRecord({
            user,
            profile,
            membershipStatus: membership.status,
            membershipEndedAt: membership.endedAt,
            profileCompleteness: persistedCompleteness,
          }),
        );
      });
    } catch (error) {
      mapProvisioningError(error, command);
      throw error;
    }
  }
}

function mapProvisioningError(error: unknown, command: CreateTeacherDto): void {
  if (error instanceof TeacherLifecycleMembershipInvariantError) {
    if (error.reasonCode.includes('role')) {
      throw new TeacherRoleRequiredException();
    }
    throw new TeacherRoleTransitionConflictException();
  }
  if (error instanceof TeacherProfileLifecycleInvariantError) {
    throw new TeacherRoleTransitionConflictException();
  }
  const isUniqueConflict =
    (error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002') ||
    (typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002');
  if (!isUniqueConflict) return;

  const target =
    typeof error === 'object' && error !== null && 'meta' in error
      ? JSON.stringify(error.meta).toLowerCase()
      : '';
  if (target.includes('teacher_code')) {
    throw new TeacherProfileCodeConflictException();
  }
  const fields: TeacherIdentityField[] = [];
  if (target.includes('phone') && command.phone !== undefined) {
    fields.push('phone');
  }
  if (target.includes('email')) {
    fields.push(command.username ? 'username' : 'loginEmail');
  }
  if (fields.length > 0) {
    throw new TeacherIdentityConflictException(fields);
  }
  throw new TeacherRoleTransitionConflictException();
}
