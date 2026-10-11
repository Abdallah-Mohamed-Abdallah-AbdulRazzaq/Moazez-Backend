import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import {
  PrivateMediaContentService,
  type PrivateMediaContentRequest,
} from '../../../../infrastructure/storage/private-media-content.service';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import { StudentRewardsReadAdapter } from '../infrastructure/student-rewards-read.adapter';
@Injectable()
export class GetStudentRewardImageContentUseCase {
  constructor(
    private readonly access: StudentAppAccessService,
    private readonly reads: StudentRewardsReadAdapter,
    private readonly content: PrivateMediaContentService,
  ) {}
  execute(
    rewardId: string,
    fileId: string,
    request: PrivateMediaContentRequest = {},
  ) {
    return this.content.openAuthorized(
      async () => {
        const { context } = await this.access.getCurrentStudentWithEnrollment();
        const file = await this.reads.findAuthorizedImage(
          context,
          rewardId,
          fileId,
        );
        if (!file) throw new NotFoundDomainException('Reward image not found');
        return file;
      },
      () => new NotFoundDomainException('Reward image not found'),
      request,
    );
  }
  redemption(
    redemptionId: string,
    fileId: string,
    request: PrivateMediaContentRequest = {},
  ) {
    return this.content.openAuthorized(
      async () => {
        const { context } = await this.access.getCurrentStudentWithEnrollment();
        const file = await this.reads.findAuthorizedRedemptionImage(
          context,
          redemptionId,
          fileId,
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
