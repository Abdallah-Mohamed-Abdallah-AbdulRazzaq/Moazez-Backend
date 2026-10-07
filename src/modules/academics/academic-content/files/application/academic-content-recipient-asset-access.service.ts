import { HttpStatus, Injectable } from '@nestjs/common';
import {
  DomainException,
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../../../common/exceptions/domain-exception';
import { AcademicContentCurrentRecipientContext } from '../../domain/academic-content-current-access.policy';
import { AcademicContentRecipientReadRepository } from '../../infrastructure/academic-content-recipient-read.repository';
import {
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
    return this.signer.sign(asset, mode, policy, asset.visibleUntil);
  }
}
