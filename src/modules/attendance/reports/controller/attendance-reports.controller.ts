import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { GetAttendanceDailyTrendUseCase } from '../application/get-attendance-daily-trend.use-case';
import { GetAttendanceScopeBreakdownUseCase } from '../application/get-attendance-scope-breakdown.use-case';
import { GetAttendanceSummaryReportUseCase } from '../application/get-attendance-summary-report.use-case';
import {
  AttendanceDailyTrendReportQueryDto,
  AttendanceDailyTrendReportResponseDto,
  AttendanceScopeBreakdownReportQueryDto,
  AttendanceScopeBreakdownReportResponseDto,
  AttendanceSummaryReportQueryDto,
  AttendanceSummaryReportResponseDto,
} from '../dto/attendance-reports.dto';

@ApiTags('attendance-reports')
@ApiBearerAuth()
@Controller('attendance/reports')
export class AttendanceReportsController {
  constructor(
    private readonly getAttendanceSummaryReportUseCase: GetAttendanceSummaryReportUseCase,
    private readonly getAttendanceDailyTrendUseCase: GetAttendanceDailyTrendUseCase,
    private readonly getAttendanceScopeBreakdownUseCase: GetAttendanceScopeBreakdownUseCase,
  ) {}

  @Get('summary')
  @RequiredPermissions('attendance.reports.view')
  getSummary(
    @Query() query: AttendanceSummaryReportQueryDto,
  ): Promise<AttendanceSummaryReportResponseDto> {
    return this.getAttendanceSummaryReportUseCase.execute(query);
  }

  @Get('daily-trend')
  @RequiredPermissions('attendance.reports.view')
  getDailyTrend(
    @Query() query: AttendanceDailyTrendReportQueryDto,
  ): Promise<AttendanceDailyTrendReportResponseDto> {
    return this.getAttendanceDailyTrendUseCase.execute(query);
  }

  @Get('scope-breakdown')
  @RequiredPermissions('attendance.reports.view')
  getScopeBreakdown(
    @Query() query: AttendanceScopeBreakdownReportQueryDto,
  ): Promise<AttendanceScopeBreakdownReportResponseDto> {
    return this.getAttendanceScopeBreakdownUseCase.execute(query);
  }
}
