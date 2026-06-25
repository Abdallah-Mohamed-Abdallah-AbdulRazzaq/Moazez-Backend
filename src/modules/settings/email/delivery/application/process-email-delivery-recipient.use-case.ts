import { Inject, Injectable } from '@nestjs/common';
import {
  Prisma,
  SchoolEmailConnection,
  SchoolEmailConnectionStatus,
  SchoolEmailDeliveryBatch,
  SchoolEmailDeliveryKind,
  SchoolEmailDeliveryRecipientStatus,
  SchoolEmailTemplateKey,
} from '@prisma/client';
import { PasswordService } from '../../../../iam/auth/domain/password.service';
import { AuthRepository } from '../../../../iam/auth/infrastructure/auth.repository';
import { generateTemporaryPassword } from '../../../users/credentials/domain/credential-password.policy';
import { UserCredentialsRepository } from '../../../users/credentials/infrastructure/user-credentials.repository';
import {
  EmailConnectionMissingException,
  EmailDeliveryConnectionInactiveException,
} from '../../domain/email.exceptions';
import { EmailSecretCrypto } from '../../domain/email-secret-crypto';
import { EmailSettingsRepository } from '../../infrastructure/email-settings.repository';
import { SCHOOL_EMAIL_TRANSPORT } from '../transport/email-transport';
import type { SchoolEmailTransport } from '../transport/email-transport';
import { CredentialDeliveryModeValue } from '../dto/email-delivery.dto';
import { EmailDeliveryRepository } from '../infrastructure/email-delivery.repository';
import { SchoolEmailDeliveryRecipientJobData } from '../domain/email-delivery.constants';
import { SchoolEmailRendererService } from './school-email-renderer.service';

@Injectable()
export class ProcessEmailDeliveryRecipientUseCase {
  constructor(
    private readonly deliveryRepository: EmailDeliveryRepository,
    private readonly emailSettingsRepository: EmailSettingsRepository,
    private readonly credentialsRepository: UserCredentialsRepository,
    private readonly passwordService: PasswordService,
    private readonly authRepository: AuthRepository,
    private readonly renderer: SchoolEmailRendererService,
    private readonly emailSecretCrypto: EmailSecretCrypto,
    @Inject(SCHOOL_EMAIL_TRANSPORT)
    private readonly emailTransport: SchoolEmailTransport,
  ) {}

  async execute(data: SchoolEmailDeliveryRecipientJobData): Promise<void> {
    const recipient =
      await this.deliveryRepository.findRecipientForProcessing(
        data.recipientId,
      );
    if (!recipient) return;

    if (
      recipient.status === SchoolEmailDeliveryRecipientStatus.SENT ||
      recipient.status === SchoolEmailDeliveryRecipientStatus.SKIPPED ||
      recipient.status === SchoolEmailDeliveryRecipientStatus.CANCELLED
    ) {
      return;
    }

    if (recipient.batch.status === 'CANCELLED') {
      await this.deliveryRepository.markRecipientCancelled(
        recipient.id,
        'batch_cancelled',
      );
      await this.deliveryRepository.refreshBatchStatus(recipient.batchId);
      return;
    }

    const now = new Date();
    const locked = await this.deliveryRepository.markRecipientSending(
      recipient.id,
      now,
    );
    if (!locked) return;

    await this.deliveryRepository.markBatchProcessing(recipient.batchId, now);

    try {
      const connection = await this.resolveActiveConnection();
      const rendered =
        recipient.batch.kind === SchoolEmailDeliveryKind.CREDENTIAL_DELIVERY
          ? await this.renderCredentialRecipient(recipient.batch, recipient)
          : await this.renderCampaignRecipient(recipient.batch, recipient);

      const result = await this.emailTransport.sendEmail({
        fromName: connection.fromName,
        fromEmail: connection.fromEmail,
        replyToEmail: connection.replyToEmail,
        toEmail: recipient.toEmail,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        connection,
      });

      if (rendered.credentialToApply) {
        const passwordHash = await this.passwordService.hash(
          rendered.credentialToApply.temporaryPassword,
        );
        await this.credentialsRepository.updateUserCredential({
          userId: rendered.credentialToApply.userId,
          passwordHash,
          mustChangePassword: true,
          passwordProvisionedAt: new Date(),
          passwordChangedAt: null,
        });
        await this.authRepository.revokeUserSessions(
          rendered.credentialToApply.userId,
        );
      }

      await this.deliveryRepository.markRecipientSent({
        recipientId: recipient.id,
        sentAt: new Date(),
        metadata: {
          providerMessageId: result.providerMessageId ?? null,
          acceptedCount: result.accepted?.length ?? 0,
          rejectedCount: result.rejected?.length ?? 0,
        } satisfies Prisma.InputJsonObject,
      });
      await this.deliveryRepository.refreshBatchStatus(recipient.batchId);
    } catch (error) {
      const reason = safeFailureReason(error);
      await this.deliveryRepository.markRecipientFailed({
        recipientId: recipient.id,
        failureReason: reason,
      });
      await this.deliveryRepository.refreshBatchStatus(recipient.batchId);
      throw new Error(reason);
    }
  }

