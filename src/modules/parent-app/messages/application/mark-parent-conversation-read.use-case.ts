import { Injectable } from '@nestjs/common';
import { MarkCommunicationConversationReadUseCase } from '../../../communication/application/communication-message.use-cases';
import { ParentAppAccessService } from '../../access/parent-app-access.service';
import { ParentConversationReadResponseDto } from '../dto/parent-messages.dto';
import { ParentMessagesReadAdapter } from '../infrastructure/parent-messages-read.adapter';
import { ParentMessagesPresenter } from '../presenters/parent-messages.presenter';
import { assertParentConversationVisible } from './list-parent-conversation-messages.use-case';

@Injectable()
export class MarkParentConversationReadUseCase {
  constructor(
    private readonly accessService: ParentAppAccessService,
    private readonly readAdapter: ParentMessagesReadAdapter,
    private readonly markCommunicationConversationReadUseCase: MarkCommunicationConversationReadUseCase,
  ) {}

  async execute(
    conversationId: string,
  ): Promise<ParentConversationReadResponseDto> {
    const context = await this.accessService.assertCurrentParent();
    await assertParentConversationVisible({
      readAdapter: this.readAdapter,
      conversationId,
      parentUserId: context.parentUserId,
    });

    const result =
      await this.markCommunicationConversationReadUseCase.execute(
        conversationId,
      );

    return ParentMessagesPresenter.presentReadResult(result);
  }
}
