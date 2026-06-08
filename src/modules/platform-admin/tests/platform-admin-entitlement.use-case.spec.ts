import {
  AuditOutcome,
  SchoolEntitlementStatus,
  SchoolStatus,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActor,
  setPlatformPermissions,
} from '../../../common/context/request-context';
import { GetSchoolEntitlementUseCase } from '../application/get-school-entitlement.use-case';
import { UpsertSchoolEntitlementUseCase } from '../application/upsert-school-entitlement.use-case';
import {
  PlatformEntitlementInvalidDateRangeException,
  PlatformEntitlementSchoolArchivedException,
  PlatformEntitlementStudentSeatLimitInvalidException,
} from '../domain/platform-admin-errors';
import {
  PlatformAdminEntitlementsRepository,
  PlatformEntitlementSchoolRecord,
  PlatformSchoolEntitlementRecord,
} from '../infrastructure/platform-admin-entitlements.repository';

describe('Platform Admin entitlement use cases', () => {
  it('reads a school with no entitlement as null plus active student usage', async () => {
    const { repository } = mocks();
    repository.findSchoolById.mockResolvedValue(schoolRecord());
    repository.findEntitlementBySchoolId.mockResolvedValue(null);
    repository.countActiveStudentSeats.mockResolvedValue(4);

    const useCase = new GetSchoolEntitlementUseCase(repository as never);

    const response = await withPlatformScope(
      ['platform.entitlements.view'],
      () => useCase.execute('school-1'),
    );

    expect(response.entitlement).toBeNull();
    expect(response.studentSeatUsage).toMatchObject({
      used: 4,
      limit: null,
      isUnlimited: true,
      calculation: 'active_students',
    });
  });

  it('creates an entitlement, computes usage, and audits sanitized metadata', async () => {
    const { repository, authRepository } = mocks();
    repository.findSchoolById.mockResolvedValue(schoolRecord());
    repository.findEntitlementBySchoolId.mockResolvedValue(null);
    repository.upsertSchoolEntitlement.mockResolvedValue(
      entitlementRecord({
        status: SchoolEntitlementStatus.ACTIVE,
        studentSeatLimit: 10,
      }),
    );
    repository.countActiveStudentSeats.mockResolvedValue(7);

    const useCase = new UpsertSchoolEntitlementUseCase(
      repository as never,
      authRepository as never,
    );

    const response = await withPlatformScope(
      ['platform.entitlements.manage'],
      () =>
        useCase.execute('school-1', {
          status: 'active',
          startsAt: '2026-06-01T00:00:00.000Z',
          endsAt: '2027-06-01T00:00:00.000Z',
          studentSeatLimit: 10,
          notes: ' Annual school entitlement ',
        }),
    );

    expect(repository.upsertSchoolEntitlement).toHaveBeenCalledWith({
      schoolId: 'school-1',
      organizationId: 'org-1',
      status: SchoolEntitlementStatus.ACTIVE,
      startsAt: new Date('2026-06-01T00:00:00.000Z'),
      endsAt: new Date('2027-06-01T00:00:00.000Z'),
      studentSeatLimit: 10,
      notes: 'Annual school entitlement',
    });
    expect(response.studentSeatUsage).toMatchObject({
      used: 7,
      limit: 10,
      remaining: 3,
      isOverLimit: false,
    });
    expect(authRepository.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'platform-1',
        userType: UserType.PLATFORM_USER,
        organizationId: 'org-1',
        schoolId: 'school-1',
        module: 'platform_admin',
        action: 'platform.entitlement.create',
        resourceType: 'school_entitlement',
        resourceId: 'entitlement-1',
        outcome: AuditOutcome.SUCCESS,
        after: expect.objectContaining({
          changedFields: [
            'status',
            'startsAt',
            'endsAt',
            'studentSeatLimit',
            'notes',
          ],
          notesPresent: true,
        }),
      }),
    );
    expect(
      JSON.stringify(authRepository.createAuditLog.mock.calls),
    ).not.toContain('Annual school entitlement');
  });

  it('updates entitlement fields and audits before/after seat and date state', async () => {
    const { repository, authRepository } = mocks();
    const existing = entitlementRecord({
      status: SchoolEntitlementStatus.TRIAL,
      studentSeatLimit: 20,
      endsAt: new Date('2026-12-01T00:00:00.000Z'),
    });
    repository.findSchoolById.mockResolvedValue(schoolRecord());
    repository.findEntitlementBySchoolId.mockResolvedValue(existing);
    repository.upsertSchoolEntitlement.mockResolvedValue(
      entitlementRecord({
        status: SchoolEntitlementStatus.SUSPENDED,
        studentSeatLimit: 5,
        endsAt: new Date('2027-06-01T00:00:00.000Z'),
      }),
    );
    repository.countActiveStudentSeats.mockResolvedValue(7);

    const useCase = new UpsertSchoolEntitlementUseCase(
      repository as never,
      authRepository as never,
    );

    const response = await withPlatformScope(
      ['platform.entitlements.manage'],
      () =>
        useCase.execute('school-1', {
          status: 'suspended',
          endsAt: '2027-06-01T00:00:00.000Z',
          studentSeatLimit: 5,
        }),
    );

    expect(response.entitlement?.status).toBe('suspended');
    expect(response.studentSeatUsage.isOverLimit).toBe(true);
    expect(authRepository.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'platform.entitlement.update',
        before: expect.objectContaining({
          status: 'trial',
          studentSeatLimit: 20,
          endsAt: '2026-12-01T00:00:00.000Z',
        }),
        after: expect.objectContaining({
          status: 'suspended',
          studentSeatLimit: 5,
          endsAt: '2027-06-01T00:00:00.000Z',
          changedFields: ['status', 'endsAt', 'studentSeatLimit'],
        }),
      }),
    );
  });

  it('rejects invalid date ranges and non-positive seat limits', async () => {
    const { repository, authRepository } = mocks();
    repository.findSchoolById.mockResolvedValue(schoolRecord());
    repository.findEntitlementBySchoolId.mockResolvedValue(null);
    const useCase = new UpsertSchoolEntitlementUseCase(
      repository as never,
      authRepository as never,
    );

    await expect(
      withPlatformScope(['platform.entitlements.manage'], () =>
        useCase.execute('school-1', {
          startsAt: '2027-06-01T00:00:00.000Z',
          endsAt: '2026-06-01T00:00:00.000Z',
        }),
      ),
    ).rejects.toBeInstanceOf(PlatformEntitlementInvalidDateRangeException);

    await expect(
      withPlatformScope(['platform.entitlements.manage'], () =>
        useCase.execute('school-1', { studentSeatLimit: 0 }),
      ),
    ).rejects.toBeInstanceOf(
      PlatformEntitlementStudentSeatLimitInvalidException,
    );
    expect(repository.upsertSchoolEntitlement).not.toHaveBeenCalled();
  });

  it('rejects archived schools and skips audit on no-op updates', async () => {
    const { repository, authRepository } = mocks();
    repository.findSchoolById.mockResolvedValue(
      schoolRecord({ status: SchoolStatus.ARCHIVED }),
    );
    repository.findEntitlementBySchoolId.mockResolvedValue(entitlementRecord());
    const useCase = new UpsertSchoolEntitlementUseCase(
      repository as never,
      authRepository as never,
    );

    await expect(
      withPlatformScope(['platform.entitlements.manage'], () =>
        useCase.execute('school-1', { status: 'active' }),
      ),
    ).rejects.toBeInstanceOf(PlatformEntitlementSchoolArchivedException);

    repository.findSchoolById.mockResolvedValue(schoolRecord());
    repository.findEntitlementBySchoolId.mockResolvedValue(entitlementRecord());
    repository.countActiveStudentSeats.mockResolvedValue(1);

    await withPlatformScope(['platform.entitlements.manage'], () =>
      useCase.execute('school-1', { status: 'active' }),
    );

    expect(repository.upsertSchoolEntitlement).not.toHaveBeenCalled();
    expect(authRepository.createAuditLog).not.toHaveBeenCalled();
  });
});

