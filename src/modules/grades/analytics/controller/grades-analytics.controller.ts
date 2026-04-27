import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { GetGradesAnalyticsDistributionUseCase } from '../application/get-grades-analytics-distribution.use-case';
import { GetGradesAnalyticsSummaryUseCase } from '../application/get-grades-analytics-summary.use-case';
import {
  GetGradesAnalyticsQueryDto,
  GetGradesDistributionQueryDto,
  GradesAnalyticsSummaryResponseDto,
  GradesDistributionResponseDto,
} from '../dto/grades-analytics-query.dto';

@ApiTags('grades-analytics')
@ApiBearerAuth()
@Controller('grades/analytics')
export class GradesAnalyticsController {
  constructor(
    private readonly getGradesAnalyticsSummaryUseCase: GetGradesAnalyticsSummaryUseCase,
    private readonly getGradesAnalyticsDistributionUseCase: GetGradesAnalyticsDistributionUseCase,
  ) {}

  @Get('summary')
  @RequiredPermissions('grades.analytics.view')
  getSummary(
    @Query() query: GetGradesAnalyticsQueryDto,
  ): Promise<GradesAnalyticsSummaryResponseDto> {
    return this.getGradesAnalyticsSummaryUseCase.execute(query);
  }

  @Get('distribution')
  @RequiredPermissions('grades.analytics.view')
  getDistribution(
    @Query() query: GetGradesDistributionQueryDto,
  ): Promise<GradesDistributionResponseDto> {
    return this.getGradesAnalyticsDistributionUseCase.execute(query);
  }
}
