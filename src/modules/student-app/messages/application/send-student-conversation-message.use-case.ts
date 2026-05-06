import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { CreateCommunicationMessageUseCase } from '../../../communication/application/communication-message.use-cases';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import {
  SendStudentConversationMessageDto,
  StudentConversationMessageResponseDto,
} from '../dto/student-messages.dto';
import { StudentMessagesReadAdapter } from '../infrastructure/student-messages-read.adapter';
import { StudentMessagesPresenter } from '../presenters/student-messages.presenter';
import { assertConversationVisible } from './list-student-conversation-messages.use-case';

@Injectable()
export class SendStudentConversationMessageUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly readAdapter: StudentMessagesReadAdapter,
    private readonly createCommunicationMessageUseCase: CreateCommunicationMessageUseCase,
  ) {}

  async execute(params: {
    conversationId: string;
    body: SendStudentConversationMessageDto;
  }): Promise<StudentConversationMessageResponseDto> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();
    await assertConversationVisible({
      readAdapter: this.readAdapter,
      conversationId: params.conversationId,
      studentUserId: context.studentUserId,
    });

    const created = await this.createCommunicationMessageUseCase.execute(
      params.conversationId,
      {
        type: 'text',
        body: params.body.body,
      },
    );
    const message = await this.readAdapter.findMessageForStudent({
      conversationId: params.conversationId,
      messageId: created.id,
    });

    if (!message) {
      throw new NotFoundDomainException('Student App message not found', {
        conversationId: params.conversationId,
        messageId: created.id,
      });
    }

    return StudentMessagesPresenter.presentMessage({
      message,
      studentUserId: context.studentUserId,
    });
  }
}
