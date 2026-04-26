import { Module } from '@nestjs/common';
import { AuthModule } from '../../iam/auth/auth.module';
import { GetAttendanceDailyTrendUseCase } from './application/get-attendance-daily-trend.use-case';
import { GetAttendanceScopeBreakdownUseCase } from './application/get-attendance-scope-breakdown.use-case';
import { GetAttendanceSummaryReportUseCase } from './application/get-attendance-summary-report.use-case';
import { AttendanceReportsController } from './controller/attendance-reports.controller';
import { AttendanceReportsRepository } from './infrastructure/attendance-reports.repository';

@Module({
  imports: [AuthModule],
  controllers: [AttendanceReportsController],
  providers: [
    AttendanceReportsRepository,
    GetAttendanceSummaryReportUseCase,
    GetAttendanceDailyTrendUseCase,
    GetAttendanceScopeBreakdownUseCase,
  ],
})
export class ReportsModule {}
