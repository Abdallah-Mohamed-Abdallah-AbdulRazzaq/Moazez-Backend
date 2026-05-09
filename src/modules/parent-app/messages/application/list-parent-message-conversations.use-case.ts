import { Injectable } from '@nestjs/common';
import {
  CommunicationConversationStatus,
  CommunicationConversationType,
} from '@prisma/client';
import { ParentAppAccessService } from '../../access/parent-app-access.service';
import {
  ListParentMessageConversationsQueryDto,
  ParentMessageConversationsResponseDto,
} from '../dto/parent-messages.dto';
import {
  ParentMessageConversationFilters,
  ParentMessagesReadAdapter,
} from '../infrastructure/parent-messages-read.adapter';
import { ParentMessagesPresenter } from '../presenters/parent-messages.presenter';

@Injectable()
export class ListParentMessageConversationsUseCase {
  constructor(
    private readonly accessService: ParentAppAccessService,
    private readonly readAdapter: ParentMessagesReadAdapter,
  ) {}

  async execute(
    query?: ListParentMessageConversationsQueryDto,
  ): Promise<ParentMessageConversationsResponseDto> {
    const context = await this.accessService.assertCurrentParent();
    const [result, unreadSummary] = await Promise.all([
      this.readAdapter.listConversations({
        parentUserId: context.parentUserId,
        filters: toConversationFilters(query),
      }),
      this.readAdapter.getUnreadSummary({
        parentUserId: context.parentUserId,
      }),
    ]);

    return ParentMessagesPresenter.presentConversationList({
      result,
      parentUserId: context.parentUserId,
      unreadSummary,
    });
  }
}

function toConversationFilters(
  query?: ListParentMessageConversationsQueryDto,
): ParentMessageConversationFilters {
  return {
    ...(query?.type
      ? { type: query.type.toUpperCase() as CommunicationConversationType }
      : {}),
    ...(query?.status
      ? {
          status: query.status.toUpperCase() as CommunicationConversationStatus,
        }
      : {}),
    ...(query?.search ? { search: query.search } : {}),
    ...(query?.limit !== undefined ? { limit: query.limit } : {}),
    ...(query?.page !== undefined ? { page: query.page } : {}),
  };
}
