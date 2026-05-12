import { Module } from '@nestjs/common';
import { AuthModule } from '../../iam/auth/auth.module';
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
import { EmailSecretCrypto } from './domain/email-secret-crypto';
import { EmailSettingsRepository } from './infrastructure/email-settings.repository';

@Module({
  imports: [AuthModule],
  controllers: [EmailConnectionController, EmailTemplateController],
  providers: [
    EmailSettingsRepository,
    EmailSecretCrypto,
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
