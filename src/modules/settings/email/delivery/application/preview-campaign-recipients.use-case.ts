import { Injectable } from '@nestjs/common';
import { CampaignPreviewRecipientsDto } from '../dto/email-delivery.dto';
import { presentRecipientPreview } from '../presenters/email-delivery.presenter';
import { EmailRecipientTargetingService } from './email-recipient-targeting.service';

@Injectable()
export class PreviewCampaignRecipientsUseCase {
  constructor(
    private readonly recipientTargeting: EmailRecipientTargetingService,
  ) {}

  async execute(command: CampaignPreviewRecipientsDto) {
    const partition = await this.recipientTargeting.resolveTargets({
      recipientScope: command.recipientScope,
      customEmails: command.customEmails,
      includeUsersWithPassword: true,
      includeDisabledUsers: command.includeDisabledUsers,
      requireContactEmail: command.requireContactEmail,
      allowLoginEmailFallback: command.allowLoginEmailFallback,
      sampleLimit: command.limit,
    });

    return presentRecipientPreview(partition);
  }
}
