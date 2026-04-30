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
  ApproveRewardRedemptionUseCase,
  CancelRewardRedemptionUseCase,
  CreateRewardRedemptionUseCase,
  FulfillRewardRedemptionUseCase,
  GetRewardRedemptionUseCase,
  ListRewardRedemptionsUseCase,
  RejectRewardRedemptionUseCase,
} from '../application/reward-redemptions.use-cases';
import {
  ApproveRewardRedemptionDto,
  CancelRewardRedemptionDto,
  CreateRewardRedemptionDto,
  FulfillRewardRedemptionDto,
  ListRewardRedemptionsQueryDto,
  RejectRewardRedemptionDto,
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
    private readonly approveRewardRedemptionUseCase: ApproveRewardRedemptionUseCase,
    private readonly rejectRewardRedemptionUseCase: RejectRewardRedemptionUseCase,
    private readonly fulfillRewardRedemptionUseCase: FulfillRewardRedemptionUseCase,
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

  @Post('redemptions/:redemptionId/approve')
  @RequiredPermissions('reinforcement.rewards.redemptions.review')
  approveRedemption(
    @Param('redemptionId', new ParseUUIDPipe()) redemptionId: string,
    @Body() dto: ApproveRewardRedemptionDto,
  ) {
    return this.approveRewardRedemptionUseCase.execute(redemptionId, dto ?? {});
  }

  @Post('redemptions/:redemptionId/reject')
  @RequiredPermissions('reinforcement.rewards.redemptions.review')
  rejectRedemption(
    @Param('redemptionId', new ParseUUIDPipe()) redemptionId: string,
    @Body() dto: RejectRewardRedemptionDto,
  ) {
    return this.rejectRewardRedemptionUseCase.execute(redemptionId, dto ?? {});
  }

  @Post('redemptions/:redemptionId/fulfill')
  @RequiredPermissions('reinforcement.rewards.fulfill')
  fulfillRedemption(
    @Param('redemptionId', new ParseUUIDPipe()) redemptionId: string,
    @Body() dto: FulfillRewardRedemptionDto,
  ) {
    return this.fulfillRewardRedemptionUseCase.execute(redemptionId, dto ?? {});
  }
}
