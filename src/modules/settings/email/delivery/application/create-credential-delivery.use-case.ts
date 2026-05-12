import { Injectable } from '@nestjs/common';
import {
  AuditOutcome,
  Prisma,
  SchoolEmailConnectionStatus,
  SchoolEmailDeliveryKind,
  SchoolEmailDeliveryRecipientStatus,
  SchoolEmailDeliveryRecipientType,
  SchoolEmailTemplateKey,
} from '@prisma/client';
import { ValidationDomainException } from '../../../../../common/exceptions/domain-exception';
import { AuthRepository } from '../../../../iam/auth/infrastructure/auth.repository';
import { requireSettingsScope } from '../../../settings-context';
import {
  EmailConnectionMissingException,
  EmailDeliveryConnectionInactiveException,
  EmailDeliveryNoRecipientsException,
  EmailDeliveryTooManyRecipientsException,
} from '../../domain/email.exceptions';
import { EmailSettingsRepository } from '../../infrastructure/email-settings.repository';
import {
  CreateCredentialDeliveryDto,
  CredentialDeliveryModeValue,
} from '../dto/email-delivery.dto';
import {
  ResolvedEmailRecipient,
  SkippedEmailRecipient,
} from './email-recipient-targeting.service';
import { EmailRecipientTargetingService } from './email-recipient-targeting.service';
import { EmailDeliveryRepository } from '../infrastructure/email-delivery.repository';
import { presentDeliveryBatch } from '../presenters/email-delivery.presenter';
import { SchoolEmailDeliveryQueueService } from './school-email-delivery-queue.service';
import { SchoolEmailRendererService } from './school-email-renderer.service';

@Injectable()
export class CreateCredentialDeliveryUseCase {
  constructor(
    private readonly recipientTargeting: EmailRecipientTargetingService,
    private readonly deliveryRepository: EmailDeliveryRepository,
    private readonly emailSettingsRepository: EmailSettingsRepository,
    private readonly renderer: SchoolEmailRendererService,
    private readonly queueService: SchoolEmailDeliveryQueueService,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(command: CreateCredentialDeliveryDto) {
    if (command.dryRun === true) {
      throw new ValidationDomainException(
        'Use the preview endpoint for credential delivery dry runs',
        { field: 'dryRun' },
      );
    }

    const scope = requireSettingsScope();
    await this.ensureActiveConnection();

    const templateKey =
      (command.templateKey as SchoolEmailTemplateKey | undefined) ??
      SchoolEmailTemplateKey.ACCOUNT_CREDENTIALS;
    await this.renderer.loadTemplateContent(templateKey);

    const credentialMode = command.credentialMode;
    const partition = await this.recipientTargeting.resolveTargets({
      recipientScope: command,
      includeUsersWithPassword:
        credentialMode === 'REGENERATE_TEMPORARY_PASSWORD'
          ? true
          : command.includeUsersWithPassword,
      includeDisabledUsers: command.includeDisabledUsers,
      requireContactEmail: command.requireContactEmail,
      allowLoginEmailFallback: command.allowLoginEmailFallback,
      credentialMode,
      sampleLimit: command.limit,
    });

    if (partition.eligible.length === 0) {
      throw new EmailDeliveryNoRecipientsException({
        skippedReasons: partition.skippedReasons,
      });
    }

    const maxRecipients = command.maxRecipients ?? 250;
    if (partition.eligible.length > maxRecipients) {
      throw new EmailDeliveryTooManyRecipientsException(
        partition.eligible.length,
        maxRecipients,
      );
    }

    const { batch, queuedRecipientIds } =
      await this.deliveryRepository.createBatchWithRecipients({
        schoolId: scope.schoolId,
        kind: SchoolEmailDeliveryKind.CREDENTIAL_DELIVERY,
        templateKey,
        subjectSnapshot: 'Account credential delivery',
        createdByUserId: scope.actorId,
        recipientScope: {
          scope: command.scope,
          userIds: command.userIds ?? [],
          roleKeys: command.roleKeys ?? [],
          userTypes: command.userTypes ?? [],
          credentialMode,
          requireContactEmail: command.requireContactEmail !== false,
          allowLoginEmailFallback: command.allowLoginEmailFallback === true,
        } satisfies Prisma.InputJsonObject,
        campaignContent: {
          credentialMode,
        } satisfies Prisma.InputJsonObject,
        recipients: [
          ...partition.eligible.map((recipient) =>
            this.toQueuedRecipient(recipient, credentialMode),
          ),
          ...partition.skipped.map((recipient) =>
            this.toSkippedRecipient(recipient),
          ),
        ],
      });

    await Promise.all(
      queuedRecipientIds.map((recipientId) =>
        this.queueService.enqueueRecipientDelivery({
          schoolId: scope.schoolId,
          organizationId: scope.organizationId,
          batchId: batch.id,
          recipientId,
          actorUserId: scope.actorId,
          actorUserType: scope.userType,
        }),
      ),
    );

    await this.authRepository.createAuditLog({
      actorId: scope.actorId,
      userType: scope.userType,
      organizationId: scope.organizationId,
      schoolId: scope.schoolId,
      module: 'settings',
      action: 'settings.email.credential_delivery.queue',
      resourceType: 'school_email_delivery_batch',
      resourceId: batch.id,
      outcome: AuditOutcome.SUCCESS,
      after: {
        credentialMode,
        queuedRecipients: queuedRecipientIds.length,
        skippedRecipients: partition.skipped.length,
      },
    });

    return presentDeliveryBatch(batch, { deliveryMode: 'queued' });
  }

  private async ensureActiveConnection(): Promise<void> {
    const connection = await this.emailSettingsRepository.findConnection();
    if (!connection) throw new EmailConnectionMissingException();
    if (connection.status !== SchoolEmailConnectionStatus.ACTIVE) {
      throw new EmailDeliveryConnectionInactiveException();
    }
  }

  private toQueuedRecipient(
    recipient: ResolvedEmailRecipient,
    credentialMode: CredentialDeliveryModeValue,
  ) {
    return {
      recipientType: SchoolEmailDeliveryRecipientType.USER,
      userId: recipient.userId,
      toEmail: recipient.toEmail,
      displayName: recipient.displayName,
      status: SchoolEmailDeliveryRecipientStatus.QUEUED,
      metadata: {
        roleKey: recipient.roleKey,
        userType: recipient.userType,
        credentialMode,
      } satisfies Prisma.InputJsonObject,
    };
  }

  private toSkippedRecipient(recipient: SkippedEmailRecipient) {
    return {
      recipientType: SchoolEmailDeliveryRecipientType.USER,
      userId: recipient.userId,
      toEmail: recipient.toEmail,
      displayName: recipient.displayName,
      status: SchoolEmailDeliveryRecipientStatus.SKIPPED,
      skippedReason: recipient.reason,
      metadata: {
        roleKey: recipient.roleKey,
        userType: recipient.userType,
      } satisfies Prisma.InputJsonObject,
    };
  }
}
