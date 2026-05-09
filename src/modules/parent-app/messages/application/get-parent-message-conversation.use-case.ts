import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { ParentAppAccessService } from '../../access/parent-app-access.service';
import { ParentMessageConversationResponseDto } from '../dto/parent-messages.dto';
import { ParentMessagesReadAdapter } from '../infrastructure/parent-messages-read.adapter';
import { ParentMessagesPresenter } from '../presenters/parent-messages.presenter';

@Injectable()
export class GetParentMessageConversationUseCase {
  constructor(
    private readonly accessService: ParentAppAccessService,
    private readonly readAdapter: ParentMessagesReadAdapter,
  ) {}

  async execute(
    conversationId: string,
  ): Promise<ParentMessageConversationResponseDto> {
    const context = await this.accessService.assertCurrentParent();
    const conversation = await this.readAdapter.findConversationForParent({
      conversationId,
      parentUserId: context.parentUserId,
    });

    if (!conversation) {
      throw new NotFoundDomainException('Parent App conversation not found', {
        conversationId,
      });
    }

    const unreadCount =
      await this.readAdapter.countUnreadMessagesForConversation({
        conversationId,
        parentUserId: context.parentUserId,
      });

    return ParentMessagesPresenter.presentConversation({
      conversation,
      parentUserId: context.parentUserId,
      unreadCount,
    });
  }
}
