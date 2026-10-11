import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../common/exceptions/domain-exception';
import {
  PrivateMediaContentService,
  type PrivateMediaContentRequest,
} from '../../../infrastructure/storage/private-media-content.service';
import { GetApplicantDocumentDownloadUrlUseCase } from './get-applicant-document-download-url.use-case';
@Injectable()
export class GetApplicantDocumentContentUseCase {
  constructor(
    private readonly resolver: GetApplicantDocumentDownloadUrlUseCase,
    private readonly content: PrivateMediaContentService,
  ) {}
  async execute(
    params: {
      requestId: string;
      documentId: string;
      ipAddress?: string | null;
      userAgent?: string | null;
    },
    request: PrivateMediaContentRequest = {},
  ) {
    let authorized!: Awaited<
      ReturnType<GetApplicantDocumentDownloadUrlUseCase['resolveFile']>
    >;
    const content = await this.content.openAuthorized(
      async () => {
        authorized = await this.resolver.resolveFile(params);
        const file = authorized.document.file;
        return {
          bucket: file.bucket,
          objectKey: file.objectKey,
          originalName: file.originalName,
          mimeType: file.mimeType,
          sizeBytes: file.sizeBytes,
        };
      },
      () => new NotFoundDomainException('Applicant document not found'),
      request,
    );
    try {
      if (!request.head && content.statusCode !== 416)
        await this.resolver.recordDownload(
          authorized,
          params,
          'content_opened',
        );
      return content;
    } catch (error) {
      content.stream.destroy();
      throw error;
    }
  }
}
