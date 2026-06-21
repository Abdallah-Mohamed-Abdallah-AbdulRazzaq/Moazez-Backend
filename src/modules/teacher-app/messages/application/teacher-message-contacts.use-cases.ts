import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { CreateOrReuseCommunicationDirectConversationUseCase } from '../../../communication/application/communication-conversation.use-cases';
import {
  presentCommunicationAppContactList,
  type CommunicationAppContactRole,
} from '../../../communication/presenters/communication-app-contact.presenter';
import { TeacherAppAccessService } from '../../access/teacher-app-access.service';
import {
  CreateTeacherMessageConversationDto,
  ListTeacherMessageContactsQueryDto,
  TeacherMessageContactsResponseDto,
  TeacherMessageConversationResponseDto,
} from '../dto/teacher-messages.dto';
import { TeacherMessagesReadAdapter } from '../infrastructure/teacher-messages-read.adapter';
import { TeacherMessagesPresenter } from '../presenters/teacher-messages.presenter';

@Injectable()
export class ListTeacherMessageContactsUseCase {
  constructor(
    private readonly accessService: TeacherAppAccessService,
    private readonly readAdapter: TeacherMessagesReadAdapter,
  ) {}

  async execute(
    query?: ListTeacherMessageContactsQueryDto,
  ): Promise<TeacherMessageContactsResponseDto> {
    const context = this.accessService.assertCurrentTeacher();
    const allocations = await this.accessService.listOwnedTeacherAllocations();
    const result = await this.readAdapter.listContactsForTeacher({
      context,
      classroomIds: allocations.map((allocation) => allocation.classroomId),
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
      'camel',
    ) as TeacherMessageContactsResponseDto;
  }
}

@Injectable()
export class CreateTeacherMessageConversationUseCase {
  constructor(
    private readonly accessService: TeacherAppAccessService,
    private readonly readAdapter: TeacherMessagesReadAdapter,
    private readonly createDirectConversationUseCase: CreateOrReuseCommunicationDirectConversationUseCase,
  ) {}

  async execute(
    dto: CreateTeacherMessageConversationDto,
  ): Promise<TeacherMessageConversationResponseDto> {
    const context = this.accessService.assertCurrentTeacher();
    const allocations = await this.accessService.listOwnedTeacherAllocations();
    const contact = await this.readAdapter.findContactForTeacher({
      context,
      classroomIds: allocations.map((allocation) => allocation.classroomId),
      contactId: dto.contactId,
    });

    if (!contact) {
      throw new NotFoundDomainException(
        'Teacher App message contact not found',
        { contactId: dto.contactId },
      );
    }

    const result = await this.createDirectConversationUseCase.execute({
      targetUserId: contact.targetUserId,
    });
    const conversation = await this.readAdapter.findConversationForTeacher({
      conversationId: result.conversationId,
      teacherUserId: context.teacherUserId,
    });

    if (!conversation) {
      throw new NotFoundDomainException(
        'Teacher message conversation not found',
        { conversationId: result.conversationId },
      );
    }

    return TeacherMessagesPresenter.presentConversation({
      conversation,
      teacherUserId: context.teacherUserId,
      unreadCount: 0,
    });
  }
}
