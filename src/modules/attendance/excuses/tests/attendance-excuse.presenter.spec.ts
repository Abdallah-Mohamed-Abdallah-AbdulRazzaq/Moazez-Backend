import {
  AttendanceExcuseStatus,
  AttendanceExcuseType,
  StudentStatus,
} from '@prisma/client';
import { presentAttendanceExcuseRequest } from '../presenters/attendance-excuse.presenter';

describe('Attendance excuse presenter', () => {
  function excuseRequestRecord() {
    return {
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
    };
  }

  it('returns the frontend-friendly excuse response shape with attachment count', () => {
    const record = {
      ...excuseRequestRecord(),
      status: AttendanceExcuseStatus.APPROVED,
      decisionNote: 'Approved after document review',
      decidedById: 'user-2',
      decidedAt: new Date('2026-09-15T10:00:00.000Z'),
    };
    const result = presentAttendanceExcuseRequest(record, {
      attachmentCount: 2,
    });

    expect(result).toMatchObject({
      id: 'excuse-1',
      academicYearId: 'year-1',
      yearId: 'year-1',
      termId: 'term-1',
      studentId: 'student-1',
      studentName: 'Layla Hassan',
      type: AttendanceExcuseType.LATE,
      status: AttendanceExcuseStatus.APPROVED,
      dateFrom: '2026-09-15',
      dateTo: '2026-09-15',
      selectedPeriodKeys: ['daily'],
      selectedPeriodIds: ['daily'],
      lateMinutes: 10,
      minutesLate: 10,
      earlyLeaveMinutes: null,
      minutesEarlyLeave: null,
      reasonEn: 'Traffic',
      decisionNote: 'Approved after document review',
      decidedById: 'user-2',
      decidedAt: '2026-09-15T10:00:00.000Z',
      linkedSessionIds: ['session-1'],
      attachmentCount: 2,
      createdAt: '2026-09-15T08:00:00.000Z',
      updatedAt: '2026-09-15T09:00:00.000Z',
    });
    expect(result.attachments).toBeUndefined();
    expect(result.student).toMatchObject({
      id: 'student-1',
      studentId: 'student-1',
      name: 'Layla Hassan',
      studentNumber: null,
      photoUrl: null,
    });
  });

  it('includes safe attachment metadata for detail responses', () => {
    const result = presentAttendanceExcuseRequest(excuseRequestRecord(), {
      attachments: [
        {
          id: 'attachment-1',
          fileId: 'file-1',
          schoolId: 'school-1',
          resourceType: 'attendance.excuse_request',
          resourceId: 'excuse-1',
          createdById: 'user-1',
          createdAt: new Date('2026-09-15T09:10:00.000Z'),
          file: {
            id: 'file-1',
            originalName: 'medical-note.pdf',
            mimeType: 'application/pdf',
            sizeBytes: BigInt(4096),
          },
        },
      ],
    });

    expect(result.attachmentCount).toBe(1);
    expect(result.attachments).toEqual([
      {
        id: 'attachment-1',
        fileId: 'file-1',
        filename: 'medical-note.pdf',
        originalName: 'medical-note.pdf',
        mimeType: 'application/pdf',
        sizeBytes: '4096',
        createdAt: '2026-09-15T09:10:00.000Z',
        downloadUrl: '/api/v1/files/file-1/download',
      },
    ]);
  });
});
