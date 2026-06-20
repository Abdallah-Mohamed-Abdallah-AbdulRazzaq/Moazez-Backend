import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import {
  GetCommunicationMessageInfoUseCase,
  GetCommunicationMessageReadersUseCase,
} from '../../../communication/application/communication-message.use-cases';
import { ParentAppAccessService } from '../../access/parent-app-access.service';
import {
  ParentMessageInfoResponseDto,
  ParentMessageReadersQueryDto,
  ParentMessageReadersResponseDto,
} from '../dto/parent-messages.dto';
import { ParentMessagesReadAdapter } from '../infrastructure/parent-messages-read.adapter';
import { ParentMessagesPresenter } from '../presenters/parent-messages.presenter';
import { assertParentConversationVisible } from './list-parent-conversation-messages.use-case';

@Injectable()
export class GetParentMessageReadersUseCase {
  constructor(
    private readonly accessService: ParentAppAccessService,
    private readonly readAdapter: ParentMessagesReadAdapter,
    private readonly getCommunicationMessageReadersUseCase: GetCommunicationMessageReadersUseCase,
  ) {}

  async execute(params: {
    conversationId: string;
    messageId: string;
    query?: ParentMessageReadersQueryDto;
  }): Promise<ParentMessageReadersResponseDto> {
    await this.assertParentCanViewMessage(params);

    const result = await this.getCommunicationMessageReadersUseCase.execute(
      params.messageId,
      params.query,
    );

    return ParentMessagesPresenter.presentMessageReaders(result);
  }

  private async assertParentCanViewMessage(params: {
    conversationId: string;
    messageId: string;
  }): Promise<void> {
    const context = await this.accessService.assertCurrentParent();
    await assertParentConversationVisible({
      readAdapter: this.readAdapter,
      conversationId: params.conversationId,
      parentUserId: context.parentUserId,
    });
    const message = await this.readAdapter.findMessageForParent(params);

    if (!message) {
      throw new NotFoundDomainException('Parent App message not found', {
        messageId: params.messageId,
      });
    }
  }
}

@Injectable()
export class GetParentMessageInfoUseCase {
  constructor(
    private readonly accessService: ParentAppAccessService,
    private readonly readAdapter: ParentMessagesReadAdapter,
    private readonly getCommunicationMessageInfoUseCase: GetCommunicationMessageInfoUseCase,
  ) {}

  async execute(params: {
    conversationId: string;
    messageId: string;
    query?: ParentMessageReadersQueryDto;
  }): Promise<ParentMessageInfoResponseDto> {
    await this.assertParentCanViewMessage(params);

    const result = await this.getCommunicationMessageInfoUseCase.execute(
      params.messageId,
      params.query,
    );

    return ParentMessagesPresenter.presentMessageInfo(result);
  }

  private async assertParentCanViewMessage(params: {
    conversationId: string;
    messageId: string;
  }): Promise<void> {
    const context = await this.accessService.assertCurrentParent();
    await assertParentConversationVisible({
      readAdapter: this.readAdapter,
      conversationId: params.conversationId,
      parentUserId: context.parentUserId,
    });
    const message = await this.readAdapter.findMessageForParent(params);

    if (!message) {
      throw new NotFoundDomainException('Parent App message not found', {
        messageId: params.messageId,
      });
    }
  }
}
