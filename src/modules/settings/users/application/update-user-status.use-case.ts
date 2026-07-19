import { Injectable } from '@nestjs/common';
import { AuditOutcome, UserStatus, UserType } from '@prisma/client';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { TeacherAccountDisableCoordinator } from '../../../teachers/lifecycle/application/teacher-account-disable.coordinator';
import { requireSettingsScope } from '../../settings-context';
import { UpdateUserStatusDto } from '../dto/update-user-status.dto';
import { UserStatusResponseDto } from '../dto/user-response.dto';
import { UsersRepository } from '../infrastructure/users.repository';
import { presentUserStatus } from '../presenters/users.presenter';
import { TeacherSettingsBypassService } from './teacher-settings-bypass.service';

@Injectable()
export class UpdateUserStatusUseCase {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly authRepository: AuthRepository,
    private readonly teacherAccountDisable: TeacherAccountDisableCoordinator,
    private readonly teacherBypass: TeacherSettingsBypassService,
  ) {}

  async execute(
    userId: string,
    command: UpdateUserStatusDto,
  ): Promise<UserStatusResponseDto> {
    const scope = requireSettingsScope();
    const membership =
      await this.usersRepository.findScopedMembershipForStatusChangeByUserId(
        userId,
      );
    if (!membership) {
      throw new NotFoundDomainException('User not found', { userId });
    }

    const teacherFootprint =
      membership.user.userType === UserType.TEACHER ||
      membership.userType === UserType.TEACHER ||
      membership.role.key === 'teacher';
    if (teacherFootprint && command.status === 'active') {
      await this.teacherBypass.rejectActivation({
        scope,
        resourceId: membership.user.id,
        previousStatus: membership.user.status,
      });
    }
    if (teacherFootprint) {
      const disabled = await this.teacherAccountDisable.execute({
        actorId: scope.actorId,
        actorUserType: scope.userType,
        organizationId: scope.organizationId,
        schoolId: scope.schoolId,
        userId: membership.user.id,
        membershipId: membership.id,
        effectiveAt: new Date(),
      });
      return { id: disabled.userId, status: 'inactive' };
    }

    const updated = await this.usersRepository.updateUserAndMembership({
      userId: membership.user.id,
      membershipId: membership.id,
      status:
        command.status === 'active' ? UserStatus.ACTIVE : UserStatus.DISABLED,
    });
    if (updated.user.status !== UserStatus.ACTIVE) {
      await this.authRepository.revokeUserSessions(updated.user.id);
    }

    await this.authRepository.createAuditLog({
      actorId: scope.actorId,
      userType: scope.userType,
      organizationId: scope.organizationId,
      schoolId: scope.schoolId,
      module: 'iam',
      action: 'iam.user.status.change',
      resourceType: 'user',
      resourceId: updated.user.id,
      outcome: AuditOutcome.SUCCESS,
      before: { status: membership.user.status },
      after: { status: updated.user.status },
    });

    return presentUserStatus(updated);
  }
}
