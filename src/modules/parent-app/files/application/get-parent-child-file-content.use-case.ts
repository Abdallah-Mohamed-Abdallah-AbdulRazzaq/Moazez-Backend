import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import {
  PrivateMediaContentService,
  type PrivateMediaContentRequest,
} from '../../../../infrastructure/storage/private-media-content.service';
import { GetParentChildFileDownloadUrlUseCase } from './get-parent-child-file-download-url.use-case';
@Injectable()
export class GetParentChildFileContentUseCase {
  constructor(
    private readonly resolver: GetParentChildFileDownloadUrlUseCase,
    private readonly content: PrivateMediaContentService,
  ) {}
  execute(
    params: { studentId: string; fileId: string },
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
      request,
    );
  }
}
