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
  listRewards(
    @Query() query: StudentRewardsQueryDto,
  ): Promise<StudentRewardsListResponseDto> {
    return this.listStudentRewardsUseCase.execute(query);
  }

  @Get('redemptions')
  @ApiOkResponse({ type: StudentRewardRedemptionsResponseDto })
  listRedemptions(): Promise<StudentRewardRedemptionsResponseDto> {
    return this.listStudentRewardRedemptionsUseCase.execute();
  }

  @Get('redemptions/:redemptionId')
  @ApiOkResponse({ type: StudentRewardRedemptionResponseDto })
  getRedemption(
    @Param('redemptionId', new ParseUUIDPipe()) redemptionId: string,
  ): Promise<StudentRewardRedemptionResponseDto> {
    return this.getStudentRewardRedemptionUseCase.execute(redemptionId);
  }

  @Get(':rewardId')
  @ApiOkResponse({ type: StudentRewardResponseDto })
  getReward(
    @Param('rewardId', new ParseUUIDPipe()) rewardId: string,
  ): Promise<StudentRewardResponseDto> {
    return this.getStudentRewardUseCase.execute(rewardId);
  }

  @Post(':rewardId/redeem')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: StudentRewardRedemptionResponseDto })
  redeemReward(
    @Param('rewardId', new ParseUUIDPipe()) rewardId: string,
    @Body() dto: RedeemStudentRewardDto,
  ): Promise<StudentRewardRedemptionResponseDto> {
    return this.redeemStudentRewardUseCase.execute({ rewardId, dto });
  }
}
