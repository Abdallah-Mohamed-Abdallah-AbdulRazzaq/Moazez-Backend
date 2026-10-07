import { HttpStatus, Injectable } from '@nestjs/common';
import type { File } from '@prisma/client';
import {
  DomainException,
  NotFoundDomainException,
} from '../../../../../common/exceptions/domain-exception';
import { StorageService } from '../../../../../infrastructure/storage/storage.service';
import { sanitizeOriginalName } from '../../../../files/uploads/domain/original-name';
import { resolveAcademicContentFileType } from '../domain/academic-content-file.registry';

export type AcademicContentAssetAccessMode = 'preview' | 'download';
type AuthorizedFile = Pick<
  File,
  'bucket' | 'objectKey' | 'originalName' | 'mimeType'
>;

/** Accepts only a File whose actor/resource relationship was already authorized. */
@Injectable()
export class AcademicContentAuthorizedFileSigner {
  constructor(private readonly storage: StorageService) {}

  async sign(
    file: AuthorizedFile,
    mode: AcademicContentAssetAccessMode,
    policy: { allowInlinePreview: boolean },
    visibleUntil: Date | null = null,
  ): Promise<{ url: string }> {
    if (
      mode === 'preview' &&
      (!policy.allowInlinePreview ||
        !resolveAcademicContentFileType(file.originalName, file.mimeType)
          ?.inlinePreviewSupported)
    )
      throw new DomainException({
        code: 'academic_content.file.preview_unavailable',
        message: 'Inline preview is unavailable',
        httpStatus: HttpStatus.FORBIDDEN,
      });

    const downloadFileName = sanitizeOriginalName(file.originalName);
    // Sample time after all authorization/policy work, immediately before signing.
    const expiresInSeconds = visibleUntil
      ? Math.min(300, Math.floor((visibleUntil.getTime() - Date.now()) / 1000))
      : 300;
    if (expiresInSeconds <= 0)
      throw new NotFoundDomainException('Academic asset not found');
    const capability = await this.storage.createDownloadUrl({
      bucket: file.bucket,
      objectKey: file.objectKey,
      expiresInSeconds,
      disposition: mode === 'preview' ? 'inline' : 'attachment',
      contentType: file.mimeType,
      downloadFileName,
    });
    return { url: capability.url };
  }
}
