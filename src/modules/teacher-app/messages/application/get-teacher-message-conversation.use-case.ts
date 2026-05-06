import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { TeacherAppAccessService } from '../../access/teacher-app-access.service';
import { TeacherMessageConversationResponseDto } from '../dto/teacher-messages.dto';
import { TeacherMessagesReadAdapter } from '../infrastructure/teacher-messages-read.adapter';
import { TeacherMessagesPresenter } from '../presenters/teacher-messages.presenter';

@Injectable()
export class GetTeacherMessageConversationUseCase {
  constructor(
    private readonly accessService: TeacherAppAccessService,
    private readonly messagesReadAdapter: TeacherMessagesReadAdapter,
  ) {}

  async execute(conversationId: string): Promise<TeacherMessageConversationResponseDto> {
    const context = this.accessService.assertCurrentTeacher();
    const conversation =
      await this.messagesReadAdapter.findConversationForTeacher({
        conversationId,
        teacherUserId: context.teacherUserId,
      });

    if (!conversation) {
      throw new NotFoundDomainException(
        'Teacher message conversation not found',
        { conversationId },
      );
    }

    return TeacherMessagesPresenter.presentConversation({
      conversation,
      teacherUserId: context.teacherUserId,
      unreadCount: 0,
    });
  }
}
