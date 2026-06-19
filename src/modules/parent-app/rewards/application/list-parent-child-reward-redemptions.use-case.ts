import { Injectable } from '@nestjs/common';
import { ParentAppAccessService } from '../../access/parent-app-access.service';
import { ParentRewardRedemptionsResponseDto } from '../dto/parent-rewards.dto';
import { ParentRewardsReadAdapter } from '../infrastructure/parent-rewards-read.adapter';
import { ParentRewardsPresenter } from '../presenters/parent-rewards.presenter';

@Injectable()
export class ListParentChildRewardRedemptionsUseCase {
  constructor(
    private readonly accessService: ParentAppAccessService,
    private readonly readAdapter: ParentRewardsReadAdapter,
  ) {}

  async execute(
    studentId: string,
  ): Promise<ParentRewardRedemptionsResponseDto> {
    const child = await this.accessService.assertParentOwnsStudent(studentId);
    const result = await this.readAdapter.listRedemptions(child);

    return ParentRewardsPresenter.presentRedemptions(result);
  }
}
