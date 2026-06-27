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
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';
import { TimetableAttendancePeriodReferenceService } from '../../../academics/timetable/application/timetable-attendance-period-reference.service';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { AttendanceGuardianAbsenceNotificationService } from '../application/attendance-guardian-absence-notification.service';
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

  function thresholdPolicy(
    overrides?: Partial<{
      id: string;
      lateThresholdMinutes: number | null;
      earlyLeaveThresholdMinutes: number | null;
    }>,
  ) {
    return {
      id: overrides?.id ?? 'policy-1',
      lateThresholdMinutes: overrides?.lateThresholdMinutes ?? null,
      earlyLeaveThresholdMinutes:
        overrides?.earlyLeaveThresholdMinutes ?? null,
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
      findPolicyThresholdsById: jest.fn().mockResolvedValue(null),
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

  function periodReferenceService(isValid = true) {
    const service = {
      findValidPeriodIdsForAttendanceContext: jest.fn(),
      isPeriodValidForAttendanceContext: jest.fn().mockResolvedValue(isValid),
    };

    return service as unknown as TimetableAttendancePeriodReferenceService &
      typeof service;
  }

  function resolveUseCase(
    repository: AttendanceRollCallRepository,
    references = periodReferenceService(),
  ): ResolveRollCallSessionUseCase {
    return new ResolveRollCallSessionUseCase(repository, references);
  }

  function baseAuthRepository(overrides?: Partial<Record<string, jest.Mock>>) {
    return {
      createAuditLog: jest.fn().mockResolvedValue(undefined),
      ...overrides,
    } as unknown as AuthRepository;
  }

  function guardianAbsenceNotificationService(
    overrides?: Partial<Record<string, jest.Mock>>,
  ) {
    return {
      notifySubmittedAbsences: jest.fn().mockResolvedValue(undefined),
      ...overrides,
    } as unknown as AttendanceGuardianAbsenceNotificationService & {
      notifySubmittedAbsences: jest.Mock;
    };
  }

  it('creates a draft session when no matching session exists', async () => {
    const repository = baseRepository();
    const useCase = resolveUseCase(repository);

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
    const periodReferences = periodReferenceService(false);
    const useCase = resolveUseCase(repository, periodReferences);

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
    expect(
      periodReferences.isPeriodValidForAttendanceContext,
    ).not.toHaveBeenCalled();
  });

  it('preserves legacy PERIOD session creation when no effective policy exists', async () => {
    const repository = baseRepository();
    const periodReferences = periodReferenceService(false);
    const useCase = resolveUseCase(repository, periodReferences);

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
    expect(
      periodReferences.isPeriodValidForAttendanceContext,
    ).not.toHaveBeenCalled();
  });

  it('rejects a supplied PERIOD periodId that is outside the timetable academic context', async () => {
    const repository = baseRepository({
      createSession: jest.fn(),
    });
    const periodReferences = periodReferenceService(false);
    const useCase = resolveUseCase(repository, periodReferences);

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
          periodId: ' missing-period ',
        }),
      ),
    ).rejects.toMatchObject({
      code: 'validation.failed',
      details: {
        field: 'periodId',
        mode: AttendanceMode.PERIOD,
        periodId: 'missing-period',
        reason: 'not_found_or_outside_context',
      },
    });
    expect(repository.createSession).not.toHaveBeenCalled();
    expect(
      periodReferences.isPeriodValidForAttendanceContext,
    ).toHaveBeenCalledWith({
      academicYearId: 'year-1',
      termId: 'term-1',
      periodId: 'missing-period',
    });
  });

  it('ignores selectedPeriodIds for new DAILY sessions', async () => {
    const repository = baseRepository({
      findEffectivePolicyCandidates: jest
        .fn()
        .mockResolvedValue([
          effectivePolicy({ selectedPeriodIds: ['period-1'] }),
        ]),
    });
    const periodReferences = periodReferenceService(false);
    const useCase = resolveUseCase(repository, periodReferences);

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
    expect(
      periodReferences.isPeriodValidForAttendanceContext,
    ).not.toHaveBeenCalled();
  });

  it('preserves legacy PERIOD behavior when selectedPeriodIds is empty', async () => {
    const repository = baseRepository({
      findEffectivePolicyCandidates: jest
        .fn()
        .mockResolvedValue([effectivePolicy({ selectedPeriodIds: [] })]),
    });
    const periodReferences = periodReferenceService(false);
    const useCase = resolveUseCase(repository, periodReferences);

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
    expect(
      periodReferences.isPeriodValidForAttendanceContext,
    ).not.toHaveBeenCalled();
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
    const periodReferences = periodReferenceService(false);
    const useCase = resolveUseCase(repository, periodReferences);

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
    expect(
      periodReferences.isPeriodValidForAttendanceContext,
    ).not.toHaveBeenCalled();
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
    const periodReferences = periodReferenceService(false);
    const useCase = resolveUseCase(repository, periodReferences);

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
    expect(
      periodReferences.isPeriodValidForAttendanceContext,
    ).not.toHaveBeenCalled();
  });

  it('creates a new PERIOD session with selectedPeriodIds and allowed periodId', async () => {
    const repository = baseRepository({
      findEffectivePolicyCandidates: jest
        .fn()
        .mockResolvedValue([
          effectivePolicy({ selectedPeriodIds: ['period-1'] }),
        ]),
    });
    const periodReferences = periodReferenceService(true);
    const useCase = resolveUseCase(repository, periodReferences);

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
    expect(
      periodReferences.isPeriodValidForAttendanceContext,
    ).toHaveBeenCalledWith({
      academicYearId: 'year-1',
      termId: 'term-1',
      periodId: 'period-1',
    });
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
    const periodReferences = periodReferenceService(false);
    const useCase = resolveUseCase(repository, periodReferences);

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
    expect(
      periodReferences.isPeriodValidForAttendanceContext,
    ).not.toHaveBeenCalled();
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
    const useCase = resolveUseCase(repository);

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

  it('dispatches guardian absence notifications after the submit audit path', async () => {
    const submitted = sessionRecord({
      policyId: 'policy-1',
      status: AttendanceSessionStatus.SUBMITTED,
      submittedAt: new Date('2026-09-15T07:20:00.000Z'),
      submittedById: 'user-1',
      entries: [entryRecord({ status: AttendanceStatus.ABSENT })],
    });
    const repository = baseRepository({
      findSessionById: jest
        .fn()
        .mockResolvedValue(sessionRecord({ policyId: 'policy-1' })),
      submitSession: jest.fn().mockResolvedValue(submitted),
    });
    const authRepository = baseAuthRepository();
    const notifications = guardianAbsenceNotificationService();
    const useCase = new SubmitRollCallSessionUseCase(
      repository,
      authRepository,
      notifications,
    );

    const result = await withAttendanceScope(() =>
      useCase.execute('session-1'),
    );

    expect(authRepository.createAuditLog).toHaveBeenCalled();
    expect(notifications.notifySubmittedAbsences).toHaveBeenCalledWith(
      submitted,
    );
    expect(
      (authRepository.createAuditLog as jest.Mock).mock.invocationCallOrder[0],
    ).toBeLessThan(
      notifications.notifySubmittedAbsences.mock.invocationCallOrder[0],
    );
    expect(result.session.status).toBe(AttendanceSessionStatus.SUBMITTED);
  });

  it('keeps submit successful when guardian absence notification orchestration fails', async () => {
    const repository = baseRepository({
      submitSession: jest.fn().mockResolvedValue(
        sessionRecord({
          status: AttendanceSessionStatus.SUBMITTED,
          submittedAt: new Date('2026-09-15T07:20:00.000Z'),
          submittedById: 'user-1',
        }),
      ),
    });
    const authRepository = baseAuthRepository();
    const notifications = guardianAbsenceNotificationService({
      notifySubmittedAbsences: jest
        .fn()
        .mockRejectedValue(new Error('notification failed')),
    });
    const useCase = new SubmitRollCallSessionUseCase(
      repository,
      authRepository,
      notifications,
    );

    const result = await withAttendanceScope(() =>
      useCase.execute('session-1'),
    );

    expect(result.session.status).toBe(AttendanceSessionStatus.SUBMITTED);
    expect(notifications.notifySubmittedAbsences).toHaveBeenCalled();
  });

  it('does not inspect policy thresholds or mutate entries when submitting a session', async () => {
    const repository = baseRepository({
      findSessionById: jest
        .fn()
        .mockResolvedValue(sessionRecord({ policyId: 'policy-1' })),
      findPolicyThresholdsById: jest
        .fn()
        .mockResolvedValue(thresholdPolicy({ lateThresholdMinutes: 10 })),
      submitSession: jest.fn().mockImplementation((params) =>
        Promise.resolve(
          sessionRecord({
            policyId: 'policy-1',
            status: AttendanceSessionStatus.SUBMITTED,
            submittedAt: params.submittedAt,
            submittedById: params.submittedById,
            entries: [
              entryRecord({
                status: AttendanceStatus.PRESENT,
                lateMinutes: 20,
              }),
            ],
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

    expect(repository.findPolicyThresholdsById).not.toHaveBeenCalled();
    expect(repository.submitSession).toHaveBeenCalledWith({
      sessionId: 'session-1',
      schoolId: 'school-1',
      submittedAt: expect.any(Date),
      submittedById: 'user-1',
    });
    expect(result.entries[0]).toEqual(
      expect.objectContaining({
        status: AttendanceStatus.PRESENT,
        lateMinutes: 20,
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

  it('leaves draft PRESENT entries unchanged when the session has no linked policy', async () => {
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
    expect(repository.findPolicyThresholdsById).not.toHaveBeenCalled();
  });

  it('converts draft PRESENT entries to LATE when lateMinutes meets the linked policy threshold', async () => {
    const repository = baseRepository({
      findSessionById: jest
        .fn()
        .mockResolvedValue(sessionRecord({ policyId: 'policy-1' })),
      findPolicyThresholdsById: jest
        .fn()
        .mockResolvedValue(thresholdPolicy({ lateThresholdMinutes: 10 })),
      bulkUpsertEntries: jest.fn().mockImplementation((params) =>
        Promise.resolve([
          entryRecord({
            status: params.entries[0].status,
            lateMinutes: params.entries[0].lateMinutes,
            earlyLeaveMinutes: params.entries[0].earlyLeaveMinutes,
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
            lateMinutes: 10,
            earlyLeaveMinutes: 3,
          },
        ],
      }),
    );

    expect(repository.findPolicyThresholdsById).toHaveBeenCalledWith(
      'policy-1',
    );
    expect(repository.bulkUpsertEntries).toHaveBeenCalledWith(
      expect.objectContaining({
        entries: [
          expect.objectContaining({
            studentId: 'student-1',
            status: AttendanceStatus.LATE,
            lateMinutes: 10,
            earlyLeaveMinutes: null,
          }),
        ],
      }),
    );
    expect(result.entries[0]).toEqual(
      expect.objectContaining({
        status: AttendanceStatus.LATE,
        lateMinutes: 10,
        earlyLeaveMinutes: null,
      }),
    );
  });

  it('converts draft PRESENT entries to EARLY_LEAVE when earlyLeaveMinutes meets the linked policy threshold', async () => {
    const repository = baseRepository({
      findSessionById: jest
        .fn()
        .mockResolvedValue(sessionRecord({ policyId: 'policy-1' })),
      findPolicyThresholdsById: jest.fn().mockResolvedValue(
        thresholdPolicy({
          earlyLeaveThresholdMinutes: 12,
        }),
      ),
      bulkUpsertEntries: jest.fn().mockImplementation((params) =>
        Promise.resolve([
          entryRecord({
            status: params.entries[0].status,
            lateMinutes: params.entries[0].lateMinutes,
            earlyLeaveMinutes: params.entries[0].earlyLeaveMinutes,
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
            lateMinutes: 3,
            earlyLeaveMinutes: 12,
          },
        ],
      }),
    );

    expect(repository.bulkUpsertEntries).toHaveBeenCalledWith(
      expect.objectContaining({
        entries: [
          expect.objectContaining({
            studentId: 'student-1',
            status: AttendanceStatus.EARLY_LEAVE,
            lateMinutes: null,
            earlyLeaveMinutes: 12,
          }),
        ],
      }),
    );
    expect(result.entries[0]).toEqual(
      expect.objectContaining({
        status: AttendanceStatus.EARLY_LEAVE,
        lateMinutes: null,
        earlyLeaveMinutes: 12,
      }),
    );
  });

  it('leaves draft PRESENT entries unchanged when minute values are below configured thresholds', async () => {
    const repository = baseRepository({
      findSessionById: jest
        .fn()
        .mockResolvedValue(sessionRecord({ policyId: 'policy-1' })),
      findPolicyThresholdsById: jest.fn().mockResolvedValue(
        thresholdPolicy({
          lateThresholdMinutes: 10,
          earlyLeaveThresholdMinutes: 12,
        }),
      ),
      bulkUpsertEntries: jest.fn().mockImplementation((params) =>
        Promise.resolve([
          entryRecord({
            status: params.entries[0].status,
            lateMinutes: params.entries[0].lateMinutes,
            earlyLeaveMinutes: params.entries[0].earlyLeaveMinutes,
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
            lateMinutes: 9,
            earlyLeaveMinutes: 11,
          },
        ],
      }),
    );

    expect(repository.bulkUpsertEntries).toHaveBeenCalledWith(
      expect.objectContaining({
        entries: [
          expect.objectContaining({
            status: AttendanceStatus.PRESENT,
            lateMinutes: 9,
            earlyLeaveMinutes: 11,
          }),
        ],
      }),
    );
    expect(result.entries[0]).toEqual(
      expect.objectContaining({
        status: AttendanceStatus.PRESENT,
        lateMinutes: 9,
        earlyLeaveMinutes: 11,
      }),
    );
  });

  it('leaves draft PRESENT entries unchanged when linked policy thresholds are null', async () => {
    const repository = baseRepository({
      findSessionById: jest
        .fn()
        .mockResolvedValue(sessionRecord({ policyId: 'policy-1' })),
      findPolicyThresholdsById: jest
        .fn()
        .mockResolvedValue(thresholdPolicy()),
      bulkUpsertEntries: jest.fn().mockImplementation((params) =>
        Promise.resolve([
          entryRecord({
            status: params.entries[0].status,
            lateMinutes: params.entries[0].lateMinutes,
            earlyLeaveMinutes: params.entries[0].earlyLeaveMinutes,
          }),
        ]),
      ),
    });
    const useCase = new SaveRollCallEntriesUseCase(repository);

    await withAttendanceScope(() =>
      useCase.execute('session-1', {
        entries: [
          {
            studentId: 'student-1',
            status: AttendanceStatus.PRESENT,
            lateMinutes: 20,
            earlyLeaveMinutes: 20,
          },
        ],
      }),
    );

    expect(repository.bulkUpsertEntries).toHaveBeenCalledWith(
      expect.objectContaining({
        entries: [
          expect.objectContaining({
            status: AttendanceStatus.PRESENT,
            lateMinutes: 20,
            earlyLeaveMinutes: 20,
          }),
        ],
      }),
    );
  });

  it('leaves explicit LATE and EARLY_LEAVE draft entries unchanged when minutes are missing', async () => {
    const repository = baseRepository({
      findSessionById: jest
        .fn()
        .mockResolvedValue(sessionRecord({ policyId: 'policy-1' })),
      listRosterStudents: jest.fn().mockResolvedValue([
        rosterEnrollment({ studentId: 'student-1' }),
        {
          ...rosterEnrollment({ studentId: 'student-2' }),
          id: 'enrollment-2',
        },
      ]),
      findPolicyThresholdsById: jest.fn().mockResolvedValue(
        thresholdPolicy({
          lateThresholdMinutes: 10,
          earlyLeaveThresholdMinutes: 12,
        }),
      ),
      bulkUpsertEntries: jest.fn().mockImplementation((params) =>
        Promise.resolve(
          params.entries.map((entry, index) =>
            entryRecord({
              status: entry.status,
              lateMinutes: entry.lateMinutes,
              earlyLeaveMinutes: entry.earlyLeaveMinutes,
              note: `entry-${index + 1}`,
            }),
          ),
        ),
      ),
    });
    const useCase = new SaveRollCallEntriesUseCase(repository);

    await withAttendanceScope(() =>
      useCase.execute('session-1', {
        entries: [
          {
            studentId: 'student-1',
            status: AttendanceStatus.LATE,
          },
          {
            studentId: 'student-2',
            status: AttendanceStatus.EARLY_LEAVE,
          },
        ],
      }),
    );

    expect(repository.bulkUpsertEntries).toHaveBeenCalledWith(
      expect.objectContaining({
        entries: [
          expect.objectContaining({
            studentId: 'student-1',
            status: AttendanceStatus.LATE,
            lateMinutes: null,
            earlyLeaveMinutes: null,
          }),
          expect.objectContaining({
            studentId: 'student-2',
            status: AttendanceStatus.EARLY_LEAVE,
            lateMinutes: null,
            earlyLeaveMinutes: null,
          }),
        ],
      }),
    );
  });

  it('rejects draft PRESENT entries that trigger both late and early-leave thresholds', async () => {
    const repository = baseRepository({
      findSessionById: jest
        .fn()
        .mockResolvedValue(sessionRecord({ policyId: 'policy-1' })),
      findPolicyThresholdsById: jest.fn().mockResolvedValue(
        thresholdPolicy({
          lateThresholdMinutes: 10,
          earlyLeaveThresholdMinutes: 12,
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
              lateMinutes: 10,
              earlyLeaveMinutes: 12,
            },
          ],
        }),
      ),
    ).rejects.toMatchObject({
      code: 'validation.failed',
      message:
        'Attendance entry cannot match both late and early-leave thresholds',
      details: {
        field: 'status',
        studentId: 'student-1',
        lateMinutes: 10,
        earlyLeaveMinutes: 12,
        lateThresholdMinutes: 10,
        earlyLeaveThresholdMinutes: 12,
        reason: 'ambiguous_threshold_match',
      },
    });
    expect(repository.bulkUpsertEntries).not.toHaveBeenCalled();
  });

  it('keeps ambiguous threshold validation details free of tenant internals', async () => {
    const repository = baseRepository({
      findSessionById: jest
        .fn()
        .mockResolvedValue(sessionRecord({ policyId: 'policy-1' })),
      findPolicyThresholdsById: jest.fn().mockResolvedValue(
        thresholdPolicy({
          lateThresholdMinutes: 10,
          earlyLeaveThresholdMinutes: 12,
        }),
      ),
      bulkUpsertEntries: jest.fn(),
    });
    const useCase = new SaveRollCallEntriesUseCase(repository);

    try {
      await withAttendanceScope(() =>
        useCase.execute('session-1', {
          entries: [
            {
              studentId: 'student-1',
              status: AttendanceStatus.PRESENT,
              lateMinutes: 10,
              earlyLeaveMinutes: 12,
            },
          ],
        }),
      );
      throw new Error('Expected ambiguous threshold validation to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationDomainException);
      const details = (error as ValidationDomainException).details ?? {};
      expect(details).not.toHaveProperty('schoolId');
      expect(details).not.toHaveProperty('organizationId');
      expect(details).not.toHaveProperty('membershipId');
      expect(details).not.toHaveProperty('roleId');
      expect(details).not.toHaveProperty('deletedAt');
      expect(details).not.toHaveProperty('actorId');
    }
  });

  it('applies threshold normalization through targeted entry upsert', async () => {
    const repository = baseRepository({
      findSessionById: jest
        .fn()
        .mockResolvedValue(sessionRecord({ policyId: 'policy-1' })),
      findPolicyThresholdsById: jest
        .fn()
        .mockResolvedValue(thresholdPolicy({ lateThresholdMinutes: 10 })),
      bulkUpsertEntries: jest.fn().mockImplementation((params) =>
        Promise.resolve([
          entryRecord({
            status: params.entries[0].status,
            lateMinutes: params.entries[0].lateMinutes,
            earlyLeaveMinutes: params.entries[0].earlyLeaveMinutes,
          }),
        ]),
      ),
    });
    const saveUseCase = new SaveRollCallEntriesUseCase(repository);
    const useCase = new UpsertRollCallEntryUseCase(saveUseCase);

    const result = await withAttendanceScope(() =>
      useCase.execute('session-1', 'student-1', {
        status: AttendanceStatus.PRESENT,
        lateMinutes: 15,
      }),
    );

    expect(repository.bulkUpsertEntries).toHaveBeenCalledWith(
      expect.objectContaining({
        entries: [
          expect.objectContaining({
            studentId: 'student-1',
            status: AttendanceStatus.LATE,
            lateMinutes: 15,
            earlyLeaveMinutes: null,
          }),
        ],
      }),
    );
    expect(result.status).toBe(AttendanceStatus.LATE);
    expect(result.lateMinutes).toBe(15);
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
