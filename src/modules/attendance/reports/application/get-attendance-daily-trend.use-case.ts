import { Injectable } from '@nestjs/common';
import { buildAttendanceDailyTrend } from '../domain/attendance-report';
import { AttendanceDailyTrendReportQueryDto } from '../dto/attendance-reports.dto';
import { AttendanceReportsRepository } from '../infrastructure/attendance-reports.repository';
import { presentAttendanceDailyTrendReport } from '../presenters/attendance-reports.presenter';
import {
  buildAttendanceReportFilters,
  formatAttendanceReportDate,
} from './attendance-reports-use-case.helpers';

@Injectable()
export class GetAttendanceDailyTrendUseCase {
  constructor(
    private readonly attendanceReportsRepository: AttendanceReportsRepository,
  ) {}

  async execute(query: AttendanceDailyTrendReportQueryDto) {
    const filters = await buildAttendanceReportFilters(
      this.attendanceReportsRepository,
      query,
    );
    const entries =
      await this.attendanceReportsRepository.getDailyTrend(filters);

    return presentAttendanceDailyTrendReport(
      buildAttendanceDailyTrend(
        entries.map((entry) => ({
          date: formatAttendanceReportDate(entry.session.date),
          status: entry.status,
        })),
      ),
    );
  }
}
