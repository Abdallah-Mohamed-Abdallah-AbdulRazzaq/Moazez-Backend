import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../common/decorators/required-permissions.decorator';
import { GetDashboardSummaryUseCase } from '../application/get-dashboard-summary.use-case';
import { ListDashboardAlertsUseCase } from '../application/list-dashboard-alerts.use-case';
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
}
