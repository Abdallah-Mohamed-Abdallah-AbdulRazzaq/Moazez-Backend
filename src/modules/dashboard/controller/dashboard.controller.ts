import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../common/decorators/required-permissions.decorator';
import { GetDashboardCommandCenterUseCase } from '../application/get-dashboard-command-center.use-case';
import { GetDashboardWidgetUseCase } from '../application/get-dashboard-widget.use-case';
import { GetDashboardSummaryUseCase } from '../application/get-dashboard-summary.use-case';
import { ListDashboardActivityFeedUseCase } from '../application/list-dashboard-activity-feed.use-case';
import { ListDashboardAlertsUseCase } from '../application/list-dashboard-alerts.use-case';
import { ListDashboardWidgetsUseCase } from '../application/list-dashboard-widgets.use-case';
import {
  DashboardActivityFeedResponseDto,
  ListDashboardActivityFeedQueryDto,
} from '../dto/dashboard-activity-feed.dto';
import {
  DashboardAlertsResponseDto,
  ListDashboardAlertsQueryDto,
} from '../dto/dashboard-alerts.dto';
import { DashboardCommandCenterResponseDto } from '../dto/dashboard-command-center.dto';
import { DashboardSummaryResponseDto } from '../dto/dashboard-summary.dto';
import {
  DashboardWidgetResponseDto,
  DashboardWidgetsResponseDto,
  ListDashboardWidgetsQueryDto,
} from '../dto/dashboard-widgets.dto';

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly getDashboardCommandCenterUseCase: GetDashboardCommandCenterUseCase,
    private readonly getDashboardWidgetUseCase: GetDashboardWidgetUseCase,
    private readonly getDashboardSummaryUseCase: GetDashboardSummaryUseCase,
    private readonly listDashboardAlertsUseCase: ListDashboardAlertsUseCase,
    private readonly listDashboardActivityFeedUseCase: ListDashboardActivityFeedUseCase,
    private readonly listDashboardWidgetsUseCase: ListDashboardWidgetsUseCase,
  ) {}

  @Get('command-center')
  @RequiredPermissions('dashboard.command_center.view')
  getCommandCenter(): Promise<DashboardCommandCenterResponseDto> {
    return this.getDashboardCommandCenterUseCase.execute();
  }

  @Get('widgets')
  @RequiredPermissions('dashboard.widgets.view')
  listWidgets(
    @Query() query: ListDashboardWidgetsQueryDto,
  ): Promise<DashboardWidgetsResponseDto> {
    return this.listDashboardWidgetsUseCase.execute(query);
  }

  @Get('widgets/:widgetKey')
  @RequiredPermissions('dashboard.widgets.view')
  getWidget(
    @Param('widgetKey') widgetKey: string,
  ): Promise<DashboardWidgetResponseDto> {
    return this.getDashboardWidgetUseCase.execute(widgetKey);
  }

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
