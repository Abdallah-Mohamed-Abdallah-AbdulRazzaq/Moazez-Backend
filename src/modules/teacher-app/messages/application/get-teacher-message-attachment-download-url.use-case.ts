import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import {
  CommunicationAttachmentAccessMode,
  GetCommunicationMessageAttachmentDownloadUrlUseCase,
} from '../../../communication/application/communication-message-attachment-download.use-case';
import { TeacherAppAccessService } from '../../access/teacher-app-access.service';
import { TeacherMessagesReadAdapter } from '../infrastructure/teacher-messages-read.adapter';

@Injectable()
export class GetTeacherMessageAttachmentDownloadUrlUseCase {
  constructor(
    private readonly accessService: TeacherAppAccessService,
    private readonly readAdapter: TeacherMessagesReadAdapter,
    private readonly getAttachmentDownloadUrlUseCase: GetCommunicationMessageAttachmentDownloadUrlUseCase,
  ) {}

  async execute(params: {
    conversationId: string;
    messageId: string;
    attachmentId: string;
    mode: CommunicationAttachmentAccessMode;
  }): Promise<string> {
    const context = this.accessService.assertCurrentTeacher();
    const conversation = await this.readAdapter.findConversationForTeacher({
      conversationId: params.conversationId,
      teacherUserId: context.teacherUserId,
    });

    if (!conversation) {
      throw new NotFoundDomainException(
        'Teacher message conversation not found',
        { conversationId: params.conversationId },
      );
    }

    const message = await this.readAdapter.findMessageForTeacher({
      conversationId: params.conversationId,
      messageId: params.messageId,
    });

    if (!message) {
      throw new NotFoundDomainException('Teacher message not found', {
        conversationId: params.conversationId,
        messageId: params.messageId,
      });
    }

    return this.getAttachmentDownloadUrlUseCase.execute(params);
  }
}
