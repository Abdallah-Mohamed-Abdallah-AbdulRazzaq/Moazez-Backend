import { Injectable } from '@nestjs/common';
import { AuditOutcome, SchoolEmailTemplateKey } from '@prisma/client';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { requireSettingsScope } from '../../settings-context';
import { EmailTemplateResponseDto } from '../dto/email-template.dto';
import { EmailSettingsRepository } from '../infrastructure/email-settings.repository';
import { presentEmailTemplate } from '../presenters/email-template.presenter';

@Injectable()
export class ResetEmailTemplateUseCase {
  constructor(
    private readonly emailSettingsRepository: EmailSettingsRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    key: SchoolEmailTemplateKey,
  ): Promise<EmailTemplateResponseDto> {
    const scope = requireSettingsScope();
    const existing = await this.emailSettingsRepository.findTemplate(key);
    await this.emailSettingsRepository.deleteTemplate(key);

    await this.authRepository.createAuditLog({
      actorId: scope.actorId,
      userType: scope.userType,
      organizationId: scope.organizationId,
      schoolId: scope.schoolId,
      module: 'settings',
      action: 'settings.email.template.reset_default',
      resourceType: 'school_email_template',
      resourceId: existing?.id ?? null,
      outcome: AuditOutcome.SUCCESS,
      before: existing
        ? {
            key: existing.key,
            subject: existing.subject,
            title: existing.title,
            isActive: existing.isActive,
          }
        : undefined,
      after: { key, customized: false },
    });

    return presentEmailTemplate(key, null);
  }
}
