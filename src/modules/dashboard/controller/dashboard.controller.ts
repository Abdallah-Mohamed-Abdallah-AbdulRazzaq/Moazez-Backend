import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../common/decorators/required-permissions.decorator';
import { GetDashboardSummaryUseCase } from '../application/get-dashboard-summary.use-case';
import { ListDashboardActivityFeedUseCase } from '../application/list-dashboard-activity-feed.use-case';
import { ListDashboardAlertsUseCase } from '../application/list-dashboard-alerts.use-case';
import {
  DashboardActivityFeedResponseDto,
  ListDashboardActivityFeedQueryDto,
} from '../dto/dashboard-activity-feed.dto';
import {
  DashboardAlertsResponseDto,
  ListDashboardAlertsQueryDto,
} from '../dto/dashboard-alerts.dto';
import { DashboardSummaryResponseDto } from '../dto/dashboard-summary.dto';

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly getDashboardSummaryUseCase: GetDashboardSummaryUseCase,
    private readonly listDashboardAlertsUseCase: ListDashboardAlertsUseCase,
    private readonly listDashboardActivityFeedUseCase: ListDashboardActivityFeedUseCase,
  ) {}

  @Get('summary')
  @RequiredPermissions('dashboard.summary.view')
  getSummary(): Promise<DashboardSummaryResponseDto> {
    return this.getDashboardSummaryUseCase.execute();
  }

  @Get('alerts')
  @RequiredPermissions('dashboard.alerts.view')
  listAlerts(
    @Query() query: ListDashboardAlertsQueryDto,
  ): Promise<DashboardAlertsResponseDto> {
    return this.listDashboardAlertsUseCase.execute(query);
  }

  @Get('activity-feed')
  @RequiredPermissions('dashboard.activity_feed.view')
  listActivityFeed(
    @Query() query: ListDashboardActivityFeedQueryDto,
  ): Promise<DashboardActivityFeedResponseDto> {
    return this.listDashboardActivityFeedUseCase.execute(query);
  }
}
