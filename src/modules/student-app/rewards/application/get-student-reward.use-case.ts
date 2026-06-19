import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import { StudentRewardResponseDto } from '../dto/student-rewards.dto';
import { StudentRewardsReadAdapter } from '../infrastructure/student-rewards-read.adapter';
import { StudentRewardsPresenter } from '../presenters/student-rewards.presenter';

@Injectable()
export class GetStudentRewardUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly readAdapter: StudentRewardsReadAdapter,
  ) {}

  async execute(rewardId: string): Promise<StudentRewardResponseDto> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();
    const reward = await this.readAdapter.findReward({ context, rewardId });

    if (!reward) {
      throw new NotFoundDomainException('Student App reward not found', {
        rewardId,
      });
    }

    return StudentRewardsPresenter.presentRewardDetail(reward);
  }
}
