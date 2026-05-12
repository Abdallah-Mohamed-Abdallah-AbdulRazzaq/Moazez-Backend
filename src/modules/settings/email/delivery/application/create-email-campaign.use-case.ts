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
import { AuthRepository } from '../../../../iam/auth/infrastructure/auth.repository';
import { requireSettingsScope } from '../../../settings-context';
import {
  EmailCampaignInvalidException,
  EmailConnectionMissingException,
  EmailDeliveryConnectionInactiveException,
  EmailDeliveryNoRecipientsException,
  EmailDeliveryTooManyRecipientsException,
} from '../../domain/email.exceptions';
import { EmailSettingsRepository } from '../../infrastructure/email-settings.repository';
import { CreateCampaignDto } from '../dto/email-delivery.dto';
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
export class CreateEmailCampaignUseCase {
  constructor(
    private readonly recipientTargeting: EmailRecipientTargetingService,
    private readonly deliveryRepository: EmailDeliveryRepository,
    private readonly emailSettingsRepository: EmailSettingsRepository,
    private readonly renderer: SchoolEmailRendererService,
    private readonly queueService: SchoolEmailDeliveryQueueService,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(command: CreateCampaignDto) {
    const scope = requireSettingsScope();
    await this.ensureActiveConnection();

    const templateKey =
      (command.templateKey as SchoolEmailTemplateKey | undefined) ??
      SchoolEmailTemplateKey.GENERAL_MESSAGE;
    if (templateKey !== SchoolEmailTemplateKey.GENERAL_MESSAGE) {
      throw new EmailCampaignInvalidException({
        templateKey,
        reason: 'general_campaign_requires_general_message_template',
      });
    }

    const preview = await this.renderer.previewCampaign({
      schoolId: scope.schoolId,
      templateKey,
      campaignContent: {
        subject: command.subject,
        title: command.title,
        bodyHtml: command.bodyHtml,
        bodyText: command.bodyText,
        footerHtml: command.footerHtml,
      },
      previewData: command.previewData,
    });

    const partition = await this.recipientTargeting.resolveTargets({
      recipientScope: command.recipientScope,
      customEmails: command.customEmails,
      includeUsersWithPassword: true,
      includeDisabledUsers: command.includeDisabledUsers,
      requireContactEmail: command.requireContactEmail,
      allowLoginEmailFallback: command.allowLoginEmailFallback,
      sampleLimit: 100,
    });

    if (partition.eligible.length === 0) {
      throw new EmailDeliveryNoRecipientsException({
        skippedReasons: partition.skippedReasons,
      });
    }

    const maxRecipients = command.maxRecipients ?? 500;
    if (partition.eligible.length > maxRecipients) {
      throw new EmailDeliveryTooManyRecipientsException(
        partition.eligible.length,
        maxRecipients,
      );
    }

    const campaignContent = {
      subject: command.subject ?? null,
      title: command.title ?? null,
      bodyHtml: command.bodyHtml,
      bodyText: command.bodyText ?? null,
      footerHtml: command.footerHtml ?? null,
    } satisfies Prisma.InputJsonObject;

    const { batch, queuedRecipientIds } =
      await this.deliveryRepository.createBatchWithRecipients({
        schoolId: scope.schoolId,
        kind: SchoolEmailDeliveryKind.GENERAL_CAMPAIGN,
        templateKey,
        subjectSnapshot: preview.subject,
        createdByUserId: scope.actorId,
        recipientScope: {
          ...command.recipientScope,
          customEmails: command.customEmails ?? [],
          requireContactEmail: command.requireContactEmail !== false,
          allowLoginEmailFallback: command.allowLoginEmailFallback === true,
        } satisfies Prisma.InputJsonObject,
        previewData:
          (command.previewData as Prisma.InputJsonObject | undefined) ??
          Prisma.JsonNull,
        campaignContent,
        recipients: [
          ...partition.eligible.map((recipient) =>
            this.toQueuedRecipient(recipient),
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
      action: 'settings.email.campaign.queue',
      resourceType: 'school_email_delivery_batch',
      resourceId: batch.id,
      outcome: AuditOutcome.SUCCESS,
      after: {
        queuedRecipients: queuedRecipientIds.length,
        skippedRecipients: partition.skipped.length,
        subjectSnapshot: preview.subject,
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

  private toQueuedRecipient(recipient: ResolvedEmailRecipient) {
    return {
      recipientType:
        recipient.recipientType === 'CUSTOM_EMAIL'
          ? SchoolEmailDeliveryRecipientType.CUSTOM_EMAIL
          : SchoolEmailDeliveryRecipientType.USER,
      userId: recipient.userId,
      toEmail: recipient.toEmail,
      displayName: recipient.displayName,
      status: SchoolEmailDeliveryRecipientStatus.QUEUED,
      metadata: {
        roleKey: recipient.roleKey,
        userType: recipient.userType,
      } satisfies Prisma.InputJsonObject,
    };
  }

  private toSkippedRecipient(recipient: SkippedEmailRecipient) {
    return {
      recipientType:
        recipient.recipientType === 'CUSTOM_EMAIL'
          ? SchoolEmailDeliveryRecipientType.CUSTOM_EMAIL
          : SchoolEmailDeliveryRecipientType.USER,
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
