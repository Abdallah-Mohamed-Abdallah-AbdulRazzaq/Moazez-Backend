import { Injectable } from '@nestjs/common';
import { SchoolEmailTemplateKey } from '@prisma/client';
import { requireSettingsScope } from '../../../settings-context';
import { EmailCampaignInvalidException } from '../../domain/email.exceptions';
import {
  CampaignPreviewDto,
  CampaignPreviewResponseDto,
} from '../dto/email-delivery.dto';
import { SchoolEmailRendererService } from './school-email-renderer.service';

@Injectable()
export class PreviewEmailCampaignUseCase {
  constructor(private readonly renderer: SchoolEmailRendererService) {}

  async execute(command: CampaignPreviewDto): Promise<CampaignPreviewResponseDto> {
    const scope = requireSettingsScope();
    const templateKey =
      (command.templateKey as SchoolEmailTemplateKey | undefined) ??
      SchoolEmailTemplateKey.GENERAL_MESSAGE;

    if (templateKey !== SchoolEmailTemplateKey.GENERAL_MESSAGE) {
      throw new EmailCampaignInvalidException({
        templateKey,
        reason: 'general_campaign_requires_general_message_template',
      });
    }

    const rendered = await this.renderer.previewCampaign({
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

    return {
      key: templateKey,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      missingVariables: rendered.missingVariables,
      unknownVariables: rendered.unknownVariables,
    };
  }
}
