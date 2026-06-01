import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../common/decorators/required-permissions.decorator';
import { GetDashboardSummaryUseCase } from '../application/get-dashboard-summary.use-case';
import { DashboardSummaryResponseDto } from '../dto/dashboard-summary.dto';

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly getDashboardSummaryUseCase: GetDashboardSummaryUseCase,
  ) {}

  @Get('summary')
  @RequiredPermissions('dashboard.summary.view')
  getSummary(): Promise<DashboardSummaryResponseDto> {
    return this.getDashboardSummaryUseCase.execute();
  }
}
