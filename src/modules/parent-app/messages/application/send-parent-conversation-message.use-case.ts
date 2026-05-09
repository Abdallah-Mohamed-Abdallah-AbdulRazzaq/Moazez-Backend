import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { CreateCommunicationMessageUseCase } from '../../../communication/application/communication-message.use-cases';
import { ParentAppAccessService } from '../../access/parent-app-access.service';
import {
  ParentConversationMessageResponseDto,
  SendParentConversationMessageDto,
} from '../dto/parent-messages.dto';
import { ParentMessagesReadAdapter } from '../infrastructure/parent-messages-read.adapter';
import { ParentMessagesPresenter } from '../presenters/parent-messages.presenter';
import { assertParentConversationVisible } from './list-parent-conversation-messages.use-case';

@Injectable()
export class SendParentConversationMessageUseCase {
  constructor(
    private readonly accessService: ParentAppAccessService,
    private readonly readAdapter: ParentMessagesReadAdapter,
    private readonly createCommunicationMessageUseCase: CreateCommunicationMessageUseCase,
  ) {}

  async execute(params: {
    conversationId: string;
    body: SendParentConversationMessageDto;
  }): Promise<ParentConversationMessageResponseDto> {
    const context = await this.accessService.assertCurrentParent();
    await assertParentConversationVisible({
      readAdapter: this.readAdapter,
      conversationId: params.conversationId,
      parentUserId: context.parentUserId,
    });

    const created = await this.createCommunicationMessageUseCase.execute(
      params.conversationId,
      {
        type: 'text',
        body: params.body.body,
      },
    );
    const message = await this.readAdapter.findMessageForParent({
      conversationId: params.conversationId,
      messageId: created.id,
    });

    if (!message) {
      throw new NotFoundDomainException('Parent App message not found', {
        conversationId: params.conversationId,
        messageId: created.id,
      });
    }

    return ParentMessagesPresenter.presentMessage({
      message,
      parentUserId: context.parentUserId,
    });
  }
}
