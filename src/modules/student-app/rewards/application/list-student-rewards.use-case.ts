import { Injectable } from '@nestjs/common';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import {
  StudentRewardsListResponseDto,
  StudentRewardsQueryDto,
} from '../dto/student-rewards.dto';
import { StudentRewardsReadAdapter } from '../infrastructure/student-rewards-read.adapter';
import { StudentRewardsPresenter } from '../presenters/student-rewards.presenter';

@Injectable()
export class ListStudentRewardsUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly readAdapter: StudentRewardsReadAdapter,
  ) {}

  async execute(
    query: StudentRewardsQueryDto,
  ): Promise<StudentRewardsListResponseDto> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();
    const result = await this.readAdapter.listRewards(context, query);

    return StudentRewardsPresenter.presentRewardsList(result);
  }
}
