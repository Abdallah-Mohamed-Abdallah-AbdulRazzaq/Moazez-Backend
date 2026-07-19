import { Injectable } from '@nestjs/common';
import { Prisma, SchoolLoginSettingsStatus, UserType } from '@prisma/client';
import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';
import {
  buildLoginEmail,
  normalizeContactEmail,
  normalizeUsername,
  validateUsername,
} from '../../../settings/login-identity/domain/login-identity.policy';
import { LoginIdentityRepository } from '../../../settings/login-identity/infrastructure/login-identity.repository';
import {
  TeacherLifecycleUnitOfWork,
  type TeacherLifecycleProfileManagedFields,
  type TeacherLifecycleUserIdentityFields,
} from '../../lifecycle/application/teacher-lifecycle-unit-of-work';
import { isExactTeacherMembership } from '../../lifecycle/domain/teacher-membership-state';
import { projectTeacherProfileCompleteness } from '../../profile/domain/teacher-profile.integrity';
import {
  TeacherIdentityConflictException,
  TeacherProfileCodeConflictException,
  TeacherProfileNotFoundException,
  type TeacherIdentityField,
} from '../domain/teacher-directory.errors';
import {
  buildTeacherProfileManagedFields,
  normalizeLoginEmail,
  normalizeNullableText,
  selectTeacherDisplayNames,
  TEACHER_MANAGED_NAME_FIELDS,
} from '../domain/teacher-directory-input';
import { composeTeacherDirectoryRecord } from '../domain/teacher-directory.types';
import type {
  TeacherDirectoryDetailDto,
  UpdateTeacherDto,
} from '../dto/teacher-directory.dto';
import { presentTeacherDirectoryDetail } from '../presenters/teacher-directory.presenter';
import { requireTeacherDirectoryScope } from '../teacher-directory.context';

@Injectable()
export class UpdateTeacherUseCase {
  constructor(
    private readonly unitOfWork: TeacherLifecycleUnitOfWork,
    private readonly loginIdentityRepository: LoginIdentityRepository,
  ) {}

