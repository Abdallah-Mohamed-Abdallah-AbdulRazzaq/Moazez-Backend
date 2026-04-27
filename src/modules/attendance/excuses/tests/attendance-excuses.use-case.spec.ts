import {
  AttendanceExcuseStatus,
  AttendanceExcuseType,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../../common/context/request-context';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { CreateAttendanceExcuseRequestUseCase } from '../application/create-attendance-excuse-request.use-case';
import { DeleteAttendanceExcuseRequestUseCase } from '../application/delete-attendance-excuse-request.use-case';
import { UpdateAttendanceExcuseRequestUseCase } from '../application/update-attendance-excuse-request.use-case';
import {
  AttendanceExcuseAlreadyReviewedException,
  AttendanceExcuseInvalidDateRangeException,
  AttendanceExcuseInvalidMinutesException,
  AttendanceExcuseInvalidPeriodSelectionException,
} from '../domain/excuse.exceptions';
import { AttendanceExcusesRepository } from '../infrastructure/attendance-excuses.repository';

describe('Attendance excuse request use cases', () => {
  async function withAttendanceScope<T>(fn: () => Promise<T>): Promise<T> {
    return runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: 'user-1', userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: 'membership-1',
        organizationId: 'org-1',
        schoolId: 'school-1',
        roleId: 'role-1',
        permissions: ['attendance.excuses.view', 'attendance.excuses.manage'],
      });

      return fn();
    });
  }

  function activeTerm(
    overrides?: Partial<{
      startDate: Date;
      endDate: Date;
      isActive: boolean;
    }>,
  ) {
    return {
      id: 'term-1',
      academicYearId: 'year-1',
      startDate: overrides?.startDate ?? new Date('2026-09-01T00:00:00.000Z'),
      endDate: overrides?.endDate ?? new Date('2026-12-31T00:00:00.000Z'),
      isActive: overrides?.isActive ?? true,
    };
  }

  function excuseRecord(
    overrides?: Partial<{
      id: string;
      type: AttendanceExcuseType;
      status: AttendanceExcuseStatus;
      dateFrom: Date;
      dateTo: Date;
      selectedPeriodKeys: string[];
      lateMinutes: number | null;
      earlyLeaveMinutes: number | null;
      reasonAr: string | null;
      reasonEn: string | null;
      deletedAt: Date | null;
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
      dateFrom: overrides?.dateFrom ?? new Date('2026-09-15T00:00:00.000Z'),
      dateTo: overrides?.dateTo ?? new Date('2026-09-15T00:00:00.000Z'),
      selectedPeriodKeys: overrides?.selectedPeriodKeys ?? [],
      lateMinutes: overrides?.lateMinutes ?? null,
      earlyLeaveMinutes: overrides?.earlyLeaveMinutes ?? null,
      reasonAr: overrides?.reasonAr ?? null,
      reasonEn: overrides?.reasonEn ?? 'Family note',
      decisionNote: null,
      createdById: 'user-1',
      decidedById: null,
      decidedAt: null,
      createdAt: new Date('2026-09-15T08:00:00.000Z'),
      updatedAt: new Date('2026-09-15T08:00:00.000Z'),
      deletedAt: overrides?.deletedAt ?? null,
      student: {
        id: 'student-1',
        firstName: 'Layla',
        lastName: 'Hassan',
        status: 'ACTIVE',
      },
      linkedSessions: [],
    };
  }

  function baseRepository(overrides?: Partial<Record<string, jest.Mock>>) {
    return {
      validateAcademicYearAndTerm: jest.fn().mockResolvedValue({
        academicYear: { id: 'year-1' },
        term: activeTerm(),
      }),
      validateStudent: jest.fn().mockResolvedValue({
        id: 'student-1',
        firstName: 'Layla',
        lastName: 'Hassan',
        status: 'ACTIVE',
      }),
      create: jest.fn().mockImplementation((data) =>
        Promise.resolve(
          excuseRecord({
            type: data.type,
            dateFrom: data.dateFrom,
            dateTo: data.dateTo,
            selectedPeriodKeys: data.selectedPeriodKeys,
            lateMinutes: data.lateMinutes,
            earlyLeaveMinutes: data.earlyLeaveMinutes,
            reasonAr: data.reasonAr,
            reasonEn: data.reasonEn,
          }),
        ),
      ),
      findById: jest.fn().mockResolvedValue(excuseRecord()),
      update: jest.fn().mockImplementation((_id, data) =>
        Promise.resolve(
          excuseRecord({
            type: data.type,
            dateFrom: data.dateFrom,
            dateTo: data.dateTo,
            selectedPeriodKeys: data.selectedPeriodKeys,
            lateMinutes: data.lateMinutes,
            earlyLeaveMinutes: data.earlyLeaveMinutes,
            reasonAr: data.reasonAr,
            reasonEn: data.reasonEn,
          }),
        ),
      ),
      softDelete: jest.fn().mockResolvedValue(
        excuseRecord({
          deletedAt: new Date('2026-09-16T09:00:00.000Z'),
        }),
      ),
      ...overrides,
    } as unknown as AttendanceExcusesRepository;
  }

  function baseAuthRepository(overrides?: Partial<Record<string, jest.Mock>>) {
    return {
      createAuditLog: jest.fn().mockResolvedValue(undefined),
      ...overrides,
    } as unknown as AuthRepository;
  }

  it('creates a valid ABSENCE request', async () => {
    const repository = baseRepository();
    const authRepository = baseAuthRepository();
    const useCase = new CreateAttendanceExcuseRequestUseCase(
      repository,
      authRepository,
    );

    const result = await withAttendanceScope(() =>
      useCase.execute({
        yearId: 'year-1',
        termId: 'term-1',
        studentId: 'student-1',
        type: AttendanceExcuseType.ABSENCE,
        dateFrom: '2026-09-15',
        dateTo: '2026-09-15',
        reasonEn: 'Family note',
      }),
    );

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: 'school-1',
        academicYearId: 'year-1',
        studentId: 'student-1',
        status: AttendanceExcuseStatus.PENDING,
        createdById: 'user-1',
        lateMinutes: null,
        earlyLeaveMinutes: null,
      }),
    );
    expect(result.status).toBe(AttendanceExcuseStatus.PENDING);
    expect(authRepository.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'attendance.excuse_request.create',
        resourceType: 'attendance_excuse_request',
      }),
    );
  });

  it('requires positive lateMinutes for LATE requests', async () => {
    const repository = baseRepository();
    const useCase = new CreateAttendanceExcuseRequestUseCase(
      repository,
      baseAuthRepository(),
    );

    await expect(
      withAttendanceScope(() =>
        useCase.execute({
          yearId: 'year-1',
          termId: 'term-1',
          studentId: 'student-1',
          type: AttendanceExcuseType.LATE,
          dateFrom: '2026-09-15',
          dateTo: '2026-09-15',
          selectedPeriodKeys: ['daily'],
          lateMinutes: 0,
        }),
      ),
    ).rejects.toBeInstanceOf(AttendanceExcuseInvalidMinutesException);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('requires a period selection for LATE requests', async () => {
    const repository = baseRepository();
    const useCase = new CreateAttendanceExcuseRequestUseCase(
      repository,
      baseAuthRepository(),
    );

    await expect(
      withAttendanceScope(() =>
        useCase.execute({
          yearId: 'year-1',
          termId: 'term-1',
          studentId: 'student-1',
          type: AttendanceExcuseType.LATE,
          dateFrom: '2026-09-15',
          dateTo: '2026-09-15',
          lateMinutes: 5,
        }),
      ),
    ).rejects.toBeInstanceOf(AttendanceExcuseInvalidPeriodSelectionException);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('requires positive earlyLeaveMinutes for EARLY_LEAVE requests', async () => {
    const repository = baseRepository();
    const useCase = new CreateAttendanceExcuseRequestUseCase(
      repository,
      baseAuthRepository(),
    );

    await expect(
      withAttendanceScope(() =>
        useCase.execute({
          yearId: 'year-1',
          termId: 'term-1',
          studentId: 'student-1',
          type: AttendanceExcuseType.EARLY_LEAVE,
          dateFrom: '2026-09-15',
          dateTo: '2026-09-15',
          selectedPeriodKeys: ['daily'],
          earlyLeaveMinutes: 0,
        }),
      ),
    ).rejects.toBeInstanceOf(AttendanceExcuseInvalidMinutesException);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('rejects an invalid date range', async () => {
    const repository = baseRepository();
    const useCase = new CreateAttendanceExcuseRequestUseCase(
      repository,
      baseAuthRepository(),
    );

    await expect(
      withAttendanceScope(() =>
        useCase.execute({
          yearId: 'year-1',
          termId: 'term-1',
          studentId: 'student-1',
          type: AttendanceExcuseType.ABSENCE,
          dateFrom: '2026-09-20',
          dateTo: '2026-09-15',
        }),
      ),
    ).rejects.toBeInstanceOf(AttendanceExcuseInvalidDateRangeException);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('rejects an outside-term date range', async () => {
    const repository = baseRepository();
    const useCase = new CreateAttendanceExcuseRequestUseCase(
      repository,
      baseAuthRepository(),
    );

    await expect(
      withAttendanceScope(() =>
        useCase.execute({
          yearId: 'year-1',
          termId: 'term-1',
          studentId: 'student-1',
          type: AttendanceExcuseType.ABSENCE,
          dateFrom: '2027-01-01',
          dateTo: '2027-01-01',
        }),
      ),
    ).rejects.toBeInstanceOf(AttendanceExcuseInvalidDateRangeException);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('updates a pending request', async () => {
    const repository = baseRepository();
    const authRepository = baseAuthRepository();
    const useCase = new UpdateAttendanceExcuseRequestUseCase(
      repository,
      authRepository,
    );

    const result = await withAttendanceScope(() =>
      useCase.execute('excuse-1', {
        type: AttendanceExcuseType.LATE,
        selectedPeriodIds: ['daily'],
        lateMinutes: 12,
        reasonEn: 'Traffic',
      }),
    );

    expect(repository.update).toHaveBeenCalledWith(
      'excuse-1',
      expect.objectContaining({
        type: AttendanceExcuseType.LATE,
        selectedPeriodKeys: ['daily'],
        lateMinutes: 12,
        earlyLeaveMinutes: null,
        reasonEn: 'Traffic',
      }),
    );
    expect(result.type).toBe(AttendanceExcuseType.LATE);
    expect(result.selectedPeriodKeys).toEqual(['daily']);
    expect(authRepository.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'attendance.excuse_request.update',
      }),
    );
  });

  it('rejects updating a reviewed request', async () => {
    const repository = baseRepository({
      findById: jest.fn().mockResolvedValue(
        excuseRecord({
          status: AttendanceExcuseStatus.APPROVED,
        }),
      ),
      update: jest.fn(),
    });
    const useCase = new UpdateAttendanceExcuseRequestUseCase(
      repository,
      baseAuthRepository(),
    );

    await expect(
      withAttendanceScope(() =>
        useCase.execute('excuse-1', {
          reasonEn: 'Updated',
        }),
      ),
    ).rejects.toBeInstanceOf(AttendanceExcuseAlreadyReviewedException);
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('soft-deletes a pending request', async () => {
    const repository = baseRepository();
    const authRepository = baseAuthRepository();
    const useCase = new DeleteAttendanceExcuseRequestUseCase(
      repository,
      authRepository,
    );

    const result = await withAttendanceScope(() => useCase.execute('excuse-1'));

    expect(repository.softDelete).toHaveBeenCalledWith('excuse-1');
    expect(result).toEqual({ ok: true });
    expect(authRepository.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'attendance.excuse_request.cancel',
      }),
    );
  });

  it('rejects deleting a reviewed request', async () => {
    const repository = baseRepository({
      findById: jest.fn().mockResolvedValue(
        excuseRecord({
          status: AttendanceExcuseStatus.REJECTED,
        }),
      ),
      softDelete: jest.fn(),
    });
    const useCase = new DeleteAttendanceExcuseRequestUseCase(
      repository,
      baseAuthRepository(),
    );

    await expect(
      withAttendanceScope(() => useCase.execute('excuse-1')),
    ).rejects.toBeInstanceOf(AttendanceExcuseAlreadyReviewedException);
    expect(repository.softDelete).not.toHaveBeenCalled();
  });
});
