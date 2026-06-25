import {
  AttendanceMode,
  AttendanceScopeType,
  DailyComputationStrategy,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../../common/context/request-context';
import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';
import { CreateAttendancePolicyUseCase } from '../application/create-attendance-policy.use-case';
import { UpdateAttendancePolicyUseCase } from '../application/update-attendance-policy.use-case';
import { AttendancePolicyConflictException } from '../domain/policy.exceptions';
import { AttendancePoliciesRepository } from '../infrastructure/attendance-policies.repository';

describe('Attendance policy use cases', () => {
  async function withAttendanceScope<T>(fn: () => Promise<T>): Promise<T> {
    return runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: 'user-1', userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: 'membership-1',
        organizationId: 'org-1',
        schoolId: 'school-1',
        roleId: 'role-1',
        permissions: ['attendance.policies.view', 'attendance.policies.manage'],
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

  function policyRecord(
    overrides?: Partial<{
      id: string;
      nameAr: string;
      nameEn: string;
      scopeType: AttendanceScopeType;
      scopeKey: string;
      mode: AttendanceMode;
      dailyComputationStrategy: DailyComputationStrategy;
      selectedPeriodIds: string[];
      lateThresholdMinutes: number | null;
      earlyLeaveThresholdMinutes: number | null;
      autoAbsentAfterMinutes: number | null;
      absentIfMissedPeriodsCount: number | null;
      requireExcuseReason: boolean;
      notifyTeachers: boolean;
      notifyStudents: boolean;
      notifyOnLate: boolean;
      notifyOnEarlyLeave: boolean;
      isActive: boolean;
    }>,
  ) {
    return {
      id: overrides?.id ?? 'policy-1',
      schoolId: 'school-1',
      academicYearId: 'year-1',
      termId: 'term-1',
      scopeType: overrides?.scopeType ?? AttendanceScopeType.SCHOOL,
      scopeKey: overrides?.scopeKey ?? 'school',
      stageId: null,
      gradeId: null,
      sectionId: null,
      classroomId: null,
      nameAr: overrides?.nameAr ?? 'Default AR',
      nameEn: overrides?.nameEn ?? 'Default EN',
      descriptionAr: null,
      descriptionEn: null,
      notes: null,
      mode: overrides?.mode ?? AttendanceMode.DAILY,
      dailyComputationStrategy:
        overrides?.dailyComputationStrategy ?? DailyComputationStrategy.MANUAL,
      selectedPeriodIds: overrides?.selectedPeriodIds ?? [],
      lateThresholdMinutes: overrides?.lateThresholdMinutes ?? null,
      earlyLeaveThresholdMinutes: overrides?.earlyLeaveThresholdMinutes ?? null,
      autoAbsentAfterMinutes: overrides?.autoAbsentAfterMinutes ?? null,
      absentIfMissedPeriodsCount: overrides?.absentIfMissedPeriodsCount ?? null,
      requireExcuseAttachment: false,
      requireExcuseReason: overrides?.requireExcuseReason ?? false,
      allowParentExcuseRequests: true,
      notifyGuardiansOnAbsence: true,
      notifyTeachers: overrides?.notifyTeachers ?? false,
      notifyStudents: overrides?.notifyStudents ?? false,
      notifyOnLate: overrides?.notifyOnLate ?? false,
      notifyOnEarlyLeave: overrides?.notifyOnEarlyLeave ?? false,
      effectiveFrom: null,
      effectiveTo: null,
      isActive: overrides?.isActive ?? true,
      createdAt: new Date('2026-04-26T09:00:00.000Z'),
      updatedAt: new Date('2026-04-26T10:00:00.000Z'),
      deletedAt: null,
    };
  }

  it('rejects creating a second active policy for the same scope', async () => {
    const repository = {
      findAcademicYearById: jest.fn().mockResolvedValue({ id: 'year-1' }),
      findTermById: jest.fn().mockResolvedValue(activeTerm()),
      findActiveScopeConflict: jest.fn().mockResolvedValue(policyRecord()),
      findNameConflicts: jest.fn().mockResolvedValue([]),
    } as unknown as AttendancePoliciesRepository;
    const useCase = new CreateAttendancePolicyUseCase(repository);

    await expect(
      withAttendanceScope(() =>
        useCase.execute({
          yearId: 'year-1',
          termId: 'term-1',
          nameAr: 'New AR',
          nameEn: 'New EN',
          scopeType: AttendanceScopeType.SCHOOL,
          mode: AttendanceMode.DAILY,
        }),
      ),
    ).rejects.toBeInstanceOf(AttendancePolicyConflictException);
  });

  it('passes advanced contract fields to repository.create', async () => {
    const createdPolicy = policyRecord({
      mode: AttendanceMode.PERIOD,
      selectedPeriodIds: ['period-1', 'period-2'],
      lateThresholdMinutes: 10,
      earlyLeaveThresholdMinutes: 12,
      autoAbsentAfterMinutes: 45,
      absentIfMissedPeriodsCount: 2,
      requireExcuseReason: true,
      notifyTeachers: true,
      notifyStudents: true,
      notifyOnLate: true,
      notifyOnEarlyLeave: false,
    });
    const repository = {
      findAcademicYearById: jest.fn().mockResolvedValue({ id: 'year-1' }),
      findTermById: jest.fn().mockResolvedValue(activeTerm()),
      findActiveScopeConflict: jest.fn().mockResolvedValue(null),
      findNameConflicts: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue(createdPolicy),
    } as unknown as AttendancePoliciesRepository;
    const useCase = new CreateAttendancePolicyUseCase(repository);

    const result = await withAttendanceScope(() =>
      useCase.execute({
        yearId: 'year-1',
        termId: 'term-1',
        nameAr: 'New AR',
        nameEn: 'New EN',
        scopeType: AttendanceScopeType.SCHOOL,
        mode: AttendanceMode.PERIOD,
        selectedPeriodIds: [' period-1 ', 'period-2'],
        lateThresholdMinutes: 10,
        earlyLeaveThresholdMinutes: 12,
        autoAbsentAfterMinutes: 45,
        absentIfMissedPeriodsCount: 2,
        requireExcuseReason: true,
        notifyTeachers: true,
        notifyStudents: true,
        notifyOnLate: true,
        notifyOnEarlyLeave: false,
      }),
    );

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedPeriodIds: ['period-1', 'period-2'],
        lateThresholdMinutes: 10,
        earlyLeaveThresholdMinutes: 12,
        autoAbsentAfterMinutes: 45,
        absentIfMissedPeriodsCount: 2,
        requireExcuseReason: true,
        notifyTeachers: true,
        notifyStudents: true,
        notifyOnLate: true,
        notifyOnEarlyLeave: false,
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        selectedPeriodIds: ['period-1', 'period-2'],
        lateThresholdMinutes: 10,
        earlyLeaveThresholdMinutes: 12,
        autoAbsentAfterMinutes: 45,
        absentIfMissedPeriodsCount: 2,
        requireExcuseReason: true,
        notifyTeachers: true,
        notifyStudents: true,
        notifyOnLate: true,
        notifyOnEarlyLeave: false,
      }),
    );
  });

  it('rejects duplicate selectedPeriodIds', async () => {
    const repository = {
      findAcademicYearById: jest.fn().mockResolvedValue({ id: 'year-1' }),
      findTermById: jest.fn().mockResolvedValue(activeTerm()),
      findActiveScopeConflict: jest.fn().mockResolvedValue(null),
      findNameConflicts: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
    } as unknown as AttendancePoliciesRepository;
    const useCase = new CreateAttendancePolicyUseCase(repository);

    await expect(
      withAttendanceScope(() =>
        useCase.execute({
          yearId: 'year-1',
          termId: 'term-1',
          nameAr: 'New AR',
          nameEn: 'New EN',
          scopeType: AttendanceScopeType.SCHOOL,
          mode: AttendanceMode.PERIOD,
          selectedPeriodIds: ['period-1', ' period-1 '],
        }),
      ),
    ).rejects.toBeInstanceOf(ValidationDomainException);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('rejects empty selectedPeriodIds values', async () => {
    const repository = {
      findAcademicYearById: jest.fn().mockResolvedValue({ id: 'year-1' }),
      findTermById: jest.fn().mockResolvedValue(activeTerm()),
      findActiveScopeConflict: jest.fn().mockResolvedValue(null),
      findNameConflicts: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
    } as unknown as AttendancePoliciesRepository;
    const useCase = new CreateAttendancePolicyUseCase(repository);

    await expect(
      withAttendanceScope(() =>
        useCase.execute({
          yearId: 'year-1',
          termId: 'term-1',
          nameAr: 'New AR',
          nameEn: 'New EN',
          scopeType: AttendanceScopeType.SCHOOL,
          mode: AttendanceMode.PERIOD,
          selectedPeriodIds: ['period-1', '   '],
        }),
      ),
    ).rejects.toBeInstanceOf(ValidationDomainException);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('rejects DERIVED_FROM_PERIODS without selected periods or missed period count', async () => {
    const repository = {
      findAcademicYearById: jest.fn().mockResolvedValue({ id: 'year-1' }),
      findTermById: jest.fn().mockResolvedValue(activeTerm()),
      findActiveScopeConflict: jest.fn().mockResolvedValue(null),
      findNameConflicts: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
    } as unknown as AttendancePoliciesRepository;
    const useCase = new CreateAttendancePolicyUseCase(repository);

    await expect(
      withAttendanceScope(() =>
        useCase.execute({
          yearId: 'year-1',
          termId: 'term-1',
          nameAr: 'Derived AR',
          nameEn: 'Derived EN',
          scopeType: AttendanceScopeType.SCHOOL,
          mode: AttendanceMode.DAILY,
          dailyComputationStrategy:
            DailyComputationStrategy.DERIVED_FROM_PERIODS,
          absentIfMissedPeriodsCount: 2,
        }),
      ),
    ).rejects.toBeInstanceOf(ValidationDomainException);

    await expect(
      withAttendanceScope(() =>
        useCase.execute({
          yearId: 'year-1',
          termId: 'term-1',
          nameAr: 'Derived AR',
          nameEn: 'Derived EN',
          scopeType: AttendanceScopeType.SCHOOL,
          mode: AttendanceMode.DAILY,
          dailyComputationStrategy:
            DailyComputationStrategy.DERIVED_FROM_PERIODS,
          selectedPeriodIds: ['period-1'],
        }),
      ),
    ).rejects.toBeInstanceOf(ValidationDomainException);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('rejects updating a policy to a conflicting name in the same scope', async () => {
    const repository = {
      findById: jest.fn().mockResolvedValue(policyRecord()),
      findAcademicYearById: jest.fn().mockResolvedValue({ id: 'year-1' }),
      findTermById: jest.fn().mockResolvedValue(activeTerm()),
      findActiveScopeConflict: jest.fn().mockResolvedValue(null),
      findNameConflicts: jest
        .fn()
        .mockResolvedValue([
          policyRecord({ id: 'policy-2', nameEn: 'Taken EN' }),
        ]),
    } as unknown as AttendancePoliciesRepository;
    const useCase = new UpdateAttendancePolicyUseCase(repository);

    await expect(
      withAttendanceScope(() =>
        useCase.execute('policy-1', {
          nameEn: 'Taken EN',
        }),
      ),
    ).rejects.toBeInstanceOf(AttendancePolicyConflictException);
  });

  it('preserves advanced fields when PATCH omits them', async () => {
    const existing = policyRecord({
      selectedPeriodIds: ['period-1'],
      lateThresholdMinutes: 10,
      earlyLeaveThresholdMinutes: 12,
      autoAbsentAfterMinutes: 45,
      absentIfMissedPeriodsCount: 2,
      requireExcuseReason: true,
      notifyTeachers: true,
      notifyStudents: true,
      notifyOnLate: true,
      notifyOnEarlyLeave: true,
    });
    const repository = {
      findById: jest.fn().mockResolvedValue(existing),
      findAcademicYearById: jest.fn().mockResolvedValue({ id: 'year-1' }),
      findTermById: jest.fn().mockResolvedValue(activeTerm()),
      findActiveScopeConflict: jest.fn().mockResolvedValue(null),
      findNameConflicts: jest.fn().mockResolvedValue([]),
      update: jest
        .fn()
        .mockResolvedValue({ ...existing, nameEn: 'Updated EN' }),
    } as unknown as AttendancePoliciesRepository;
    const useCase = new UpdateAttendancePolicyUseCase(repository);

    await withAttendanceScope(() =>
      useCase.execute('policy-1', {
        nameEn: 'Updated EN',
      }),
    );

    const updateData = (repository.update as jest.Mock).mock.calls[0][1];
    expect(updateData).toEqual(
      expect.objectContaining({ nameEn: 'Updated EN' }),
    );
    expect(Object.keys(updateData)).not.toEqual(
      expect.arrayContaining([
        'selectedPeriodIds',
        'lateThresholdMinutes',
        'earlyLeaveThresholdMinutes',
        'autoAbsentAfterMinutes',
        'absentIfMissedPeriodsCount',
        'requireExcuseReason',
        'notifyTeachers',
        'notifyStudents',
        'notifyOnLate',
        'notifyOnEarlyLeave',
      ]),
    );
  });

  it('can update advanced booleans to false explicitly', async () => {
    const existing = policyRecord({
      requireExcuseReason: true,
      notifyTeachers: true,
      notifyStudents: true,
      notifyOnLate: true,
      notifyOnEarlyLeave: true,
    });
    const repository = {
      findById: jest.fn().mockResolvedValue(existing),
      findAcademicYearById: jest.fn().mockResolvedValue({ id: 'year-1' }),
      findTermById: jest.fn().mockResolvedValue(activeTerm()),
      findActiveScopeConflict: jest.fn().mockResolvedValue(null),
      findNameConflicts: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({
        ...existing,
        requireExcuseReason: false,
        notifyTeachers: false,
        notifyStudents: false,
        notifyOnLate: false,
        notifyOnEarlyLeave: false,
      }),
    } as unknown as AttendancePoliciesRepository;
    const useCase = new UpdateAttendancePolicyUseCase(repository);

    await withAttendanceScope(() =>
      useCase.execute('policy-1', {
        requireExcuseReason: false,
        notifyTeachers: false,
        notifyStudents: false,
        notifyOnLate: false,
        notifyOnEarlyLeave: false,
      }),
    );

    expect(repository.update).toHaveBeenCalledWith(
      'policy-1',
      expect.objectContaining({
        requireExcuseReason: false,
        notifyTeachers: false,
        notifyStudents: false,
        notifyOnLate: false,
        notifyOnEarlyLeave: false,
      }),
    );
  });

  it('can replace selectedPeriodIds on update', async () => {
    const existing = policyRecord({
      selectedPeriodIds: ['period-1'],
    });
    const repository = {
      findById: jest.fn().mockResolvedValue(existing),
      findAcademicYearById: jest.fn().mockResolvedValue({ id: 'year-1' }),
      findTermById: jest.fn().mockResolvedValue(activeTerm()),
      findActiveScopeConflict: jest.fn().mockResolvedValue(null),
      findNameConflicts: jest.fn().mockResolvedValue([]),
      update: jest
        .fn()
        .mockResolvedValue({ ...existing, selectedPeriodIds: ['period-2'] }),
    } as unknown as AttendancePoliciesRepository;
    const useCase = new UpdateAttendancePolicyUseCase(repository);

    await withAttendanceScope(() =>
      useCase.execute('policy-1', {
        selectedPeriodIds: [' period-2 '],
      }),
    );

    expect(repository.update).toHaveBeenCalledWith(
      'policy-1',
      expect.objectContaining({
        selectedPeriodIds: ['period-2'],
      }),
    );
  });
});
