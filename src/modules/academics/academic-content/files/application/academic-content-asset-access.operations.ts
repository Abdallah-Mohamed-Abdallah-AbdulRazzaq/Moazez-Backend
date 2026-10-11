import { Injectable } from '@nestjs/common';
import type { File } from '@prisma/client';
import {
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../../../common/exceptions/domain-exception';
import { AcademicContentRepository } from '../../infrastructure/academic-content.repository';
import { AcademicContentFileRepository } from '../infrastructure/academic-content-file.repository';
import { AcademicContentFilePolicyResolver } from './academic-content-file-policy.resolver';
import {
  assertAcademicContentFilePresentation,
  AcademicContentAssetAccessMode,
  AcademicContentAuthorizedFileSigner,
} from './academic-content-authorized-file.signer';
export type { AcademicContentAssetAccessMode } from './academic-content-authorized-file.signer';

type Reader = { schoolId: string; teacherUserId: string };

@Injectable()
export class AcademicContentAssetAccessOperations {
  constructor(
    private readonly contents: AcademicContentRepository,
    private readonly files: AcademicContentFileRepository,
    private readonly policy: AcademicContentFilePolicyResolver,
    private readonly signer: AcademicContentAuthorizedFileSigner,
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
    const resolved = await this.resolveCurrent(scope, contentId, assetId, mode);
    return this.signer.sign(resolved.file, mode, resolved.policy);
  }

  async resolveCurrent(
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
    return this.resolve(scope, file, mode);
  }

  async revision(
    scope: Reader,
    contentId: string,
    revisionId: string,
    fileId: string,
    mode: AcademicContentAssetAccessMode,
  ) {
    const resolved = await this.resolveRevision(
      scope,
      contentId,
      revisionId,
      fileId,
      mode,
    );
    return this.signer.sign(resolved.file, mode, resolved.policy);
  }

  async resolveRevision(
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
    return this.resolve(scope, file, mode);
  }

  private async resolve(
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
    const policy =
      mode === 'preview'
        ? await this.policy.resolve(scope.schoolId)
        : { allowInlinePreview: false };
    assertAcademicContentFilePresentation(file, mode, policy);
    return { file, policy };
  }
}
