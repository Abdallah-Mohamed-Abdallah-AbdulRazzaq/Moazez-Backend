import {
  AttendanceMode,
  AttendanceScopeType,
  AttendanceSessionStatus,
  AttendanceStatus,
  AuditOutcome,
  StudentStatus,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../../common/context/request-context';
import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { CorrectAttendanceEntryUseCase } from '../application/correct-attendance-entry.use-case';
import { AttendanceSessionNotSubmittedException } from '../domain/roll-call.exceptions';
import { AttendanceRollCallRepository } from '../infrastructure/attendance-roll-call.repository';

describe('CorrectAttendanceEntryUseCase', () => {
  async function withAttendanceScope<T>(fn: () => Promise<T>): Promise<T> {
    return runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: 'user-1', userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: 'membership-1',
        organizationId: 'org-1',
        schoolId: 'school-1',
        roleId: 'role-1',
        permissions: ['attendance.entries.manage'],
      });

      return fn();
    });
  }

  function sessionRecord(
    overrides?: Partial<{
      status: AttendanceSessionStatus;
    }>,
  ) {
    return {
      id: 'session-1',
      schoolId: 'school-1',
      academicYearId: 'year-1',
      termId: 'term-1',
      date: new Date('2026-09-15T00:00:00.000Z'),
      scopeType: AttendanceScopeType.CLASSROOM,
      scopeKey: 'classroom:classroom-1',
      stageId: 'stage-1',
      gradeId: 'grade-1',
      sectionId: 'section-1',
      classroomId: 'classroom-1',
      mode: AttendanceMode.DAILY,
      periodId: null,
      periodKey: 'daily',
      periodLabelAr: null,
      periodLabelEn: null,
      policyId: null,
      status: overrides?.status ?? AttendanceSessionStatus.SUBMITTED,
      submittedAt: new Date('2026-09-15T07:20:00.000Z'),
      submittedById: 'user-1',
      createdAt: new Date('2026-09-15T07:00:00.000Z'),
      updatedAt: new Date('2026-09-15T07:20:00.000Z'),
      deletedAt: null,
    };
  }

  function classroomPlacement() {
    return {
      id: 'classroom-1',
      nameAr: 'Classroom AR',
      nameEn: 'Classroom 1A',
      section: {
        id: 'section-1',
        nameAr: 'Section AR',
        nameEn: 'Section A',
        grade: {
          id: 'grade-1',
          nameAr: 'Grade AR',
          nameEn: 'Grade 1',
          stage: {
            id: 'stage-1',
            nameAr: 'Stage AR',
            nameEn: 'Primary',
          },
        },
      },
    };
  }

  function entryRecord(
    overrides?: Partial<{
      status: AttendanceStatus;
      lateMinutes: number | null;
      earlyLeaveMinutes: number | null;
      excuseReason: string | null;
      note: string | null;
      markedById: string | null;
      markedAt: Date | null;
      updatedAt: Date;
    }>,
  ) {
    return {
      id: 'entry-1',
      schoolId: 'school-1',
      sessionId: 'session-1',
      studentId: 'student-1',
      enrollmentId: 'enrollment-1',
      status: overrides?.status ?? AttendanceStatus.ABSENT,
      lateMinutes: overrides?.lateMinutes ?? null,
      earlyLeaveMinutes: overrides?.earlyLeaveMinutes ?? null,
      excuseReason: overrides?.excuseReason ?? null,
      note: overrides?.note ?? null,
      markedById: overrides?.markedById ?? 'marker-1',
      markedAt:
        overrides?.markedAt ?? new Date('2026-09-15T07:10:00.000Z'),
      createdAt: new Date('2026-09-15T07:05:00.000Z'),
      updatedAt:
        overrides?.updatedAt ?? new Date('2026-09-15T07:10:00.000Z'),
      student: {
        id: 'student-1',
        firstName: 'Layla',
        lastName: 'Hassan',
        status: StudentStatus.ACTIVE,
      },
      enrollment: {
        id: 'enrollment-1',
        classroomId: 'classroom-1',
        classroom: classroomPlacement(),
      },
    };
  }

  function correctedEntry(overrides?: Parameters<typeof entryRecord>[0]) {
    return entryRecord({
      markedById: 'user-1',
      markedAt: new Date('2026-09-15T09:00:00.000Z'),
      updatedAt: new Date('2026-09-15T09:00:00.000Z'),
      ...overrides,
    });
  }

  function baseRepository(overrides?: Partial<Record<string, jest.Mock>>) {
    return {
      findSessionEntryForCorrection: jest.fn().mockResolvedValue({
        session: sessionRecord(),
        entry: entryRecord(),
      }),
      correctSubmittedEntry: jest
        .fn()
        .mockResolvedValue(correctedEntry({ status: AttendanceStatus.PRESENT })),
      submitSession: jest.fn(),
      unsubmitSession: jest.fn(),
      ...overrides,
    } as unknown as AttendanceRollCallRepository & {
      submitSession: jest.Mock;
      unsubmitSession: jest.Mock;
    };
  }

  function baseAuthRepository(overrides?: Partial<Record<string, jest.Mock>>) {
    return {
      createAuditLog: jest.fn().mockResolvedValue(undefined),
      ...overrides,
    } as unknown as AuthRepository;
  }

  it('corrects a submitted ABSENT entry to PRESENT and clears incident fields', async () => {
    const repository = baseRepository();
    const useCase = new CorrectAttendanceEntryUseCase(
      repository,
      baseAuthRepository(),
    );

    const result = await withAttendanceScope(() =>
      useCase.execute('session-1', 'student-1', {
        status: AttendanceStatus.PRESENT,
        correctionReason: 'Attendance officer verified classroom sheet',
      }),
    );

    expect(repository.correctSubmittedEntry).toHaveBeenCalledWith({
      entryId: 'entry-1',
      sessionId: 'session-1',
      studentId: 'student-1',
      correction: {
        status: AttendanceStatus.PRESENT,
        lateMinutes: null,
        earlyLeaveMinutes: null,
        excuseReason: null,
        note: null,
      },
      markedById: 'user-1',
      markedAt: expect.any(Date),
    });
    expect(result.status).toBe(AttendanceStatus.PRESENT);
    expect(repository.submitSession).not.toHaveBeenCalled();
    expect(repository.unsubmitSession).not.toHaveBeenCalled();
  });

  it('corrects a submitted PRESENT entry to LATE when lateMinutes is positive', async () => {
    const repository = baseRepository({
      findSessionEntryForCorrection: jest.fn().mockResolvedValue({
        session: sessionRecord(),
        entry: entryRecord({ status: AttendanceStatus.PRESENT }),
      }),
      correctSubmittedEntry: jest.fn().mockResolvedValue(
        correctedEntry({
          status: AttendanceStatus.LATE,
          lateMinutes: 12,
        }),
      ),
    });
    const useCase = new CorrectAttendanceEntryUseCase(
      repository,
      baseAuthRepository(),
    );

    const result = await withAttendanceScope(() =>
      useCase.execute('session-1', 'student-1', {
        status: AttendanceStatus.LATE,
        lateMinutes: 12,
        correctionReason: 'Arrived after roll call was submitted',
      }),
    );

    expect(repository.correctSubmittedEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        correction: expect.objectContaining({
          status: AttendanceStatus.LATE,
          lateMinutes: 12,
          earlyLeaveMinutes: null,
        }),
      }),
    );
    expect(result.status).toBe(AttendanceStatus.LATE);
    expect(result.lateMinutes).toBe(12);
  });

  it('rejects LATE correction without positive lateMinutes', async () => {
    const repository = baseRepository({ correctSubmittedEntry: jest.fn() });
    const useCase = new CorrectAttendanceEntryUseCase(
      repository,
      baseAuthRepository(),
    );

    await expect(
      withAttendanceScope(() =>
        useCase.execute('session-1', 'student-1', {
          status: AttendanceStatus.LATE,
          lateMinutes: 0,
          correctionReason: 'Missing minute value',
        }),
      ),
    ).rejects.toBeInstanceOf(ValidationDomainException);
    expect(repository.correctSubmittedEntry).not.toHaveBeenCalled();
  });

  it('rejects EARLY_LEAVE correction without positive earlyLeaveMinutes', async () => {
    const repository = baseRepository({ correctSubmittedEntry: jest.fn() });
    const useCase = new CorrectAttendanceEntryUseCase(
      repository,
      baseAuthRepository(),
    );

    await expect(
      withAttendanceScope(() =>
        useCase.execute('session-1', 'student-1', {
          status: AttendanceStatus.EARLY_LEAVE,
          earlyLeaveMinutes: 0,
          correctionReason: 'Missing minute value',
        }),
      ),
    ).rejects.toBeInstanceOf(ValidationDomainException);
    expect(repository.correctSubmittedEntry).not.toHaveBeenCalled();
  });

  it('rejects correction on a DRAFT session', async () => {
    const repository = baseRepository({
      findSessionEntryForCorrection: jest.fn().mockResolvedValue({
        session: sessionRecord({ status: AttendanceSessionStatus.DRAFT }),
        entry: entryRecord(),
      }),
      correctSubmittedEntry: jest.fn(),
    });
    const useCase = new CorrectAttendanceEntryUseCase(
      repository,
      baseAuthRepository(),
    );

    await expect(
      withAttendanceScope(() =>
        useCase.execute('session-1', 'student-1', {
          status: AttendanceStatus.PRESENT,
          correctionReason: 'Draft sessions use regular roll-call edits',
        }),
      ),
    ).rejects.toBeInstanceOf(AttendanceSessionNotSubmittedException);
    expect(repository.correctSubmittedEntry).not.toHaveBeenCalled();
  });

  it('rejects UNMARKED as a correction target', async () => {
    const repository = baseRepository({ correctSubmittedEntry: jest.fn() });
    const useCase = new CorrectAttendanceEntryUseCase(
      repository,
      baseAuthRepository(),
    );

    await expect(
      withAttendanceScope(() =>
        useCase.execute('session-1', 'student-1', {
          status: AttendanceStatus.UNMARKED,
          correctionReason: 'Submitted sessions need explicit status',
        }),
      ),
    ).rejects.toBeInstanceOf(ValidationDomainException);
    expect(repository.correctSubmittedEntry).not.toHaveBeenCalled();
  });

  it('records an audit log with before and after correction metadata', async () => {
    const repository = baseRepository({
      correctSubmittedEntry: jest.fn().mockResolvedValue(
        correctedEntry({
          status: AttendanceStatus.EXCUSED,
          excuseReason: 'Medical note verified',
        }),
      ),
    });
    const authRepository = baseAuthRepository();
    const useCase = new CorrectAttendanceEntryUseCase(
      repository,
      authRepository,
    );

    await withAttendanceScope(() =>
      useCase.execute('session-1', 'student-1', {
        status: AttendanceStatus.EXCUSED,
        excuseReason: 'Medical note verified',
        correctionReason: 'Approved documentation arrived after submit',
      }),
    );

    expect(authRepository.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'user-1',
        userType: UserType.SCHOOL_USER,
        organizationId: 'org-1',
        schoolId: 'school-1',
        module: 'attendance',
        action: 'attendance.entry.correct',
        resourceType: 'attendance_entry',
        resourceId: 'entry-1',
        outcome: AuditOutcome.SUCCESS,
        before: expect.objectContaining({
          status: AttendanceStatus.ABSENT,
          lateMinutes: null,
          earlyLeaveMinutes: null,
          excuseReason: null,
          note: null,
        }),
        after: expect.objectContaining({
          status: AttendanceStatus.EXCUSED,
          excuseReason: 'Medical note verified',
          correctionReason: 'Approved documentation arrived after submit',
          markedById: 'user-1',
          markedAt: expect.any(String),
        }),
      }),
    );
  });
});
