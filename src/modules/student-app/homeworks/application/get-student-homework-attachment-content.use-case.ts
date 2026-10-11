import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import {
  PrivateMediaContentService,
  type PrivateMediaContent,
  type PrivateMediaContentRequest,
} from '../../../../infrastructure/storage/private-media-content.service';
import { GetStudentHomeworkAttachmentDownloadUrlUseCase } from './student-homeworks.use-cases';

@Injectable()
export class GetStudentHomeworkAttachmentContentUseCase {
  constructor(
    private readonly resolver: GetStudentHomeworkAttachmentDownloadUrlUseCase,
    private readonly contentService: PrivateMediaContentService,
  ) {}

  async execute(
    homeworkId: string,
    attachmentId: string,
    request: PrivateMediaContentRequest = {},
  ): Promise<PrivateMediaContent> {
    return this.contentService.openAuthorized(
      () => this.resolver.resolveFile(homeworkId, attachmentId),
      () =>
        new NotFoundDomainException(
          'Student App homework attachment not found',
        ),
      request,
    );
  }
}
