import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { CreateCommunicationMessageUseCase } from '../../../communication/application/communication-message.use-cases';
import { CreateCommunicationMessageDto } from '../../../communication/dto/communication-message.dto';
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
      buildCreateMessageCommand(params.body),
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

function buildCreateMessageCommand(
  dto: SendParentConversationMessageDto,
): CreateCommunicationMessageDto {
  const command: CreateCommunicationMessageDto = {
    type: dto.type ?? 'text',
  };

  if (dto.body !== undefined) command.body = dto.body;
  if (dto.content !== undefined) command.content = dto.content;
  if (dto.caption !== undefined) command.caption = dto.caption;
  if (dto.clientMessageId !== undefined) {
    command.clientMessageId = dto.clientMessageId;
  }
  if (dto.replyToMessageId !== undefined) {
    command.replyToMessageId = dto.replyToMessageId;
  }
  if (dto.attachments !== undefined) {
    command.attachments = dto.attachments.map((attachment) => ({
      fileId: attachment.fileId,
      mediaKind: attachment.mediaKind,
      caption: attachment.caption,
      sortOrder: attachment.sortOrder,
    }));
  }

  return command;
}
