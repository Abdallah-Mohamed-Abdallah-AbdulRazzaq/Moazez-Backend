import { Injectable } from '@nestjs/common';
import { AuditOutcome } from '@prisma/client';
import { getRequestContext } from '../../../../common/context/request-context';
import {
  CredentialCurrentPasswordInvalidException,
  CredentialMissingPasswordException,
  CredentialPasswordPolicyFailedException,
} from '../../../settings/users/credentials/domain/credential.exceptions';
import { validateAdminProvidedPassword } from '../../../settings/users/credentials/domain/credential-password.policy';
import { TokenInvalidException } from '../domain/auth.exceptions';
import { PasswordService } from '../domain/password.service';
import {
  ChangePasswordDto,
  ChangePasswordResponseDto,
} from '../dto/change-password.dto';
import { AuthRepository } from '../infrastructure/auth.repository';

@Injectable()
export class ChangePasswordUseCase {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly passwordService: PasswordService,
  ) {}

  async execute(
    command: ChangePasswordDto,
    currentSessionId?: string | null,
  ): Promise<ChangePasswordResponseDto> {
    const ctx = getRequestContext();
    if (!ctx?.actor) {
      throw new TokenInvalidException();
    }

    const user = await this.authRepository.findUserById(ctx.actor.id);
    if (!user) {
      throw new TokenInvalidException();
    }

    if (!user.passwordHash) {
      throw new CredentialMissingPasswordException({ userId: user.id });
    }

    const currentPasswordValid = await this.passwordService.verify(
      user.passwordHash,
      command.currentPassword,
    );
    if (!currentPasswordValid) {
      throw new CredentialCurrentPasswordInvalidException();
    }

    const validation = validateAdminProvidedPassword(command.newPassword);
    if (!validation.valid) {
      throw new CredentialPasswordPolicyFailedException(validation.reasons);
    }

    const changedAt = new Date();
    const passwordHash = await this.passwordService.hash(command.newPassword);

    await this.authRepository.updatePasswordCredential({
      userId: user.id,
      passwordHash,
      mustChangePassword: false,
      passwordChangedAt: changedAt,
    });

    await this.authRepository.revokeUserSessions(user.id, {
      exceptSessionId: currentSessionId ?? null,
    });

    const membership = user.memberships[0];
    await this.authRepository.createAuditLog({
      actorId: user.id,
      userType: user.userType,
      organizationId: membership?.organizationId ?? null,
      schoolId: membership?.schoolId ?? null,
      module: 'iam',
      action: 'auth.password.change',
      resourceType: 'user',
      resourceId: user.id,
      outcome: AuditOutcome.SUCCESS,
      after: { mustChangePassword: false },
    });

    return {
      success: true,
      mustChangePassword: false,
    };
  }
}
