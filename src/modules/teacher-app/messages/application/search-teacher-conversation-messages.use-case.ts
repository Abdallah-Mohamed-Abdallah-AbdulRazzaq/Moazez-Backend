import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { TeacherAppAccessService } from '../../access/teacher-app-access.service';
import {
  SearchTeacherConversationMessagesQueryDto,
  TeacherConversationMessageSearchResponseDto,
} from '../dto/teacher-messages.dto';
import { TeacherMessagesReadAdapter } from '../infrastructure/teacher-messages-read.adapter';
import { TeacherMessagesPresenter } from '../presenters/teacher-messages.presenter';

@Injectable()
export class SearchTeacherConversationMessagesUseCase {
  constructor(
    private readonly accessService: TeacherAppAccessService,
    private readonly messagesReadAdapter: TeacherMessagesReadAdapter,
  ) {}

  async execute(
    conversationId: string,
    query: SearchTeacherConversationMessagesQueryDto,
  ): Promise<TeacherConversationMessageSearchResponseDto> {
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

    const result = await this.messagesReadAdapter.searchMessages({
      conversationId,
      teacherUserId: context.teacherUserId,
      q: query.q,
      page: query.page,
      limit: query.limit,
    });

    return TeacherMessagesPresenter.presentMessageSearch({
      result,
      teacherUserId: context.teacherUserId,
      query: query.q,
    });
  }
}
