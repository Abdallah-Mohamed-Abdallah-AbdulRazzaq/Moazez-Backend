import { HttpStatus, Injectable } from '@nestjs/common';
import type { File } from '@prisma/client';
import {
  DomainException,
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../../../common/exceptions/domain-exception';
import { StorageService } from '../../../../../infrastructure/storage/storage.service';
import { sanitizeOriginalName } from '../../../../files/uploads/domain/original-name';
import { AcademicContentRepository } from '../../infrastructure/academic-content.repository';
import { AcademicContentFileRepository } from '../infrastructure/academic-content-file.repository';
import { resolveAcademicContentFileType } from '../domain/academic-content-file.registry';
import { AcademicContentFilePolicyResolver } from './academic-content-file-policy.resolver';

type Reader = { schoolId: string; teacherUserId: string };
export type AcademicContentAssetAccessMode = 'preview' | 'download';

@Injectable()
export class AcademicContentAssetAccessOperations {
  constructor(
    private readonly contents: AcademicContentRepository,
    private readonly files: AcademicContentFileRepository,
    private readonly policy: AcademicContentFilePolicyResolver,
    private readonly storage: StorageService,
  ) {}

  private async authorizeParent(
    scope: Reader,
    contentId: string,
    mode: AcademicContentAssetAccessMode,
  ) {
    if (mode !== 'preview' && mode !== 'download')
      throw new ValidationDomainException('Invalid asset access mode');
    if (
      !(await this.contents.findAllocationReaderDetail(
        contentId,
        scope.schoolId,
        { teacherUserId: scope.teacherUserId },
      ))
    )
      throw new NotFoundDomainException('Academic content not found');
  }

  async current(
    scope: Reader,
    contentId: string,
    assetId: string,
    mode: AcademicContentAssetAccessMode,
  ) {
    await this.authorizeParent(scope, contentId, mode);
    const file = await this.files.findCurrentAssetFile({
      schoolId: scope.schoolId,
      contentId,
      assetId,
    });
    return this.sign(scope, file, mode);
  }

  async revision(
    scope: Reader,
    contentId: string,
    revisionId: string,
    fileId: string,
    mode: AcademicContentAssetAccessMode,
  ) {
    await this.authorizeParent(scope, contentId, mode);
    const file = await this.files.findRevisionAssetFile({
      schoolId: scope.schoolId,
      contentId,
      revisionId,
      fileId,
    });
    return this.sign(scope, file, mode);
  }

  private async sign(
    scope: Reader,
    file: File | null,
    mode: AcademicContentAssetAccessMode,
  ) {
    if (
      !file ||
      file.schoolId !== scope.schoolId ||
      file.deletedAt ||
      file.sizeBytes <= 0n
    )
      throw new NotFoundDomainException('Academic asset not found');
    if (mode === 'preview') {
      const policy = await this.policy.resolve(scope.schoolId);
      if (
        !policy.allowInlinePreview ||
        !resolveAcademicContentFileType(file.originalName, file.mimeType)
          ?.inlinePreviewSupported
      )
        throw new DomainException({
          code: 'academic_content.file.preview_unavailable',
          message: 'Inline preview is unavailable',
          httpStatus: HttpStatus.FORBIDDEN,
        });
    }
    // Authorization and exact resource/File resolution finish before signing.
    const capability = await this.storage.createDownloadUrl({
      bucket: file.bucket,
      objectKey: file.objectKey,
      expiresInSeconds: 300,
      disposition: mode === 'preview' ? 'inline' : 'attachment',
      contentType: file.mimeType,
      downloadFileName: sanitizeOriginalName(file.originalName),
    });
    return { url: capability.url };
  }
}
