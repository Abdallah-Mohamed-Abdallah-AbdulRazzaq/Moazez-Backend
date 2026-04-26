import { Injectable } from '@nestjs/common';
import { summarizeAttendanceReport } from '../domain/attendance-report';
import { AttendanceSummaryReportQueryDto } from '../dto/attendance-reports.dto';
import { AttendanceReportsRepository } from '../infrastructure/attendance-reports.repository';
import { presentAttendanceSummaryReport } from '../presenters/attendance-reports.presenter';
import { buildAttendanceReportFilters } from './attendance-reports-use-case.helpers';

@Injectable()
export class GetAttendanceSummaryReportUseCase {
  constructor(
    private readonly attendanceReportsRepository: AttendanceReportsRepository,
  ) {}

  async execute(query: AttendanceSummaryReportQueryDto) {
    const filters = await buildAttendanceReportFilters(
      this.attendanceReportsRepository,
      query,
    );
    const dataset = await this.attendanceReportsRepository.getSummary(filters);

    return presentAttendanceSummaryReport(
      summarizeAttendanceReport({
        totalSessions: dataset.totalSessions,
        entries: dataset.entries,
      }),
    );
  }
}
