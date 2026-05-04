import {
  AttendanceMode,
  AttendanceScopeType,
  AttendanceSessionStatus,
  AttendanceStatus,
} from '@prisma/client';
import { NotFoundDomainException } from '../../../../../common/exceptions/domain-exception';
import { AttendanceSessionAlreadySubmittedException } from '../../../../attendance/roll-call/domain/roll-call.exceptions';
import { TeacherAppAccessService } from '../../../access/teacher-app-access.service';
import {
  TeacherAppAllocationNotFoundException,
  TeacherAppRequiredTeacherException,
} from '../../../shared/teacher-app.errors';
import type { TeacherAppAllocationRecord } from '../../../shared/teacher-app.types';
import { GetTeacherClassroomAttendanceRosterUseCase } from '../application/get-teacher-classroom-attendance-roster.use-case';
import { GetTeacherClassroomAttendanceSessionUseCase } from '../application/get-teacher-classroom-attendance-session.use-case';
import { ResolveTeacherClassroomAttendanceSessionUseCase } from '../application/resolve-teacher-classroom-attendance-session.use-case';
import { SubmitTeacherClassroomAttendanceSessionUseCase } from '../application/submit-teacher-classroom-attendance-session.use-case';
import { UpdateTeacherClassroomAttendanceEntriesUseCase } from '../application/update-teacher-classroom-attendance-entries.use-case';
import { TeacherClassroomAttendanceAdapter } from '../infrastructure/teacher-classroom-attendance.adapter';

