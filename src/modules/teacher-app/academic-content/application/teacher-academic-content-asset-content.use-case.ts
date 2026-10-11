import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import {
  PrivateMediaContentService,
  type PrivateMediaContentRequest,
  type PrivateMediaFileDescriptor,
} from '../../../../infrastructure/storage/private-media-content.service';
import { TeacherAcademicContentFilesUseCases } from './teacher-academic-content-files.use-cases';
@Injectable()
export class GetTeacherAcademicContentAssetContentUseCase {
  constructor(
    private readonly resolver: TeacherAcademicContentFilesUseCases,
    private readonly content: PrivateMediaContentService,
  ) {}
  current(
    contentId: string,
    assetId: string,
    mode: 'preview' | 'download',
    request: PrivateMediaContentRequest = {},
  ) {
    return this.open(
      () => this.resolver.resolveCurrentFile(contentId, assetId, mode),
      { ...request, disposition: mode === 'preview' ? 'inline' : 'attachment' },
    );
  }
  revision(
    contentId: string,
    revisionId: string,
    fileId: string,
    mode: 'preview' | 'download',
    request: PrivateMediaContentRequest = {},
  ) {
    return this.open(
      () =>
        this.resolver.resolveRevisionFile(contentId, revisionId, fileId, mode),
      { ...request, disposition: mode === 'preview' ? 'inline' : 'attachment' },
    );
  }
  private open(
    resolve: () => Promise<PrivateMediaFileDescriptor>,
    request: PrivateMediaContentRequest,
  ) {
    return this.content.openAuthorized(
      async () => {
        const file = await resolve();
        return {
          bucket: file.bucket,
          objectKey: file.objectKey,
          originalName: file.originalName,
          mimeType: file.mimeType,
          sizeBytes: file.sizeBytes,
        };
      },
      () => new NotFoundDomainException('Academic asset not found'),
      request,
    );
  }
}
