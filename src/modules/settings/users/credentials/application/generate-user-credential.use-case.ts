import { Injectable } from '@nestjs/common';
import { AuditOutcome } from '@prisma/client';
import { NotFoundDomainException } from '../../../../../common/exceptions/domain-exception';
import { PasswordService } from '../../../../iam/auth/domain/password.service';
import { AuthRepository } from '../../../../iam/auth/infrastructure/auth.repository';
import { requireSettingsScope } from '../../../settings-context';
import { CredentialUserNotManageableException } from '../domain/credential.exceptions';
import { generateTemporaryPassword } from '../domain/credential-password.policy';
import { GeneratedCredentialResponseDto } from '../dto/credential.dto';
import { UserCredentialsRepository } from '../infrastructure/user-credentials.repository';
import {
  isCredentialManageableStatus,
  presentGeneratedCredential,
} from '../presenters/credentials.presenter';

export type CredentialGenerationAction = 'generate' | 'regenerate';

@Injectable()
export class GenerateUserCredentialUseCase {
  constructor(
    private readonly credentialsRepository: UserCredentialsRepository,
    private readonly authRepository: AuthRepository,
    private readonly passwordService: PasswordService,
  ) {}

  async execute(
    userId: string,
    action: CredentialGenerationAction,
  ): Promise<GeneratedCredentialResponseDto> {
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

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await this.passwordService.hash(temporaryPassword);
    const generatedAt = new Date();

    const updated = await this.credentialsRepository.updateUserCredential({
      userId,
      passwordHash,
      mustChangePassword: true,
      passwordProvisionedAt: generatedAt,
      passwordChangedAt: null,
    });

    await this.authRepository.revokeUserSessions(userId);

    await this.authRepository.createAuditLog({
      actorId: scope.actorId,
      userType: scope.userType,
      organizationId: scope.organizationId,
      schoolId: scope.schoolId,
      module: 'iam',
      action:
        action === 'regenerate'
          ? 'iam.credentials.regenerate'
          : 'iam.credentials.generate',
      resourceType: 'user',
      resourceId: userId,
      outcome: AuditOutcome.SUCCESS,
      after: {
        mustChangePassword: true,
        credentialVersion: updated.user.credentialVersion,
      },
    });

    return presentGeneratedCredential({
      membership: updated,
      temporaryPassword,
      generatedAt,
    });
  }
}