  private async resolveActiveConnection(): Promise<SchoolEmailConnection> {
    const connection = await this.emailSettingsRepository.findConnection();
    if (!connection) throw new EmailConnectionMissingException();
    if (connection.status !== SchoolEmailConnectionStatus.ACTIVE) {
      throw new EmailDeliveryConnectionInactiveException();
    }
    return connection;
  }

  private async renderCredentialRecipient(
    batch: SchoolEmailDeliveryBatch,
    recipient: EmailDeliveryRecipientWithMetadata,
  ): Promise<RenderedEmailWithCredential> {
    if (!recipient.userId) {
      throw new Error('credential_recipient_user_missing');
    }

    const membership =
      await this.credentialsRepository.findScopedMembershipByUserId(
        recipient.userId,
      );
    if (!membership) {
      throw new Error('credential_recipient_user_not_found');
    }

    const credentialMode = readCredentialMode(batch);
    let temporaryPassword: string | null = null;
    let credentialToApply: PendingCredentialToApply | null = null;

    if (credentialMode !== 'LOGIN_INFO_ONLY') {
      if (
        credentialMode === 'GENERATE_TEMPORARY_PASSWORD' &&
        membership.user.passwordHash
      ) {
        throw new Error('credential_recipient_already_has_password');
      }

      const pendingCredential = await this.resolvePendingCredential(
        recipient,
        credentialMode,
      );
      temporaryPassword = pendingCredential.temporaryPassword;
      credentialToApply = {
        userId: recipient.userId,
        temporaryPassword,
      };
    }

    const rendered = await this.renderer.renderCredentialEmail({
      schoolId: batch.schoolId,
      templateKey: batch.templateKey ?? SchoolEmailTemplateKey.ACCOUNT_CREDENTIALS,
      user: {
        fullName:
          `${membership.user.firstName} ${membership.user.lastName}`.trim() ||
          null,
        username: membership.user.username,
        loginEmail: membership.user.email,
      },
      temporaryPassword,
    });

    return {
      ...rendered,
      credentialToApply,
    };
  }

  private async renderCampaignRecipient(
    batch: SchoolEmailDeliveryBatch,
    recipient: {
      userId: string | null;
      displayName: string | null;
      toEmail: string;
    },
  ) {
    const campaignContent = readCampaignContent(batch);
    const membership = recipient.userId
      ? await this.credentialsRepository.findScopedMembershipByUserId(
          recipient.userId,
        )
      : null;

    const rendered = await this.renderer.renderCampaignEmail({
      schoolId: batch.schoolId,
      templateKey: batch.templateKey ?? SchoolEmailTemplateKey.GENERAL_MESSAGE,
      campaignContent,
      previewData: jsonRecordOrNull(batch.previewData),
      user: membership
        ? {
            fullName:
              `${membership.user.firstName} ${membership.user.lastName}`.trim() ||
              null,
            username: membership.user.username,
            loginEmail: membership.user.email,
          }
        : {
            fullName: recipient.displayName ?? recipient.toEmail,
            username: null,
            loginEmail: null,
          },
    });

    return {
      ...rendered,
      credentialToApply: null,
    };
  }

