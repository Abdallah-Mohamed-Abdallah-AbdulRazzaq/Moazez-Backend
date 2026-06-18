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
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { CorrectAttendanceAbsenceEarlyLeaveUseCase } from '../application/correct-attendance-absence-early-leave.use-case';
import { ListAttendanceAbsencesUseCase } from '../application/list-attendance-absences.use-case';
import { MarkAttendanceAbsenceExcusedUseCase } from '../application/mark-attendance-absence-excused.use-case';
import { AttendanceAbsencesRepository } from '../infrastructure/attendance-absences.repository';

describe('ListAttendanceAbsencesUseCase', () => {
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
        permissions: ['attendance.absences.view', 'attendance.entries.manage'],
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

  function incidentRecord(
    status: AttendanceStatus,
    id = status.toLowerCase(),
    overrides?: Partial<{
      sessionStatus: AttendanceSessionStatus;
      term: ReturnType<typeof activeTerm>;
      lateMinutes: number | null;
      earlyLeaveMinutes: number | null;
      excuseReason: string | null;
      note: string | null;
      markedById: string | null;
      markedAt: Date | null;
    }>,
  ) {
    const timestamp = new Date('2026-09-15T07:00:00.000Z');

    return {
      id,
      schoolId: 'school-1',
      sessionId: 'session-1',
      studentId: `student-${id}`,
      enrollmentId: `enrollment-${id}`,
      status,
      lateMinutes:
        overrides?.lateMinutes ??
        (status === AttendanceStatus.LATE ? 8 : null),
      earlyLeaveMinutes:
        overrides?.earlyLeaveMinutes ??
        (status === AttendanceStatus.EARLY_LEAVE ? 12 : null),
      excuseReason:
        overrides?.excuseReason ??
        (status === AttendanceStatus.EXCUSED ? 'Medical' : null),
      note: overrides?.note ?? null,
      markedById: overrides?.markedById ?? null,
      markedAt: overrides?.markedAt ?? null,
      createdAt: timestamp,
      updatedAt: timestamp,
      student: {
        id: `student-${id}`,
        firstName: 'Layla',
        lastName: id,
        status: StudentStatus.ACTIVE,
      },
      enrollment: {
        id: `enrollment-${id}`,
        classroomId: 'classroom-1',
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
      },
      session: {
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
        status: overrides?.sessionStatus ?? AttendanceSessionStatus.SUBMITTED,
        submittedAt: timestamp,
        submittedById: 'user-1',
        createdAt: timestamp,
        updatedAt: timestamp,
        deletedAt: null,
        term: overrides?.term ?? activeTerm(),
        stage: {
          id: 'stage-1',
          nameAr: 'Stage AR',
          nameEn: 'Primary',
        },
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
      },
    };
  }

  function repositoryWithIncidents(
    incidents: ReturnType<typeof incidentRecord>[],
  ) {
    return {
      listIncidents: jest.fn().mockResolvedValue(incidents),
    } as unknown as AttendanceAbsencesRepository;
  }

  function correctionRepository(params?: {
    incident?: ReturnType<typeof incidentRecord> | null;
    corrected?: ReturnType<typeof incidentRecord> | null;
  }) {
    return {
      findIncidentById: jest.fn().mockResolvedValue(
        params && 'incident' in params
          ? params.incident
          : incidentRecord(AttendanceStatus.ABSENT),
      ),
      correctIncidentEntry: jest.fn().mockResolvedValue(
        params && 'corrected' in params
          ? params.corrected
          : incidentRecord(AttendanceStatus.EXCUSED, 'absent', {
              excuseReason: 'Medical appointment',
              note: 'Parent called',
              markedById: 'user-1',
              markedAt: new Date('2026-09-15T09:00:00.000Z'),
            }),
      ),
    } as unknown as AttendanceAbsencesRepository & {
      findIncidentById: jest.Mock;
      correctIncidentEntry: jest.Mock;
    };
  }

  function authRepository() {
    return {
      createAuditLog: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuthRepository & {
      createAuditLog: jest.Mock;
    };
  }

  it('includes absent, late, early-leave, and excused incidents', async () => {
    const repository = repositoryWithIncidents([
      incidentRecord(AttendanceStatus.ABSENT),
      incidentRecord(AttendanceStatus.LATE),
      incidentRecord(AttendanceStatus.EARLY_LEAVE),
      incidentRecord(AttendanceStatus.EXCUSED),
    ]);
    const useCase = new ListAttendanceAbsencesUseCase(repository);

    const result = await useCase.execute({});

    expect(result.items.map((item) => item.status)).toEqual([
      AttendanceStatus.ABSENT,
      AttendanceStatus.LATE,
      AttendanceStatus.EARLY_LEAVE,
      AttendanceStatus.EXCUSED,
    ]);
  });

  it('defensively excludes present and unmarked entries from the response', async () => {
    const repository = repositoryWithIncidents([
      incidentRecord(AttendanceStatus.ABSENT),
      incidentRecord(AttendanceStatus.PRESENT),
      incidentRecord(AttendanceStatus.UNMARKED),
    ]);
    const useCase = new ListAttendanceAbsencesUseCase(repository);

    const result = await useCase.execute({});

    expect(result.items).toHaveLength(1);
    expect(result.items[0].status).toBe(AttendanceStatus.ABSENT);
  });

  it('marks a submitted absence incident as excused and audits the source entry correction', async () => {
    const repository = correctionRepository({
      incident: incidentRecord(AttendanceStatus.ABSENT, 'absent', {
        note: 'Initial absence',
      }),
      corrected: incidentRecord(AttendanceStatus.EXCUSED, 'absent', {
        excuseReason: 'Medical appointment',
        note: 'Parent called',
        markedById: 'user-1',
        markedAt: new Date('2026-09-15T09:00:00.000Z'),
      }),
    });
    const audit = authRepository();
    const useCase = new MarkAttendanceAbsenceExcusedUseCase(
      repository,
      audit,
    );

    const result = await withAttendanceScope(() =>
      useCase.execute('absent', {
        excuseReason: '  Medical appointment  ',
        note: ' Parent called ',
        correctionReason: 'Attendance office verified the note',
      }),
    );

    expect(repository.correctIncidentEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        entryId: 'absent',
        correction: {
          status: AttendanceStatus.EXCUSED,
          lateMinutes: null,
          earlyLeaveMinutes: null,
          excuseReason: 'Medical appointment',
          note: 'Parent called',
        },
        markedById: 'user-1',
        markedAt: expect.any(Date),
      }),
    );
    expect(audit.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'user-1',
        userType: UserType.SCHOOL_USER,
        organizationId: 'org-1',
        schoolId: 'school-1',
        module: 'attendance',
        action: 'attendance.entry.correct',
        resourceType: 'attendance_entry',
        resourceId: 'absent',
        outcome: AuditOutcome.SUCCESS,
        after: expect.objectContaining({
          status: AttendanceStatus.EXCUSED,
          correctionReason: 'Attendance office verified the note',
          correctionSource: 'attendance.absences.excuse',
        }),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: 'absent',
        entryId: 'absent',
        status: AttendanceStatus.EXCUSED,
        excuseReason: 'Medical appointment',
        note: 'Parent called',
      }),
    );
    expect(result).not.toHaveProperty('schoolId');
    expect(result).not.toHaveProperty('term');
    expect(result).not.toHaveProperty('markedById');
  });

  it.each([AttendanceStatus.PRESENT, AttendanceStatus.UNMARKED])(
    'rejects marking %s as an excused absence incident',
    async (status) => {
      const repository = correctionRepository({
        incident: incidentRecord(status),
        corrected: null,
      });
      const useCase = new MarkAttendanceAbsenceExcusedUseCase(
        repository,
        authRepository(),
      );

      await expect(
        withAttendanceScope(() =>
          useCase.execute('entry-1', {
            correctionReason: 'Not a correctable absence incident',
          }),
        ),
      ).rejects.toMatchObject({
        code: 'validation.failed',
      });
      expect(repository.correctIncidentEntry).not.toHaveBeenCalled();
    },
  );

  it('rejects marking an already excused incident as excused again', async () => {
    const repository = correctionRepository({
      incident: incidentRecord(AttendanceStatus.EXCUSED),
      corrected: null,
    });
    const useCase = new MarkAttendanceAbsenceExcusedUseCase(
      repository,
      authRepository(),
    );

    await expect(
      withAttendanceScope(() =>
        useCase.execute('excused', {
          correctionReason: 'Already excused',
        }),
      ),
    ).rejects.toMatchObject({
      code: 'validation.failed',
    });
    expect(repository.correctIncidentEntry).not.toHaveBeenCalled();
  });

  it('rejects absence correction when the session is not submitted', async () => {
    const repository = correctionRepository({
      incident: incidentRecord(AttendanceStatus.ABSENT, 'draft', {
        sessionStatus: AttendanceSessionStatus.DRAFT,
      }),
      corrected: null,
    });
    const useCase = new MarkAttendanceAbsenceExcusedUseCase(
      repository,
      authRepository(),
    );

    await expect(
      withAttendanceScope(() =>
        useCase.execute('draft', {
          correctionReason: 'Draft sessions are not absence incidents',
        }),
      ),
    ).rejects.toMatchObject({
      code: 'attendance.session.not_submitted',
    });
    expect(repository.correctIncidentEntry).not.toHaveBeenCalled();
  });

  it('rejects absence correction when the session term is inactive', async () => {
    const repository = correctionRepository({
      incident: incidentRecord(AttendanceStatus.ABSENT, 'closed-term', {
        term: { ...activeTerm(), isActive: false },
      }),
      corrected: null,
    });
    const useCase = new MarkAttendanceAbsenceExcusedUseCase(
      repository,
      authRepository(),
    );

    await expect(
      withAttendanceScope(() =>
        useCase.execute('closed-term', {
          correctionReason: 'Closed term correction',
        }),
      ),
    ).rejects.toMatchObject({
      code: 'validation.failed',
      message: CLOSED_TERM_MESSAGE,
    });
    expect(repository.correctIncidentEntry).not.toHaveBeenCalled();
  });

  it('corrects a submitted absence incident to early leave', async () => {
    const repository = correctionRepository({
      incident: incidentRecord(AttendanceStatus.LATE, 'late', {
        lateMinutes: 8,
        note: 'Arrived late',
      }),
      corrected: incidentRecord(AttendanceStatus.EARLY_LEAVE, 'late', {
        lateMinutes: null,
        earlyLeaveMinutes: 22,
        note: 'Dismissed by nurse',
        markedById: 'user-1',
        markedAt: new Date('2026-09-15T10:00:00.000Z'),
      }),
    });
    const audit = authRepository();
    const useCase = new CorrectAttendanceAbsenceEarlyLeaveUseCase(
      repository,
      audit,
    );

    const result = await withAttendanceScope(() =>
      useCase.execute('late', {
        earlyLeaveMinutes: 22,
        note: ' Dismissed by nurse ',
        correctionReason: 'Attendance officer corrected the incident type',
      }),
    );

    expect(repository.correctIncidentEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        entryId: 'late',
        correction: {
          status: AttendanceStatus.EARLY_LEAVE,
          lateMinutes: null,
          earlyLeaveMinutes: 22,
          excuseReason: null,
          note: 'Dismissed by nurse',
        },
      }),
    );
    expect(audit.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'attendance.entry.correct',
        after: expect.objectContaining({
          status: AttendanceStatus.EARLY_LEAVE,
          correctionReason: 'Attendance officer corrected the incident type',
          correctionSource: 'attendance.absences.early_leave',
        }),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: 'late',
        status: AttendanceStatus.EARLY_LEAVE,
        lateMinutes: null,
        earlyLeaveMinutes: 22,
        minutesEarlyLeave: 22,
      }),
    );
    expect(result).not.toHaveProperty('schoolId');
    expect(result).not.toHaveProperty('term');
    expect(result).not.toHaveProperty('markedById');
  });

  it('rejects early-leave correction without positive minutes', async () => {
    const repository = correctionRepository({
      incident: incidentRecord(AttendanceStatus.ABSENT, 'absent'),
      corrected: null,
    });
    const useCase = new CorrectAttendanceAbsenceEarlyLeaveUseCase(
      repository,
      authRepository(),
    );

    await expect(
      withAttendanceScope(() =>
        useCase.execute('absent', {
          earlyLeaveMinutes: 0,
          correctionReason: 'Missing minutes',
        }),
      ),
    ).rejects.toMatchObject({
      code: 'validation.failed',
    });
    expect(repository.correctIncidentEntry).not.toHaveBeenCalled();
  });

  it.each([
    AttendanceStatus.PRESENT,
    AttendanceStatus.UNMARKED,
    AttendanceStatus.EXCUSED,
  ])('rejects correcting %s to early leave', async (status) => {
    const repository = correctionRepository({
      incident: incidentRecord(status),
      corrected: null,
    });
    const useCase = new CorrectAttendanceAbsenceEarlyLeaveUseCase(
      repository,
      authRepository(),
    );

    await expect(
      withAttendanceScope(() =>
        useCase.execute('entry-1', {
          earlyLeaveMinutes: 15,
          correctionReason: 'Not a correctable early leave source',
        }),
      ),
    ).rejects.toMatchObject({
      code: 'validation.failed',
    });
    expect(repository.correctIncidentEntry).not.toHaveBeenCalled();
  });
});
