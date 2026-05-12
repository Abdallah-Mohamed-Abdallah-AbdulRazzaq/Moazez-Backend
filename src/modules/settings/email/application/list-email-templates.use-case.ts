import { Injectable } from '@nestjs/common';
import { SchoolEmailTemplateKey } from '@prisma/client';
import { EmailTemplateListResponseDto } from '../dto/email-template.dto';
import { SCHOOL_EMAIL_TEMPLATE_KEY_ORDER } from '../domain/default-email-templates';
import { EmailSettingsRepository } from '../infrastructure/email-settings.repository';
import { presentEmailTemplate } from '../presenters/email-template.presenter';

@Injectable()
export class ListEmailTemplatesUseCase {
  constructor(
    private readonly emailSettingsRepository: EmailSettingsRepository,
  ) {}

  async execute(): Promise<EmailTemplateListResponseDto> {
    const templates = await this.emailSettingsRepository.listTemplates();
    const byKey = new Map(
      templates.map((template) => [template.key, template]),
    );

    return {
      items: SCHOOL_EMAIL_TEMPLATE_KEY_ORDER.map((key) =>
        presentEmailTemplate(
          key,
          byKey.get(key as SchoolEmailTemplateKey) ?? null,
        ),
      ),
    };
  }
}
