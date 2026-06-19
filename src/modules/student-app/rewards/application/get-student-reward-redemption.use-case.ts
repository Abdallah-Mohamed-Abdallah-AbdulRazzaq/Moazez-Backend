import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import { StudentRewardRedemptionResponseDto } from '../dto/student-rewards.dto';
import { StudentRewardsReadAdapter } from '../infrastructure/student-rewards-read.adapter';
import { StudentRewardsPresenter } from '../presenters/student-rewards.presenter';

@Injectable()
export class GetStudentRewardRedemptionUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly readAdapter: StudentRewardsReadAdapter,
  ) {}

  async execute(redemptionId: string): Promise<StudentRewardRedemptionResponseDto> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();
    const redemption = await this.readAdapter.findRedemption({
      context,
      redemptionId,
    });

    if (!redemption) {
      throw new NotFoundDomainException('Student App reward redemption not found', {
        redemptionId,
      });
    }

    return StudentRewardsPresenter.presentRedemption(redemption);
  }
}
