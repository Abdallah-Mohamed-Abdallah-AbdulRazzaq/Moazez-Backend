import { Injectable } from '@nestjs/common';
import { AuditOutcome } from '@prisma/client';
import { NotFoundDomainException } from '../../../../../common/exceptions/domain-exception';
import { PasswordService } from '../../../../iam/auth/domain/password.service';
import { AuthRepository } from '../../../../iam/auth/infrastructure/auth.repository';
import { requireSettingsScope } from '../../../settings-context';
import {
  CredentialPasswordPolicyFailedException,
  CredentialUserNotManageableException,
} from '../domain/credential.exceptions';
import { validateAdminProvidedPassword } from '../domain/credential-password.policy';
import {
  SetCredentialPasswordDto,
  SetCredentialResponseDto,
} from '../dto/credential.dto';
import { UserCredentialsRepository } from '../infrastructure/user-credentials.repository';
import {
  isCredentialManageableStatus,
  presentSetCredential,
} from '../presenters/credentials.presenter';

@Injectable()
export class SetUserCredentialUseCase {
  constructor(
    private readonly credentialsRepository: UserCredentialsRepository,
    private readonly authRepository: AuthRepository,
    private readonly passwordService: PasswordService,
  ) {}

  async execute(
    userId: string,
    command: SetCredentialPasswordDto,
  ): Promise<SetCredentialResponseDto> {
    const scope = requireSettingsScope();
    const membership =
      await this.credentialsRepository.findScopedMembershipByUserId(userId);

    if (!membership) {
      throw new NotFoundDomainException('User not found', { userId });
    }

    if (!isCredentialManageableStatus(membership.user.status)) {
      throw new CredentialUserNotManageableException({
        userId,
        status: membership.user.status,
      });
    }

    const validation = validateAdminProvidedPassword(command.password);
    if (!validation.valid) {
      throw new CredentialPasswordPolicyFailedException(validation.reasons);
    }

    const forceResetOnLogin = command.forceResetOnLogin ?? true;
    const updatedAt = new Date();
    const passwordHash = await this.passwordService.hash(command.password);

    const updated = await this.credentialsRepository.updateUserCredential({
      userId,
      passwordHash,
      mustChangePassword: forceResetOnLogin,
      passwordProvisionedAt: updatedAt,
      passwordChangedAt: forceResetOnLogin ? null : updatedAt,
    });

    await this.authRepository.revokeUserSessions(userId);

    await this.authRepository.createAuditLog({
      actorId: scope.actorId,
      userType: scope.userType,
      organizationId: scope.organizationId,
      schoolId: scope.schoolId,
      module: 'iam',
      action: 'iam.credentials.set',
      resourceType: 'user',
      resourceId: userId,
      outcome: AuditOutcome.SUCCESS,
      after: {
        mustChangePassword: updated.user.mustChangePassword,
        credentialVersion: updated.user.credentialVersion,
      },
    });

    return presentSetCredential({ membership: updated, updatedAt });
  }
}
