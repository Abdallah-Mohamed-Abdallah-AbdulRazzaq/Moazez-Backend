import { AttendanceStatus } from '@prisma/client';
import {
  AttendanceReportScopeGroupBy,
  buildAttendanceDailyTrend,
  buildAttendanceScopeBreakdown,
  summarizeAttendanceReport,
} from '../domain/attendance-report';

describe('Attendance report domain helpers', () => {
  it('counts all attendance statuses and computes summary rates', () => {
    const summary = summarizeAttendanceReport({
      totalSessions: 2,
      entries: [
        { status: AttendanceStatus.PRESENT, studentId: 'student-1' },
        { status: AttendanceStatus.ABSENT, studentId: 'student-2' },
        { status: AttendanceStatus.LATE, studentId: 'student-2' },
        { status: AttendanceStatus.EARLY_LEAVE, studentId: 'student-3' },
        { status: AttendanceStatus.EXCUSED, studentId: 'student-4' },
        { status: AttendanceStatus.UNMARKED, studentId: 'student-5' },
      ],
    });

    expect(summary).toEqual({
      totalSessions: 2,
      totalEntries: 6,
      presentCount: 1,
      absentCount: 1,
      lateCount: 1,
      earlyLeaveCount: 1,
      excusedCount: 1,
      unmarkedCount: 1,
      incidentCount: 4,
      attendanceRate: 0.1667,
      absenceRate: 0.1667,
      lateRate: 0.1667,
      affectedStudentsCount: 3,
    });
  });

  it('returns zero rates when there are no entries', () => {
    const summary = summarizeAttendanceReport({
      totalSessions: 0,
      entries: [],
    });

    expect(summary.attendanceRate).toBe(0);
    expect(summary.absenceRate).toBe(0);
    expect(summary.lateRate).toBe(0);
  });

  it('groups daily trend by date and sorts ascending', () => {
    const trend = buildAttendanceDailyTrend([
      { date: '2026-09-16', status: AttendanceStatus.ABSENT },
      { date: '2026-09-15', status: AttendanceStatus.PRESENT },
      { date: '2026-09-15', status: AttendanceStatus.LATE },
    ]);

    expect(trend).toEqual([
      {
        date: '2026-09-15',
        totalEntries: 2,
        presentCount: 1,
        absentCount: 0,
        lateCount: 1,
        earlyLeaveCount: 0,
        excusedCount: 0,
        unmarkedCount: 0,
        incidentCount: 1,
        attendanceRate: 0.5,
      },
      {
        date: '2026-09-16',
        totalEntries: 1,
        presentCount: 0,
        absentCount: 1,
        lateCount: 0,
        earlyLeaveCount: 0,
        excusedCount: 0,
        unmarkedCount: 0,
        incidentCount: 1,
        attendanceRate: 0,
      },
    ]);
  });

  it('aggregates classroom scope breakdown rows', () => {
    const breakdown = buildAttendanceScopeBreakdown([
      {
        scopeType: AttendanceReportScopeGroupBy.CLASSROOM,
        scopeId: 'classroom-1',
        scopeNameAr: 'Classroom AR',
        scopeNameEn: 'Classroom 1A',
        status: AttendanceStatus.PRESENT,
      },
      {
        scopeType: AttendanceReportScopeGroupBy.CLASSROOM,
        scopeId: 'classroom-1',
        scopeNameAr: 'Classroom AR',
        scopeNameEn: 'Classroom 1A',
        status: AttendanceStatus.ABSENT,
      },
    ]);

    expect(breakdown).toEqual([
      {
        scopeType: AttendanceReportScopeGroupBy.CLASSROOM,
        scopeId: 'classroom-1',
        scopeNameAr: 'Classroom AR',
        scopeNameEn: 'Classroom 1A',
        totalEntries: 2,
        presentCount: 1,
        absentCount: 1,
        lateCount: 0,
        earlyLeaveCount: 0,
        excusedCount: 0,
        unmarkedCount: 0,
        incidentCount: 1,
        attendanceRate: 0.5,
      },
    ]);
  });
});
