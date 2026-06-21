import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { CreateOrReuseCommunicationDirectConversationUseCase } from '../../../communication/application/communication-conversation.use-cases';
import {
  presentCommunicationAppContactList,
  type CommunicationAppContactRole,
} from '../../../communication/presenters/communication-app-contact.presenter';
import { ParentAppAccessService } from '../../access/parent-app-access.service';
import {
  CreateParentMessageConversationDto,
  ListParentMessageContactsQueryDto,
  ParentMessageContactsResponseDto,
  ParentMessageConversationResponseDto,
} from '../dto/parent-messages.dto';
import { ParentMessagesReadAdapter } from '../infrastructure/parent-messages-read.adapter';
import { ParentMessagesPresenter } from '../presenters/parent-messages.presenter';

@Injectable()
export class ListParentMessageContactsUseCase {
  constructor(
    private readonly accessService: ParentAppAccessService,
    private readonly readAdapter: ParentMessagesReadAdapter,
  ) {}

  async execute(
    query?: ListParentMessageContactsQueryDto,
  ): Promise<ParentMessageContactsResponseDto> {
    const context = await this.accessService.assertCurrentParent();
    const result = await this.readAdapter.listContactsForParent({
      context,
      filters: {
        ...(query?.q ? { q: query.q } : {}),
        ...(query?.role
          ? { role: query.role as CommunicationAppContactRole }
          : {}),
        ...(query?.limit !== undefined ? { limit: query.limit } : {}),
        ...(query?.page !== undefined ? { page: query.page } : {}),
      },
    });

    return presentCommunicationAppContactList(
      result,
      'dual',
    ) as ParentMessageContactsResponseDto;
  }
}

@Injectable()
export class CreateParentMessageConversationUseCase {
  constructor(
    private readonly accessService: ParentAppAccessService,
    private readonly readAdapter: ParentMessagesReadAdapter,
    private readonly createDirectConversationUseCase: CreateOrReuseCommunicationDirectConversationUseCase,
  ) {}

  async execute(
    dto: CreateParentMessageConversationDto,
  ): Promise<ParentMessageConversationResponseDto> {
    const context = await this.accessService.assertCurrentParent();
    const contact = await this.readAdapter.findContactForParent({
      context,
      contactId: dto.contactId,
    });

    if (!contact) {
      throw new NotFoundDomainException(
        'Parent App message contact not found',
        {
          contactId: dto.contactId,
        },
      );
    }

    const result = await this.createDirectConversationUseCase.execute({
      targetUserId: contact.targetUserId,
    });
    const conversation = await this.readAdapter.findConversationForParent({
      conversationId: result.conversationId,
      parentUserId: context.parentUserId,
    });

    if (!conversation) {
      throw new NotFoundDomainException('Parent App conversation not found', {
        conversationId: result.conversationId,
      });
    }

    const unreadCount =
      await this.readAdapter.countUnreadMessagesForConversation({
        conversationId: result.conversationId,
        parentUserId: context.parentUserId,
      });

    return ParentMessagesPresenter.presentConversation({
      conversation,
      parentUserId: context.parentUserId,
      unreadCount,
    });
  }
}
