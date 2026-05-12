import { Injectable } from '@nestjs/common';
import { EmailRecipientTargetingService } from './email-recipient-targeting.service';
import { CredentialDeliveryPreviewRecipientsDto } from '../dto/email-delivery.dto';
import { presentRecipientPreview } from '../presenters/email-delivery.presenter';

@Injectable()
export class PreviewCredentialDeliveryRecipientsUseCase {
  constructor(
    private readonly recipientTargeting: EmailRecipientTargetingService,
  ) {}

  async execute(command: CredentialDeliveryPreviewRecipientsDto) {
    const partition = await this.recipientTargeting.resolveTargets({
      recipientScope: command,
      includeUsersWithPassword: command.includeUsersWithPassword,
      includeDisabledUsers: command.includeDisabledUsers,
      requireContactEmail: command.requireContactEmail,
      allowLoginEmailFallback: command.allowLoginEmailFallback,
      sampleLimit: command.limit,
    });

    return presentRecipientPreview(partition);
  }
}
