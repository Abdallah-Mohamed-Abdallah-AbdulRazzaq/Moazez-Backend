import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import {
  PrivateMediaContentService,
  type PrivateMediaContentRequest,
} from '../../../../infrastructure/storage/private-media-content.service';
import { GetFileDownloadUrlUseCase } from './get-file-download-url.use-case';
@Injectable()
export class GetFileContentUseCase {
  constructor(
    private readonly resolver: GetFileDownloadUrlUseCase,
    private readonly content: PrivateMediaContentService,
  ) {}
  execute(fileId: string, request: PrivateMediaContentRequest = {}) {
    return this.content.openAuthorized(
      async () => {
        const file = await this.resolver.resolveFile(fileId);
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
