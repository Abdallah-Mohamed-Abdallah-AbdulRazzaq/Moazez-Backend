import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { CreateCommunicationMessageUseCase } from '../../../communication/application/communication-message.use-cases';
import { CreateCommunicationMessageDto } from '../../../communication/dto/communication-message.dto';
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
      buildCreateMessageCommand(dto),
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

function buildCreateMessageCommand(
  dto: SendTeacherConversationMessageDto,
): CreateCommunicationMessageDto {
  const command: CreateCommunicationMessageDto = {
    type: dto.type ?? 'text',
  };

  if (dto.body !== undefined) command.body = dto.body;
  if (dto.content !== undefined) command.content = dto.content;
  if (dto.caption !== undefined) command.caption = dto.caption;
  if (dto.clientMessageId !== undefined) {
    command.clientMessageId = dto.clientMessageId;
  }
  if (dto.replyToMessageId !== undefined) {
    command.replyToMessageId = dto.replyToMessageId;
  }
  if (dto.attachments !== undefined) {
    command.attachments = dto.attachments.map((attachment) => ({
      fileId: attachment.fileId,
      mediaKind: attachment.mediaKind,
      caption: attachment.caption,
      sortOrder: attachment.sortOrder,
    }));
  }

  return command;
}
