import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { GetParentChildRewardRedemptionUseCase } from '../application/get-parent-child-reward-redemption.use-case';
import { GetParentChildRewardUseCase } from '../application/get-parent-child-reward.use-case';
import { ListParentChildRewardRedemptionsUseCase } from '../application/list-parent-child-reward-redemptions.use-case';
import { ListParentChildRewardsUseCase } from '../application/list-parent-child-rewards.use-case';
import {
  ParentRewardRedemptionResponseDto,
  ParentRewardRedemptionsResponseDto,
  ParentRewardResponseDto,
  ParentRewardsListResponseDto,
  ParentRewardsQueryDto,
} from '../dto/parent-rewards.dto';

@ApiTags('parent-app')
@ApiBearerAuth()
@Controller('parent/children/:studentId/rewards')
export class ParentRewardsController {
  constructor(
    private readonly listParentChildRewardsUseCase: ListParentChildRewardsUseCase,
    private readonly getParentChildRewardUseCase: GetParentChildRewardUseCase,
    private readonly listParentChildRewardRedemptionsUseCase: ListParentChildRewardRedemptionsUseCase,
    private readonly getParentChildRewardRedemptionUseCase: GetParentChildRewardRedemptionUseCase,
  ) {}

  @Get()
  @ApiOkResponse({ type: ParentRewardsListResponseDto })
  listRewards(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Query() query: ParentRewardsQueryDto,
  ): Promise<ParentRewardsListResponseDto> {
    return this.listParentChildRewardsUseCase.execute(studentId, query);
  }

  @Get('redemptions')
  @ApiOkResponse({ type: ParentRewardRedemptionsResponseDto })
  listRedemptions(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
  ): Promise<ParentRewardRedemptionsResponseDto> {
    return this.listParentChildRewardRedemptionsUseCase.execute(studentId);
  }

  @Get('redemptions/:redemptionId')
  @ApiOkResponse({ type: ParentRewardRedemptionResponseDto })
  getRedemption(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Param('redemptionId', new ParseUUIDPipe()) redemptionId: string,
  ): Promise<ParentRewardRedemptionResponseDto> {
    return this.getParentChildRewardRedemptionUseCase.execute(
      studentId,
      redemptionId,
    );
  }

  @Get(':rewardId')
  @ApiOkResponse({ type: ParentRewardResponseDto })
  getReward(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Param('rewardId', new ParseUUIDPipe()) rewardId: string,
  ): Promise<ParentRewardResponseDto> {
    return this.getParentChildRewardUseCase.execute(studentId, rewardId);
  }
}
