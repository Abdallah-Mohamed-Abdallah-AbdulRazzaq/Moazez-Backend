import { Injectable } from '@nestjs/common';
import {
  AuditOutcome,
  SchoolEmailConnection,
  SchoolEmailConnectionStatus,
} from '@prisma/client';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { requireSettingsScope } from '../../settings-context';
import { EmailSecretCrypto } from '../domain/email-secret-crypto';
import { validateSmtpConnectionConfig } from '../domain/email-connection.policy';
import {
  EmailConnectionMissingException,
  EmailConnectionTestFailedException,
} from '../domain/email.exceptions';
import {
  TestEmailConnectionDto,
  TestEmailConnectionResponseDto,
} from '../dto/email-connection.dto';
import { EmailSettingsRepository } from '../infrastructure/email-settings.repository';
import { presentEmailConnectionTestResult } from '../presenters/email-connection.presenter';

@Injectable()
export class TestEmailConnectionUseCase {
  constructor(
    private readonly emailSettingsRepository: EmailSettingsRepository,
    private readonly authRepository: AuthRepository,
    private readonly emailSecretCrypto: EmailSecretCrypto,
  ) {}

  async execute(
    command: TestEmailConnectionDto,
  ): Promise<TestEmailConnectionResponseDto> {
    const scope = requireSettingsScope();
    const connection = await this.emailSettingsRepository.findConnection();
    if (!connection) throw new EmailConnectionMissingException();

    const testRecipient = await this.resolveTestRecipient(
      command.toEmail,
      scope.actorId,
    );

    const testedAt = new Date();
    const failureReason = this.validateConnectionForTest(connection);
    if (failureReason) {
      const failed = await this.emailSettingsRepository.updateConnectionState(
        connection.id,
        {
          status: SchoolEmailConnectionStatus.FAILED,
          lastTestedAt: testedAt,
          verifiedAt: null,
          failureReason,
        },
      );
      await this.audit(scope, failed, AuditOutcome.FAILURE, {
        testRecipient,
        failureReason,
      });
      throw new EmailConnectionTestFailedException(failureReason);
    }

    const verified = await this.emailSettingsRepository.updateConnectionState(
      connection.id,
      {
        status: SchoolEmailConnectionStatus.VERIFIED,
        lastTestedAt: testedAt,
        verifiedAt: testedAt,
        failureReason: null,
      },
    );

    await this.audit(scope, verified, AuditOutcome.SUCCESS, {
      testRecipient,
      deliveryMode: 'configuration_validation',
    });

    return presentEmailConnectionTestResult(verified, testRecipient);
  }

  private validateConnectionForTest(
    connection: SchoolEmailConnection,
  ): string | null {
    try {
      validateSmtpConnectionConfig(connection);
    } catch {
      return 'smtp_configuration_invalid';
    }

    if (!connection.encryptedPassword) {
      return 'smtp_password_missing';
    }

    try {
      this.emailSecretCrypto.decrypt(connection.encryptedPassword);
      if (connection.encryptedApiKey) {
        this.emailSecretCrypto.decrypt(connection.encryptedApiKey);
      }
    } catch {
      return 'secret_decryption_failed';
    }

    return null;
  }

  private async resolveTestRecipient(
    requestedToEmail: string | undefined,
    actorId: string,
  ): Promise<string> {
    if (requestedToEmail) return requestedToEmail.trim().toLowerCase();

    const actor = await this.authRepository.findUserById(actorId);
    return (actor?.contactEmail ?? actor?.email ?? '').trim().toLowerCase();
  }

  private audit(
    scope: ReturnType<typeof requireSettingsScope>,
    connection: SchoolEmailConnection,
    outcome: AuditOutcome,
    after: Record<string, unknown>,
  ) {
    return this.authRepository.createAuditLog({
      actorId: scope.actorId,
      userType: scope.userType,
      organizationId: scope.organizationId,
      schoolId: scope.schoolId,
      module: 'settings',
      action: 'settings.email.connection.test',
      resourceType: 'school_email_connection',
      resourceId: connection.id,
      outcome,
      after: {
        providerType: connection.providerType,
        status: connection.status,
        lastTestedAt: connection.lastTestedAt?.toISOString() ?? null,
        ...after,
      },
    });
  }
}
