import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import {
  PrivateMediaContentService,
  type PrivateMediaContentRequest,
} from '../../../../infrastructure/storage/private-media-content.service';
import { GetTeacherMessageAttachmentDownloadUrlUseCase } from './get-teacher-message-attachment-download-url.use-case';
@Injectable()
export class GetTeacherMessageAttachmentContentUseCase {
  constructor(
    private readonly resolver: GetTeacherMessageAttachmentDownloadUrlUseCase,
    private readonly content: PrivateMediaContentService,
  ) {}
  execute(
    params: {
      conversationId: string;
      messageId: string;
      attachmentId: string;
      mode: 'download' | 'preview';
    },
    request: PrivateMediaContentRequest = {},
  ) {
    return this.content.openAuthorized(
      async () => {
        const file = await this.resolver.resolveFile(params);
        return {
          bucket: file.bucket,
          objectKey: file.objectKey,
          originalName: file.originalName,
          mimeType: file.mimeType,
          sizeBytes: file.sizeBytes,
        };
      },
      () => new NotFoundDomainException('File not found'),
      {
        ...request,
        disposition: params.mode === 'preview' ? 'inline' : 'attachment',
      },
    );
  }
}
