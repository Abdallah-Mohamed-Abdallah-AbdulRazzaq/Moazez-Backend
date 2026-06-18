import {
  AttendanceMode,
  AttendanceScopeType,
  AttendanceSessionStatus,
  AttendanceStatus,
} from '@prisma/client';
import { TeacherClassroomAttendancePresenter } from '../presenters/teacher-classroom-attendance.presenter';

describe('TeacherClassroomAttendancePresenter', () => {
  it('maps core attendance statuses into explicit app-facing read statuses', () => {
    const roster = TeacherClassroomAttendancePresenter.presentRoster({
      classId: 'allocation-1',
      date: '2026-09-10',
      roster: {
        session: sessionSummaryFixture(),
        items: [
          rosterRowFixture('student-present', AttendanceStatus.PRESENT),
          rosterRowFixture('student-absent', AttendanceStatus.ABSENT),
          rosterRowFixture('student-late', AttendanceStatus.LATE, {
            lateMinutes: 12,
          }),
          rosterRowFixture('student-excused', AttendanceStatus.EXCUSED, {
            excuseReason: 'Approved',
          }),
          rosterRowFixture('student-early', AttendanceStatus.EARLY_LEAVE, {
            earlyLeaveMinutes: 20,
          }),
          rosterRowFixture('student-unmarked', AttendanceStatus.UNMARKED),
          rosterRowFixture('student-missing', null),
        ],
      },
      filters: { limit: 20 },
    });

    expect(
      roster.students.map((student) => [
        student.id,
        student.attendanceStatus,
        student.lateMinutes,
        student.earlyLeaveMinutes,
        student.excuseReason,
      ]),
    ).toEqual([
      ['student-present', 'present', null, null, null],
      ['student-absent', 'absent', null, null, null],
      ['student-late', 'late', 12, null, null],
      ['student-excused', 'excused', null, null, 'Approved'],
      ['student-early', 'early_leave', null, 20, null],
      ['student-unmarked', 'unmarked', null, null, null],
      ['student-missing', 'unmarked', null, null, null],
    ]);
  });

  it('builds a read-only today summary without exposing internal fields', () => {
    const result = TeacherClassroomAttendancePresenter.presentToday({
      classId: 'allocation-1',
      date: '2026-09-10T12:30:00.000Z',
      roster: {
        session: sessionSummaryFixture({
          status: AttendanceSessionStatus.SUBMITTED,
          submittedAt: '2026-09-10T10:00:00.000Z',
        }),
        items: [
          rosterRowFixture('student-present', AttendanceStatus.PRESENT),
          rosterRowFixture('student-absent', AttendanceStatus.ABSENT),
          rosterRowFixture('student-late', AttendanceStatus.LATE),
          rosterRowFixture('student-excused', AttendanceStatus.EXCUSED),
          rosterRowFixture('student-early', AttendanceStatus.EARLY_LEAVE),
          rosterRowFixture('student-unmarked', AttendanceStatus.UNMARKED),
          rosterRowFixture('student-missing', null),
        ],
      },
    });
    const json = JSON.stringify(result);

    expect(result).toMatchObject({
      classId: 'allocation-1',
      date: '2026-09-10',
      session: {
        id: 'session-1',
        status: 'submitted',
        mode: 'daily',
        submittedAt: '2026-09-10T10:00:00.000Z',
      },
      summary: {
        totalCount: 7,
        presentCount: 1,
        absentCount: 1,
        lateCount: 1,
        excusedCount: 1,
        earlyLeaveCount: 1,
        unmarkedCount: 2,
        markedCount: 5,
      },
    });

    for (const forbidden of [
      'schoolId',
      'organizationId',
      'membershipId',
      'roleId',
      'deletedAt',
      'submittedById',
      'markedById',
      'passwordHash',
      'metadata',
      'bucket',
      'objectKey',
      'signedUrl',
    ]) {
      expect(json).not.toContain(forbidden);
    }
  });
});

function sessionSummaryFixture(
  overrides?: Partial<{
    status: AttendanceSessionStatus;
    submittedAt: string | null;
  }>,
) {
  return {
    id: 'session-1',
    academicYearId: 'year-1',
    yearId: 'year-1',
    termId: 'term-1',
    date: '2026-09-10',
    scopeType: AttendanceScopeType.CLASSROOM,
    scopeKey: 'classroom:classroom-1',
    scopeIds: {
      stageId: 'stage-1',
      gradeId: 'grade-1',
      sectionId: 'section-1',
      classroomId: 'classroom-1',
    },
    mode: AttendanceMode.DAILY,
    periodId: null,
    periodKey: 'daily',
    periodLabelAr: null,
    periodLabelEn: null,
    policyId: null,
    status: overrides?.status ?? AttendanceSessionStatus.DRAFT,
    submittedAt: overrides?.submittedAt ?? null,
    submittedById: 'internal-submitter',
    createdAt: '2026-09-10T08:00:00.000Z',
    updatedAt: '2026-09-10T08:00:00.000Z',
  };
}

function rosterRowFixture(
  studentId: string,
  currentStatus: AttendanceStatus | null,
  overrides?: Partial<{
    lateMinutes: number | null;
    earlyLeaveMinutes: number | null;
    excuseReason: string | null;
  }>,
) {
  return {
    id: studentId,
    studentId,
    name: `Student ${studentId}`,
    firstName: 'Student',
    lastName: studentId,
    fullNameEn: `Student ${studentId}`,
    studentNumber: null,
    photoUrl: null,
    classroom: null,
    section: null,
    grade: null,
    stage: null,
    enrollmentId: `enrollment-${studentId}`,
    currentStatus,
    entryId: currentStatus ? `entry-${studentId}` : null,
    lateMinutes: overrides?.lateMinutes ?? null,
    earlyLeaveMinutes: overrides?.earlyLeaveMinutes ?? null,
    excuseReason: overrides?.excuseReason ?? null,
    note: null,
  };
}
