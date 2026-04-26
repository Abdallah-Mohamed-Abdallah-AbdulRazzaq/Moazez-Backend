import { Injectable } from '@nestjs/common';
import {
  AttendanceReportScopeGroupBy,
  buildAttendanceScopeBreakdown,
} from '../domain/attendance-report';
import { AttendanceScopeBreakdownReportQueryDto } from '../dto/attendance-reports.dto';
import {
  AttendanceReportEntryRecord,
  AttendanceReportsRepository,
} from '../infrastructure/attendance-reports.repository';
import { presentAttendanceScopeBreakdownReport } from '../presenters/attendance-reports.presenter';
import { buildAttendanceReportFilters } from './attendance-reports-use-case.helpers';

type PlacementNode = {
  id: string;
  nameAr: string;
  nameEn: string;
};

@Injectable()
export class GetAttendanceScopeBreakdownUseCase {
  constructor(
    private readonly attendanceReportsRepository: AttendanceReportsRepository,
  ) {}

  async execute(query: AttendanceScopeBreakdownReportQueryDto) {
    const filters = await buildAttendanceReportFilters(
      this.attendanceReportsRepository,
      query,
    );
    const entries =
      await this.attendanceReportsRepository.getScopeBreakdown(filters);

    return presentAttendanceScopeBreakdownReport(
      buildAttendanceScopeBreakdown(
        entries.flatMap((entry) => {
          const node = resolveScopeBreakdownNode(entry, query.groupBy);
          if (!node) return [];

          return [
            {
              scopeType: query.groupBy,
              scopeId: node.id,
              scopeNameAr: node.nameAr,
              scopeNameEn: node.nameEn,
              status: entry.status,
            },
          ];
        }),
      ),
    );
  }
}

function resolveScopeBreakdownNode(
  entry: AttendanceReportEntryRecord,
  groupBy: AttendanceReportScopeGroupBy,
): PlacementNode | null {
  const classroom = entry.enrollment?.classroom ?? entry.session.classroom;
  const section = classroom?.section ?? entry.session.section;
  const grade = section?.grade ?? entry.session.grade;
  const stage = grade?.stage ?? entry.session.stage;

  if (groupBy === AttendanceReportScopeGroupBy.CLASSROOM) {
    return classroom ?? null;
  }

  if (groupBy === AttendanceReportScopeGroupBy.SECTION) {
    return section ?? null;
  }

  if (groupBy === AttendanceReportScopeGroupBy.GRADE) {
    return grade ?? null;
  }

  return stage ?? null;
}
