import {
  MembershipStatus,
  OrganizationStatus,
  SchoolLoginSettingsStatus,
  SchoolStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActor,
  setPlatformPermissions,
} from '../../../common/context/request-context';
import { ProvisionPlatformSchoolUseCase } from '../application/provision-platform-school.use-case';
import {
  PlatformSchoolProvisioningLoginDomainTakenException,
  PlatformSchoolProvisioningPrimaryAdminLoginTakenException,
} from '../domain/platform-admin-errors';
import { PlatformAdminRepository } from '../infrastructure/platform-admin.repository';
import type {
  PlatformSchoolProvisioningRecord,
  ProvisionPlatformSchoolTransactionData,
} from '../infrastructure/platform-admin.repository';

describe('ProvisionPlatformSchoolUseCase', () => {
  it('validates create organization mode and maps the provisioning output', async () => {
    const { repository, passwordService } = mocks();
    repository.findOrganizationBySlug.mockResolvedValue(null);
    repository.findLoginSettingsByDomain.mockResolvedValue(null);
    repository.findUserByLoginEmail.mockResolvedValue(null);
    repository.findSystemRoleByKey.mockResolvedValue(roleRecord());
    repository.provisionSchool.mockImplementation(mockProvisionSchoolFromInput);

    const useCase = new ProvisionPlatformSchoolUseCase(
      repository as never,
      passwordService as never,
    );

    const response = await withPlatformScope(() =>
      useCase.execute({
        organization: {
          mode: 'create',
          name: '  Al   Rowad Group ',
          slug: 'Al Rowad',
        },
        school: {
          name: ' Al Rowad International School ',
          slug: 'Main',
        },
        loginIdentity: {
          loginDomain: 'ROWAD.MOAZEZ.SCHOOL',
        },
        primaryAdmin: {
          firstName: ' School ',
          lastName: ' Admin ',
          username: 'ADMIN',
          contactEmail: 'Admin@School.Com',
          phone: '+201000000000',
        },
        credentials: { deliveryMode: 'manual' },
      }),
    );

    expect(repository.provisionSchool).toHaveBeenCalledWith(
      expect.objectContaining({
        organization: {
          mode: 'create',
          name: 'Al Rowad Group',
          slug: 'al-rowad',
        },
        school: {
          name: 'Al Rowad International School',
          slug: 'main',
        },
        loginIdentity: {
          loginDomain: 'rowad.moazez.school',
        },
        primaryAdmin: expect.objectContaining({
          username: 'admin',
          loginEmail: 'admin@rowad.moazez.school',
          contactEmail: 'admin@school.com',
          phone: '+201000000000',
          mustChangePassword: true,
          passwordHash: null,
        }),
      }),
    );
    expect(response).toMatchObject({
      organization: {
        organizationId: 'created-org',
        slug: 'al-rowad',
        status: OrganizationStatus.ACTIVE,
      },
      school: {
        schoolId: 'created-school',
        slug: 'main',
        status: SchoolStatus.ACTIVE,
      },
      loginIdentity: {
        loginDomain: 'rowad.moazez.school',
        primaryAdminLoginEmail: 'admin@rowad.moazez.school',
      },
      primaryAdmin: {
        userId: 'primary-admin',
        username: 'admin',
        loginEmail: 'admin@rowad.moazez.school',
        contactEmail: 'admin@school.com',
        userType: 'school_user',
        status: 'active',
        mustChangePassword: true,
      },
      credentials: {
        deliveryMode: 'manual',
        status: 'manual_pending',
        temporaryPassword: null,
      },
      deferred: {
        entitlements: 'deferred',
        featureControl: 'deferred',
        studentSeatLimit: 'deferred',
        billing: 'out_of_scope_v1',
      },
    });
  });

  it('validates existing organization mode and generated login email', async () => {
    const { repository, passwordService } = mocks();
    repository.findOrganizationById.mockResolvedValue({
      id: 'org-existing',
      name: 'Existing Org',
      slug: 'existing-org',
      status: OrganizationStatus.ACTIVE,
      schoolsCount: 1,
      activeSchoolsCount: 1,
      createdAt: new Date('2026-06-01T09:00:00.000Z'),
      updatedAt: new Date('2026-06-01T09:00:00.000Z'),
      deletedAt: null,
    });
    repository.findSchoolBySlug.mockResolvedValue(null);
    repository.findLoginSettingsByDomain.mockResolvedValue(null);
    repository.findUserByLoginEmail.mockResolvedValue(null);
    repository.findSystemRoleByKey.mockResolvedValue(roleRecord());
    repository.provisionSchool.mockImplementation(mockProvisionSchoolFromInput);

    const useCase = new ProvisionPlatformSchoolUseCase(
      repository as never,
      passwordService as never,
    );

    const response = await withPlatformScope(() =>
      useCase.execute({
        organization: {
          mode: 'existing',
          organizationId: 'org-existing',
        },
        school: {
          name: 'Second Campus',
          slug: 'second-campus',
        },
        loginIdentity: {
          loginDomain: 'second.moazez.school',
        },
        primaryAdmin: {
          firstName: 'Primary',
          lastName: 'Admin',
          username: 'primary.admin',
          contactEmail: 'primary@example.test',
        },
        credentials: { deliveryMode: 'activation_link' },
      }),
    );

    expect(repository.findSchoolBySlug).toHaveBeenCalledWith({
      organizationId: 'org-existing',
      slug: 'second-campus',
    });
    expect(repository.provisionSchool).toHaveBeenCalledWith(
      expect.objectContaining({
        organization: {
          mode: 'existing',
          organizationId: 'org-existing',
        },
        primaryAdmin: expect.objectContaining({
          loginEmail: 'primary.admin@second.moazez.school',
        }),
        credentials: {
          deliveryMode: 'activation_link',
          status: 'activation_link_deferred',
        },
      }),
    );
    expect(response.loginIdentity.primaryAdminLoginEmail).toBe(
      'primary.admin@second.moazez.school',
    );
  });

  it('supports one-time temporary password mode through the safe credential foundation', async () => {
    const { repository, passwordService } = mocks();
    repository.findOrganizationBySlug.mockResolvedValue(null);
    repository.findLoginSettingsByDomain.mockResolvedValue(null);
    repository.findUserByLoginEmail.mockResolvedValue(null);
    repository.findSystemRoleByKey.mockResolvedValue(roleRecord());
    repository.provisionSchool.mockImplementation(mockProvisionSchoolFromInput);
    passwordService.hash.mockImplementation(
      async (plain: string) => `hashed:${plain}`,
    );

    const useCase = new ProvisionPlatformSchoolUseCase(
      repository as never,
      passwordService as never,
    );

    const response = await withPlatformScope(() =>
      useCase.execute({
        organization: {
          mode: 'create',
          name: 'Temporary Org',
          slug: 'temporary-org',
        },
        school: {
          name: 'Temporary School',
          slug: 'temporary-school',
        },
        loginIdentity: {
          loginDomain: 'temporary.moazez.school',
        },
        primaryAdmin: {
          firstName: 'Temp',
          lastName: 'Admin',
          username: 'temp.admin',
          contactEmail: 'temp@example.test',
        },
        credentials: { deliveryMode: 'temporary_password' },
      }),
    );

    expect(response.credentials.temporaryPassword).toMatch(/^MZ-/);
    expect(passwordService.hash).toHaveBeenCalledWith(
      response.credentials.temporaryPassword,
    );
    expect(repository.provisionSchool).toHaveBeenCalledWith(
      expect.objectContaining({
        primaryAdmin: expect.objectContaining({
          passwordHash: `hashed:${response.credentials.temporaryPassword}`,
          credentialVersion: 1,
          mustChangePassword: true,
        }),
        credentials: {
          deliveryMode: 'temporary_password',
          status: 'temporary_password_ready',
        },
      }),
    );
    expect(JSON.stringify(response)).not.toContain('passwordHash');
  });

  it('rejects duplicate login domains before provisioning', async () => {
    const { repository, passwordService } = mocks();
    repository.findOrganizationBySlug.mockResolvedValue(null);
    repository.findLoginSettingsByDomain.mockResolvedValue({
      id: 'settings-1',
      schoolId: 'school-1',
      loginDomain: 'taken.moazez.school',
    });
    const useCase = new ProvisionPlatformSchoolUseCase(
      repository as never,
      passwordService as never,
    );

    await expect(
      withPlatformScope(() =>
        useCase.execute({
          organization: {
            mode: 'create',
            name: 'Taken Domain Org',
            slug: 'taken-domain-org',
          },
          school: {
            name: 'Taken Domain School',
            slug: 'taken-domain-school',
          },
          loginIdentity: {
            loginDomain: 'taken.moazez.school',
          },
          primaryAdmin: {
            firstName: 'Domain',
            lastName: 'Admin',
            username: 'domain.admin',
            contactEmail: 'domain@example.test',
          },
          credentials: { deliveryMode: 'manual' },
        }),
      ),
    ).rejects.toBeInstanceOf(
      PlatformSchoolProvisioningLoginDomainTakenException,
    );
    expect(repository.provisionSchool).not.toHaveBeenCalled();
  });

  it('rejects duplicate generated primary admin login emails before provisioning', async () => {
    const { repository, passwordService } = mocks();
    repository.findOrganizationBySlug.mockResolvedValue(null);
    repository.findLoginSettingsByDomain.mockResolvedValue(null);
    repository.findUserByLoginEmail.mockResolvedValue({
      id: 'existing-user',
      email: 'taken.admin@unique.moazez.school',
    });
    const useCase = new ProvisionPlatformSchoolUseCase(
      repository as never,
      passwordService as never,
    );

    await expect(
      withPlatformScope(() =>
        useCase.execute({
          organization: {
            mode: 'create',
            name: 'Login Taken Org',
            slug: 'login-taken-org',
          },
          school: {
            name: 'Login Taken School',
            slug: 'login-taken-school',
          },
          loginIdentity: {
            loginDomain: 'unique.moazez.school',
          },
          primaryAdmin: {
            firstName: 'Taken',
            lastName: 'Admin',
            username: 'taken.admin',
            contactEmail: 'taken@example.test',
          },
          credentials: { deliveryMode: 'manual' },
        }),
      ),
    ).rejects.toBeInstanceOf(
      PlatformSchoolProvisioningPrimaryAdminLoginTakenException,
    );
    expect(repository.provisionSchool).not.toHaveBeenCalled();
  });
});

