import { Injectable } from '@nestjs/common';
import { MarkCommunicationConversationReadUseCase } from '../../../communication/application/communication-message.use-cases';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import { StudentConversationReadResponseDto } from '../dto/student-messages.dto';
import { StudentMessagesReadAdapter } from '../infrastructure/student-messages-read.adapter';
import { StudentMessagesPresenter } from '../presenters/student-messages.presenter';
import { assertConversationVisible } from './list-student-conversation-messages.use-case';

@Injectable()
export class MarkStudentConversationReadUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly readAdapter: StudentMessagesReadAdapter,
    private readonly markCommunicationConversationReadUseCase: MarkCommunicationConversationReadUseCase,
  ) {}

  async execute(conversationId: string): Promise<StudentConversationReadResponseDto> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();
    await assertConversationVisible({
      readAdapter: this.readAdapter,
      conversationId,
      studentUserId: context.studentUserId,
    });

    const result =
      await this.markCommunicationConversationReadUseCase.execute(conversationId);

    return StudentMessagesPresenter.presentReadResult(result);
  }
}
