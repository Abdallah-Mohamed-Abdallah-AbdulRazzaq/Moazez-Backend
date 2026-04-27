import {
  AttendanceExcuseStatus,
  AttendanceExcuseType,
  AttendanceStatus,
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
import { ApproveAttendanceExcuseRequestUseCase } from '../application/approve-attendance-excuse-request.use-case';
import { RejectAttendanceExcuseRequestUseCase } from '../application/reject-attendance-excuse-request.use-case';
import {
  AttendanceEntryRequiresExcuseAttachmentException,
  AttendanceExcuseAlreadyReviewedException,
  AttendanceExcuseNoMatchingSubmittedEntryException,
} from '../domain/excuse.exceptions';
import { AttendanceExcusesRepository } from '../infrastructure/attendance-excuses.repository';

describe('Attendance excuse review use cases', () => {
  async function withAttendanceScope<T>(fn: () => Promise<T>): Promise<T> {
    return runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: 'user-1', userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: 'membership-1',
        organizationId: 'org-1',
        schoolId: 'school-1',
        roleId: 'role-1',
        permissions: [
          'attendance.excuses.view',
          'attendance.excuses.manage',
          'attendance.excuses.review',
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

  function excuseRecord(
    overrides?: Partial<{
      id: string;
      type: AttendanceExcuseType;
      status: AttendanceExcuseStatus;
      selectedPeriodKeys: string[];
      reasonAr: string | null;
      reasonEn: string | null;
      decisionNote: string | null;
      decidedById: string | null;
      decidedAt: Date | null;
      linkedSessionIds: string[];
    }>,
  ) {
    return {
      id: overrides?.id ?? 'excuse-1',
      schoolId: 'school-1',
      academicYearId: 'year-1',
      termId: 'term-1',
      studentId: 'student-1',
      type: overrides?.type ?? AttendanceExcuseType.ABSENCE,
      status: overrides?.status ?? AttendanceExcuseStatus.PENDING,
      dateFrom: new Date('2026-09-15T00:00:00.000Z'),
      dateTo: new Date('2026-09-15T00:00:00.000Z'),
      selectedPeriodKeys: overrides?.selectedPeriodKeys ?? [],
      lateMinutes: null,
      earlyLeaveMinutes: null,
      reasonAr: overrides?.reasonAr ?? null,
      reasonEn: overrides?.reasonEn ?? 'Medical appointment',
      decisionNote: overrides?.decisionNote ?? null,
      createdById: 'creator-1',
      decidedById: overrides?.decidedById ?? null,
      decidedAt: overrides?.decidedAt ?? null,
      createdAt: new Date('2026-09-14T08:00:00.000Z'),
      updatedAt: new Date('2026-09-14T08:00:00.000Z'),
      deletedAt: null,
      student: {
        id: 'student-1',
        firstName: 'Layla',
        lastName: 'Hassan',
        status: StudentStatus.ACTIVE,
      },
      linkedSessions: (overrides?.linkedSessionIds ?? []).map(
        (attendanceSessionId) => ({
          attendanceSessionId,
          createdAt: new Date('2026-09-15T09:00:00.000Z'),
        }),
      ),
    };
  }

  function reviewSession(
    overrides?: Partial<{
      id: string;
      periodKey: string;
      policyId: string | null;
      requireExcuseAttachment: boolean;
    }>,
  ) {
    const policyId = overrides?.policyId ?? 'policy-1';

    return {
      id: overrides?.id ?? 'session-1',
      schoolId: 'school-1',
      academicYearId: 'year-1',
      termId: 'term-1',
      date: new Date('2026-09-15T00:00:00.000Z'),
      periodKey: overrides?.periodKey ?? 'daily',
      policyId,
      policy: policyId
        ? {
            id: policyId,
            requireExcuseAttachment:
              overrides?.requireExcuseAttachment ?? false,
          }
        : null,
    };
  }

  function reviewEntry(
    overrides?: Partial<{
      id: string;
      sessionId: string;
      status: AttendanceStatus;
    }>,
  ) {
    return {
      id: overrides?.id ?? 'entry-1',
      schoolId: 'school-1',
      sessionId: overrides?.sessionId ?? 'session-1',
      studentId: 'student-1',
      status: overrides?.status ?? AttendanceStatus.ABSENT,
      lateMinutes: null,
      earlyLeaveMinutes: null,
      excuseReason: null,
      note: null,
      updatedAt: new Date('2026-09-15T08:30:00.000Z'),
      session: reviewSession({ id: overrides?.sessionId ?? 'session-1' }),
    };
  }

  function approvedRecord() {
    return excuseRecord({
      status: AttendanceExcuseStatus.APPROVED,
      decisionNote: 'Approved after review',
      decidedById: 'user-1',
      decidedAt: new Date('2026-09-15T10:00:00.000Z'),
      linkedSessionIds: ['session-1'],
    });
  }

  function rejectedRecord() {
    return excuseRecord({
      status: AttendanceExcuseStatus.REJECTED,
      decisionNote: 'Insufficient evidence',
      decidedById: 'user-1',
      decidedAt: new Date('2026-09-15T10:00:00.000Z'),
    });
  }

  function baseRepository(overrides?: Partial<Record<string, jest.Mock>>) {
    return {
      findById: jest.fn().mockResolvedValue(excuseRecord()),
      validateAcademicYearAndTerm: jest.fn().mockResolvedValue({
        academicYear: { id: 'year-1' },
        term: activeTerm(),
      }),
      validateStudent: jest.fn().mockResolvedValue({
        id: 'student-1',
        firstName: 'Layla',
        lastName: 'Hassan',
        status: StudentStatus.ACTIVE,
      }),
      findMatchingSubmittedSessions: jest
        .fn()
        .mockResolvedValue([reviewSession()]),
      findMatchingEntriesForExcuse: jest
        .fn()
        .mockResolvedValue([reviewEntry()]),
      countAttachmentsForExcuseRequest: jest.fn().mockResolvedValue(0),
      approveRequestAndApplyEntries: jest
        .fn()
        .mockResolvedValue(approvedRecord()),
      rejectRequest: jest.fn().mockResolvedValue(rejectedRecord()),
      ...overrides,
    } as unknown as AttendanceExcusesRepository;
  }

  function baseAuthRepository(overrides?: Partial<Record<string, jest.Mock>>) {
    return {
      createAuditLog: jest.fn().mockResolvedValue(undefined),
      ...overrides,
    } as unknown as AuthRepository;
  }

  it('approves a pending ABSENCE request and applies EXCUSED to matching ABSENT submitted entries', async () => {
    const repository = baseRepository();
    const authRepository = baseAuthRepository();
    const useCase = new ApproveAttendanceExcuseRequestUseCase(
      repository,
      authRepository,
    );

    const result = await withAttendanceScope(() =>
      useCase.execute('excuse-1', { decisionNote: 'Approved after review' }),
    );

    expect(repository.findMatchingSubmittedSessions).toHaveBeenCalledWith({
      request: expect.objectContaining({ id: 'excuse-1' }),
    });
    expect(repository.findMatchingEntriesForExcuse).toHaveBeenCalledWith({
      sessionIds: ['session-1'],
      studentId: 'student-1',
      expectedStatus: AttendanceStatus.ABSENT,
    });
    expect(repository.approveRequestAndApplyEntries).toHaveBeenCalledWith(
      expect.objectContaining({
        excuseRequestId: 'excuse-1',
        schoolId: 'school-1',
        affectedSessionIds: ['session-1'],
        affectedEntryIds: ['entry-1'],
        studentId: 'student-1',
        expectedStatus: AttendanceStatus.ABSENT,
        excuseReason: 'Medical appointment',
        review: expect.objectContaining({
          status: AttendanceExcuseStatus.APPROVED,
          decidedById: 'user-1',
          decisionNote: 'Approved after review',
          decidedAt: expect.any(Date),
        }),
      }),
    );
    expect(result.status).toBe(AttendanceExcuseStatus.APPROVED);
    expect(result.linkedSessionIds).toEqual(['session-1']);
  });

  it('links all affected submitted sessions through approval', async () => {
    const repository = baseRepository({
      findMatchingSubmittedSessions: jest
        .fn()
        .mockResolvedValue([
          reviewSession({ id: 'session-1' }),
          reviewSession({ id: 'session-2' }),
        ]),
      findMatchingEntriesForExcuse: jest.fn().mockResolvedValue([
        reviewEntry({ id: 'entry-1', sessionId: 'session-1' }),
        reviewEntry({ id: 'entry-2', sessionId: 'session-2' }),
      ]),
      approveRequestAndApplyEntries: jest.fn().mockResolvedValue(
        excuseRecord({
          status: AttendanceExcuseStatus.APPROVED,
          decisionNote: 'Approved',
          decidedById: 'user-1',
          decidedAt: new Date('2026-09-15T10:00:00.000Z'),
          linkedSessionIds: ['session-1', 'session-2'],
        }),
      ),
    });
    const useCase = new ApproveAttendanceExcuseRequestUseCase(
      repository,
      baseAuthRepository(),
    );

    const result = await withAttendanceScope(() =>
      useCase.execute('excuse-1', { decisionNote: 'Approved' }),
    );

    expect(repository.approveRequestAndApplyEntries).toHaveBeenCalledWith(
      expect.objectContaining({
        affectedSessionIds: ['session-1', 'session-2'],
        affectedEntryIds: ['entry-1', 'entry-2'],
      }),
    );
    expect(result.linkedSessionIds).toEqual(['session-1', 'session-2']);
  });

  it('records an audit log when approving', async () => {
    const repository = baseRepository();
    const authRepository = baseAuthRepository();
    const useCase = new ApproveAttendanceExcuseRequestUseCase(
      repository,
      authRepository,
    );

    await withAttendanceScope(() => useCase.execute('excuse-1', {}));

    expect(authRepository.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'attendance.excuse.approve',
        resourceType: 'attendance_excuse_request',
        resourceId: 'excuse-1',
        after: expect.objectContaining({
          affectedSessionIds: ['session-1'],
          affectedEntryIds: ['entry-1'],
        }),
      }),
    );
  });

  it('rejects approval for an already reviewed request', async () => {
    const repository = baseRepository({
      findById: jest.fn().mockResolvedValue(
        excuseRecord({
          status: AttendanceExcuseStatus.APPROVED,
        }),
      ),
      approveRequestAndApplyEntries: jest.fn(),
    });
    const useCase = new ApproveAttendanceExcuseRequestUseCase(
      repository,
      baseAuthRepository(),
    );

    await expect(
      withAttendanceScope(() => useCase.execute('excuse-1', {})),
    ).rejects.toBeInstanceOf(AttendanceExcuseAlreadyReviewedException);
    expect(repository.approveRequestAndApplyEntries).not.toHaveBeenCalled();
  });

  it('rejects approval when no matching submitted entry exists', async () => {
    const repository = baseRepository({
      findMatchingEntriesForExcuse: jest.fn().mockResolvedValue([]),
      approveRequestAndApplyEntries: jest.fn(),
    });
    const useCase = new ApproveAttendanceExcuseRequestUseCase(
      repository,
      baseAuthRepository(),
    );

    await expect(
      withAttendanceScope(() => useCase.execute('excuse-1', {})),
    ).rejects.toBeInstanceOf(
      AttendanceExcuseNoMatchingSubmittedEntryException,
    );
    expect(repository.approveRequestAndApplyEntries).not.toHaveBeenCalled();
  });

  it('rejects approval when the matched session policy requires an attachment and none is linked', async () => {
    const repository = baseRepository({
      findMatchingSubmittedSessions: jest
        .fn()
        .mockResolvedValue([
          reviewSession({ requireExcuseAttachment: true }),
        ]),
      countAttachmentsForExcuseRequest: jest.fn().mockResolvedValue(0),
      approveRequestAndApplyEntries: jest.fn(),
    });
    const useCase = new ApproveAttendanceExcuseRequestUseCase(
      repository,
      baseAuthRepository(),
    );

    await expect(
      withAttendanceScope(() => useCase.execute('excuse-1', {})),
    ).rejects.toBeInstanceOf(
      AttendanceEntryRequiresExcuseAttachmentException,
    );
    expect(repository.approveRequestAndApplyEntries).not.toHaveBeenCalled();
  });

  it('approves when an attachment is linked and the matched policy requires one', async () => {
    const repository = baseRepository({
      findMatchingSubmittedSessions: jest
        .fn()
        .mockResolvedValue([
          reviewSession({ requireExcuseAttachment: true }),
        ]),
      countAttachmentsForExcuseRequest: jest.fn().mockResolvedValue(1),
    });
    const useCase = new ApproveAttendanceExcuseRequestUseCase(
      repository,
      baseAuthRepository(),
    );

    const result = await withAttendanceScope(() =>
      useCase.execute('excuse-1', {}),
    );

    expect(repository.approveRequestAndApplyEntries).toHaveBeenCalled();
    expect(result.attachmentCount).toBe(1);
  });

  it('does not pass draft sessions to approval application', async () => {
    const repository = baseRepository({
      findMatchingSubmittedSessions: jest
        .fn()
        .mockResolvedValue([reviewSession({ id: 'submitted-session' })]),
      findMatchingEntriesForExcuse: jest
        .fn()
        .mockResolvedValue([
          reviewEntry({ id: 'submitted-entry', sessionId: 'submitted-session' }),
        ]),
    });
    const useCase = new ApproveAttendanceExcuseRequestUseCase(
      repository,
      baseAuthRepository(),
    );

    await withAttendanceScope(() => useCase.execute('excuse-1', {}));

    expect(repository.approveRequestAndApplyEntries).toHaveBeenCalledWith(
      expect.objectContaining({
        affectedSessionIds: ['submitted-session'],
        affectedEntryIds: ['submitted-entry'],
      }),
    );
  });

  it('does not pass PRESENT or UNMARKED entries to approval application', async () => {
    const repository = baseRepository({
      findMatchingEntriesForExcuse: jest
        .fn()
        .mockResolvedValue([reviewEntry({ id: 'absent-entry' })]),
    });
    const useCase = new ApproveAttendanceExcuseRequestUseCase(
      repository,
      baseAuthRepository(),
    );

    await withAttendanceScope(() => useCase.execute('excuse-1', {}));

    expect(repository.findMatchingEntriesForExcuse).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedStatus: AttendanceStatus.ABSENT,
      }),
    );
    expect(repository.approveRequestAndApplyEntries).toHaveBeenCalledWith(
      expect.objectContaining({
        affectedEntryIds: ['absent-entry'],
      }),
    );
  });

  it('rejects a pending request without mutating attendance entries', async () => {
    const repository = baseRepository();
    const useCase = new RejectAttendanceExcuseRequestUseCase(
      repository,
      baseAuthRepository(),
    );

    const result = await withAttendanceScope(() =>
      useCase.execute('excuse-1', { decisionNote: 'Insufficient evidence' }),
    );

    expect(repository.rejectRequest).toHaveBeenCalledWith({
      excuseRequestId: 'excuse-1',
      review: expect.objectContaining({
        status: AttendanceExcuseStatus.REJECTED,
        decidedById: 'user-1',
        decisionNote: 'Insufficient evidence',
        decidedAt: expect.any(Date),
      }),
    });
    expect(repository.approveRequestAndApplyEntries).not.toHaveBeenCalled();
    expect(result.status).toBe(AttendanceExcuseStatus.REJECTED);
  });

  it('records an audit log when rejecting', async () => {
    const repository = baseRepository();
    const authRepository = baseAuthRepository();
    const useCase = new RejectAttendanceExcuseRequestUseCase(
      repository,
      authRepository,
    );

    await withAttendanceScope(() => useCase.execute('excuse-1', {}));

    expect(authRepository.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'attendance.excuse.reject',
        resourceType: 'attendance_excuse_request',
        resourceId: 'excuse-1',
      }),
    );
  });

  it('rejects rejection for an already reviewed request', async () => {
    const repository = baseRepository({
      findById: jest.fn().mockResolvedValue(
        excuseRecord({
          status: AttendanceExcuseStatus.REJECTED,
        }),
      ),
      rejectRequest: jest.fn(),
    });
    const useCase = new RejectAttendanceExcuseRequestUseCase(
      repository,
      baseAuthRepository(),
    );

    await expect(
      withAttendanceScope(() => useCase.execute('excuse-1', {})),
    ).rejects.toBeInstanceOf(AttendanceExcuseAlreadyReviewedException);
    expect(repository.rejectRequest).not.toHaveBeenCalled();
  });
});
