import {
  AuditOutcome,
  OrganizationStatus,
  SchoolStatus,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
  setPlatformPermissions,
} from '../../../common/context/request-context';
import { ScopeMissingException } from '../../iam/auth/domain/auth.exceptions';
import { CreatePlatformOrganizationUseCase } from '../application/create-platform-organization.use-case';
import { CreatePlatformSchoolUseCase } from '../application/create-platform-school.use-case';
import { TransitionPlatformOrganizationStatusUseCase } from '../application/transition-platform-organization-status.use-case';
import { TransitionPlatformSchoolStatusUseCase } from '../application/transition-platform-school-status.use-case';
import {
  PlatformOrganizationArchivedException,
  PlatformOrganizationInvalidStatusTransitionException,
  PlatformOrganizationSlugTakenException,
  PlatformSchoolInvalidStatusTransitionException,
  PlatformSchoolSlugTakenException,
} from '../domain/platform-admin-errors';
import { PlatformAdminRepository } from '../infrastructure/platform-admin.repository';
import type {
  PlatformOrganizationRecord,
  PlatformSchoolRecord,
} from '../infrastructure/platform-admin.repository';

describe('Platform Admin use cases', () => {
  it('normalizes organization slug, creates organization, and audits safely', async () => {
    const { repository, authRepository } = mocks();
    repository.findOrganizationBySlug.mockResolvedValue(null);
    repository.createOrganization.mockResolvedValue(
      organizationRecord({ slug: 'moazez-academy' }),
    );
    const useCase = new CreatePlatformOrganizationUseCase(
      repository as never,
      authRepository as never,
    );

    const response = await withPlatformScope(() =>
      useCase.execute({
        name: '  Moazez   Academy  ',
        slug: 'Moazez Academy',
      }),
    );

    expect(repository.createOrganization).toHaveBeenCalledWith({
      name: 'Moazez Academy',
      slug: 'moazez-academy',
    });
    expect(response.slug).toBe('moazez-academy');
    expect(authRepository.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'platform-1',
        userType: UserType.PLATFORM_USER,
        module: 'platform_admin',
        action: 'platform.organization.create',
        resourceType: 'organization',
        outcome: AuditOutcome.SUCCESS,
      }),
    );
    expect(JSON.stringify(authRepository.createAuditLog.mock.calls)).not.toContain(
      'passwordHash',
    );
  });

  it('rejects duplicate organization slug after normalization', async () => {
    const { repository, authRepository } = mocks();
    repository.findOrganizationBySlug.mockResolvedValue(organizationRecord());
    const useCase = new CreatePlatformOrganizationUseCase(
      repository as never,
      authRepository as never,
    );

    await expect(
      withPlatformScope(() =>
        useCase.execute({ name: 'Duplicate', slug: 'Moazez Group' }),
      ),
    ).rejects.toBeInstanceOf(PlatformOrganizationSlugTakenException);
    expect(repository.createOrganization).not.toHaveBeenCalled();
    expect(authRepository.createAuditLog).not.toHaveBeenCalled();
  });

  it('blocks activating an archived organization', async () => {
    const { repository, authRepository } = mocks();
    repository.findOrganizationById.mockResolvedValue(
      organizationRecord({ status: OrganizationStatus.ARCHIVED }),
    );
    const useCase = new TransitionPlatformOrganizationStatusUseCase(
      repository as never,
      authRepository as never,
    );

    await expect(
      withPlatformScope(() =>
        useCase.execute('org-1', OrganizationStatus.ACTIVE),
      ),
    ).rejects.toBeInstanceOf(PlatformOrganizationArchivedException);
    expect(repository.updateOrganization).not.toHaveBeenCalled();
  });

  it('rejects school creation under a suspended organization', async () => {
    const { repository, authRepository } = mocks();
    repository.findOrganizationById.mockResolvedValue(
      organizationRecord({ status: OrganizationStatus.SUSPENDED }),
    );
    const useCase = new CreatePlatformSchoolUseCase(
      repository as never,
      authRepository as never,
    );

    await expect(
      withPlatformScope(() =>
        useCase.execute('org-1', { name: 'Primary', slug: 'primary' }),
      ),
    ).rejects.toBeInstanceOf(
      PlatformOrganizationInvalidStatusTransitionException,
    );
    expect(repository.createSchool).not.toHaveBeenCalled();
  });

  it('rejects duplicate school slug within the organization', async () => {
    const { repository, authRepository } = mocks();
    repository.findOrganizationById.mockResolvedValue(organizationRecord());
    repository.findSchoolBySlug.mockResolvedValue(schoolRecord());
    const useCase = new CreatePlatformSchoolUseCase(
      repository as never,
      authRepository as never,
    );

    await expect(
      withPlatformScope(() =>
        useCase.execute('org-1', { name: 'Primary', slug: 'Primary' }),
      ),
    ).rejects.toBeInstanceOf(PlatformSchoolSlugTakenException);
    expect(repository.createSchool).not.toHaveBeenCalled();
    expect(authRepository.createAuditLog).not.toHaveBeenCalled();
  });

  it('blocks activating an archived school', async () => {
    const { repository, authRepository } = mocks();
    repository.findSchoolById.mockResolvedValue(
      schoolRecord({ status: SchoolStatus.ARCHIVED }),
    );
    const useCase = new TransitionPlatformSchoolStatusUseCase(
      repository as never,
      authRepository as never,
    );

    await expect(
      withPlatformScope(() => useCase.execute('school-1', SchoolStatus.ACTIVE)),
    ).rejects.toBeInstanceOf(PlatformSchoolInvalidStatusTransitionException);
    expect(repository.updateSchool).not.toHaveBeenCalled();
  });

  it('requires a platform actor before executing use cases', async () => {
    const { repository, authRepository } = mocks();
    const useCase = new CreatePlatformOrganizationUseCase(
      repository as never,
      authRepository as never,
    );

    await expect(
      runWithRequestContext(createRequestContext(), async () => {
        setActor({ id: 'school-user-1', userType: UserType.SCHOOL_USER });
        setActiveMembership({
          membershipId: 'membership-1',
          organizationId: 'org-1',
          schoolId: 'school-1',
          roleId: 'role-1',
          permissions: ['platform.organizations.manage'],
        });
        return useCase.execute({ name: 'Denied', slug: 'denied' });
      }),
    ).rejects.toBeInstanceOf(ScopeMissingException);
  });
});

