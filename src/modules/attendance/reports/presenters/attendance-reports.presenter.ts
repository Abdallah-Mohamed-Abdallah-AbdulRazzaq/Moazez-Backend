import {
  AttendanceDailyTrendReportResponseDto,
  AttendanceScopeBreakdownReportResponseDto,
  AttendanceSummaryReportResponseDto,
  DerivedDailyAbsencesReportResponseDto,
} from '../dto/attendance-reports.dto';
import {
  AttendanceDailyTrendRow,
  AttendanceScopeBreakdownRow,
  AttendanceSummaryReport,
} from '../domain/attendance-report';
import { DerivedDailyAbsenceRow } from '../domain/derived-daily-attendance';

export function presentAttendanceSummaryReport(
  summary: AttendanceSummaryReport,
): AttendanceSummaryReportResponseDto {
  return {
    totalSessions: summary.totalSessions,
    totalEntries: summary.totalEntries,
    presentCount: summary.presentCount,
    absentCount: summary.absentCount,
    lateCount: summary.lateCount,
    earlyLeaveCount: summary.earlyLeaveCount,
    excusedCount: summary.excusedCount,
    unmarkedCount: summary.unmarkedCount,
    incidentCount: summary.incidentCount,
    attendanceRate: summary.attendanceRate,
    absenceRate: summary.absenceRate,
    lateRate: summary.lateRate,
    affectedStudentsCount: summary.affectedStudentsCount,
  };
}

export function presentAttendanceDailyTrendReport(
  rows: AttendanceDailyTrendRow[],
): AttendanceDailyTrendReportResponseDto {
  return {
    items: rows.map((row) => ({
      date: row.date,
      totalEntries: row.totalEntries,
      presentCount: row.presentCount,
      absentCount: row.absentCount,
      lateCount: row.lateCount,
      earlyLeaveCount: row.earlyLeaveCount,
      excusedCount: row.excusedCount,
      attendanceRate: row.attendanceRate,
      incidentCount: row.incidentCount,
    })),
  };
}

export function presentAttendanceScopeBreakdownReport(
  rows: AttendanceScopeBreakdownRow[],
): AttendanceScopeBreakdownReportResponseDto {
  return {
    items: rows.map((row) => ({
      scopeType: row.scopeType,
      scopeId: row.scopeId,
      scopeNameAr: row.scopeNameAr,
      scopeNameEn: row.scopeNameEn,
      totalEntries: row.totalEntries,
      presentCount: row.presentCount,
      absentCount: row.absentCount,
      lateCount: row.lateCount,
      earlyLeaveCount: row.earlyLeaveCount,
      excusedCount: row.excusedCount,
      attendanceRate: row.attendanceRate,
      incidentCount: row.incidentCount,
    })),
  };
}

export function presentDerivedDailyAbsencesReport(
  rows: DerivedDailyAbsenceRow[],
): DerivedDailyAbsencesReportResponseDto {
  return {
    items: rows.map((row) => ({
      date: row.date,
      studentId: row.studentId,
      scopeType: row.scopeType,
      scopeKey: row.scopeKey,
      scopeIds: {
        stageId: row.scopeIds.stageId,
        gradeId: row.scopeIds.gradeId,
        sectionId: row.scopeIds.sectionId,
        classroomId: row.scopeIds.classroomId,
      },
      policyId: row.policyId,
      missedPeriodCount: row.missedPeriodCount,
      requiredMissedPeriodsCount: row.requiredMissedPeriodsCount,
      missedPeriodIds: row.missedPeriodIds,
      evidencePeriodCount: row.evidencePeriodCount,
      sourcePeriodIds: row.sourcePeriodIds,
      derivedStatus: row.derivedStatus,
      source: row.source,
      reportOnly: row.reportOnly,
    })),
  };
}
