import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import {
  PrivateMediaContentService,
  type PrivateMediaContent,
} from '../../../../infrastructure/storage/private-media-content.service';
import type { CommunicationAttachmentAccessMode } from '../../../communication/application/communication-message-attachment-download.use-case';
import { GetStudentMessageAttachmentDownloadUrlUseCase } from './get-student-message-attachment-download-url.use-case';

@Injectable()
export class GetStudentMessageAttachmentContentUseCase {
  constructor(
    private readonly resolver: GetStudentMessageAttachmentDownloadUrlUseCase,
    private readonly contentService: PrivateMediaContentService,
  ) {}

  async execute(params: {
    conversationId: string;
    messageId: string;
    attachmentId: string;
    mode: CommunicationAttachmentAccessMode;
  }): Promise<PrivateMediaContent> {
    const file = await this.resolver.resolveFile(params);
    return this.contentService.open(
      file,
      () =>
        new NotFoundDomainException('Student App message attachment not found'),
    );
  }
}
