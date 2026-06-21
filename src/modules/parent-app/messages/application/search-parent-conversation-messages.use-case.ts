import { Injectable } from '@nestjs/common';
import { ParentAppAccessService } from '../../access/parent-app-access.service';
import {
  ParentConversationMessageSearchResponseDto,
  SearchParentConversationMessagesQueryDto,
} from '../dto/parent-messages.dto';
import { ParentMessagesReadAdapter } from '../infrastructure/parent-messages-read.adapter';
import { ParentMessagesPresenter } from '../presenters/parent-messages.presenter';
import { assertParentConversationVisible } from './list-parent-conversation-messages.use-case';

@Injectable()
export class SearchParentConversationMessagesUseCase {
  constructor(
    private readonly accessService: ParentAppAccessService,
    private readonly readAdapter: ParentMessagesReadAdapter,
  ) {}

  async execute(params: {
    conversationId: string;
    query: SearchParentConversationMessagesQueryDto;
  }): Promise<ParentConversationMessageSearchResponseDto> {
    const context = await this.accessService.assertCurrentParent();
    await assertParentConversationVisible({
      readAdapter: this.readAdapter,
      conversationId: params.conversationId,
      parentUserId: context.parentUserId,
    });

    const result = await this.readAdapter.searchMessages({
      conversationId: params.conversationId,
      parentUserId: context.parentUserId,
      q: params.query.q,
      page: params.query.page,
      limit: params.query.limit,
    });

    return ParentMessagesPresenter.presentMessageSearch({
      result,
      parentUserId: context.parentUserId,
      query: params.query.q,
    });
  }
}
