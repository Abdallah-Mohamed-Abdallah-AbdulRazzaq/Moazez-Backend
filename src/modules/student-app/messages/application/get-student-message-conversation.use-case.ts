import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import { StudentMessageConversationResponseDto } from '../dto/student-messages.dto';
import { StudentMessagesReadAdapter } from '../infrastructure/student-messages-read.adapter';
import { StudentMessagesPresenter } from '../presenters/student-messages.presenter';

@Injectable()
export class GetStudentMessageConversationUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly readAdapter: StudentMessagesReadAdapter,
  ) {}

  async execute(
    conversationId: string,
  ): Promise<StudentMessageConversationResponseDto> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();
    const conversation =
      await this.readAdapter.findConversationForStudent({
        conversationId,
        studentUserId: context.studentUserId,
      });

    if (!conversation) {
      throw new NotFoundDomainException(
        'Student App conversation not found',
        { conversationId },
      );
    }

    const unreadCount =
      await this.readAdapter.countUnreadMessagesForConversation({
        conversationId,
        studentUserId: context.studentUserId,
      });

    return StudentMessagesPresenter.presentConversation({
      conversation,
      studentUserId: context.studentUserId,
      unreadCount,
    });
  }
}
