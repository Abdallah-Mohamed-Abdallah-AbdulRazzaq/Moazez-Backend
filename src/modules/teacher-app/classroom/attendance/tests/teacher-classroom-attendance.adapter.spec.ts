import {
  AttendanceMode,
  AttendanceScopeType,
  AttendanceSessionStatus,
  AttendanceStatus,
} from '@prisma/client';
import { GetRollCallRosterUseCase } from '../../../../attendance/roll-call/application/get-roll-call-roster.use-case';
import { GetRollCallSessionDetailUseCase } from '../../../../attendance/roll-call/application/get-roll-call-session-detail.use-case';
import { ResolveRollCallSessionUseCase } from '../../../../attendance/roll-call/application/resolve-roll-call-session.use-case';
import { SaveRollCallEntriesUseCase } from '../../../../attendance/roll-call/application/save-roll-call-entries.use-case';
import { SubmitRollCallSessionUseCase } from '../../../../attendance/roll-call/application/submit-roll-call-session.use-case';
import { AttendanceSessionAlreadySubmittedException } from '../../../../attendance/roll-call/domain/roll-call.exceptions';
import type { TeacherAppAllocationRecord } from '../../../shared/teacher-app.types';
import { TeacherClassroomAttendanceAdapter } from '../infrastructure/teacher-classroom-attendance.adapter';