function mocks(): {
  repository: jest.Mocked<Partial<PlatformAdminEntitlementsRepository>>;
  authRepository: { createAuditLog: jest.Mock };
} {
  return {
    repository: {
      findSchoolById: jest.fn(),
      findEntitlementBySchoolId: jest.fn(),
      upsertSchoolEntitlement: jest.fn(),
      countActiveStudentSeats: jest.fn(),
      loadOverviewCounters: jest.fn(),
    },
    authRepository: { createAuditLog: jest.fn().mockResolvedValue(undefined) },
  };
}

function withPlatformScope<T>(
  permissions: string[],
  fn: () => Promise<T>,
): Promise<T> {
  return runWithRequestContext(createRequestContext(), async () => {
    setActor({ id: 'platform-1', userType: UserType.PLATFORM_USER });
    setPlatformPermissions(permissions);
    return fn();
  });
}

function schoolRecord(
  overrides: Partial<PlatformEntitlementSchoolRecord> = {},
): PlatformEntitlementSchoolRecord {
  return {
    id: 'school-1',
    organizationId: 'org-1',
    name: 'Moazez Primary',
    slug: 'primary',
    status: SchoolStatus.ACTIVE,
    deletedAt: null,
    ...overrides,
  };
}

function entitlementRecord(
  overrides: Partial<PlatformSchoolEntitlementRecord> = {},
): PlatformSchoolEntitlementRecord {
  return {
    id: 'entitlement-1',
    schoolId: 'school-1',
    organizationId: 'org-1',
    status: SchoolEntitlementStatus.ACTIVE,
    startsAt: new Date('2026-06-01T00:00:00.000Z'),
    endsAt: new Date('2027-06-01T00:00:00.000Z'),
    studentSeatLimit: 10,
    notes: 'Annual school entitlement',
    createdAt: new Date('2026-06-01T09:00:00.000Z'),
    updatedAt: new Date('2026-06-01T10:00:00.000Z'),
    ...overrides,
  };
}