function mocks(): {
  repository: jest.Mocked<Partial<PlatformAdminRepository>>;
  passwordService: { hash: jest.Mock };
} {
  return {
    repository: {
      findOrganizationById: jest.fn(),
      findOrganizationBySlug: jest.fn(),
      findSchoolBySlug: jest.fn(),
      findLoginSettingsByDomain: jest.fn(),
      findUserByLoginEmail: jest.fn(),
      findSystemRoleByKey: jest.fn(),
      provisionSchool: jest.fn(),
    },
    passwordService: {
      hash: jest.fn(async (plain: string) => `hashed:${plain}`),
    },
  };
}

function withPlatformScope<T>(fn: () => Promise<T>): Promise<T> {
  return runWithRequestContext(createRequestContext(), async () => {
    setActor({ id: 'platform-1', userType: UserType.PLATFORM_USER });
    setPlatformPermissions(['platform.schools.manage']);
    return fn();
  });
}

function roleRecord(): { id: string; key: string; name: string } {
  return {
    id: 'school-admin-role',
    key: 'school_admin',
    name: 'School Admin',
  };
}

async function mockProvisionSchoolFromInput(
  data: ProvisionPlatformSchoolTransactionData,
): Promise<PlatformSchoolProvisioningRecord> {
  const organization =
    data.organization.mode === 'create'
      ? {
          id: 'created-org',
          name: data.organization.name,
          slug: data.organization.slug,
          status: OrganizationStatus.ACTIVE,
        }
      : {
          id: data.organization.organizationId,
          name: 'Existing Org',
          slug: 'existing-org',
          status: OrganizationStatus.ACTIVE,
        };

  return {
    organization,
    school: {
      id: 'created-school',
      organizationId: organization.id,
      name: data.school.name,
      slug: data.school.slug,
      status: SchoolStatus.ACTIVE,
    },
    loginSettings: {
      id: 'login-settings-1',
      schoolId: 'created-school',
      loginDomain: data.loginIdentity.loginDomain,
      status: SchoolLoginSettingsStatus.ACTIVE,
    },
    primaryAdmin: {
      id: 'primary-admin',
      email: data.primaryAdmin.loginEmail,
      username: data.primaryAdmin.username,
      contactEmail: data.primaryAdmin.contactEmail,
      phone: data.primaryAdmin.phone ?? null,
      firstName: data.primaryAdmin.firstName,
      lastName: data.primaryAdmin.lastName,
      userType: UserType.SCHOOL_USER,
      status: UserStatus.ACTIVE,
      mustChangePassword: data.primaryAdmin.mustChangePassword,
      passwordProvisionedAt: data.primaryAdmin.passwordProvisionedAt ?? null,
      credentialVersion: data.primaryAdmin.credentialVersion,
    },
    membership: {
      id: 'membership-1',
      userId: 'primary-admin',
      organizationId: organization.id,
      schoolId: 'created-school',
      roleId: data.schoolAdminRoleId,
      userType: UserType.SCHOOL_USER,
      status: MembershipStatus.ACTIVE,
      role: roleRecord(),
    },
    credentials: data.credentials,
  };
}