describe('Teacher classroom attendance use-cases', () => {
  it('rejects non-teacher actors through the Teacher App access service', async () => {
    for (const scenario of createUseCaseScenarios()) {
      const { useCases, accessService, attendanceAdapter } = createUseCases();
      accessService.assertTeacherOwnsAllocation.mockRejectedValue(
        new TeacherAppRequiredTeacherException({ reason: 'actor_not_teacher' }),
      );

      await expect(scenario.execute(useCases)).rejects.toMatchObject({
        code: 'teacher_app.actor.required_teacher',
      });
      expect(attendanceAdapter.getRoster).not.toHaveBeenCalled();
      expect(attendanceAdapter.resolveSession).not.toHaveBeenCalled();
      expect(attendanceAdapter.getSession).not.toHaveBeenCalled();
      expect(attendanceAdapter.updateEntries).not.toHaveBeenCalled();
      expect(attendanceAdapter.submitSession).not.toHaveBeenCalled();
    }
  });

  it('checks allocation ownership before each attendance access', async () => {
    for (const scenario of createUseCaseScenarios()) {
      const { useCases, accessService, attendanceAdapter } = createUseCases();

      await scenario.execute(useCases);

      const accessOrder =
        accessService.assertTeacherOwnsAllocation.mock.invocationCallOrder[0];
      const adapterOrder =
        attendanceAdapter[scenario.adapterMethod].mock.invocationCallOrder[0];
      expect(accessOrder).toBeLessThan(adapterOrder);
      expect(accessService.assertTeacherOwnsAllocation).toHaveBeenCalledWith(
        'allocation-1',
      );
    }
  });

  it('returns attendance roster for the owned allocation without mutation or private fields', async () => {
    const { useCases, attendanceAdapter } = createUseCases();

    const result = await useCases.getRoster.execute('allocation-1', {
      date: '2026-09-10',
    });
    const json = JSON.stringify(result);

    expect(attendanceAdapter.getRoster).toHaveBeenCalledWith({
      allocation: expect.objectContaining({
        id: 'allocation-1',
        classroomId: 'classroom-1',
      }),
      date: '2026-09-10',
    });
    expect(attendanceAdapter.resolveSession).not.toHaveBeenCalled();
    expect(attendanceAdapter.updateEntries).not.toHaveBeenCalled();
    expect(attendanceAdapter.submitSession).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      classId: 'allocation-1',
      date: '2026-09-10',
      session: {
        id: 'session-1',
        status: 'draft',
        submittedAt: null,
      },
      pagination: {
        page: 1,
        limit: 20,
        total: 2,
      },
    });
    expect(result.students.map((student) => student.id)).toEqual([
      'student-1',
      'student-2',
    ]);
    expect(json).not.toContain('student-outside');
    expect(json).not.toContain('schoolId');
    expect(json).not.toContain('scheduleId');
    expect(json).not.toContain('period');
    expect(json).not.toContain('timetable');
  });

  it('resolves or creates a draft session for the owned classroom', async () => {
    const { useCases } = createUseCases();

    const result = await useCases.resolveSession.execute('allocation-1', {
      date: '2026-09-10',
    });
    const json = JSON.stringify(result);

    expect(result).toMatchObject({
      classId: 'allocation-1',
      date: '2026-09-10',
      session: {
        id: 'session-1',
        status: 'draft',
        submittedAt: null,
      },
      entries: [],
    });
    expect(json).not.toContain('schoolId');
    expect(json).not.toContain('scheduleId');
  });

  it('returns owned session detail and maps entries safely', async () => {
    const { useCases } = createUseCases();

    const result = await useCases.getSession.execute(
      'allocation-1',
      'session-1',
    );

    expect(result.entries).toEqual([
      {
        id: 'entry-1',
        studentId: 'student-1',
        displayName: 'Mona Ahmed',
        attendanceStatus: 'present',
        arrivalTime: null,
        dismissalTime: null,
        note: 'Here',
        markedAt: '2026-09-10T08:00:00.000Z',
      },
    ]);
  });

  it('rejects sessions from another classroom as safe not-found', async () => {
    const { useCases, attendanceAdapter } = createUseCases();
    attendanceAdapter.getSession.mockRejectedValue(
      new NotFoundDomainException('Attendance session not found', {
        sessionId: 'other-session',
      }),
    );

    await expect(
      useCases.getSession.execute('allocation-1', 'other-session'),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('updates entries through Attendance core and rejects outside students', async () => {
    const { useCases, attendanceAdapter } = createUseCases();

    const result = await useCases.updateEntries.execute(
      'allocation-1',
      'session-1',
      {
        entries: [{ studentId: 'student-1', status: 'late', note: 'Traffic' }],
      },
    );

    expect(attendanceAdapter.updateEntries).toHaveBeenCalledWith({
      allocation: expect.objectContaining({ classroomId: 'classroom-1' }),
      sessionId: 'session-1',
      entries: [{ studentId: 'student-1', status: 'late', note: 'Traffic' }],
    });
    expect(result.entries[0]).toMatchObject({
      studentId: 'student-1',
      attendanceStatus: 'present',
    });

    attendanceAdapter.updateEntries.mockRejectedValueOnce(
      new NotFoundDomainException('Student not found in attendance roster', {
        studentId: 'student-outside',
      }),
    );
    await expect(
      useCases.updateEntries.execute('allocation-1', 'session-1', {
        entries: [{ studentId: 'student-outside', status: 'present' }],
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('propagates submitted-session edit restrictions from Attendance core', async () => {
    const { useCases, attendanceAdapter } = createUseCases();
    attendanceAdapter.updateEntries.mockRejectedValue(
      new AttendanceSessionAlreadySubmittedException({
        sessionId: 'session-1',
      }),
    );

    await expect(
      useCases.updateEntries.execute('allocation-1', 'session-1', {
        entries: [{ studentId: 'student-1', status: 'present' }],
      }),
    ).rejects.toMatchObject({
      code: 'attendance.session.already_submitted',
    });
  });

  it('submits an owned draft session without exposing school or schedule fields', async () => {
    const { useCases } = createUseCases();

    const result = await useCases.submitSession.execute(
      'allocation-1',
      'session-1',
    );
    const json = JSON.stringify(result);

    expect(result.session).toEqual({
      id: 'session-1',
      status: 'submitted',
      submittedAt: '2026-09-10T10:00:00.000Z',
    });
    expect(json).not.toContain('schoolId');
    expect(json).not.toContain('scheduleId');
  });

  it('rejects same-school and cross-school unowned allocations before attendance access', async () => {
    for (const classId of ['same-school-other-teacher', 'cross-school']) {
      const { useCases, accessService, attendanceAdapter } = createUseCases();
      accessService.assertTeacherOwnsAllocation.mockRejectedValue(
        new TeacherAppAllocationNotFoundException({ classId }),
      );

      await expect(
        useCases.getRoster.execute(classId, { date: '2026-09-10' }),
      ).rejects.toMatchObject({
        code: 'teacher_app.allocation.not_found',
      });
      expect(attendanceAdapter.getRoster).not.toHaveBeenCalled();
    }
  });
});

function createUseCaseScenarios(): Array<{
  adapterMethod: keyof Pick<
    jest.Mocked<TeacherClassroomAttendanceAdapter>,
    | 'getRoster'
    | 'resolveSession'
    | 'getSession'
    | 'updateEntries'
    | 'submitSession'
  >;
  execute: (useCases: ReturnType<typeof createUseCases>['useCases']) => Promise<unknown>;
}> {
  return [
    {
      adapterMethod: 'getRoster',
      execute: (useCases) =>
        useCases.getRoster.execute('allocation-1', { date: '2026-09-10' }),
    },
    {
      adapterMethod: 'resolveSession',
      execute: (useCases) =>
        useCases.resolveSession.execute('allocation-1', {
          date: '2026-09-10',
        }),
    },
    {
      adapterMethod: 'getSession',
      execute: (useCases) =>
        useCases.getSession.execute('allocation-1', 'session-1'),
    },
    {
      adapterMethod: 'updateEntries',
      execute: (useCases) =>
        useCases.updateEntries.execute('allocation-1', 'session-1', {
          entries: [{ studentId: 'student-1', status: 'present' }],
        }),
    },
    {
      adapterMethod: 'submitSession',
      execute: (useCases) =>
        useCases.submitSession.execute('allocation-1', 'session-1'),
    },
  ];
}

function createUseCases(): {
  useCases: {
    getRoster: GetTeacherClassroomAttendanceRosterUseCase;
    resolveSession: ResolveTeacherClassroomAttendanceSessionUseCase;
    getSession: GetTeacherClassroomAttendanceSessionUseCase;
    updateEntries: UpdateTeacherClassroomAttendanceEntriesUseCase;
    submitSession: SubmitTeacherClassroomAttendanceSessionUseCase;
  };
  accessService: jest.Mocked<TeacherAppAccessService>;
  attendanceAdapter: jest.Mocked<TeacherClassroomAttendanceAdapter>;
} {
  const accessService = {
    assertTeacherOwnsAllocation: jest.fn(() =>
      Promise.resolve(allocationFixture()),
    ),
  } as unknown as jest.Mocked<TeacherAppAccessService>;
  const attendanceAdapter = {
    getRoster: jest.fn(() => Promise.resolve(rosterResponseFixture())),
    resolveSession: jest.fn(() => Promise.resolve(sessionResponseFixture())),
    getSession: jest.fn(() => Promise.resolve(sessionDetailFixture())),
    updateEntries: jest.fn(() => Promise.resolve(savedEntriesResponseFixture())),
    submitSession: jest.fn(() =>
      Promise.resolve(
        sessionDetailFixture({
          status: AttendanceSessionStatus.SUBMITTED,
          submittedAt: '2026-09-10T10:00:00.000Z',
        }),
      ),
    ),
  } as unknown as jest.Mocked<TeacherClassroomAttendanceAdapter>;

  return {
    useCases: {
      getRoster: new GetTeacherClassroomAttendanceRosterUseCase(
        accessService,
        attendanceAdapter,
      ),
      resolveSession: new ResolveTeacherClassroomAttendanceSessionUseCase(
        accessService,
        attendanceAdapter,
      ),
      getSession: new GetTeacherClassroomAttendanceSessionUseCase(
        accessService,
        attendanceAdapter,
      ),
      updateEntries: new UpdateTeacherClassroomAttendanceEntriesUseCase(
        accessService,
        attendanceAdapter,
      ),
      submitSession: new SubmitTeacherClassroomAttendanceSessionUseCase(
        accessService,
        attendanceAdapter,
      ),
    },
    accessService,
    attendanceAdapter,
  };
}

function allocationFixture(): TeacherAppAllocationRecord {
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
  };
}

function rosterResponseFixture() {
  return {
    session: sessionSummaryFixture(),
    items: [
      rosterRowFixture({
        studentId: 'student-1',
        name: 'Mona Ahmed',
        currentStatus: AttendanceStatus.PRESENT,
        note: 'Here',
      }),
      rosterRowFixture({
        studentId: 'student-2',
        name: 'Omar Hassan',
        currentStatus: null,
        note: null,
      }),
    ],
  };
}

function sessionResponseFixture() {
  return {
    session: sessionSummaryFixture(),
    entries: [],
  };
}

function sessionDetailFixture(
  overrides?: Partial<{
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
        student: {
          id: 'student-1',
          studentId: 'student-1',
          name: 'Mona Ahmed',
          firstName: 'Mona',
          lastName: 'Ahmed',
          fullNameEn: 'Mona Ahmed',
          studentNumber: null,
          photoUrl: null,
          classroom: null,
          section: null,
          grade: null,
          stage: null,
        },
        createdAt: '2026-09-10T08:00:00.000Z',
        updatedAt: '2026-09-10T08:00:00.000Z',
      },
    ],
  };
}

function savedEntriesResponseFixture() {
  return {
    session: sessionSummaryFixture(),
    entries: sessionDetailFixture().entries,
  };
}

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
    submittedById: null,
    createdAt: '2026-09-10T08:00:00.000Z',
    updatedAt: '2026-09-10T08:00:00.000Z',
  };
}

function rosterRowFixture(params: {
  studentId: string;
  name: string;
  currentStatus: AttendanceStatus | null;
  note: string | null;
}) {
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
    currentStatus: params.currentStatus,
    entryId: null,
    lateMinutes: null,
    earlyLeaveMinutes: null,
    excuseReason: null,
    note: params.note,
  };
}
