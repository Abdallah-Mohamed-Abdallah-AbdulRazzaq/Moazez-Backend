import { Module } from '@nestjs/common';
import { QueueModule } from '../../../infrastructure/queue/queue.module';
import { AuthModule } from '../../iam/auth/auth.module';
import { UsersModule } from '../users/users.module';
import { ActivateEmailConnectionUseCase } from './application/activate-email-connection.use-case';
import { DisableEmailConnectionUseCase } from './application/disable-email-connection.use-case';
import { GetEmailConnectionUseCase } from './application/get-email-connection.use-case';
import { GetEmailTemplateUseCase } from './application/get-email-template.use-case';
import { ListEmailTemplatesUseCase } from './application/list-email-templates.use-case';
import { PreviewEmailTemplateUseCase } from './application/preview-email-template.use-case';
import { ResetEmailTemplateUseCase } from './application/reset-email-template.use-case';
import { TestEmailConnectionUseCase } from './application/test-email-connection.use-case';
import { UpdateEmailConnectionUseCase } from './application/update-email-connection.use-case';
import { UpdateEmailTemplateUseCase } from './application/update-email-template.use-case';
import { EmailConnectionController } from './controller/email-connection.controller';
import { EmailTemplateController } from './controller/email-template.controller';
import { CancelEmailDeliveryUseCase } from './delivery/application/cancel-email-delivery.use-case';
import { CreateCredentialDeliveryUseCase } from './delivery/application/create-credential-delivery.use-case';
import { CreateEmailCampaignUseCase } from './delivery/application/create-email-campaign.use-case';
import {
  GetEmailCampaignUseCase,
  GetEmailDeliveryUseCase,
  ListEmailDeliveriesUseCase,
  ListEmailDeliveryRecipientsUseCase,
} from './delivery/application/delivery-read.use-cases';
import { EmailRecipientTargetingService } from './delivery/application/email-recipient-targeting.service';
import { PreviewCampaignRecipientsUseCase } from './delivery/application/preview-campaign-recipients.use-case';
import { PreviewCredentialDeliveryRecipientsUseCase } from './delivery/application/preview-credential-delivery-recipients.use-case';
import { PreviewEmailCampaignUseCase } from './delivery/application/preview-email-campaign.use-case';
import { ProcessEmailDeliveryRecipientUseCase } from './delivery/application/process-email-delivery-recipient.use-case';
import { SchoolEmailDeliveryQueueService } from './delivery/application/school-email-delivery-queue.service';
import { SchoolEmailRendererService } from './delivery/application/school-email-renderer.service';
import { CredentialDeliveryController } from './delivery/controller/credential-delivery.controller';
import { EmailCampaignController } from './delivery/controller/email-campaign.controller';
import { EmailDeliveryController } from './delivery/controller/email-delivery.controller';
import { EmailDeliveryRepository } from './delivery/infrastructure/email-delivery.repository';
import { SchoolEmailDeliveryWorker } from './delivery/infrastructure/school-email-delivery.worker';
import { SCHOOL_EMAIL_TRANSPORT } from './delivery/transport/email-transport';
import { NodemailerEmailTransport } from './delivery/transport/nodemailer-email.transport';
import { EmailSecretCrypto } from './domain/email-secret-crypto';
import { EmailSettingsRepository } from './infrastructure/email-settings.repository';

@Module({
  imports: [AuthModule, QueueModule, UsersModule],
  controllers: [
    EmailConnectionController,
    EmailTemplateController,
    CredentialDeliveryController,
    EmailDeliveryController,
    EmailCampaignController,
  ],
  providers: [
    EmailSettingsRepository,
    EmailSecretCrypto,
    EmailDeliveryRepository,
    EmailRecipientTargetingService,
    SchoolEmailDeliveryQueueService,
    SchoolEmailRendererService,
    PreviewCredentialDeliveryRecipientsUseCase,
    CreateCredentialDeliveryUseCase,
    PreviewCampaignRecipientsUseCase,
    PreviewEmailCampaignUseCase,
    CreateEmailCampaignUseCase,
    ListEmailDeliveriesUseCase,
    GetEmailCampaignUseCase,
    GetEmailDeliveryUseCase,
    ListEmailDeliveryRecipientsUseCase,
    CancelEmailDeliveryUseCase,
    ProcessEmailDeliveryRecipientUseCase,
    SchoolEmailDeliveryWorker,
    {
      provide: SCHOOL_EMAIL_TRANSPORT,
      useClass: NodemailerEmailTransport,
    },
    GetEmailConnectionUseCase,
    UpdateEmailConnectionUseCase,
    TestEmailConnectionUseCase,
    ActivateEmailConnectionUseCase,
    DisableEmailConnectionUseCase,
    ListEmailTemplatesUseCase,
    GetEmailTemplateUseCase,
    UpdateEmailTemplateUseCase,
    PreviewEmailTemplateUseCase,
    ResetEmailTemplateUseCase,
  ],
})
export class EmailModule {}
