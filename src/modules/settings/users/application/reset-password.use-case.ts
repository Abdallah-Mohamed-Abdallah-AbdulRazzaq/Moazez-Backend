import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { AuditOutcome } from '@prisma/client';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { PasswordService } from '../../../iam/auth/domain/password.service';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { requireSettingsScope } from '../../settings-context';
import { ResetPasswordResponseDto } from '../dto/user-response.dto';
import { UsersRepository } from '../infrastructure/users.repository';
import { presentResetPasswordResponse } from '../presenters/users.presenter';

@Injectable()
export class ResetPasswordUseCase {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly authRepository: AuthRepository,
    private readonly passwordService: PasswordService,
  ) {}

  async execute(userId: string): Promise<ResetPasswordResponseDto> {
    const scope = requireSettingsScope();
    const membership = await this.usersRepository.findScopedMembershipByUserId(userId);
    if (!membership) {
      throw new NotFoundDomainException('User not found', { userId });
    }

    // Placeholder until a dedicated reset-token delivery flow exists.
    await this.passwordService.hash(`reset:${membership.user.id}:${randomUUID()}`);

    await this.authRepository.createAuditLog({
      actorId: scope.actorId,
      userType: scope.userType,
      organizationId: scope.organizationId,
      schoolId: scope.schoolId,
      module: 'auth',
      action: 'password.reset',
      resourceType: 'user',
      resourceId: membership.user.id,
      outcome: AuditOutcome.SUCCESS,
    });

    return presentResetPasswordResponse(membership.user.id);
  }
}
