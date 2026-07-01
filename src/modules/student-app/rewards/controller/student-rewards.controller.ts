import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { GetStudentRewardRedemptionUseCase } from '../application/get-student-reward-redemption.use-case';
import { GetStudentRewardUseCase } from '../application/get-student-reward.use-case';
import { ListStudentRewardRedemptionsUseCase } from '../application/list-student-reward-redemptions.use-case';
import { ListStudentRewardsUseCase } from '../application/list-student-rewards.use-case';
import { RedeemStudentRewardUseCase } from '../application/redeem-student-reward.use-case';
import {
  RedeemStudentRewardDto,
  StudentRewardRedemptionResponseDto,
  StudentRewardRedemptionsResponseDto,
  StudentRewardResponseDto,
  StudentRewardsListResponseDto,
  StudentRewardsQueryDto,
} from '../dto/student-rewards.dto';

@ApiTags('student-app')
@ApiBearerAuth()
@Controller('student/rewards')
export class StudentRewardsController {
  constructor(
    private readonly listStudentRewardsUseCase: ListStudentRewardsUseCase,
    private readonly getStudentRewardUseCase: GetStudentRewardUseCase,
    private readonly listStudentRewardRedemptionsUseCase: ListStudentRewardRedemptionsUseCase,
    private readonly getStudentRewardRedemptionUseCase: GetStudentRewardRedemptionUseCase,
    private readonly redeemStudentRewardUseCase: RedeemStudentRewardUseCase,
  ) {}

  @Get()
  @ApiOkResponse({ type: StudentRewardsListResponseDto })
  @RequiredPermissions('reinforcement.rewards.view')
  listRewards(
    @Query() query: StudentRewardsQueryDto,
  ): Promise<StudentRewardsListResponseDto> {
    return this.listStudentRewardsUseCase.execute(query);
  }

  @Get('redemptions')
  @ApiOkResponse({ type: StudentRewardRedemptionsResponseDto })
  @RequiredPermissions('reinforcement.rewards.redemptions.view')
  listRedemptions(): Promise<StudentRewardRedemptionsResponseDto> {
    return this.listStudentRewardRedemptionsUseCase.execute();
  }

  @Get('redemptions/:redemptionId')
  @ApiOkResponse({ type: StudentRewardRedemptionResponseDto })
  @RequiredPermissions('reinforcement.rewards.redemptions.view')
  getRedemption(
    @Param('redemptionId', new ParseUUIDPipe()) redemptionId: string,
  ): Promise<StudentRewardRedemptionResponseDto> {
    return this.getStudentRewardRedemptionUseCase.execute(redemptionId);
  }

  @Get(':rewardId')
  @ApiOkResponse({ type: StudentRewardResponseDto })
  @RequiredPermissions('reinforcement.rewards.view')
  getReward(
    @Param('rewardId', new ParseUUIDPipe()) rewardId: string,
  ): Promise<StudentRewardResponseDto> {
    return this.getStudentRewardUseCase.execute(rewardId);
  }

  @Post(':rewardId/redeem')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: StudentRewardRedemptionResponseDto })
  @RequiredPermissions('reinforcement.rewards.redemptions.request')
  redeemReward(
    @Param('rewardId', new ParseUUIDPipe()) rewardId: string,
    @Body() dto: RedeemStudentRewardDto,
  ): Promise<StudentRewardRedemptionResponseDto> {
    return this.redeemStudentRewardUseCase.execute({ rewardId, dto });
  }
}
