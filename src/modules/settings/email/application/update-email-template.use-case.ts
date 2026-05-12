import { Injectable } from '@nestjs/common';
import { AuditOutcome, SchoolEmailTemplateKey } from '@prisma/client';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { requireSettingsScope } from '../../settings-context';
import {
  mergeTemplateContent,
  socialLinksToJson,
  validateTemplateContent,
} from '../domain/email-template-content';
import { allowedVariablesForTemplate } from '../domain/default-email-templates';
import {
  EmailTemplateResponseDto,
  UpdateEmailTemplateDto,
} from '../dto/email-template.dto';
import { EmailSettingsRepository } from '../infrastructure/email-settings.repository';
import { presentEmailTemplate } from '../presenters/email-template.presenter';

@Injectable()
export class UpdateEmailTemplateUseCase {
  constructor(
    private readonly emailSettingsRepository: EmailSettingsRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    key: SchoolEmailTemplateKey,
    command: UpdateEmailTemplateDto,
  ): Promise<EmailTemplateResponseDto> {
    const scope = requireSettingsScope();
    const existing = await this.emailSettingsRepository.findTemplate(key);
    const content = mergeTemplateContent(key, existing, command);
    validateTemplateContent(content, allowedVariablesForTemplate(key));

    const updated = await this.emailSettingsRepository.saveTemplate(
      scope.schoolId,
      key,
      {
        subject: content.subject.trim(),
        preheader: nullableTrim(content.preheader),
        title: nullableTrim(content.title),
        subtitle: nullableTrim(content.subtitle),
        bodyHtml: content.bodyHtml,
        bodyText: nullableTrim(content.bodyText),
        footerHtml: nullableTrim(content.footerHtml),
        logoFileId: content.logoFileId,
        supportEmail: nullableTrim(content.supportEmail),
        supportPhone: nullableTrim(content.supportPhone),
        socialLinks: socialLinksToJson(content.socialLinks),
        isActive: content.isActive,
      },
    );

    await this.authRepository.createAuditLog({
      actorId: scope.actorId,
      userType: scope.userType,
      organizationId: scope.organizationId,
      schoolId: scope.schoolId,
      module: 'settings',
      action: existing
        ? 'settings.email.template.update'
        : 'settings.email.template.create',
      resourceType: 'school_email_template',
      resourceId: updated.id,
      outcome: AuditOutcome.SUCCESS,
      before: existing ? summarizeTemplate(existing) : undefined,
      after: summarizeTemplate(updated),
    });

    return presentEmailTemplate(key, updated);
  }
}

function nullableTrim(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function summarizeTemplate(template: {
  key: SchoolEmailTemplateKey;
  subject: string;
  preheader: string | null;
  title: string | null;
  subtitle: string | null;
  logoFileId: string | null;
  supportEmail: string | null;
  supportPhone: string | null;
  isActive: boolean;
}) {
  return {
    key: template.key,
    subject: template.subject,
    preheader: template.preheader,
    title: template.title,
    subtitle: template.subtitle,
    logoFileId: template.logoFileId,
    supportEmail: template.supportEmail,
    supportPhone: template.supportPhone,
    isActive: template.isActive,
  };
}
