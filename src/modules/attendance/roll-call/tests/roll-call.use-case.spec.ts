import {
  AttendanceMode,
  AttendanceScopeType,
  AttendanceSessionStatus,
  AttendanceStatus,
  AuditOutcome,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../../common/context/request-context';
import {
  NotFoundDomainException,
} from '../../../../common/exceptions/domain-exception';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { GetRollCallRosterUseCase } from '../application/get-roll-call-roster.use-case';
import { ResolveRollCallSessionUseCase } from '../application/resolve-roll-call-session.use-case';
import { SaveRollCallEntriesUseCase } from '../application/save-roll-call-entries.use-case';
import { SubmitRollCallSessionUseCase } from '../application/submit-roll-call-session.use-case';
import { UnsubmitRollCallSessionUseCase } from '../application/unsubmit-roll-call-session.use-case';
import { UpsertRollCallEntryUseCase } from '../application/upsert-roll-call-entry.use-case';
import {
  AttendanceSessionAlreadySubmittedException,
  AttendanceSessionNotSubmittedException,
} from '../domain/roll-call.exceptions';
import { AttendanceRollCallRepository } from '../infrastructure/attendance-roll-call.repository';

describe('Attendance roll-call use cases', () => {
  const CLOSED_TERM_MESSAGE =
    'Attendance sessions cannot be changed in a closed term';

  async function withAttendanceScope<T>(fn: () => Promise<T>): Promise<T> {
    return runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: 'user-1', userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: 'membership-1',
        organizationId: 'org-1',
        schoolId: 'school-1',
        roleId: 'role-1',
        permissions: [
          'attendance.sessions.view',
          'attendance.sessions.manage',
          'attendance.sessions.submit',
          'attendance.entries.manage',
        ],
      });

      return fn();
    });
  }

  function activeTerm() {
    return {
      id: 'term-1',
      academicYearId: 'year-1',
      startDate: new Date('2026-09-01T00:00:00.000Z'),
      endDate: new Date('2026-12-31T00:00:00.000Z'),
      isActive: true,
    };
  }

  function inactiveTerm() {
    return { ...activeTerm(), isActive: false };
  }

  function classroomReference() {
    return {
      id: 'classroom-1',
      sectionId: 'section-1',
      section: {
        gradeId: 'grade-1',
        grade: {
          stageId: 'stage-1',
        },
      },
    };
  }

  function sessionRecord(
    overrides?: Partial<{
      id: string;
      policyId: string | null;
      mode: AttendanceMode;
      periodId: string | null;
      periodKey: string;
      status: AttendanceSessionStatus;
      submittedAt: Date | null;
      submittedById: string | null;
      updatedAt: Date;
      entries: unknown[];
      term: ReturnType<typeof activeTerm>;
    }>,
  ) {
    return {
      id: overrides?.id ?? 'session-1',
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
      mode: overrides?.mode ?? AttendanceMode.DAILY,
      periodId: overrides?.periodId ?? null,
      periodKey: overrides?.periodKey ?? 'daily',
      periodLabelAr: null,
      periodLabelEn: null,
      policyId: overrides?.policyId ?? null,
      status: overrides?.status ?? AttendanceSessionStatus.DRAFT,
      submittedAt: overrides?.submittedAt ?? null,
      submittedById: overrides?.submittedById ?? null,
      createdAt: new Date('2026-09-15T07:00:00.000Z'),
      updatedAt: overrides?.updatedAt ?? new Date('2026-09-15T07:00:00.000Z'),
      deletedAt: null,
      term: overrides?.term ?? activeTerm(),
      entries: overrides?.entries ?? [],
    };
  }

  function rosterEnrollment(overrides?: Partial<{ studentId: string }>) {
    const studentId = overrides?.studentId ?? 'student-1';

    return {
      id: 'enrollment-1',
      schoolId: 'school-1',
      studentId,
      academicYearId: 'year-1',
      termId: 'term-1',
      classroomId: 'classroom-1',
      status: 'ACTIVE',
      enrolledAt: new Date('2026-09-01T00:00:00.000Z'),
      endedAt: null,
      createdAt: new Date('2026-09-01T08:00:00.000Z'),
      updatedAt: new Date('2026-09-01T08:00:00.000Z'),
      student: {
        id: studentId,
        firstName: 'Layla',
        lastName: 'Hassan',
        status: 'ACTIVE',
      },
      classroom: {
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
      },
    };
  }

  function effectivePolicy(
    overrides?: Partial<{
      id: string;
      selectedPeriodIds: string[];
      scopeType: AttendanceScopeType;
      scopeKey: string;
      updatedAt: Date;
    }>,
  ) {
    return {
      id: overrides?.id ?? 'policy-1',
      scopeType: overrides?.scopeType ?? AttendanceScopeType.CLASSROOM,
      scopeKey: overrides?.scopeKey ?? 'classroom:classroom-1',
      selectedPeriodIds: overrides?.selectedPeriodIds ?? [],
      effectiveFrom: null,
      effectiveTo: null,
      updatedAt:
        overrides?.updatedAt ?? new Date('2026-09-01T00:00:00.000Z'),
    };
  }

  function entryRecord(
    overrides?: Partial<{
      status: AttendanceStatus;
      lateMinutes: number | null;
      earlyLeaveMinutes: number | null;
      excuseReason: string | null;
      note: string | null;
    }>,
  ) {
    return {
      id: 'entry-1',
      schoolId: 'school-1',
      sessionId: 'session-1',
      studentId: 'student-1',
      enrollmentId: 'enrollment-1',
      status: overrides?.status ?? AttendanceStatus.PRESENT,
      lateMinutes: overrides?.lateMinutes ?? null,
      earlyLeaveMinutes: overrides?.earlyLeaveMinutes ?? null,
      excuseReason: overrides?.excuseReason ?? null,
      note: overrides?.note ?? null,
      markedById: 'user-1',
      markedAt: new Date('2026-09-15T07:05:00.000Z'),
      createdAt: new Date('2026-09-15T07:05:00.000Z'),
      updatedAt: new Date('2026-09-15T07:05:00.000Z'),
      student: {
        id: 'student-1',
        firstName: 'Layla',
        lastName: 'Hassan',
        status: 'ACTIVE',
      },
      enrollment: {
        id: 'enrollment-1',
        classroomId: 'classroom-1',
        classroom: rosterEnrollment().classroom,
      },
    };
  }

  function baseRepository(overrides?: Partial<Record<string, jest.Mock>>) {
    return {
      findAcademicYearById: jest.fn().mockResolvedValue({ id: 'year-1' }),
      findTermById: jest.fn().mockResolvedValue(activeTerm()),
      findClassroomById: jest.fn().mockResolvedValue(classroomReference()),
      findEffectivePolicyCandidates: jest.fn().mockResolvedValue([]),
      findSessionByKey: jest.fn().mockResolvedValue(null),
      createSession: jest.fn().mockImplementation((data) =>
        Promise.resolve(
          sessionRecord({
            policyId: data.policyId ?? null,
            mode: data.mode,
            periodId: data.periodId ?? null,
            periodKey: data.periodKey,
          }),
        ),
      ),
      findSessionById: jest.fn().mockResolvedValue(sessionRecord()),
      submitSession: jest.fn().mockImplementation((params) =>
        Promise.resolve(
          sessionRecord({
            status: AttendanceSessionStatus.SUBMITTED,
            submittedAt: params.submittedAt,
            submittedById: params.submittedById,
          }),
        ),
      ),
      unsubmitSession: jest.fn().mockResolvedValue(
        sessionRecord({
          status: AttendanceSessionStatus.DRAFT,
          submittedAt: null,
          submittedById: null,
        }),
      ),
      listRosterStudents: jest.fn().mockResolvedValue([rosterEnrollment()]),
      bulkUpsertEntries: jest.fn().mockResolvedValue([entryRecord()]),
      ...overrides,
    } as unknown as AttendanceRollCallRepository;
  }

  function baseAuthRepository(overrides?: Partial<Record<string, jest.Mock>>) {
    return {
      createAuditLog: jest.fn().mockResolvedValue(undefined),
      ...overrides,
    } as unknown as AuthRepository;
  }

  it('creates a draft session when no matching session exists', async () => {
    const repository = baseRepository();
    const useCase = new ResolveRollCallSessionUseCase(repository);

    const result = await withAttendanceScope(() =>
      useCase.execute({
        yearId: 'year-1',
        termId: 'term-1',
        date: '2026-09-15',
        scopeType: AttendanceScopeType.CLASSROOM,
        classroomId: 'classroom-1',
        mode: AttendanceMode.DAILY,
      }),
    );

    expect(repository.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: 'school-1',
        scopeKey: 'classroom:classroom-1',
        periodKey: 'daily',
      }),
    );
    expect(result.session.status).toBe(AttendanceSessionStatus.DRAFT);
  });

  it('returns an existing resolved session when present', async () => {
    const repository = baseRepository({
      findSessionByKey: jest.fn().mockResolvedValue(sessionRecord()),
      createSession: jest.fn(),
    });
    const useCase = new ResolveRollCallSessionUseCase(repository);

    const result = await withAttendanceScope(() =>
      useCase.execute({
        yearId: 'year-1',
        termId: 'term-1',
        date: '2026-09-15',
        scopeType: AttendanceScopeType.CLASSROOM,
        classroomId: 'classroom-1',
        mode: AttendanceMode.DAILY,
      }),
    );

    expect(result.session.id).toBe('session-1');
    expect(repository.createSession).not.toHaveBeenCalled();
  });

  it('preserves legacy PERIOD session creation when no effective policy exists', async () => {
    const repository = baseRepository();
    const useCase = new ResolveRollCallSessionUseCase(repository);

    const result = await withAttendanceScope(() =>
      useCase.execute({
        yearId: 'year-1',
        termId: 'term-1',
        date: '2026-09-15',
        scopeType: AttendanceScopeType.CLASSROOM,
        classroomId: 'classroom-1',
        mode: AttendanceMode.PERIOD,
        periodKey: 'period-key-1',
      }),
    );

    expect(repository.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: AttendanceMode.PERIOD,
        periodId: null,
        periodKey: 'period-key-1',
        policyId: null,
      }),
    );
    expect(result.session.mode).toBe(AttendanceMode.PERIOD);
    expect(result.session.periodId).toBeNull();
    expect(result.session.periodKey).toBe('period-key-1');
  });

  it('ignores selectedPeriodIds for new DAILY sessions', async () => {
    const repository = baseRepository({
      findEffectivePolicyCandidates: jest
        .fn()
        .mockResolvedValue([
          effectivePolicy({ selectedPeriodIds: ['period-1'] }),
        ]),
    });
    const useCase = new ResolveRollCallSessionUseCase(repository);

    const result = await withAttendanceScope(() =>
      useCase.execute({
        yearId: 'year-1',
        termId: 'term-1',
        date: '2026-09-15',
        scopeType: AttendanceScopeType.CLASSROOM,
        classroomId: 'classroom-1',
        mode: AttendanceMode.DAILY,
      }),
    );

    expect(repository.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: AttendanceMode.DAILY,
        periodId: null,
        periodKey: 'daily',
        policyId: 'policy-1',
      }),
    );
    expect(result.session.mode).toBe(AttendanceMode.DAILY);
  });

  it('preserves legacy PERIOD behavior when selectedPeriodIds is empty', async () => {
    const repository = baseRepository({
      findEffectivePolicyCandidates: jest
        .fn()
        .mockResolvedValue([effectivePolicy({ selectedPeriodIds: [] })]),
    });
    const useCase = new ResolveRollCallSessionUseCase(repository);

    await withAttendanceScope(() =>
      useCase.execute({
        yearId: 'year-1',
        termId: 'term-1',
        date: '2026-09-15',
        scopeType: AttendanceScopeType.CLASSROOM,
        classroomId: 'classroom-1',
        mode: AttendanceMode.PERIOD,
        periodKey: 'period-key-1',
      }),
    );

    expect(repository.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: AttendanceMode.PERIOD,
        periodId: null,
        periodKey: 'period-key-1',
        policyId: 'policy-1',
      }),
    );
  });

  it('rejects a new PERIOD session with selectedPeriodIds and missing periodId', async () => {
    const repository = baseRepository({
      findEffectivePolicyCandidates: jest
        .fn()
        .mockResolvedValue([
          effectivePolicy({ selectedPeriodIds: ['period-1'] }),
        ]),
      createSession: jest.fn(),
    });
    const useCase = new ResolveRollCallSessionUseCase(repository);

    await expect(
      withAttendanceScope(() =>
        useCase.execute({
          yearId: 'year-1',
          termId: 'term-1',
          date: '2026-09-15',
          scopeType: AttendanceScopeType.CLASSROOM,
          classroomId: 'classroom-1',
          mode: AttendanceMode.PERIOD,
          periodKey: 'period-key-1',
          periodId: '   ',
        }),
      ),
    ).rejects.toMatchObject({
      code: 'validation.failed',
      details: expect.objectContaining({
        field: 'periodId',
        mode: AttendanceMode.PERIOD,
        policyId: 'policy-1',
      }),
    });
    expect(repository.createSession).not.toHaveBeenCalled();
  });

  it('rejects a new PERIOD session with selectedPeriodIds and disallowed periodId', async () => {
    const repository = baseRepository({
      findEffectivePolicyCandidates: jest
        .fn()
        .mockResolvedValue([
          effectivePolicy({ selectedPeriodIds: ['period-1'] }),
        ]),
      createSession: jest.fn(),
    });
    const useCase = new ResolveRollCallSessionUseCase(repository);

    await expect(
      withAttendanceScope(() =>
        useCase.execute({
          yearId: 'year-1',
          termId: 'term-1',
          date: '2026-09-15',
          scopeType: AttendanceScopeType.CLASSROOM,
          classroomId: 'classroom-1',
          mode: AttendanceMode.PERIOD,
          periodKey: 'period-key-1',
          periodId: 'period-2',
        }),
      ),
    ).rejects.toMatchObject({
      code: 'validation.failed',
      details: expect.objectContaining({
        field: 'periodId',
        mode: AttendanceMode.PERIOD,
        policyId: 'policy-1',
        periodId: 'period-2',
      }),
    });
    expect(repository.createSession).not.toHaveBeenCalled();
  });

  it('creates a new PERIOD session with selectedPeriodIds and allowed periodId', async () => {
    const repository = baseRepository({
      findEffectivePolicyCandidates: jest
        .fn()
        .mockResolvedValue([
          effectivePolicy({ selectedPeriodIds: ['period-1'] }),
        ]),
    });
    const useCase = new ResolveRollCallSessionUseCase(repository);

    const result = await withAttendanceScope(() =>
      useCase.execute({
        yearId: 'year-1',
        termId: 'term-1',
        date: '2026-09-15',
        scopeType: AttendanceScopeType.CLASSROOM,
        classroomId: 'classroom-1',
        mode: AttendanceMode.PERIOD,
        periodKey: 'period-key-1',
        periodId: ' period-1 ',
      }),
    );

    expect(repository.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: AttendanceMode.PERIOD,
        periodId: 'period-1',
        periodKey: 'period-key-1',
        policyId: 'policy-1',
      }),
    );
    expect(result.session.policyId).toBe('policy-1');
    expect(result.session.periodId).toBe('period-1');
  });

  it('returns an existing PERIOD session before selected-period validation', async () => {
    const repository = baseRepository({
      findSessionByKey: jest.fn().mockResolvedValue(
        sessionRecord({
          mode: AttendanceMode.PERIOD,
          periodId: 'legacy-period',
          periodKey: 'legacy-period-key',
          policyId: 'legacy-policy',
        }),
      ),
      findEffectivePolicyCandidates: jest.fn(),
      createSession: jest.fn(),
    });
    const useCase = new ResolveRollCallSessionUseCase(repository);

    const result = await withAttendanceScope(() =>
      useCase.execute({
        yearId: 'year-1',
        termId: 'term-1',
        date: '2026-09-15',
        scopeType: AttendanceScopeType.CLASSROOM,
        classroomId: 'classroom-1',
        mode: AttendanceMode.PERIOD,
        periodKey: 'legacy-period-key',
        periodId: 'disallowed-period',
      }),
    );

    expect(result.session.id).toBe('session-1');
    expect(result.session.policyId).toBe('legacy-policy');
    expect(repository.findEffectivePolicyCandidates).not.toHaveBeenCalled();
    expect(repository.createSession).not.toHaveBeenCalled();
  });

  it('attaches the effective policy when creating a session', async () => {
    const repository = baseRepository({
      findEffectivePolicyCandidates: jest.fn().mockResolvedValue([
        effectivePolicy(),
      ]),
      createSession: jest.fn().mockImplementation((data) =>
        Promise.resolve(
          sessionRecord({
            policyId: data.policyId,
          }),
        ),
      ),
    });
    const useCase = new ResolveRollCallSessionUseCase(repository);

    const result = await withAttendanceScope(() =>
      useCase.execute({
        yearId: 'year-1',
        termId: 'term-1',
        date: '2026-09-15',
        scopeType: AttendanceScopeType.CLASSROOM,
        classroomId: 'classroom-1',
        mode: AttendanceMode.DAILY,
      }),
    );

    expect(repository.createSession).toHaveBeenCalledWith(
      expect.objectContaining({ policyId: 'policy-1' }),
    );
    expect(result.session.policyId).toBe('policy-1');
  });

  it('submits a draft session and writes an audit record', async () => {
    const submittedAt = new Date('2026-09-15T07:20:00.000Z');
    const repository = baseRepository({
      submitSession: jest.fn().mockImplementation((params) =>
        Promise.resolve(
          sessionRecord({
            status: AttendanceSessionStatus.SUBMITTED,
            submittedAt: params.submittedAt,
            submittedById: params.submittedById,
            updatedAt: submittedAt,
          }),
        ),
      ),
    });
    const authRepository = baseAuthRepository();
    const useCase = new SubmitRollCallSessionUseCase(
      repository,
      authRepository,
    );

    const result = await withAttendanceScope(() =>
      useCase.execute('session-1'),
    );

    expect(repository.submitSession).toHaveBeenCalledWith({
      sessionId: 'session-1',
      schoolId: 'school-1',
      submittedAt: expect.any(Date),
      submittedById: 'user-1',
    });
    expect(result.session.status).toBe(AttendanceSessionStatus.SUBMITTED);
    expect(result.session.submittedById).toBe('user-1');
    expect(result.session.submittedAt).not.toBeNull();
    expect(authRepository.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'user-1',
        userType: UserType.SCHOOL_USER,
        organizationId: 'org-1',
        schoolId: 'school-1',
        module: 'attendance',
        action: 'attendance.session.submit',
        resourceType: 'attendance_session',
        resourceId: 'session-1',
        outcome: AuditOutcome.SUCCESS,
        before: {
          status: AttendanceSessionStatus.DRAFT,
          submittedAt: null,
          submittedById: null,
        },
        after: {
          status: AttendanceSessionStatus.SUBMITTED,
          submittedAt: expect.any(String),
          submittedById: 'user-1',
        },
      }),
    );
  });

  it('rejects submitting an already submitted session', async () => {
    const repository = baseRepository({
      findSessionById: jest.fn().mockResolvedValue(
        sessionRecord({
          status: AttendanceSessionStatus.SUBMITTED,
          submittedAt: new Date('2026-09-15T07:20:00.000Z'),
          submittedById: 'user-1',
        }),
      ),
      submitSession: jest.fn(),
    });
    const authRepository = baseAuthRepository();
    const useCase = new SubmitRollCallSessionUseCase(
      repository,
      authRepository,
    );

    await expect(
      withAttendanceScope(() => useCase.execute('session-1')),
    ).rejects.toBeInstanceOf(AttendanceSessionAlreadySubmittedException);
    expect(repository.submitSession).not.toHaveBeenCalled();
    expect(authRepository.createAuditLog).not.toHaveBeenCalled();
  });

  it('rejects submitting a session when the term is inactive', async () => {
    const repository = baseRepository({
      findSessionById: jest.fn().mockResolvedValue(
        sessionRecord({
          term: inactiveTerm(),
        }),
      ),
      submitSession: jest.fn(),
    });
    const authRepository = baseAuthRepository();
    const useCase = new SubmitRollCallSessionUseCase(
      repository,
      authRepository,
    );

    await expect(
      withAttendanceScope(() => useCase.execute('session-1')),
    ).rejects.toMatchObject({
      code: 'validation.failed',
      message: CLOSED_TERM_MESSAGE,
    });
    expect(repository.submitSession).not.toHaveBeenCalled();
    expect(authRepository.createAuditLog).not.toHaveBeenCalled();
  });

  it('unsubmits a submitted session and clears submission metadata', async () => {
    const submittedAt = new Date('2026-09-15T07:20:00.000Z');
    const repository = baseRepository({
      findSessionById: jest.fn().mockResolvedValue(
        sessionRecord({
          status: AttendanceSessionStatus.SUBMITTED,
          submittedAt,
          submittedById: 'user-1',
        }),
      ),
      unsubmitSession: jest.fn().mockResolvedValue(
        sessionRecord({
          status: AttendanceSessionStatus.DRAFT,
          submittedAt: null,
          submittedById: null,
        }),
      ),
    });
    const authRepository = baseAuthRepository();
    const useCase = new UnsubmitRollCallSessionUseCase(
      repository,
      authRepository,
    );

    const result = await withAttendanceScope(() =>
      useCase.execute('session-1'),
    );

    expect(repository.unsubmitSession).toHaveBeenCalledWith({
      sessionId: 'session-1',
      schoolId: 'school-1',
    });
    expect(result.session.status).toBe(AttendanceSessionStatus.DRAFT);
    expect(result.session.submittedAt).toBeNull();
    expect(result.session.submittedById).toBeNull();
    expect(authRepository.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'user-1',
        module: 'attendance',
        action: 'attendance.session.unsubmit',
        resourceType: 'attendance_session',
        resourceId: 'session-1',
        outcome: AuditOutcome.SUCCESS,
        before: {
          status: AttendanceSessionStatus.SUBMITTED,
          submittedAt: submittedAt.toISOString(),
          submittedById: 'user-1',
        },
        after: {
          status: AttendanceSessionStatus.DRAFT,
          submittedAt: null,
          submittedById: null,
        },
      }),
    );
  });

  it('rejects unsubmitting a draft session', async () => {
    const repository = baseRepository({
      findSessionById: jest.fn().mockResolvedValue(sessionRecord()),
      unsubmitSession: jest.fn(),
    });
    const authRepository = baseAuthRepository();
    const useCase = new UnsubmitRollCallSessionUseCase(
      repository,
      authRepository,
    );

    await expect(
      withAttendanceScope(() => useCase.execute('session-1')),
    ).rejects.toBeInstanceOf(AttendanceSessionNotSubmittedException);
    expect(repository.unsubmitSession).not.toHaveBeenCalled();
    expect(authRepository.createAuditLog).not.toHaveBeenCalled();
  });

  it('rejects unsubmitting a session when the term is inactive', async () => {
    const repository = baseRepository({
      findSessionById: jest.fn().mockResolvedValue(
        sessionRecord({
          status: AttendanceSessionStatus.SUBMITTED,
          term: inactiveTerm(),
        }),
      ),
      unsubmitSession: jest.fn(),
    });
    const authRepository = baseAuthRepository();
    const useCase = new UnsubmitRollCallSessionUseCase(
      repository,
      authRepository,
    );

    await expect(
      withAttendanceScope(() => useCase.execute('session-1')),
    ).rejects.toMatchObject({
      code: 'validation.failed',
      message: CLOSED_TERM_MESSAGE,
    });
    expect(repository.unsubmitSession).not.toHaveBeenCalled();
    expect(authRepository.createAuditLog).not.toHaveBeenCalled();
  });

  it('upserts draft entries for roster students', async () => {
    const repository = baseRepository();
    const useCase = new SaveRollCallEntriesUseCase(repository);

    const result = await withAttendanceScope(() =>
      useCase.execute('session-1', {
        entries: [
          {
            studentId: 'student-1',
            status: AttendanceStatus.PRESENT,
          },
        ],
      }),
    );

    expect(repository.bulkUpsertEntries).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: 'school-1',
        sessionId: 'session-1',
        markedById: 'user-1',
        entries: [
          expect.objectContaining({
            studentId: 'student-1',
            enrollmentId: 'enrollment-1',
            status: AttendanceStatus.PRESENT,
          }),
        ],
      }),
    );
    expect(result.entries[0].id).toBe('entry-1');
  });

  it('does not apply policy thresholds when saving draft entries', async () => {
    const repository = baseRepository({
      bulkUpsertEntries: jest.fn().mockImplementation((params) =>
        Promise.resolve([
          entryRecord({
            status: params.entries[0].status,
            lateMinutes: params.entries[0].lateMinutes,
          }),
        ]),
      ),
    });
    const useCase = new SaveRollCallEntriesUseCase(repository);

    const result = await withAttendanceScope(() =>
      useCase.execute('session-1', {
        entries: [
          {
            studentId: 'student-1',
            status: AttendanceStatus.PRESENT,
            lateMinutes: 20,
          },
        ],
      }),
    );

    expect(repository.bulkUpsertEntries).toHaveBeenCalledWith(
      expect.objectContaining({
        entries: [
          expect.objectContaining({
            studentId: 'student-1',
            status: AttendanceStatus.PRESENT,
            lateMinutes: 20,
          }),
        ],
      }),
    );
    expect(result.entries[0]).toEqual(
      expect.objectContaining({
        status: AttendanceStatus.PRESENT,
        lateMinutes: 20,
      }),
    );
  });

  it('rejects draft entry mutation when session is not DRAFT', async () => {
    const repository = baseRepository({
      findSessionById: jest
        .fn()
        .mockResolvedValue(
          sessionRecord({ status: AttendanceSessionStatus.SUBMITTED }),
        ),
      bulkUpsertEntries: jest.fn(),
    });
    const useCase = new SaveRollCallEntriesUseCase(repository);

    await expect(
      withAttendanceScope(() =>
        useCase.execute('session-1', {
          entries: [
            {
              studentId: 'student-1',
              status: AttendanceStatus.PRESENT,
            },
          ],
        }),
      ),
    ).rejects.toBeInstanceOf(AttendanceSessionAlreadySubmittedException);
    expect(repository.bulkUpsertEntries).not.toHaveBeenCalled();
  });

  it('rejects bulk saving entries when the term is inactive', async () => {
    const repository = baseRepository({
      findSessionById: jest.fn().mockResolvedValue(
        sessionRecord({
          term: inactiveTerm(),
        }),
      ),
      bulkUpsertEntries: jest.fn(),
    });
    const useCase = new SaveRollCallEntriesUseCase(repository);

    await expect(
      withAttendanceScope(() =>
        useCase.execute('session-1', {
          entries: [
            {
              studentId: 'student-1',
              status: AttendanceStatus.PRESENT,
            },
          ],
        }),
      ),
    ).rejects.toMatchObject({
      code: 'validation.failed',
      message: CLOSED_TERM_MESSAGE,
    });
    expect(repository.listRosterStudents).not.toHaveBeenCalled();
    expect(repository.bulkUpsertEntries).not.toHaveBeenCalled();
  });

  it('rejects targeted entry upsert when session is submitted', async () => {
    const repository = baseRepository({
      findSessionById: jest
        .fn()
        .mockResolvedValue(
          sessionRecord({ status: AttendanceSessionStatus.SUBMITTED }),
        ),
      bulkUpsertEntries: jest.fn(),
    });
    const saveUseCase = new SaveRollCallEntriesUseCase(repository);
    const useCase = new UpsertRollCallEntryUseCase(saveUseCase);

    await expect(
      withAttendanceScope(() =>
        useCase.execute('session-1', 'student-1', {
          status: AttendanceStatus.PRESENT,
        }),
      ),
    ).rejects.toBeInstanceOf(AttendanceSessionAlreadySubmittedException);
    expect(repository.bulkUpsertEntries).not.toHaveBeenCalled();
  });

  it('rejects targeted entry upsert when the term is inactive', async () => {
    const repository = baseRepository({
      findSessionById: jest.fn().mockResolvedValue(
        sessionRecord({
          term: inactiveTerm(),
        }),
      ),
      bulkUpsertEntries: jest.fn(),
    });
    const saveUseCase = new SaveRollCallEntriesUseCase(repository);
    const useCase = new UpsertRollCallEntryUseCase(saveUseCase);

    await expect(
      withAttendanceScope(() =>
        useCase.execute('session-1', 'student-1', {
          status: AttendanceStatus.PRESENT,
        }),
      ),
    ).rejects.toMatchObject({
      code: 'validation.failed',
      message: CLOSED_TERM_MESSAGE,
    });
    expect(repository.listRosterStudents).not.toHaveBeenCalled();
    expect(repository.bulkUpsertEntries).not.toHaveBeenCalled();
  });

  it('rejects a draft entry for a student outside the session scope', async () => {
    const repository = baseRepository({
      listRosterStudents: jest.fn().mockResolvedValue([rosterEnrollment()]),
      bulkUpsertEntries: jest.fn(),
    });
    const useCase = new SaveRollCallEntriesUseCase(repository);

    await expect(
      withAttendanceScope(() =>
        useCase.execute('session-1', {
          entries: [
            {
              studentId: 'student-outside',
              status: AttendanceStatus.PRESENT,
            },
          ],
        }),
      ),
    ).rejects.toBeInstanceOf(NotFoundDomainException);
    expect(repository.bulkUpsertEntries).not.toHaveBeenCalled();
  });

  it('resolves classroom roster filtering with normalized hierarchy', async () => {
    const repository = baseRepository();
    const useCase = new GetRollCallRosterUseCase(repository);

    const result = await withAttendanceScope(() =>
      useCase.execute({
        yearId: 'year-1',
        termId: 'term-1',
        date: '2026-09-15',
        scopeType: AttendanceScopeType.CLASSROOM,
        classroomId: 'classroom-1',
      }),
    );

    expect(repository.listRosterStudents).toHaveBeenCalledWith({
      academicYearId: 'year-1',
      termId: 'term-1',
      scope: {
        scopeType: AttendanceScopeType.CLASSROOM,
        scopeKey: 'classroom:classroom-1',
        stageId: 'stage-1',
        gradeId: 'grade-1',
        sectionId: 'section-1',
        classroomId: 'classroom-1',
      },
    });
    expect(result.items).toHaveLength(1);
  });
});
