import { AttendanceStatus } from '@prisma/client';

export interface AttendanceStatusCounters {
  totalEntries: number;
  presentCount: number;
  absentCount: number;
  lateCount: number;
  earlyLeaveCount: number;
  excusedCount: number;
  unmarkedCount: number;
  incidentCount: number;
}

export interface AttendanceReportEntryInput {
  status: AttendanceStatus;
  studentId: string;
}

export interface AttendanceDailyTrendEntryInput {
  date: string;
  status: AttendanceStatus;
}

export interface AttendanceScopeBreakdownEntryInput {
  scopeType: AttendanceReportScopeGroupBy;
  scopeId: string;
  scopeNameAr: string;
  scopeNameEn: string;
  status: AttendanceStatus;
}

export interface AttendanceSummaryReport extends AttendanceStatusCounters {
  totalSessions: number;
  attendanceRate: number;
  absenceRate: number;
  lateRate: number;
  affectedStudentsCount: number;
}

export interface AttendanceDailyTrendRow extends AttendanceStatusCounters {
  date: string;
  attendanceRate: number;
}

export interface AttendanceScopeBreakdownRow extends AttendanceStatusCounters {
  scopeType: AttendanceReportScopeGroupBy;
  scopeId: string;
  scopeNameAr: string;
  scopeNameEn: string;
  attendanceRate: number;
}

export enum AttendanceReportScopeGroupBy {
  STAGE = 'stage',
  GRADE = 'grade',
  SECTION = 'section',
  CLASSROOM = 'classroom',
}

export function createAttendanceStatusCounters(): AttendanceStatusCounters {
  return {
    totalEntries: 0,
    presentCount: 0,
    absentCount: 0,
    lateCount: 0,
    earlyLeaveCount: 0,
    excusedCount: 0,
    unmarkedCount: 0,
    incidentCount: 0,
  };
}

export function addAttendanceStatus(
  counters: AttendanceStatusCounters,
  status: AttendanceStatus,
): void {
  counters.totalEntries += 1;

  if (status === AttendanceStatus.PRESENT) {
    counters.presentCount += 1;
  } else if (status === AttendanceStatus.ABSENT) {
    counters.absentCount += 1;
    counters.incidentCount += 1;
  } else if (status === AttendanceStatus.LATE) {
    counters.lateCount += 1;
    counters.incidentCount += 1;
  } else if (status === AttendanceStatus.EARLY_LEAVE) {
    counters.earlyLeaveCount += 1;
    counters.incidentCount += 1;
  } else if (status === AttendanceStatus.EXCUSED) {
    counters.excusedCount += 1;
    counters.incidentCount += 1;
  } else if (status === AttendanceStatus.UNMARKED) {
    counters.unmarkedCount += 1;
  }
}

export function calculateAttendanceRate(
  numerator: number,
  totalEntries: number,
): number {
  if (totalEntries <= 0) return 0;
  return Number((numerator / totalEntries).toFixed(4));
}

export function summarizeAttendanceReport(params: {
  totalSessions: number;
  entries: AttendanceReportEntryInput[];
}): AttendanceSummaryReport {
  const counters = createAttendanceStatusCounters();
  const affectedStudentIds = new Set<string>();

  for (const entry of params.entries) {
    addAttendanceStatus(counters, entry.status);
    if (isIncidentStatus(entry.status)) {
      affectedStudentIds.add(entry.studentId);
    }
  }

  return {
    ...counters,
    totalSessions: params.totalSessions,
    attendanceRate: calculateAttendanceRate(
      counters.presentCount,
      counters.totalEntries,
    ),
    absenceRate: calculateAttendanceRate(
      counters.absentCount,
      counters.totalEntries,
    ),
    lateRate: calculateAttendanceRate(
      counters.lateCount,
      counters.totalEntries,
    ),
    affectedStudentsCount: affectedStudentIds.size,
  };
}

export function buildAttendanceDailyTrend(
  entries: AttendanceDailyTrendEntryInput[],
): AttendanceDailyTrendRow[] {
  const rowsByDate = new Map<string, AttendanceStatusCounters>();

  for (const entry of entries) {
    const counters =
      rowsByDate.get(entry.date) ?? createAttendanceStatusCounters();
    addAttendanceStatus(counters, entry.status);
    rowsByDate.set(entry.date, counters);
  }

  return [...rowsByDate.entries()]
    .sort(([leftDate], [rightDate]) => leftDate.localeCompare(rightDate))
    .map(([date, counters]) => ({
      date,
      ...counters,
      attendanceRate: calculateAttendanceRate(
        counters.presentCount,
        counters.totalEntries,
      ),
    }));
}

export function buildAttendanceScopeBreakdown(
  entries: AttendanceScopeBreakdownEntryInput[],
): AttendanceScopeBreakdownRow[] {
  const rowsByScope = new Map<
    string,
    {
      scopeType: AttendanceReportScopeGroupBy;
      scopeId: string;
      scopeNameAr: string;
      scopeNameEn: string;
      counters: AttendanceStatusCounters;
    }
  >();

  for (const entry of entries) {
    const key = `${entry.scopeType}:${entry.scopeId}`;
    const row = rowsByScope.get(key) ?? {
      scopeType: entry.scopeType,
      scopeId: entry.scopeId,
      scopeNameAr: entry.scopeNameAr,
      scopeNameEn: entry.scopeNameEn,
      counters: createAttendanceStatusCounters(),
    };
    addAttendanceStatus(row.counters, entry.status);
    rowsByScope.set(key, row);
  }

  return [...rowsByScope.values()]
    .sort((left, right) => {
      const nameCompare = left.scopeNameEn.localeCompare(right.scopeNameEn);
      return nameCompare !== 0
        ? nameCompare
        : left.scopeId.localeCompare(right.scopeId);
    })
    .map((row) => ({
      scopeType: row.scopeType,
      scopeId: row.scopeId,
      scopeNameAr: row.scopeNameAr,
      scopeNameEn: row.scopeNameEn,
      ...row.counters,
      attendanceRate: calculateAttendanceRate(
        row.counters.presentCount,
        row.counters.totalEntries,
      ),
    }));
}

export function isIncidentStatus(status: AttendanceStatus): boolean {
  return (
    status === AttendanceStatus.ABSENT ||
    status === AttendanceStatus.LATE ||
    status === AttendanceStatus.EARLY_LEAVE ||
    status === AttendanceStatus.EXCUSED
  );
}
