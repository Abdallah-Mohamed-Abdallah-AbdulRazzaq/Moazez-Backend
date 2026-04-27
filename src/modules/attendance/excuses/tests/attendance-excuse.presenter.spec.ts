import {
  AttendanceExcuseStatus,
  AttendanceExcuseType,
  StudentStatus,
} from '@prisma/client';
import { presentAttendanceExcuseRequest } from '../presenters/attendance-excuse.presenter';

describe('Attendance excuse presenter', () => {
  it('returns the frontend-friendly excuse response shape', () => {
    const result = presentAttendanceExcuseRequest({
      id: 'excuse-1',
      schoolId: 'school-1',
      academicYearId: 'year-1',
      termId: 'term-1',
      studentId: 'student-1',
      type: AttendanceExcuseType.LATE,
      status: AttendanceExcuseStatus.PENDING,
      dateFrom: new Date('2026-09-15T00:00:00.000Z'),
      dateTo: new Date('2026-09-15T00:00:00.000Z'),
      selectedPeriodKeys: ['daily'],
      lateMinutes: 10,
      earlyLeaveMinutes: null,
      reasonAr: null,
      reasonEn: 'Traffic',
      decisionNote: null,
      createdById: 'user-1',
      decidedById: null,
      decidedAt: null,
      createdAt: new Date('2026-09-15T08:00:00.000Z'),
      updatedAt: new Date('2026-09-15T09:00:00.000Z'),
      deletedAt: null,
      student: {
        id: 'student-1',
        firstName: 'Layla',
        lastName: 'Hassan',
        status: StudentStatus.ACTIVE,
      },
      linkedSessions: [
        {
          attendanceSessionId: 'session-1',
          createdAt: new Date('2026-09-15T09:05:00.000Z'),
        },
      ],
    });

    expect(result).toMatchObject({
      id: 'excuse-1',
      academicYearId: 'year-1',
      yearId: 'year-1',
      termId: 'term-1',
      studentId: 'student-1',
      studentName: 'Layla Hassan',
      type: AttendanceExcuseType.LATE,
      status: AttendanceExcuseStatus.PENDING,
      dateFrom: '2026-09-15',
      dateTo: '2026-09-15',
      selectedPeriodKeys: ['daily'],
      selectedPeriodIds: ['daily'],
      lateMinutes: 10,
      minutesLate: 10,
      earlyLeaveMinutes: null,
      minutesEarlyLeave: null,
      reasonEn: 'Traffic',
      linkedSessionIds: ['session-1'],
      createdAt: '2026-09-15T08:00:00.000Z',
      updatedAt: '2026-09-15T09:00:00.000Z',
    });
    expect(result.student).toMatchObject({
      id: 'student-1',
      studentId: 'student-1',
      name: 'Layla Hassan',
      studentNumber: null,
      photoUrl: null,
    });
  });
});
