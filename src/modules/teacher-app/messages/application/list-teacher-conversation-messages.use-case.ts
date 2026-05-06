import { Injectable } from '@nestjs/common';
import { CommunicationMessageKind } from '@prisma/client';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { TeacherAppAccessService } from '../../access/teacher-app-access.service';
import {
  ListTeacherConversationMessagesQueryDto,
  TeacherConversationMessagesResponseDto,
} from '../dto/teacher-messages.dto';
import { TeacherMessagesReadAdapter } from '../infrastructure/teacher-messages-read.adapter';
import { TeacherMessagesPresenter } from '../presenters/teacher-messages.presenter';

const MESSAGE_KIND_FILTERS: Record<string, CommunicationMessageKind> = {
  text: CommunicationMessageKind.TEXT,
  image: CommunicationMessageKind.IMAGE,
  file: CommunicationMessageKind.FILE,
  audio: CommunicationMessageKind.AUDIO,
  video: CommunicationMessageKind.VIDEO,
  system: CommunicationMessageKind.SYSTEM,
};

@Injectable()
export class ListTeacherConversationMessagesUseCase {
  constructor(
    private readonly accessService: TeacherAppAccessService,
    private readonly messagesReadAdapter: TeacherMessagesReadAdapter,
  ) {}

  async execute(
    conversationId: string,
    query: ListTeacherConversationMessagesQueryDto,
  ): Promise<TeacherConversationMessagesResponseDto> {
    const context = this.accessService.assertCurrentTeacher();
    await this.assertConversationVisible({
      conversationId,
      teacherUserId: context.teacherUserId,
    });

    const result = await this.messagesReadAdapter.listMessages({
      conversationId,
      filters: {
        kind: query.type ? MESSAGE_KIND_FILTERS[query.type] : undefined,
        before: query.before ? new Date(query.before) : undefined,
        after: query.after ? new Date(query.after) : undefined,
        page: query.page,
        limit: query.limit,
      },
    });

    return TeacherMessagesPresenter.presentMessageList({
      result,
      teacherUserId: context.teacherUserId,
    });
  }

  private async assertConversationVisible(params: {
    conversationId: string;
    teacherUserId: string;
  }): Promise<void> {
    const conversation =
      await this.messagesReadAdapter.findConversationForTeacher(params);

    if (!conversation) {
      throw new NotFoundDomainException(
        'Teacher message conversation not found',
        { conversationId: params.conversationId },
      );
    }
  }
}