  private async resolvePendingCredential(
    recipient: EmailDeliveryRecipientWithMetadata,
    credentialMode: CredentialDeliveryModeValue,
  ): Promise<{ temporaryPassword: string }> {
    const metadata = jsonRecordOrNull(recipient.metadata) ?? {};
    const pending = readPendingCredential(metadata);
    if (pending) {
      return {
        temporaryPassword: this.emailSecretCrypto.decrypt(
          pending.encryptedTemporaryPassword,
        ),
      };
    }

    const temporaryPassword = generateTemporaryPassword();
    await this.deliveryRepository.updateRecipientMetadata(
      recipient.id,
      buildMetadataWithPendingCredential(metadata, {
        credentialMode,
        encryptedTemporaryPassword:
          this.emailSecretCrypto.encrypt(temporaryPassword),
      }),
    );

    return { temporaryPassword };
  }
}

interface PendingCredentialToApply {
  userId: string;
  temporaryPassword: string;
}

interface RenderedEmailWithCredential {
  subject: string;
  html: string;
  text?: string | null;
  credentialToApply: PendingCredentialToApply | null;
}

type EmailDeliveryRecipientWithMetadata = {
  id: string;
  userId: string | null;
  metadata: Prisma.JsonValue | null;
};

const PENDING_CREDENTIAL_METADATA_KEY = 'pendingCredential';
const PENDING_CREDENTIAL_METADATA_VERSION = 1;

function readPendingCredential(
  metadata: Record<string, unknown>,
): { encryptedTemporaryPassword: string } | null {
  const value = metadata[PENDING_CREDENTIAL_METADATA_KEY];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const pending = value as Record<string, unknown>;
  if (
    pending.version !== PENDING_CREDENTIAL_METADATA_VERSION ||
    typeof pending.encryptedTemporaryPassword !== 'string'
  ) {
    return null;
  }

  return {
    encryptedTemporaryPassword: pending.encryptedTemporaryPassword,
  };
}

function buildMetadataWithPendingCredential(
  metadata: Record<string, unknown>,
  pending: {
    credentialMode: CredentialDeliveryModeValue;
    encryptedTemporaryPassword: string;
  },
): Prisma.InputJsonObject {
  return {
    ...metadata,
    [PENDING_CREDENTIAL_METADATA_KEY]: {
      version: PENDING_CREDENTIAL_METADATA_VERSION,
      credentialMode: pending.credentialMode,
      encryptedTemporaryPassword: pending.encryptedTemporaryPassword,
    },
  } satisfies Prisma.InputJsonObject;
}

function readCredentialMode(
  batch: SchoolEmailDeliveryBatch,
): CredentialDeliveryModeValue {
  const scope = jsonRecordOrNull(batch.recipientScope);
  const content = jsonRecordOrNull(batch.campaignContent);
  const value = scope?.credentialMode ?? content?.credentialMode;

  if (
    value === 'LOGIN_INFO_ONLY' ||
    value === 'GENERATE_TEMPORARY_PASSWORD' ||
    value === 'REGENERATE_TEMPORARY_PASSWORD'
  ) {
    return value;
  }

  return 'LOGIN_INFO_ONLY';
}

function readCampaignContent(batch: SchoolEmailDeliveryBatch): {
  subject?: string | null;
  title?: string | null;
  bodyHtml: string;
  bodyText?: string | null;
  footerHtml?: string | null;
} {
  const content = jsonRecordOrNull(batch.campaignContent);
  const bodyHtml =
    typeof content?.bodyHtml === 'string' && content.bodyHtml.trim()
      ? content.bodyHtml
      : null;

  if (!bodyHtml) {
    throw new Error('campaign_content_missing');
  }

  return {
    subject: stringOrNull(content?.subject),
    title: stringOrNull(content?.title),
    bodyHtml,
    bodyText: stringOrNull(content?.bodyText),
    footerHtml: stringOrNull(content?.footerHtml),
  };
}

function jsonRecordOrNull(value: Prisma.JsonValue | null): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function safeFailureReason(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message
      .replace(/MZ-[A-Z0-9-]+/g, '[redacted]')
      .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]');
  }

  return 'delivery_failed';
}