describe('TeacherClassroomAttendanceAdapter', () => {
  it('uses core roll-call roster lookup without creating a session', async () => {
    const { adapter, getRoster, resolveSession, saveEntries, submitSession } =
      createAdapter();

    await adapter.getRoster({
      allocation: allocationFixture(),
      date: '2026-09-10',
    });

    expect(getRoster.execute).toHaveBeenCalledWith({
      academicYearId: 'year-1',
      termId: 'term-1',
      date: '2026-09-10',
      scopeType: AttendanceScopeType.CLASSROOM,
      classroomId: 'classroom-1',
      mode: AttendanceMode.DAILY,
    });
    expect(resolveSession.execute).not.toHaveBeenCalled();
    expect(saveEntries.execute).not.toHaveBeenCalled();
    expect(submitSession.execute).not.toHaveBeenCalled();
  });

  it('resolves a draft daily classroom session through Attendance core', async () => {
    const { adapter, resolveSession } = createAdapter();

    const result = await adapter.resolveSession({
      allocation: allocationFixture(),
      date: '2026-09-10',
    });

    expect(resolveSession.execute).toHaveBeenCalledWith({
      academicYearId: 'year-1',
      termId: 'term-1',
      date: '2026-09-10',
      scopeType: AttendanceScopeType.CLASSROOM,
      classroomId: 'classroom-1',
      mode: AttendanceMode.DAILY,
    });
    expect(result.session.status).toBe(AttendanceSessionStatus.DRAFT);
  });

  it('rejects a session from another classroom as safe not-found', async () => {
    const { adapter, getSession } = createAdapter();
    getSession.execute.mockResolvedValue(
      sessionResponseFixture({ classroomId: 'classroom-2' }),
    );

    await expect(
      adapter.getSession({
        allocation: allocationFixture(),
        sessionId: 'session-1',
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('validates roster membership before saving entries', async () => {
    const { adapter, getSession, getRoster, saveEntries } = createAdapter();

    await adapter.updateEntries({
      allocation: allocationFixture(),
      sessionId: 'session-1',
      entries: [
        { studentId: 'student-1', status: 'present', note: 'Here' },
        { studentId: 'student-2', status: 'absent' },
      ],
    });

    expect(getSession.execute).toHaveBeenCalledWith('session-1');
    expect(getRoster.execute).toHaveBeenCalled();
    expect(saveEntries.execute).toHaveBeenCalledWith('session-1', {
      entries: [
        {
          studentId: 'student-1',
          status: AttendanceStatus.PRESENT,
          note: 'Here',
        },
        {
          studentId: 'student-2',
          status: AttendanceStatus.ABSENT,
          note: null,
        },
      ],
    });
  });

  it('rejects student updates outside the owned classroom roster', async () => {
    const { adapter, saveEntries } = createAdapter();

    await expect(
      adapter.updateEntries({
        allocation: allocationFixture(),
        sessionId: 'session-1',
        entries: [{ studentId: 'student-outside', status: 'present' }],
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
    expect(saveEntries.execute).not.toHaveBeenCalled();
  });

  it('propagates core submitted-session edit restrictions', async () => {
    const { adapter, saveEntries } = createAdapter();
    saveEntries.execute.mockRejectedValue(
      new AttendanceSessionAlreadySubmittedException({
        sessionId: 'session-1',
      }),
    );

    await expect(
      adapter.updateEntries({
        allocation: allocationFixture(),
        sessionId: 'session-1',
        entries: [{ studentId: 'student-1', status: 'present' }],
      }),
    ).rejects.toMatchObject({
      code: 'attendance.session.already_submitted',
    });
  });

  it('validates ownership before submitting through Attendance core', async () => {
    const { adapter, getSession, submitSession } = createAdapter();

    const result = await adapter.submitSession({
      allocation: allocationFixture(),
      sessionId: 'session-1',
    });

    expect(getSession.execute).toHaveBeenCalledWith('session-1');
    expect(submitSession.execute).toHaveBeenCalledWith('session-1');
    expect(result.session.status).toBe(AttendanceSessionStatus.SUBMITTED);
  });
});

function createAdapter(): {
  adapter: TeacherClassroomAttendanceAdapter;
  getRoster: jest.Mocked<GetRollCallRosterUseCase>;
  resolveSession: jest.Mocked<ResolveRollCallSessionUseCase>;
  getSession: jest.Mocked<GetRollCallSessionDetailUseCase>;
  saveEntries: jest.Mocked<SaveRollCallEntriesUseCase>;
  submitSession: jest.Mocked<SubmitRollCallSessionUseCase>;
} {
  const getRoster = {
    execute: jest.fn(() => Promise.resolve(rosterResponseFixture())),
  } as unknown as jest.Mocked<GetRollCallRosterUseCase>;
  const resolveSession = {
    execute: jest.fn(() => Promise.resolve(sessionResponseFixture())),
  } as unknown as jest.Mocked<ResolveRollCallSessionUseCase>;
  const getSession = {
    execute: jest.fn(() => Promise.resolve(sessionResponseFixture())),
  } as unknown as jest.Mocked<GetRollCallSessionDetailUseCase>;
  const saveEntries = {
    execute: jest.fn(() => Promise.resolve(savedEntriesResponseFixture())),
  } as unknown as jest.Mocked<SaveRollCallEntriesUseCase>;
  const submitSession = {
    execute: jest.fn(() =>
      Promise.resolve(
        sessionResponseFixture({
          status: AttendanceSessionStatus.SUBMITTED,
          submittedAt: '2026-09-10T10:00:00.000Z',
        }),
      ),
    ),
  } as unknown as jest.Mocked<SubmitRollCallSessionUseCase>;

  return {
    adapter: new TeacherClassroomAttendanceAdapter(
      getRoster,
      resolveSession,
      getSession,
      saveEntries,
      submitSession,
    ),
    getRoster,
    resolveSession,
    getSession,
    saveEntries,
    submitSession,
  };
}

function allocationFixture(
  overrides?: Partial<TeacherAppAllocationRecord>,
): TeacherAppAllocationRecord {
  return {
    id: 'allocation-1',
    schoolId: 'school-1',
    teacherUserId: 'teacher-1',
    subjectId: 'subject-1',
    classroomId: 'classroom-1',
    termId: 'term-1',
    subject: null,
    classroom: null,
    term: {
      id: 'term-1',
      schoolId: 'school-1',
      academicYearId: 'year-1',
      nameAr: 'Term AR',
      nameEn: 'Term',
      isActive: true,
    },
    ...overrides,
  };
}

function rosterResponseFixture() {
  return {
    session: sessionSummaryFixture(),
    items: [
      rosterRowFixture({ studentId: 'student-1', name: 'Mona Ahmed' }),
      rosterRowFixture({ studentId: 'student-2', name: 'Omar Hassan' }),
    ],
  };
}

function sessionResponseFixture(
  overrides?: Partial<{
    classroomId: string;
    status: AttendanceSessionStatus;
    submittedAt: string | null;
  }>,
) {
  return {
    session: sessionSummaryFixture(overrides),
    entries: [
      {
        id: 'entry-1',
        sessionId: 'session-1',
        studentId: 'student-1',
        enrollmentId: 'enrollment-1',
        status: AttendanceStatus.PRESENT,
        lateMinutes: null,
        minutesLate: null,
        earlyLeaveMinutes: null,
        minutesEarlyLeave: null,
        excuseReason: null,
        note: 'Here',
        markedById: 'teacher-1',
        markedAt: '2026-09-10T08:00:00.000Z',
        student: null,
        createdAt: '2026-09-10T08:00:00.000Z',
        updatedAt: '2026-09-10T08:00:00.000Z',
      },
    ],
  };
}

function savedEntriesResponseFixture() {
  return {
    session: sessionSummaryFixture(),
    entries: sessionResponseFixture().entries,
  };
}

function sessionSummaryFixture(
  overrides?: Partial<{
    classroomId: string;
    status: AttendanceSessionStatus;
    submittedAt: string | null;
  }>,
) {
  const classroomId = overrides?.classroomId ?? 'classroom-1';

  return {
    id: 'session-1',
    academicYearId: 'year-1',
    yearId: 'year-1',
    termId: 'term-1',
    date: '2026-09-10',
    scopeType: AttendanceScopeType.CLASSROOM,
    scopeKey: `classroom:${classroomId}`,
    scopeIds: {
      stageId: 'stage-1',
      gradeId: 'grade-1',
      sectionId: 'section-1',
      classroomId,
    },
    mode: AttendanceMode.DAILY,
    periodId: null,
    periodKey: 'daily',
    periodLabelAr: null,
    periodLabelEn: null,
    policyId: null,
    status: overrides?.status ?? AttendanceSessionStatus.DRAFT,
    submittedAt: overrides?.submittedAt ?? null,
    submittedById: null,
    createdAt: '2026-09-10T08:00:00.000Z',
    updatedAt: '2026-09-10T08:00:00.000Z',
  };
}

function rosterRowFixture(params: { studentId: string; name: string }) {
  const [firstName, lastName] = params.name.split(' ');

  return {
    id: params.studentId,
    studentId: params.studentId,
    name: params.name,
    firstName,
    lastName,
    fullNameEn: params.name,
    studentNumber: null,
    photoUrl: null,
    classroom: null,
    section: null,
    grade: null,
    stage: null,
    enrollmentId: `enrollment-${params.studentId}`,
    currentStatus: null,
    entryId: null,
    lateMinutes: null,
    earlyLeaveMinutes: null,
    excuseReason: null,
    note: null,
  };
}
