import { Injectable } from '@nestjs/common';
import { SchoolEmailTemplateKey } from '@prisma/client';
import { EmailTemplateResponseDto } from '../dto/email-template.dto';
import { EmailSettingsRepository } from '../infrastructure/email-settings.repository';
import { presentEmailTemplate } from '../presenters/email-template.presenter';

@Injectable()
export class GetEmailTemplateUseCase {
  constructor(
    private readonly emailSettingsRepository: EmailSettingsRepository,
  ) {}

  async execute(
    key: SchoolEmailTemplateKey,
  ): Promise<EmailTemplateResponseDto> {
    const template = await this.emailSettingsRepository.findTemplate(key);
    return presentEmailTemplate(key, template);
  }
}
