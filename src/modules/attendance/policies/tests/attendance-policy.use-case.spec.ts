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
      mode: AttendanceMode.DAILY,
      dailyComputationStrategy: DailyComputationStrategy.MANUAL,
      requireExcuseAttachment: false,
      allowParentExcuseRequests: true,
      notifyGuardiansOnAbsence: true,
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
});
