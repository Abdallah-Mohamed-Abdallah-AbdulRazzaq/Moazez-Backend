import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import {
  CommunicationAttachmentAccessMode,
  GetCommunicationMessageAttachmentDownloadUrlUseCase,
} from '../../../communication/application/communication-message-attachment-download.use-case';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import { StudentMessagesReadAdapter } from '../infrastructure/student-messages-read.adapter';
import { assertConversationVisible } from './list-student-conversation-messages.use-case';

@Injectable()
export class GetStudentMessageAttachmentDownloadUrlUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly readAdapter: StudentMessagesReadAdapter,
    private readonly getAttachmentDownloadUrlUseCase: GetCommunicationMessageAttachmentDownloadUrlUseCase,
  ) {}

  async execute(params: {
    conversationId: string;
    messageId: string;
    attachmentId: string;
    mode: CommunicationAttachmentAccessMode;
  }): Promise<string> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();
    await assertConversationVisible({
      readAdapter: this.readAdapter,
      conversationId: params.conversationId,
      studentUserId: context.studentUserId,
    });

    const message = await this.readAdapter.findMessageForStudent({
      conversationId: params.conversationId,
      messageId: params.messageId,
    });

    if (!message) {
      throw new NotFoundDomainException('Student App message not found', {
        conversationId: params.conversationId,
        messageId: params.messageId,
      });
    }

    return this.getAttachmentDownloadUrlUseCase.execute(params);
  }
}
