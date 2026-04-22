import { Injectable } from '@nestjs/common';
import { AuditOutcome, UserStatus } from '@prisma/client';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { requireSettingsScope } from '../../settings-context';
import { UserNotInvitableException } from '../domain/user.exceptions';
import { UserResponseDto } from '../dto/user-response.dto';
import { UsersRepository } from '../infrastructure/users.repository';
import { presentUser } from '../presenters/users.presenter';

@Injectable()
export class ResendInviteUseCase {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(userId: string): Promise<UserResponseDto> {
    const scope = requireSettingsScope();
    const membership = await this.usersRepository.findScopedMembershipByUserId(userId);
    if (!membership) {
      throw new NotFoundDomainException('User not found', { userId });
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
