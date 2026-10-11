import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import {
  PrivateMediaContentService,
  type PrivateMediaContentRequest,
} from '../../../../infrastructure/storage/private-media-content.service';
import { AccessParentAcademicContentAssetUseCase } from './parent-academic-content.use-cases';
@Injectable()
export class GetParentAcademicContentAssetContentUseCase {
  constructor(
    private readonly resolver: AccessParentAcademicContentAssetUseCase,
    private readonly content: PrivateMediaContentService,
  ) {}
  execute(
    studentId: string,
    contentId: string,
    fileId: string,
    mode: 'preview' | 'download',
    request: PrivateMediaContentRequest = {},
  ) {
    return this.content.openAuthorized(
      async () => {
        const file = await this.resolver.resolveFile(
          studentId,
          contentId,
          fileId,
          mode,
        );
        return {
          bucket: file.bucket,
          objectKey: file.objectKey,
          originalName: file.originalName,
          mimeType: file.mimeType,
          sizeBytes: file.sizeBytes,
        };
      },
      () => new NotFoundDomainException('File not found'),
      { ...request, disposition: mode === 'preview' ? 'inline' : 'attachment' },
    );
  }
}
