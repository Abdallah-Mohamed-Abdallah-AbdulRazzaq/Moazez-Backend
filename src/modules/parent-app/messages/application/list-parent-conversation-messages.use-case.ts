import { Injectable } from '@nestjs/common';
import { CommunicationMessageKind } from '@prisma/client';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { ParentAppAccessService } from '../../access/parent-app-access.service';
import {
  ListParentConversationMessagesQueryDto,
  ParentConversationMessagesResponseDto,
} from '../dto/parent-messages.dto';
import {
  ParentMessageFilters,
  ParentMessagesReadAdapter,
} from '../infrastructure/parent-messages-read.adapter';
import { ParentMessagesPresenter } from '../presenters/parent-messages.presenter';

@Injectable()
export class ListParentConversationMessagesUseCase {
  constructor(
    private readonly accessService: ParentAppAccessService,
    private readonly readAdapter: ParentMessagesReadAdapter,
  ) {}

  async execute(params: {
    conversationId: string;
    query?: ListParentConversationMessagesQueryDto;
  }): Promise<ParentConversationMessagesResponseDto> {
    const context = await this.accessService.assertCurrentParent();
    await assertParentConversationVisible({
      readAdapter: this.readAdapter,
      conversationId: params.conversationId,
      parentUserId: context.parentUserId,
    });

    const result = await this.readAdapter.listMessages({
      conversationId: params.conversationId,
      filters: toMessageFilters(params.query),
    });

    return ParentMessagesPresenter.presentMessageList({
      result,
      parentUserId: context.parentUserId,
    });
  }
}

export async function assertParentConversationVisible(params: {
  readAdapter: ParentMessagesReadAdapter;
  conversationId: string;
  parentUserId: string;
}): Promise<void> {
  const conversation = await params.readAdapter.findConversationForParent({
    conversationId: params.conversationId,
    parentUserId: params.parentUserId,
  });

  if (!conversation) {
    throw new NotFoundDomainException('Parent App conversation not found', {
      conversationId: params.conversationId,
    });
  }
}

export function toMessageFilters(
  query?: ListParentConversationMessagesQueryDto,
): ParentMessageFilters {
  return {
    ...(query?.type ? { kind: toMessageKind(query.type) } : {}),
    ...(query?.before ? { before: new Date(query.before) } : {}),
    ...(query?.after ? { after: new Date(query.after) } : {}),
    ...(query?.limit !== undefined ? { limit: query.limit } : {}),
    ...(query?.page !== undefined ? { page: query.page } : {}),
  };
}

function toMessageKind(value: string): CommunicationMessageKind {
  return value.toUpperCase() as CommunicationMessageKind;
}