  async execute(
    teacherId: string,
    command: UpdateTeacherDto,
  ): Promise<TeacherDirectoryDetailDto> {
    const scope = requireTeacherDirectoryScope();
    const identityFields = await this.resolveIdentityFields(command);
    const profileFields = buildTeacherProfileManagedFields(command);
    const namesChanged = TEACHER_MANAGED_NAME_FIELDS.some(
      (field) => command[field] !== undefined,
    );
    if (namesChanged && !command.preferredDisplayLanguage) {
      throw new ValidationDomainException(
        'preferredDisplayLanguage is required when managed names change',
        { field: 'preferredDisplayLanguage' },
      );
    }

    try {
      const record = await this.unitOfWork.execute(async (transaction) => {
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
          user.deletedAt !== null ||
          user.userType !== UserType.TEACHER ||
          !isExactTeacherMembership(membership)
        ) {
          throw new TeacherProfileNotFoundException();
        }

        const conflicts = await transaction.user.findIdentityConflicts({
          userId: user.id,
          fields: identityFields,
        });
        if (conflicts.length > 0) {
          throw new TeacherIdentityConflictException(conflicts);
        }

        const finalNames = {
          firstNameAr:
            profileFields.firstNameAr !== undefined
              ? profileFields.firstNameAr
              : profile.firstNameAr,
          lastNameAr:
            profileFields.lastNameAr !== undefined
              ? profileFields.lastNameAr
              : profile.lastNameAr,
          firstNameEn:
            profileFields.firstNameEn !== undefined
              ? profileFields.firstNameEn
              : profile.firstNameEn,
          lastNameEn:
            profileFields.lastNameEn !== undefined
              ? profileFields.lastNameEn
              : profile.lastNameEn,
        };
        const displayNames = command.preferredDisplayLanguage
          ? selectTeacherDisplayNames(
              finalNames,
              command.preferredDisplayLanguage,
            )
          : null;

        let updatedUser = user;
        let updatedProfile = profile;
        if (Object.keys(identityFields).length > 0) {
          updatedUser = await transaction.user.updateIdentityFields({
            userId: user.id,
            fields: identityFields,
          });
        }
        if (displayNames) {
          updatedUser = await transaction.user.updateDisplayNames({
            userId: user.id,
            ...displayNames,
          });
        }
        if (Object.keys(profileFields).length > 0) {
          updatedProfile = await transaction.profile.update({
            schoolId: scope.schoolId,
            profileId: profile.id,
            fields: profileFields,
          });
        }

        const changedFields = changedFieldKeys(command);
        if (changedFields.length === 0) {
          throw new ValidationDomainException('No managed fields supplied');
        }
        await transaction.audit.writeSuccessful({
          actorId: scope.actorId,
          actorUserType: scope.actorUserType,
          organizationId: scope.organizationId,
          schoolId: scope.schoolId,
          action: 'teachers.profile.update',
          resourceType: 'teacher_profile',
          resourceId: profile.id,
          metadata: {
            userId: user.id,
            teacherProfileId: profile.id,
            changedFields,
          },
        });

        return composeTeacherDirectoryRecord({
          user: updatedUser,
          profile: updatedProfile,
          membershipStatus: membership.status,
          membershipEndedAt: membership.endedAt,
          profileCompleteness:
            projectTeacherProfileCompleteness(updatedProfile),
        });
      });
      return presentTeacherDirectoryDetail(record);
    } catch (error) {
      mapPersistenceConflict(error, command);
      throw error;
    }
  }

  private async resolveIdentityFields(
    command: UpdateTeacherDto,
  ): Promise<TeacherLifecycleUserIdentityFields> {
    const fields: TeacherLifecycleUserIdentityFields = {};
    if (command.username !== undefined) {
      const settings = await this.loginIdentityRepository.findCurrentSettings();
      const validation = validateUsername(command.username, settings);
      if (
        !validation.valid ||
        !settings ||
        settings.status !== SchoolLoginSettingsStatus.ACTIVE
      ) {
        throw new ValidationDomainException('Invalid username', {
          field: 'username',
          reasonCode: validation.reason ?? 'login_settings_required',
        });
      }
      const loginEmail = buildLoginEmail(
        validation.username,
        settings.loginDomain,
      );
      if (
        command.loginEmail !== undefined &&
        normalizeLoginEmail(command.loginEmail) !== loginEmail
      ) {
        throw new ValidationDomainException(
          'loginEmail must match the configured username identity',
          { field: 'loginEmail' },
        );
      }
      fields.username = normalizeUsername(command.username);
      fields.loginEmail = loginEmail;
    } else if (command.loginEmail !== undefined) {
      fields.loginEmail = normalizeLoginEmail(command.loginEmail);
    }
    if (command.contactEmail !== undefined) {
      fields.contactEmail = command.contactEmail
        ? normalizeContactEmail(command.contactEmail)
        : null;
    }
    if (command.phone !== undefined) {
      fields.phone = normalizeNullableText(command.phone) ?? null;
    }
    return fields;
  }
}

function changedFieldKeys(
  command: UpdateTeacherDto,
): Array<
  | keyof TeacherLifecycleProfileManagedFields
  | 'loginEmail'
  | 'username'
  | 'contactEmail'
  | 'phone'
  | 'firstName'
  | 'lastName'
> {
  const keys = Object.keys(command).filter(
    (key) => key !== 'preferredDisplayLanguage',
  ) as Array<
    | keyof TeacherLifecycleProfileManagedFields
    | 'loginEmail'
    | 'username'
    | 'contactEmail'
    | 'phone'
    | 'firstName'
    | 'lastName'
  >;
  if (command.preferredDisplayLanguage) keys.push('firstName', 'lastName');
  return [...new Set(keys)];
}

function mapPersistenceConflict(
  error: unknown,
  command: UpdateTeacherDto,
): void {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) &&
    !(
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    )
  ) {
    return;
  }
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
    fields.push(command.username !== undefined ? 'username' : 'loginEmail');
  }
  throw new TeacherIdentityConflictException(
    fields.length > 0 ? fields : ['loginEmail'],
  );
}
