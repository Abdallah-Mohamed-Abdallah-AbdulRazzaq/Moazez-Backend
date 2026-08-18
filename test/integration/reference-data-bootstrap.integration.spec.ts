import {
  MembershipStatus,
  OrganizationStatus,
  PrismaClient,
  SchoolStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { BootstrapAuthorizationReferenceDataUseCase } from '../../src/modules/iam/reference-data/application/bootstrap-authorization-reference-data.use-case';
import { PERMISSIONS } from '../../src/modules/iam/reference-data/permission-catalog';
import { ReferenceDataBootstrapError } from '../../src/modules/iam/reference-data/reference-data-bootstrap.errors';
import { SYSTEM_ROLES } from '../../src/modules/iam/reference-data/system-role-catalog';
import { AuthorizationReferenceDataRepository } from '../../src/modules/iam/reference-data/infrastructure/authorization-reference-data.repository';
import { PLATFORM_ADMIN_ROLE_CODE } from '../../src/modules/platform-admin/bootstrap/platform-admin-bootstrap.constants';
import { PlatformAdminBootstrapError } from '../../src/modules/platform-admin/bootstrap/platform-admin-bootstrap.errors';
import { PlatformAdminBootstrapRepository } from '../../src/modules/platform-admin/bootstrap/platform-admin-bootstrap.repository';

jest.setTimeout(120_000);

const DISPOSABLE_DATABASE_REQUIRED_MESSAGE =
  'Reference-data bootstrap integration requires an explicitly disposable test database';
const LOCAL_DISPOSABLE_DATABASE_PATTERN =
  /^moazez_test(?:_[a-z0-9]+(?:[_-][a-z0-9]+)*)?$/u;
const CI_DISPOSABLE_DATABASE_PATTERN = /^ci_[0-9a-f]{14}$/u;

assertDisposableIntegrationDatabase(process.env);

const TEST_MARKER = `reference-data-${randomUUID().slice(0, 12)}`;
const UNKNOWN_PERMISSION_CODE = `reference_data.${TEST_MARKER}.unknown`;
const MISSING_PERMISSION = requireCanonicalPermission('platform.overview.view');
const CORRUPTED_PERMISSION = requireCanonicalPermission(
  'platform.organizations.view',
);
const CORRUPTED_ROLE = requireCanonicalRole('teacher');
const MISSING_GRANT_CODE = requireRolePermission(CORRUPTED_ROLE.key);
const EXPECTED_ROLE_GRANT_COUNT = SYSTEM_ROLES.reduce(
  (count, role) => count + role.permissions.length,
  0,
);

describe('authorization reference-data bootstrap (integration)', () => {
  const prisma = new PrismaClient();

  let repository: AuthorizationReferenceDataRepository;
  let useCase: BootstrapAuthorizationReferenceDataUseCase;
  let organizationId = '';
  let schoolId = '';
  let customRoleId = '';
  let userId = '';
  let membershipId = '';

  beforeAll(async () => {
    await prisma.$connect();

    repository = new AuthorizationReferenceDataRepository(
      prisma as unknown as PrismaService,
    );
    useCase = new BootstrapAuthorizationReferenceDataUseCase(repository);

    const organization = await prisma.organization.create({
      data: {
        name: `Reference Data Sentinel ${TEST_MARKER}`,
        slug: `${TEST_MARKER}-organization`,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    organizationId = organization.id;

    const school = await prisma.school.create({
      data: {
        organizationId,
        name: `Reference Data Sentinel School ${TEST_MARKER}`,
        slug: `${TEST_MARKER}-school`,
        status: SchoolStatus.ACTIVE,
      },
      select: { id: true },
    });
    schoolId = school.id;

    const customRole = await prisma.role.create({
      data: {
        schoolId,
        key: `${TEST_MARKER}-custom-role`,
        name: 'Reference Data Sentinel Role',
        description: `Must remain unchanged: ${TEST_MARKER}`,
        isSystem: false,
      },
      select: { id: true },
    });
    customRoleId = customRole.id;

    const user = await prisma.user.create({
      data: {
        email: `${TEST_MARKER}@example.test`,
        username: `${TEST_MARKER}-user`,
        contactEmail: `${TEST_MARKER}-contact@example.test`,
        phone: `+1999${Date.now().toString().slice(-9)}`,
        passwordHash: `$argon2id$sentinel$${TEST_MARKER}`,
        firstName: 'Reference',
        lastName: 'Sentinel',
        userType: UserType.SCHOOL_USER,
        status: UserStatus.ACTIVE,
        mustChangePassword: true,
        credentialVersion: 7,
      },
      select: { id: true },
    });
    userId = user.id;

    const membership = await prisma.membership.create({
      data: {
        userId,
        organizationId,
        schoolId,
        roleId: customRoleId,
        userType: UserType.SCHOOL_USER,
        status: MembershipStatus.ACTIVE,
      },
      select: { id: true },
    });
    membershipId = membership.id;
  });

  afterEach(async () => {
    await prisma.permission.deleteMany({
      where: { code: UNKNOWN_PERMISSION_CODE },
    });
    await repository.converge();
  });

  afterAll(async () => {
    try {
      await prisma.permission.deleteMany({
        where: { code: UNKNOWN_PERMISSION_CODE },
      });
      if (repository) {
        await repository.converge();
      }

      if (membershipId) {
        await prisma.membership.deleteMany({ where: { id: membershipId } });
      }
      if (userId) {
        await prisma.user.deleteMany({ where: { id: userId } });
      }
      if (customRoleId) {
        await prisma.role.deleteMany({ where: { id: customRoleId } });
      }
      if (schoolId) {
        await prisma.school.deleteMany({ where: { id: schoolId } });
      }
      if (organizationId) {
        await prisma.organization.deleteMany({
          where: { id: organizationId },
        });
      }
    } finally {
      await prisma.$disconnect();
    }
  });

  it('repairs missing and corrupted canonical data and is semantically idempotent', async () => {
    const permissionToDelete = await prisma.permission.findUniqueOrThrow({
      where: { code: MISSING_PERMISSION.code },
      select: { id: true },
    });
    await prisma.permission.delete({
      where: { id: permissionToDelete.id },
    });

    await prisma.permission.update({
      where: { code: CORRUPTED_PERMISSION.code },
      data: {
        module: `${TEST_MARKER}-wrong-module`,
        resource: `${TEST_MARKER}-wrong-resource`,
        action: `${TEST_MARKER}-wrong-action`,
        description: `${TEST_MARKER}-wrong-description`,
      },
    });

    const platformRole = await prisma.role.findFirstOrThrow({
      where: {
        key: PLATFORM_ADMIN_ROLE_CODE,
        schoolId: null,
        isSystem: true,
        deletedAt: null,
      },
      select: { id: true },
    });
    await expect(
      prisma.membership.count({ where: { roleId: platformRole.id } }),
    ).resolves.toBe(0);
    await prisma.role.delete({ where: { id: platformRole.id } });

    const roleToRepair = await prisma.role.findFirstOrThrow({
      where: {
        key: CORRUPTED_ROLE.key,
        schoolId: null,
        isSystem: true,
        deletedAt: null,
      },
      select: { id: true },
    });
    await prisma.role.update({
      where: { id: roleToRepair.id },
      data: {
        name: `${TEST_MARKER}-wrong-name`,
        description: `${TEST_MARKER}-wrong-description`,
      },
    });
    const missingGrantPermission = await prisma.permission.findUniqueOrThrow({
      where: { code: MISSING_GRANT_CODE },
      select: { id: true },
    });
    await prisma.rolePermission.deleteMany({
      where: {
        roleId: roleToRepair.id,
        permissionId: missingGrantPermission.id,
      },
    });

    const firstResult = await executeWithoutProtectedMutation(() =>
      useCase.execute(),
    );

    expect(firstResult).toEqual({
      status: 'PASS',
      permissionsReady: true,
      systemRolesReady: true,
      platformSuperAdminReady: true,
      permissionCount: PERMISSIONS.length,
      systemRoleCount: SYSTEM_ROLES.length,
      platformSuperAdminPermissionCount: PERMISSIONS.length,
      userMutation: false,
    });
    await expectCanonicalReferenceData();

    const referenceStateAfterRepair = await captureReferenceSemanticState();
    const secondResult = await executeWithoutProtectedMutation(() =>
      useCase.execute(),
    );

    expect(secondResult).toEqual(firstResult);
    await expect(captureReferenceSemanticState()).resolves.toEqual(
      referenceStateAfterRepair,
    );
    await expectCanonicalReferenceData();
  });

  it('retains unknown Permission drift and blocks both bootstrap paths before User creation', async () => {
    const unexpectedPermission = await prisma.permission.create({
      data: {
        code: UNKNOWN_PERMISSION_CODE,
        module: 'reference_data_test',
        resource: TEST_MARKER,
        action: 'unknown',
        description: `Test-owned unexpected reference drift ${TEST_MARKER}`,
      },
    });

    await expect(
      executeWithoutProtectedMutation(() => useCase.execute()),
    ).rejects.toEqual(
      expect.objectContaining<Partial<ReferenceDataBootstrapError>>({
        reason: 'REFERENCE_DATA_DRIFT',
      }),
    );

    await expect(
      prisma.permission.findUniqueOrThrow({
        where: { code: UNKNOWN_PERMISSION_CODE },
      }),
    ).resolves.toEqual(unexpectedPermission);

    const verification = await repository.verify();
    expect(verification).toEqual({
      ready: false,
      permissionsReady: true,
      systemRolesReady: true,
      platformSuperAdminReady: false,
      permissionCount: PERMISSIONS.length + 1,
      systemRoleCount: SYSTEM_ROLES.length,
      platformSuperAdminPermissionCount: PERMISSIONS.length,
    });

    let userCreateAttempted = false;
    const guardedPrisma = prisma.$extends({
      query: {
        auditLog: {
          findFirst() {
            return Promise.resolve(null);
          },
        },
        user: {
          findFirst() {
            return Promise.resolve(null);
          },
          create() {
            userCreateAttempted = true;
            throw new Error('User creation must remain unreachable');
          },
        },
      },
    });
    const platformAdminRepository = new PlatformAdminBootstrapRepository(
      guardedPrisma as unknown as PrismaService,
    );

    await expect(
      executeWithoutProtectedMutation(() =>
        platformAdminRepository.createInitialPlatformAdministrator({
          email: `${TEST_MARKER}-blocked-platform-admin@example.test`,
          firstName: 'Blocked',
          lastName: 'Administrator',
          passwordHash: `$argon2id$unreachable$${TEST_MARKER}`,
        }),
      ),
    ).rejects.toEqual(
      expect.objectContaining<Partial<PlatformAdminBootstrapError>>({
        reason: 'REFERENCE_DATA_INVALID',
      }),
    );
    expect(userCreateAttempted).toBe(false);
    await expect(
      prisma.user.findUnique({
        where: {
          email: `${TEST_MARKER}-blocked-platform-admin@example.test`,
        },
      }),
    ).resolves.toBeNull();
    await expect(
      prisma.permission.findUnique({
        where: { code: UNKNOWN_PERMISSION_CODE },
      }),
    ).resolves.not.toBeNull();
  });

  async function executeWithoutProtectedMutation<T>(
    operation: () => Promise<T>,
  ): Promise<T> {
    const before = await captureProtectedState();
    try {
      return await operation();
    } finally {
      await expect(captureProtectedState()).resolves.toEqual(before);
    }
  }

  async function captureProtectedState() {
    const [organization, school, customRole, user, membership, counts] =
      await Promise.all([
        prisma.organization.findUniqueOrThrow({
          where: { id: organizationId },
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
            createdAt: true,
            updatedAt: true,
            deletedAt: true,
          },
        }),
        prisma.school.findUniqueOrThrow({
          where: { id: schoolId },
          select: {
            id: true,
            organizationId: true,
            name: true,
            slug: true,
            status: true,
            createdAt: true,
            updatedAt: true,
            deletedAt: true,
          },
        }),
        prisma.role.findUniqueOrThrow({
          where: { id: customRoleId },
          select: {
            id: true,
            schoolId: true,
            key: true,
            name: true,
            description: true,
            isSystem: true,
            createdAt: true,
            updatedAt: true,
            deletedAt: true,
          },
        }),
        prisma.user.findUniqueOrThrow({
          where: { id: userId },
          select: {
            id: true,
            email: true,
            username: true,
            contactEmail: true,
            phone: true,
            passwordHash: true,
            firstName: true,
            lastName: true,
            userType: true,
            status: true,
            lastLoginAt: true,
            mustChangePassword: true,
            passwordChangedAt: true,
            passwordProvisionedAt: true,
            credentialVersion: true,
            createdAt: true,
            updatedAt: true,
            deletedAt: true,
          },
        }),
        prisma.membership.findUniqueOrThrow({
          where: { id: membershipId },
          select: {
            id: true,
            userId: true,
            organizationId: true,
            schoolId: true,
            roleId: true,
            userType: true,
            status: true,
            startedAt: true,
            endedAt: true,
            createdAt: true,
            updatedAt: true,
            deletedAt: true,
          },
        }),
        Promise.all([
          prisma.user.count(),
          prisma.membership.count(),
          prisma.organization.count(),
          prisma.school.count(),
        ]),
      ]);

    return {
      organization,
      school,
      customRole,
      user,
      membership,
      counts: {
        users: counts[0],
        memberships: counts[1],
        organizations: counts[2],
        schools: counts[3],
      },
    };
  }

  async function captureReferenceSemanticState() {
    const [permissions, roles, systemRoleCount, roleGrantCount] =
      await Promise.all([
        prisma.permission.findMany({
          where: { code: { in: PERMISSIONS.map(({ code }) => code) } },
          orderBy: { code: 'asc' },
          select: {
            id: true,
            code: true,
            module: true,
            resource: true,
            action: true,
            description: true,
          },
        }),
        prisma.role.findMany({
          where: {
            key: { in: SYSTEM_ROLES.map(({ key }) => key) },
            schoolId: null,
            isSystem: true,
            deletedAt: null,
          },
          orderBy: { key: 'asc' },
          select: {
            id: true,
            key: true,
            name: true,
            description: true,
            rolePermissions: {
              select: { permission: { select: { code: true } } },
            },
          },
        }),
        prisma.role.count({
          where: { schoolId: null, isSystem: true, deletedAt: null },
        }),
        prisma.rolePermission.count({
          where: {
            role: {
              schoolId: null,
              isSystem: true,
              deletedAt: null,
              key: { in: SYSTEM_ROLES.map(({ key }) => key) },
            },
          },
        }),
      ]);

    return {
      permissions,
      roles: roles.map(({ rolePermissions, ...role }) => ({
        ...role,
        permissionCodes: rolePermissions
          .map(({ permission }) => permission.code)
          .sort(),
      })),
      systemRoleCount,
      roleGrantCount,
    };
  }

  async function expectCanonicalReferenceData(): Promise<void> {
    const state = await captureReferenceSemanticState();
    const permissionByCode = new Map(
      state.permissions.map((permission) => [permission.code, permission]),
    );
    const roleByKey = new Map(state.roles.map((role) => [role.key, role]));

    expect(state.permissions).toHaveLength(PERMISSIONS.length);
    for (const definition of PERMISSIONS) {
      expect(permissionByCode.get(definition.code)).toEqual(
        expect.objectContaining({
          code: definition.code,
          module: definition.module,
          resource: definition.resource,
          action: definition.action,
          description: definition.description,
        }),
      );
    }

    expect(state.roles).toHaveLength(SYSTEM_ROLES.length);
    expect(state.systemRoleCount).toBe(SYSTEM_ROLES.length);
    expect(state.roleGrantCount).toBe(EXPECTED_ROLE_GRANT_COUNT);
    for (const definition of SYSTEM_ROLES) {
      expect(roleByKey.get(definition.key)).toEqual(
        expect.objectContaining({
          key: definition.key,
          name: definition.name,
          description: definition.description,
          permissionCodes: [...definition.permissions].sort(),
        }),
      );
    }

    const verification = await repository.verify();
    expect(verification).toEqual({
      ready: true,
      permissionsReady: true,
      systemRolesReady: true,
      platformSuperAdminReady: true,
      permissionCount: PERMISSIONS.length,
      systemRoleCount: SYSTEM_ROLES.length,
      platformSuperAdminPermissionCount: PERMISSIONS.length,
    });
  }
});

function requireCanonicalPermission(code: string) {
  const permission = PERMISSIONS.find((candidate) => candidate.code === code);
  if (!permission) {
    throw new Error(`Required canonical Permission is missing: ${code}`);
  }
  return permission;
}

function requireCanonicalRole(key: string) {
  const role = SYSTEM_ROLES.find((candidate) => candidate.key === key);
  if (!role) {
    throw new Error(`Required canonical system Role is missing: ${key}`);
  }
  return role;
}

function requireRolePermission(roleKey: string): string {
  const role = requireCanonicalRole(roleKey);
  const permissionCode = role.permissions[0];
  if (!permissionCode) {
    throw new Error(`Required system Role has no Permission: ${roleKey}`);
  }
  return permissionCode;
}

function assertDisposableIntegrationDatabase(
  environment: NodeJS.ProcessEnv,
): void {
  if (environment.NODE_ENV !== 'test' || !environment.DATABASE_URL) {
    throw new Error(DISPOSABLE_DATABASE_REQUIRED_MESSAGE);
  }

  let databaseUrl: URL;
  let databaseName: string;
  try {
    databaseUrl = new URL(environment.DATABASE_URL);
    databaseName = decodeURIComponent(databaseUrl.pathname.slice(1));
  } catch {
    throw new Error(DISPOSABLE_DATABASE_REQUIRED_MESSAGE);
  }

  const isLoopback =
    databaseUrl.hostname === 'localhost' ||
    databaseUrl.hostname === '127.0.0.1';
  const isDisposableDatabase =
    LOCAL_DISPOSABLE_DATABASE_PATTERN.test(databaseName) ||
    CI_DISPOSABLE_DATABASE_PATTERN.test(databaseName);

  if (
    databaseUrl.protocol !== 'postgresql:' ||
    !isLoopback ||
    !isDisposableDatabase
  ) {
    throw new Error(DISPOSABLE_DATABASE_REQUIRED_MESSAGE);
  }
}
