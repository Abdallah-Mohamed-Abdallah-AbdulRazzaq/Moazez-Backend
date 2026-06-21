import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { CreateOrReuseCommunicationDirectConversationUseCase } from '../../../communication/application/communication-conversation.use-cases';
import {
  presentCommunicationAppContactList,
  type CommunicationAppContactRole,
} from '../../../communication/presenters/communication-app-contact.presenter';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import {
  CreateStudentMessageConversationDto,
  ListStudentMessageContactsQueryDto,
  StudentMessageContactsResponseDto,
  StudentMessageConversationResponseDto,
} from '../dto/student-messages.dto';
import { StudentMessagesReadAdapter } from '../infrastructure/student-messages-read.adapter';
import { StudentMessagesPresenter } from '../presenters/student-messages.presenter';

@Injectable()
export class ListStudentMessageContactsUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly readAdapter: StudentMessagesReadAdapter,
  ) {}

  async execute(
    query?: ListStudentMessageContactsQueryDto,
  ): Promise<StudentMessageContactsResponseDto> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();
    const result = await this.readAdapter.listContactsForStudent({
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
    ) as StudentMessageContactsResponseDto;
  }
}

@Injectable()
export class CreateStudentMessageConversationUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly readAdapter: StudentMessagesReadAdapter,
    private readonly createDirectConversationUseCase: CreateOrReuseCommunicationDirectConversationUseCase,
  ) {}

  async execute(
    dto: CreateStudentMessageConversationDto,
  ): Promise<StudentMessageConversationResponseDto> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();
    const contact = await this.readAdapter.findContactForStudent({
      context,
      contactId: dto.contactId,
    });

    if (!contact) {
      throw new NotFoundDomainException(
        'Student App message contact not found',
        { contactId: dto.contactId },
      );
    }

    const result = await this.createDirectConversationUseCase.execute({
      targetUserId: contact.targetUserId,
    });
    const conversation = await this.readAdapter.findConversationForStudent({
      conversationId: result.conversationId,
      studentUserId: context.studentUserId,
    });

    if (!conversation) {
      throw new NotFoundDomainException('Student App conversation not found', {
        conversationId: result.conversationId,
      });
    }

    const unreadCount =
      await this.readAdapter.countUnreadMessagesForConversation({
        conversationId: result.conversationId,
        studentUserId: context.studentUserId,
      });

    return StudentMessagesPresenter.presentConversation({
      conversation,
      studentUserId: context.studentUserId,
      unreadCount,
    });
  }
}
