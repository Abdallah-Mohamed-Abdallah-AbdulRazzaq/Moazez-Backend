import { Injectable } from '@nestjs/common';
import { ParentAppAccessService } from '../../access/parent-app-access.service';
import {
  ParentRewardsListResponseDto,
  ParentRewardsQueryDto,
} from '../dto/parent-rewards.dto';
import { ParentRewardsReadAdapter } from '../infrastructure/parent-rewards-read.adapter';
import { ParentRewardsPresenter } from '../presenters/parent-rewards.presenter';

@Injectable()
export class ListParentChildRewardsUseCase {
  constructor(
    private readonly accessService: ParentAppAccessService,
    private readonly readAdapter: ParentRewardsReadAdapter,
  ) {}

  async execute(
    studentId: string,
    query?: ParentRewardsQueryDto,
  ): Promise<ParentRewardsListResponseDto> {
    const child = await this.accessService.assertParentOwnsStudent(studentId);
    const result = await this.readAdapter.listRewards(child, query);

    return ParentRewardsPresenter.presentRewardsList(result);
  }
}
