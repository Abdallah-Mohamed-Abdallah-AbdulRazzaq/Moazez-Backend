import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import {
  CommunicationAttachmentAccessMode,
  GetCommunicationMessageAttachmentDownloadUrlUseCase,
} from '../../../communication/application/communication-message-attachment-download.use-case';
import { ParentAppAccessService } from '../../access/parent-app-access.service';
import { ParentMessagesReadAdapter } from '../infrastructure/parent-messages-read.adapter';
import { assertParentConversationVisible } from './list-parent-conversation-messages.use-case';

@Injectable()
export class GetParentMessageAttachmentDownloadUrlUseCase {
  constructor(
    private readonly accessService: ParentAppAccessService,
    private readonly readAdapter: ParentMessagesReadAdapter,
    private readonly getAttachmentDownloadUrlUseCase: GetCommunicationMessageAttachmentDownloadUrlUseCase,
  ) {}

  async execute(params: {
    conversationId: string;
    messageId: string;
    attachmentId: string;
    mode: CommunicationAttachmentAccessMode;
  }): Promise<string> {
    const context = await this.accessService.assertCurrentParent();
    await assertParentConversationVisible({
      readAdapter: this.readAdapter,
      conversationId: params.conversationId,
      parentUserId: context.parentUserId,
    });

    const message = await this.readAdapter.findMessageForParent({
      conversationId: params.conversationId,
      messageId: params.messageId,
    });

    if (!message) {
      throw new NotFoundDomainException('Parent App message not found', {
        conversationId: params.conversationId,
        messageId: params.messageId,
      });
    }

    return this.getAttachmentDownloadUrlUseCase.execute(params);
  }
}
