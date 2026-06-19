import { Injectable } from '@nestjs/common';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import { StudentRewardRedemptionsResponseDto } from '../dto/student-rewards.dto';
import { StudentRewardsReadAdapter } from '../infrastructure/student-rewards-read.adapter';
import { StudentRewardsPresenter } from '../presenters/student-rewards.presenter';

@Injectable()
export class ListStudentRewardRedemptionsUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly readAdapter: StudentRewardsReadAdapter,
  ) {}

  async execute(): Promise<StudentRewardRedemptionsResponseDto> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();
    const result = await this.readAdapter.listRedemptions(context);

    return StudentRewardsPresenter.presentRedemptions(result);
  }
}
