import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { ParentAppAccessService } from '../../access/parent-app-access.service';
import { ParentRewardResponseDto } from '../dto/parent-rewards.dto';
import { ParentRewardsReadAdapter } from '../infrastructure/parent-rewards-read.adapter';
import { ParentRewardsPresenter } from '../presenters/parent-rewards.presenter';

@Injectable()
export class GetParentChildRewardUseCase {
  constructor(
    private readonly accessService: ParentAppAccessService,
    private readonly readAdapter: ParentRewardsReadAdapter,
  ) {}

  async execute(
    studentId: string,
    rewardId: string,
  ): Promise<ParentRewardResponseDto> {
    const child = await this.accessService.assertParentOwnsStudent(studentId);
    const reward = await this.readAdapter.findReward({ child, rewardId });

    if (!reward) {
      throw new NotFoundDomainException('Parent App reward not found', {
        studentId,
        rewardId,
      });
    }

    return ParentRewardsPresenter.presentRewardDetail(reward);
  }
}
