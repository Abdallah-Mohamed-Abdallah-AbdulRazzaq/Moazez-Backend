import { Injectable } from '@nestjs/common';
import {
  buildDerivedDailyAbsenceRows,
  DerivedDailyAbsenceEvidence,
} from '../domain/derived-daily-attendance';
import { DerivedDailyAbsencesReportQueryDto } from '../dto/attendance-reports.dto';
import {
  AttendanceReportsRepository,
  DerivedDailyAbsenceEvidenceRecord,
} from '../infrastructure/attendance-reports.repository';
import { presentDerivedDailyAbsencesReport } from '../presenters/attendance-reports.presenter';
import {
  buildAttendanceReportFilters,
  formatAttendanceReportDate,
} from './attendance-reports-use-case.helpers';

@Injectable()
export class GetDerivedDailyAbsencesReportUseCase {
  constructor(
    private readonly attendanceReportsRepository: AttendanceReportsRepository,
  ) {}

  async execute(query: DerivedDailyAbsencesReportQueryDto) {
    const filters = await buildAttendanceReportFilters(
      this.attendanceReportsRepository,
      query,
    );
    const records =
      await this.attendanceReportsRepository.listDerivedDailyAbsenceEvidence(
        filters,
      );
    const rows = buildDerivedDailyAbsenceRows(
      records.map(mapDerivedDailyAbsenceEvidence),
    );

    return presentDerivedDailyAbsencesReport(rows);
  }
}

function mapDerivedDailyAbsenceEvidence(
  record: DerivedDailyAbsenceEvidenceRecord,
): DerivedDailyAbsenceEvidence {
  return {
    entryId: record.id,
    studentId: record.studentId,
    enrollmentId: record.enrollmentId,
    status: record.status,
    entryUpdatedAt: record.updatedAt,
    sessionId: record.session.id,
    date: formatAttendanceReportDate(record.session.date),
    scopeType: record.session.scopeType,
    scopeKey: record.session.scopeKey,
    stageId: record.session.stageId,
    gradeId: record.session.gradeId,
    sectionId: record.session.sectionId,
    classroomId: record.session.classroomId,
    mode: record.session.mode,
    periodId: record.session.periodId,
    periodKey: record.session.periodKey,
    policyId: record.session.policyId,
    sessionStatus: record.session.status,
    sessionSubmittedAt: record.session.submittedAt,
    sessionUpdatedAt: record.session.updatedAt,
    policy: record.session.policy,
  };
}
