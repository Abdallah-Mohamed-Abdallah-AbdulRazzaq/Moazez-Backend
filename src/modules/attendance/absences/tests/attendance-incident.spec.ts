import { AttendanceStatus } from '@prisma/client';
import { summarizeAttendanceIncidents } from '../domain/attendance-incident';

describe('Attendance incident summary', () => {
  it('counts incidents by status and distinct affected students', () => {
    const summary = summarizeAttendanceIncidents([
      { status: AttendanceStatus.ABSENT, studentId: 'student-1' },
      { status: AttendanceStatus.LATE, studentId: 'student-1' },
      { status: AttendanceStatus.EARLY_LEAVE, studentId: 'student-2' },
      { status: AttendanceStatus.EXCUSED, studentId: 'student-3' },
      { status: AttendanceStatus.PRESENT, studentId: 'student-4' },
      { status: AttendanceStatus.UNMARKED, studentId: 'student-5' },
    ]);

    expect(summary).toEqual({
      totalIncidents: 4,
      absentCount: 1,
      lateCount: 1,
      earlyLeaveCount: 1,
      excusedCount: 1,
      affectedStudentsCount: 3,
    });
  });
});