function mocks(): {
  repository: jest.Mocked<Partial<PlatformAdminRepository>>;
  authRepository: { createAuditLog: jest.Mock };
} {
  return {
    repository: {
      findOrganizationById: jest.fn(),
      findOrganizationBySlug: jest.fn(),
      createOrganization: jest.fn(),
      updateOrganization: jest.fn(),
      findSchoolById: jest.fn(),
      findSchoolBySlug: jest.fn(),
      createSchool: jest.fn(),
      updateSchool: jest.fn(),
    },
    authRepository: { createAuditLog: jest.fn().mockResolvedValue(undefined) },
  };
}

function withPlatformScope<T>(fn: () => Promise<T>): Promise<T> {
  return runWithRequestContext(createRequestContext(), async () => {
    setActor({ id: 'platform-1', userType: UserType.PLATFORM_USER });
    setPlatformPermissions([
      'platform.overview.view',
      'platform.organizations.view',
      'platform.organizations.manage',
      'platform.schools.view',
      'platform.schools.manage',
    ]);
    return fn();
  });
}

function organizationRecord(
  overrides: Partial<PlatformOrganizationRecord> = {},
): PlatformOrganizationRecord {
  return { ...organizationRecordBase(), ...overrides };
}

function organizationRecordBase(): PlatformOrganizationRecord {
  return {
    id: 'org-1',
    name: 'Moazez Group',
    slug: 'moazez-group',
    status: OrganizationStatus.ACTIVE,
    schoolsCount: 0,
    activeSchoolsCount: 0,
    createdAt: new Date('2026-06-01T09:00:00.000Z'),
    updatedAt: new Date('2026-06-01T09:00:00.000Z'),
    deletedAt: null,
  };
}

function schoolRecord(
  overrides: Partial<PlatformSchoolRecord> = {},
): PlatformSchoolRecord {
  return { ...schoolRecordBase(), ...overrides };
}

function schoolRecordBase(): PlatformSchoolRecord {
  return {
    id: 'school-1',
    organizationId: 'org-1',
    organization: {
      id: 'org-1',
      name: 'Moazez Group',
      slug: 'moazez-group',
      status: OrganizationStatus.ACTIVE,
    },
    name: 'Moazez Primary',
    slug: 'primary',
    status: SchoolStatus.ACTIVE,
    createdAt: new Date('2026-06-01T09:00:00.000Z'),
    updatedAt: new Date('2026-06-01T09:00:00.000Z'),
    deletedAt: null,
  };
}
