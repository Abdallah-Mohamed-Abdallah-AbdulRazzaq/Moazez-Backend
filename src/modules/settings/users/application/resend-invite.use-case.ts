import { Injectable } from '@nestjs/common';
import { AuditOutcome, UserStatus, UserType } from '@prisma/client';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { requireSettingsScope } from '../../settings-context';
import { UserNotInvitableException } from '../domain/user.exceptions';
import { UserResponseDto } from '../dto/user-response.dto';
import { UsersRepository } from '../infrastructure/users.repository';
import { presentUser } from '../presenters/users.presenter';
import { TeacherSettingsBypassService } from './teacher-settings-bypass.service';

@Injectable()
export class ResendInviteUseCase {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly authRepository: AuthRepository,
    private readonly teacherBypass: TeacherSettingsBypassService,
  ) {}

  async execute(userId: string): Promise<UserResponseDto> {
    const scope = requireSettingsScope();
    const membership =
      await this.usersRepository.findScopedMembershipByUserId(userId);
    if (!membership) {
      throw new NotFoundDomainException('User not found', { userId });
    }
    if (
      membership.userType === UserType.TEACHER ||
      membership.user.userType === UserType.TEACHER ||
      membership.role.key === 'teacher'
    ) {
      return this.teacherBypass.reject({
        scope,
        reasonCode: 'teacher_invite_managed_by_directory',
        resourceType: 'user',
        resourceId: membership.user.id,
      });
    }
    if (membership.user.status !== UserStatus.INVITED) {
      throw new UserNotInvitableException(userId);
    }

    const updated = await this.usersRepository.updateUserAndMembership({
      userId: membership.user.id,
      membershipId: membership.id,
      touchUpdatedAt: true,
    });

    await this.authRepository.createAuditLog({
      actorId: scope.actorId,
      userType: scope.userType,
      organizationId: scope.organizationId,
      schoolId: scope.schoolId,
      module: 'iam',
      action: 'user.invite.resend',
      resourceType: 'user',
      resourceId: updated.user.id,
      outcome: AuditOutcome.SUCCESS,
    });

    return presentUser(updated);
  }
}
