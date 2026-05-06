import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { MarkCommunicationConversationReadUseCase } from '../../../communication/application/communication-message.use-cases';
import { TeacherAppAccessService } from '../../access/teacher-app-access.service';
import { TeacherConversationReadResponseDto } from '../dto/teacher-messages.dto';
import { TeacherMessagesReadAdapter } from '../infrastructure/teacher-messages-read.adapter';
import { TeacherMessagesPresenter } from '../presenters/teacher-messages.presenter';

@Injectable()
export class MarkTeacherConversationReadUseCase {
  constructor(
    private readonly accessService: TeacherAppAccessService,
    private readonly messagesReadAdapter: TeacherMessagesReadAdapter,
    private readonly markCommunicationConversationReadUseCase: MarkCommunicationConversationReadUseCase,
  ) {}

  async execute(conversationId: string): Promise<TeacherConversationReadResponseDto> {
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

    const result =
      await this.markCommunicationConversationReadUseCase.execute(
        conversationId,
      );

    return TeacherMessagesPresenter.presentReadResult(result);
  }
}
