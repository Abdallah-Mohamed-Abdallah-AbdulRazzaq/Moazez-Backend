import { Injectable } from '@nestjs/common';
import { AuditOutcome } from '@prisma/client';
import { PasswordService } from '../../../../iam/auth/domain/password.service';
import { AuthRepository } from '../../../../iam/auth/infrastructure/auth.repository';
import { requireSettingsScope } from '../../../settings-context';
import {
  CredentialBulkTooLargeException,
  CredentialNoEligibleUsersException,
} from '../domain/credential.exceptions';
import { generateTemporaryPassword } from '../domain/credential-password.policy';
import {
  BulkCredentialSelectionDto,
  BulkGenerateCredentialsResponseDto,
} from '../dto/credential.dto';
import { UserCredentialsRepository } from '../infrastructure/user-credentials.repository';
import { presentBulkGeneratedCredentials } from '../presenters/credentials.presenter';
import { partitionCredentialTargets } from './credential-targeting';

const BULK_GENERATE_LIMIT = 100;

@Injectable()
export class BulkCredentialGenerateUseCase {
  constructor(
    private readonly credentialsRepository: UserCredentialsRepository,
    private readonly authRepository: AuthRepository,
    private readonly passwordService: PasswordService,
  ) {}

  async execute(
    command: BulkCredentialSelectionDto,
  ): Promise<BulkGenerateCredentialsResponseDto> {
    const scope = requireSettingsScope();
    const targets = await this.credentialsRepository.listCredentialTargets({
      scope: command.scope,
      userIds: command.userIds,
      roleKeys: command.roleKeys,
      userTypes: command.userTypes,
    });

    const partition = partitionCredentialTargets(targets, command);

    if (partition.eligible.length === 0) {
      throw new CredentialNoEligibleUsersException();
    }

    if (partition.eligible.length > BULK_GENERATE_LIMIT) {
      throw new CredentialBulkTooLargeException(
        partition.eligible.length,
        BULK_GENERATE_LIMIT,
      );
    }

    const generatedAt = new Date();
    const generated: Array<{
      membership: (typeof partition.eligible)[number];
      temporaryPassword: string;
    }> = [];

    for (const membership of partition.eligible) {
      const temporaryPassword = generateTemporaryPassword();
      const passwordHash = await this.passwordService.hash(temporaryPassword);
      const updated = await this.credentialsRepository.updateUserCredential({
        userId: membership.user.id,
        passwordHash,
        mustChangePassword: true,
        passwordProvisionedAt: generatedAt,
        passwordChangedAt: null,
      });
      await this.authRepository.revokeUserSessions(membership.user.id);
      generated.push({ membership: updated, temporaryPassword });
    }

    await this.authRepository.createAuditLog({
      actorId: scope.actorId,
      userType: scope.userType,
      organizationId: scope.organizationId,
      schoolId: scope.schoolId,
      module: 'iam',
      action: 'iam.credentials.bulk_generate',
      resourceType: 'user',
      outcome: AuditOutcome.SUCCESS,
      after: {
        generated: generated.length,
        skipped: partition.skipped.length,
        scope: command.scope,
      },
    });

    return presentBulkGeneratedCredentials({
      generatedAt,
      totalMatched: partition.totalMatched,
      generated,
      skipped: partition.skipped,
      skippedReasons: partition.skippedReasons,
    });
  }
}
