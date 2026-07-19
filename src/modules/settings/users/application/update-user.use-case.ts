import { Injectable } from '@nestjs/common';
import { AuditOutcome, UserStatus, UserType } from '@prisma/client';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { TeacherRoleDemotionCoordinator } from '../../../teachers/lifecycle/application/teacher-role-demotion.coordinator';
import { requireSettingsScope } from '../../settings-context';
import { splitFullName } from '../domain/split-full-name';
import { userTypeFromRoleKey } from '../domain/user-type-from-role';
import { UpdateUserDto } from '../dto/update-user.dto';
import { UserResponseDto } from '../dto/user-response.dto';
import { UsersRepository } from '../infrastructure/users.repository';
import {
  presentSettingsUserStatus,
  presentUser,
} from '../presenters/users.presenter';
import { TeacherSettingsBypassService } from './teacher-settings-bypass.service';

@Injectable()
export class UpdateUserUseCase {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly authRepository: AuthRepository,
    private readonly teacherBypass: TeacherSettingsBypassService,
    private readonly teacherRoleDemotion?: TeacherRoleDemotionCoordinator,
  ) {}

  async execute(
    userId: string,
    command: UpdateUserDto,
  ): Promise<UserResponseDto> {
    const scope = requireSettingsScope();
    let membership =
      await this.usersRepository.findScopedMembershipByUserId(userId);
    if (!membership) {
      const lifecycleFootprint =
        await this.usersRepository.findScopedMembershipForStatusChangeByUserId(
          userId,
        );
      if (
        lifecycleFootprint?.user.userType === UserType.TEACHER ||
        lifecycleFootprint?.userType === UserType.TEACHER ||
        lifecycleFootprint?.role.key === 'teacher'
      ) {
        membership = lifecycleFootprint;
      }
    }
    if (!membership) {
      throw new NotFoundDomainException('User not found', { userId });
    }

    if (command.fullName && membership.user.userType === UserType.TEACHER) {
      await this.teacherBypass.reject({
        scope,
        reasonCode: 'teacher_display_projection_managed',
        resourceType: 'membership',
        resourceId: membership.id,
      });
    }

    let nextRoleId: string | undefined;
    let nextUserType: UserType | undefined;

    if (command.roleId) {
      const role = await this.usersRepository.findAssignableRoleById(
        scope.schoolId,
        command.roleId,
      );
      if (!role) {
        throw new NotFoundDomainException('Role not found', {
          roleId: command.roleId,
        });
      }
      if (role.key === 'teacher' && command.fullName) {
        await this.teacherBypass.reject({
          scope,
          reasonCode: 'teacher_display_projection_managed',
          resourceType: 'membership',
          resourceId: membership.id,
        });
      }
      if (
        role.key === 'teacher' &&
        membership.user.userType !== UserType.TEACHER
      ) {
        await this.teacherBypass.reject({
          scope,
          reasonCode: 'teacher_promotion_requires_profile',
          resourceType: 'membership',
          resourceId: membership.id,
        });
      }
      if (
        role.key !== 'teacher' &&
        membership.user.userType === UserType.TEACHER
      ) {
        if (!this.teacherRoleDemotion) {
          throw new Error('Teacher role demotion coordinator is unavailable');
        }
        const result = await this.teacherRoleDemotion.execute({
          actorId: scope.actorId,
          actorUserType: scope.userType,
          organizationId: scope.organizationId,
          schoolId: scope.schoolId,
          userId: membership.user.id,
          teacherMembershipId: membership.id,
          targetRoleId: role.id,
          effectiveAt: new Date(),
        });
        return {
          id: result.user.id,
          fullName: `${result.user.firstName} ${result.user.lastName}`.trim(),
          username: result.user.username,
          email: result.user.loginEmail,
          loginEmail: result.user.loginEmail,
          contactEmail: result.user.contactEmail,
          roleId: result.role.id,
          roleName: result.role.name ?? result.role.key,
          status: presentSettingsUserStatus(result.user.status),
          lastActiveAt: result.user.lastLoginAt?.toISOString() ?? null,
          invitedAt:
            result.user.status === UserStatus.INVITED
              ? (result.user.createdAt?.toISOString() ?? null)
              : null,
          lastInviteSentAt:
            result.user.status === UserStatus.INVITED
              ? (result.user.updatedAt?.toISOString() ?? null)
              : null,
        };
      }
      nextRoleId = role.id;
      nextUserType = userTypeFromRoleKey(role.key);
    }

    const names = command.fullName ? splitFullName(command.fullName) : null;

    const updated = await this.usersRepository.updateUserAndMembership({
      userId: membership.user.id,
      membershipId: membership.id,
      firstName: names?.firstName,
      lastName: names?.lastName,
      roleId: nextRoleId,
      userType: nextUserType,
    });

    await this.authRepository.createAuditLog({
      actorId: scope.actorId,
      userType: scope.userType,
      organizationId: scope.organizationId,
      schoolId: scope.schoolId,
      module: 'iam',
      action: 'user.update',
      resourceType: 'user',
      resourceId: updated.user.id,
      outcome: AuditOutcome.SUCCESS,
      after: {
        fullName: `${updated.user.firstName} ${updated.user.lastName}`.trim(),
        roleId: updated.roleId,
      },
    });

    return presentUser(updated);
  }
}
