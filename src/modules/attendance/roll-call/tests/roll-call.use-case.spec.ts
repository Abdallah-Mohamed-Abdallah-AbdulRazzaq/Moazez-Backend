import {
  AttendanceMode,
  AttendanceScopeType,
  AttendanceSessionStatus,
  AttendanceStatus,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../../common/context/request-context';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { GetRollCallRosterUseCase } from '../application/get-roll-call-roster.use-case';
import { ResolveRollCallSessionUseCase } from '../application/resolve-roll-call-session.use-case';
import { SaveRollCallEntriesUseCase } from '../application/save-roll-call-entries.use-case';
import { AttendanceSessionAlreadySubmittedException } from '../domain/roll-call.exceptions';
import { AttendanceRollCallRepository } from '../infrastructure/attendance-roll-call.repository';

describe('Attendance roll-call use cases', () => {
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
      status: AttendanceSessionStatus;
      entries: unknown[];
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
      mode: AttendanceMode.DAILY,
      periodId: null,
      periodKey: 'daily',
      periodLabelAr: null,
      periodLabelEn: null,
      policyId: overrides?.policyId ?? null,
      status: overrides?.status ?? AttendanceSessionStatus.DRAFT,
      submittedAt: null,
      submittedById: null,
      createdAt: new Date('2026-09-15T07:00:00.000Z'),
      updatedAt: new Date('2026-09-15T07:00:00.000Z'),
      deletedAt: null,
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

  function entryRecord() {
    return {
      id: 'entry-1',
      schoolId: 'school-1',
      sessionId: 'session-1',
      studentId: 'student-1',
      enrollmentId: 'enrollment-1',
      status: AttendanceStatus.PRESENT,
      lateMinutes: null,
      earlyLeaveMinutes: null,
      excuseReason: null,
      note: null,
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
      createSession: jest.fn().mockResolvedValue(sessionRecord()),
      findSessionById: jest.fn().mockResolvedValue(sessionRecord()),
      listRosterStudents: jest
        .fn()
        .mockResolvedValue([rosterEnrollment()]),
      bulkUpsertEntries: jest.fn().mockResolvedValue([entryRecord()]),
      ...overrides,
    } as unknown as AttendanceRollCallRepository;
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

  it('attaches the effective policy when creating a session', async () => {
    const repository = baseRepository({
      findEffectivePolicyCandidates: jest.fn().mockResolvedValue([
        {
          id: 'policy-1',
          scopeType: AttendanceScopeType.CLASSROOM,
          scopeKey: 'classroom:classroom-1',
          effectiveFrom: null,
          effectiveTo: null,
          updatedAt: new Date('2026-09-01T00:00:00.000Z'),
        },
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
