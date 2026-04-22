import { Injectable } from '@nestjs/common';
import { AuditOutcome, UserStatus } from '@prisma/client';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { requireSettingsScope } from '../../settings-context';
import { UpdateUserStatusDto } from '../dto/update-user-status.dto';
import { UserStatusResponseDto } from '../dto/user-response.dto';
import { UsersRepository } from '../infrastructure/users.repository';
import { presentUserStatus } from '../presenters/users.presenter';

@Injectable()
export class UpdateUserStatusUseCase {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    userId: string,
    command: UpdateUserStatusDto,
  ): Promise<UserStatusResponseDto> {
    const scope = requireSettingsScope();
    const membership = await this.usersRepository.findScopedMembershipByUserId(userId);
    if (!membership) {
      throw new NotFoundDomainException('User not found', { userId });
    }

    const updated = await this.usersRepository.updateUserAndMembership({
      userId: membership.user.id,
      membershipId: membership.id,
      status:
        command.status === 'active' ? UserStatus.ACTIVE : UserStatus.DISABLED,
    });

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
