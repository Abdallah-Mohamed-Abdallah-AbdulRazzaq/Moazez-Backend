import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import {
  CancelRewardRedemptionUseCase,
  CreateRewardRedemptionUseCase,
  GetRewardRedemptionUseCase,
  ListRewardRedemptionsUseCase,
} from '../application/reward-redemptions.use-cases';
import {
  CancelRewardRedemptionDto,
  CreateRewardRedemptionDto,
  ListRewardRedemptionsQueryDto,
} from '../dto/reward-redemptions.dto';

@ApiTags('reinforcement-rewards')
@ApiBearerAuth()
@Controller('reinforcement/rewards')
export class RewardRedemptionsController {
  constructor(
    private readonly listRewardRedemptionsUseCase: ListRewardRedemptionsUseCase,
    private readonly getRewardRedemptionUseCase: GetRewardRedemptionUseCase,
    private readonly createRewardRedemptionUseCase: CreateRewardRedemptionUseCase,
    private readonly cancelRewardRedemptionUseCase: CancelRewardRedemptionUseCase,
  ) {}

  @Get('redemptions')
  @RequiredPermissions('reinforcement.rewards.redemptions.view')
  listRedemptions(@Query() query: ListRewardRedemptionsQueryDto) {
    return this.listRewardRedemptionsUseCase.execute(query);
  }

  @Get('redemptions/:redemptionId')
  @RequiredPermissions('reinforcement.rewards.redemptions.view')
  getRedemption(
    @Param('redemptionId', new ParseUUIDPipe()) redemptionId: string,
  ) {
    return this.getRewardRedemptionUseCase.execute(redemptionId);
  }

  @Post('redemptions')
  @RequiredPermissions('reinforcement.rewards.redemptions.request')
  createRedemption(@Body() dto: CreateRewardRedemptionDto) {
    return this.createRewardRedemptionUseCase.execute(dto);
  }

  @Post('redemptions/:redemptionId/cancel')
  @RequiredPermissions('reinforcement.rewards.redemptions.request')
  cancelRedemption(
    @Param('redemptionId', new ParseUUIDPipe()) redemptionId: string,
    @Body() dto: CancelRewardRedemptionDto,
  ) {
    return this.cancelRewardRedemptionUseCase.execute(redemptionId, dto ?? {});
  }
}
