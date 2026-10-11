import type { Request, Response } from 'express';
import { Req, Res } from '@nestjs/common';
import {
  privateMediaContentRequest,
  streamPrivateMediaContent,
} from '../../../../infrastructure/storage/private-media-content.response';
import { GetParentRewardImageContentUseCase } from '../application/get-parent-reward-image-content.use-case';
import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
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
    private readonly content: GetParentRewardImageContentUseCase,
    private readonly listParentChildRewardsUseCase: ListParentChildRewardsUseCase,
    private readonly getParentChildRewardUseCase: GetParentChildRewardUseCase,
    private readonly listParentChildRewardRedemptionsUseCase: ListParentChildRewardRedemptionsUseCase,
    private readonly getParentChildRewardRedemptionUseCase: GetParentChildRewardRedemptionUseCase,
  ) {}

  @Get()
  @ApiOkResponse({ type: ParentRewardsListResponseDto })
  @RequiredPermissions('reinforcement.rewards.view', 'reinforcement.xp.view')
  listRewards(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Query() query: ParentRewardsQueryDto,
  ): Promise<ParentRewardsListResponseDto> {
    return this.listParentChildRewardsUseCase.execute(studentId, query);
  }

  @Get('redemptions')
  @ApiOkResponse({ type: ParentRewardRedemptionsResponseDto })
  @RequiredPermissions('reinforcement.rewards.redemptions.view')
  listRedemptions(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
  ): Promise<ParentRewardRedemptionsResponseDto> {
    return this.listParentChildRewardRedemptionsUseCase.execute(studentId);
  }

  @Get('redemptions/:redemptionId')
  @ApiOkResponse({ type: ParentRewardRedemptionResponseDto })
  @RequiredPermissions('reinforcement.rewards.redemptions.view')
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
  @RequiredPermissions('reinforcement.rewards.view', 'reinforcement.xp.view')
  getReward(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Param('rewardId', new ParseUUIDPipe()) rewardId: string,
  ): Promise<ParentRewardResponseDto> {
    return this.getParentChildRewardUseCase.execute(studentId, rewardId);
  }
  @Get(':rewardId/images/:fileId/download/content')
  @RequiredPermissions('reinforcement.rewards.view', 'reinforcement.xp.view')
  async fileContent(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Param('rewardId', new ParseUUIDPipe()) rewardId: string,
    @Param('fileId', new ParseUUIDPipe()) fileId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const content = await this.content.execute(
      studentId,
      rewardId,
      fileId,
      privateMediaContentRequest(request, response, 'attachment'),
    );
    await streamPrivateMediaContent(content, response, 'attachment');
  }
  @Get('redemptions/:redemptionId/images/:fileId/download/content')
  @RequiredPermissions('reinforcement.rewards.redemptions.view')
  async redemptionImageContent(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Param('redemptionId', new ParseUUIDPipe()) redemptionId: string,
    @Param('fileId', new ParseUUIDPipe()) fileId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const content = await this.content.redemption(
      studentId,
      redemptionId,
      fileId,
      privateMediaContentRequest(request, response, 'attachment'),
    );
    await streamPrivateMediaContent(content, response, 'attachment');
  }
}
