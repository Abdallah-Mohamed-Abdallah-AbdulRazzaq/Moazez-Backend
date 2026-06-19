import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { ParentAppAccessService } from '../../access/parent-app-access.service';
import { ParentRewardRedemptionResponseDto } from '../dto/parent-rewards.dto';
import { ParentRewardsReadAdapter } from '../infrastructure/parent-rewards-read.adapter';
import { ParentRewardsPresenter } from '../presenters/parent-rewards.presenter';

@Injectable()
export class GetParentChildRewardRedemptionUseCase {
  constructor(
    private readonly accessService: ParentAppAccessService,
    private readonly readAdapter: ParentRewardsReadAdapter,
  ) {}

  async execute(
    studentId: string,
    redemptionId: string,
  ): Promise<ParentRewardRedemptionResponseDto> {
    const child = await this.accessService.assertParentOwnsStudent(studentId);
    const redemption = await this.readAdapter.findRedemption({
      child,
      redemptionId,
    });

    if (!redemption) {
      throw new NotFoundDomainException(
        'Parent App reward redemption not found',
        {
          studentId,
          redemptionId,
        },
      );
    }

    return ParentRewardsPresenter.presentRedemption(redemption);
  }
}
