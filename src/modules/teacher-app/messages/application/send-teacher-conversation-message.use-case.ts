import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { CreateCommunicationMessageUseCase } from '../../../communication/application/communication-message.use-cases';
import { TeacherAppAccessService } from '../../access/teacher-app-access.service';
import {
  SendTeacherConversationMessageDto,
  TeacherConversationMessageResponseDto,
} from '../dto/teacher-messages.dto';
import { TeacherMessagesReadAdapter } from '../infrastructure/teacher-messages-read.adapter';
import { TeacherMessagesPresenter } from '../presenters/teacher-messages.presenter';

@Injectable()
export class SendTeacherConversationMessageUseCase {
  constructor(
    private readonly accessService: TeacherAppAccessService,
    private readonly messagesReadAdapter: TeacherMessagesReadAdapter,
    private readonly createCommunicationMessageUseCase: CreateCommunicationMessageUseCase,
  ) {}

  async execute(
    conversationId: string,
    dto: SendTeacherConversationMessageDto,
  ): Promise<TeacherConversationMessageResponseDto> {
    const context = this.accessService.assertCurrentTeacher();
    await this.assertConversationVisible({
      conversationId,
      teacherUserId: context.teacherUserId,
    });

    const created = await this.createCommunicationMessageUseCase.execute(
      conversationId,
      {
        type: 'text',
        body: dto.body,
        replyToMessageId: dto.replyToMessageId,
      },
    );

    const message = await this.messagesReadAdapter.findMessageForTeacher({
      conversationId,
      messageId: created.id,
    });

    if (!message) {
      throw new NotFoundDomainException('Teacher message not found', {
        messageId: created.id,
      });
    }

    return TeacherMessagesPresenter.presentMessage({
      message,
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
