import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import {
  PrivateMediaContentService,
  type PrivateMediaContentRequest,
} from '../../../../infrastructure/storage/private-media-content.service';
import { ParentAppAccessService } from '../../access/parent-app-access.service';
import { ParentRewardsReadAdapter } from '../infrastructure/parent-rewards-read.adapter';
@Injectable()
export class GetParentRewardImageContentUseCase {
  constructor(
    private readonly access: ParentAppAccessService,
    private readonly reads: ParentRewardsReadAdapter,
    private readonly content: PrivateMediaContentService,
  ) {}
  execute(
    studentId: string,
    rewardId: string,
    fileId: string,
    request: PrivateMediaContentRequest = {},
  ) {
    return this.content.openAuthorized(
      async () => {
        const { child, context } =
          await this.access.getOwnedStudentContext(studentId);
        const file = await this.reads.findAuthorizedImage(
          child,
          rewardId,
          fileId,
          context.schoolId,
        );
        if (!file) throw new NotFoundDomainException('Reward image not found');
        return file;
      },
      () => new NotFoundDomainException('Reward image not found'),
      request,
    );
  }
  redemption(
    studentId: string,
    redemptionId: string,
    fileId: string,
    request: PrivateMediaContentRequest = {},
  ) {
    return this.content.openAuthorized(
      async () => {
        const { child, context } =
          await this.access.getOwnedStudentContext(studentId);
        const file = await this.reads.findAuthorizedRedemptionImage(
          child,
          redemptionId,
          fileId,
          context.schoolId,
        );
        if (!file)
          throw new NotFoundDomainException('Redemption image not found');
        return file;
      },
      () => new NotFoundDomainException('Redemption image not found'),
      request,
    );
  }
}
