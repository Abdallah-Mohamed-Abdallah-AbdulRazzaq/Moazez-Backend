import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import {
  GetRewardCatalogSummaryUseCase,
  GetRewardsOverviewUseCase,
  GetStudentRewardsSummaryUseCase,
} from '../application/reward-dashboard.use-cases';
import {
  GetRewardCatalogSummaryQueryDto,
  GetRewardsOverviewQueryDto,
  GetStudentRewardsSummaryQueryDto,
} from '../dto/reward-dashboard.dto';

@ApiTags('reinforcement-rewards')
@ApiBearerAuth()
@Controller('reinforcement/rewards')
export class RewardDashboardController {
  constructor(
    private readonly getRewardsOverviewUseCase: GetRewardsOverviewUseCase,
    private readonly getStudentRewardsSummaryUseCase: GetStudentRewardsSummaryUseCase,
    private readonly getRewardCatalogSummaryUseCase: GetRewardCatalogSummaryUseCase,
  ) {}

  @Get('overview')
  @RequiredPermissions('reinforcement.rewards.view')
  getOverview(@Query() query: GetRewardsOverviewQueryDto) {
    return this.getRewardsOverviewUseCase.execute(query);
  }

  @Get('students/:studentId/summary')
  @RequiredPermissions('reinforcement.rewards.redemptions.view')
  getStudentSummary(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Query() query: GetStudentRewardsSummaryQueryDto,
  ) {
    return this.getStudentRewardsSummaryUseCase.execute(studentId, query);
  }

  @Get('catalog-summary')
  @RequiredPermissions('reinforcement.rewards.view')
  getCatalogSummary(@Query() query: GetRewardCatalogSummaryQueryDto) {
    return this.getRewardCatalogSummaryUseCase.execute(query);
  }
}
