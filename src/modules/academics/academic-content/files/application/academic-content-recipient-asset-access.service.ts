import { HttpStatus, Injectable } from '@nestjs/common';
import {
  DomainException,
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../../../common/exceptions/domain-exception';
import { AcademicContentCurrentRecipientContext } from '../../domain/academic-content-current-access.policy';
import { AcademicContentRecipientReadRepository } from '../../infrastructure/academic-content-recipient-read.repository';
import {
  assertAcademicContentFilePresentation,
  AcademicContentAssetAccessMode,
  AcademicContentAuthorizedFileSigner,
} from './academic-content-authorized-file.signer';
import { AcademicContentFilePolicyResolver } from './academic-content-file-policy.resolver';

@Injectable()
export class AcademicContentRecipientAssetAccessService {
  constructor(
    private readonly reads: AcademicContentRecipientReadRepository,
    private readonly policy: AcademicContentFilePolicyResolver,
    private readonly signer: AcademicContentAuthorizedFileSigner,
  ) {}

  async access(
    context: AcademicContentCurrentRecipientContext,
    contentId: string,
    fileId: string,
    mode: AcademicContentAssetAccessMode,
  ): Promise<{ url: string }> {
    const { file, policy } = await this.resolve(
      context,
      contentId,
      fileId,
      mode,
    );
    return this.signer.sign(file, mode, policy, file.visibleUntil);
  }

  async resolve(
    context: AcademicContentCurrentRecipientContext,
    contentId: string,
    fileId: string,
    mode: AcademicContentAssetAccessMode,
  ) {
    if (mode !== 'preview' && mode !== 'download')
      throw new ValidationDomainException('Invalid asset access mode');
    const asset = await this.reads.findCurrentRecipientAsset(
      context,
      contentId,
      fileId,
      new Date(),
    );
    if (!asset) throw new NotFoundDomainException('Academic asset not found');
    const policy = await this.policy.resolve(context.schoolId);
    if (
      mode === 'download' &&
      !(context.actorKind === 'STUDENT'
        ? policy.allowStudentDownload
        : policy.allowGuardianDownload)
    )
      throw new DomainException({
        code: 'academic_content.file.download_unavailable',
        message: 'Recipient download is unavailable',
        httpStatus: HttpStatus.FORBIDDEN,
      });
    assertAcademicContentFilePresentation(
      asset,
      mode,
      policy,
      asset.visibleUntil,
    );
    return { file: asset, policy };
  }
}
