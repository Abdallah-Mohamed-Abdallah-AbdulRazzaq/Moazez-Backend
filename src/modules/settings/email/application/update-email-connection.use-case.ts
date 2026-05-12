import { Injectable } from '@nestjs/common';
import {
  AuditOutcome,
  SchoolEmailConnection,
  SchoolEmailConnectionStatus,
  SchoolEmailProviderType,
} from '@prisma/client';
import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { requireSettingsScope } from '../../settings-context';
import { EmailSecretCrypto } from '../domain/email-secret-crypto';
import {
  normalizeEmail,
  normalizeOptionalText,
  normalizeRequiredText,
  validateSmtpConnectionConfig,
} from '../domain/email-connection.policy';
import { EmailSecretEncryptionFailedException } from '../domain/email.exceptions';
import {
  SchoolEmailConnectionResponseDto,
  UpdateEmailConnectionDto,
} from '../dto/email-connection.dto';
import { EmailSettingsRepository } from '../infrastructure/email-settings.repository';
import { presentEmailConnection } from '../presenters/email-connection.presenter';

@Injectable()
export class UpdateEmailConnectionUseCase {
  constructor(
    private readonly emailSettingsRepository: EmailSettingsRepository,
    private readonly authRepository: AuthRepository,
    private readonly emailSecretCrypto: EmailSecretCrypto,
  ) {}

  async execute(
    command: UpdateEmailConnectionDto,
  ): Promise<SchoolEmailConnectionResponseDto> {
    const scope = requireSettingsScope();
    const current = await this.emailSettingsRepository.findConnection();

    const providerType =
      mapProviderType(command.providerType) ??
      current?.providerType ??
      SchoolEmailProviderType.SMTP;

    const finalConfig = {
      providerType,
      fromName:
        normalizeRequiredText(command.fromName) ?? current?.fromName ?? null,
      fromEmail:
        normalizeEmail(command.fromEmail) ?? current?.fromEmail ?? null,
      replyToEmail:
        command.replyToEmail === undefined
          ? (current?.replyToEmail ?? null)
          : (normalizeEmail(command.replyToEmail) ?? null),
      host: normalizeRequiredText(command.host) ?? current?.host ?? null,
      port: command.port ?? current?.port ?? null,
      secure: command.secure ?? current?.secure ?? true,
      username:
        normalizeRequiredText(command.username) ?? current?.username ?? null,
    };

    if (finalConfig.providerType !== SchoolEmailProviderType.SMTP) {
      throw new ValidationDomainException(
        'Only SMTP email provider runtime is supported in Sprint 11D',
        { providerType: finalConfig.providerType },
      );
    }

    validateSmtpConnectionConfig(finalConfig);
    const smtpConfig = {
      ...finalConfig,
      fromName: finalConfig.fromName as string,
      fromEmail: finalConfig.fromEmail as string,
      host: finalConfig.host as string,
      port: finalConfig.port as number,
      username: finalConfig.username as string,
    };

    const encryptedPassword = this.resolveEncryptedSecret(
      command.password,
      current?.encryptedPassword ?? null,
    );
    const encryptedApiKey = this.resolveEncryptedSecret(
      command.apiKey,
      current?.encryptedApiKey ?? null,
    );

    const updated = await this.emailSettingsRepository.saveConnection(
      scope.schoolId,
      {
        providerType: smtpConfig.providerType,
        fromName: smtpConfig.fromName,
        fromEmail: smtpConfig.fromEmail,
        replyToEmail: smtpConfig.replyToEmail,
        host: smtpConfig.host,
        port: smtpConfig.port,
        secure: smtpConfig.secure,
        username: smtpConfig.username,
        encryptedPassword,
        encryptedApiKey,
        status: SchoolEmailConnectionStatus.DRAFT,
        lastTestedAt: current?.lastTestedAt ?? null,
        verifiedAt: null,
        failureReason: null,
      },
    );

    await this.authRepository.createAuditLog({
      actorId: scope.actorId,
      userType: scope.userType,
      organizationId: scope.organizationId,
      schoolId: scope.schoolId,
      module: 'settings',
      action: current
        ? 'settings.email.connection.update'
        : 'settings.email.connection.create',
      resourceType: 'school_email_connection',
      resourceId: updated.id,
      outcome: AuditOutcome.SUCCESS,
      before: summarizeConnection(current),
      after: summarizeConnection(updated),
    });

    return presentEmailConnection(updated);
  }

  private resolveEncryptedSecret(
    plainSecret: string | undefined,
    existingSecret: string | null,
  ): string | null {
    if (plainSecret === undefined) return existingSecret;

    const normalized = normalizeOptionalText(plainSecret);
    if (!normalized) return null;

    try {
      return this.emailSecretCrypto.encrypt(normalized);
    } catch {
      throw new EmailSecretEncryptionFailedException();
    }
  }
}

function mapProviderType(
  value: string | undefined,
): SchoolEmailProviderType | null {
  if (!value) return null;
  return value as SchoolEmailProviderType;
}

function summarizeConnection(
  connection: SchoolEmailConnection | null | undefined,
) {
  if (!connection) return undefined;

  return {
    providerType: connection.providerType,
    fromName: connection.fromName,
    fromEmail: connection.fromEmail,
    replyToEmail: connection.replyToEmail,
    host: connection.host,
    port: connection.port,
    secure: connection.secure,
    username: connection.username,
    hasPassword: Boolean(connection.encryptedPassword),
    hasApiKey: Boolean(connection.encryptedApiKey),
    status: connection.status,
    lastTestedAt: connection.lastTestedAt?.toISOString() ?? null,
    verifiedAt: connection.verifiedAt?.toISOString() ?? null,
  };
}
