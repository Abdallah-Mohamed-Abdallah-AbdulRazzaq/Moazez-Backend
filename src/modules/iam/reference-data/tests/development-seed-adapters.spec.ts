import * as permissionSeedAdapter from '../../../../../prisma/seeds/01-permissions.seed';
import * as systemRoleSeedAdapter from '../../../../../prisma/seeds/02-system-roles.seed';
import { PERMISSION_CODES, PERMISSIONS } from '../permission-catalog';
import { SYSTEM_ROLES, TEACHER_PERMISSIONS } from '../system-role-catalog';
import {
  applyCanonicalPermissions,
  applyCanonicalSystemRoles,
  type AuthorizationReferenceDataClient,
} from '../infrastructure/authorization-reference-data.apply';

const CURRENT_PERMISSION_COUNT = 236;
const CURRENT_SYSTEM_ROLE_COUNT = 7;
const CURRENT_ROLE_GRANT_COUNT = 847;

type PermissionFindManyInput = {
  where: { code: { in: string[] } };
};

type RoleCreateInput = {
  data: { key: string };
};

type RolePermissionCreateManyInput = {
  data: Array<{ roleId: string; permissionId: string }>;
};

function createFakeReferenceDataClient() {
  const permission = {
    upsert: jest.fn(() => Promise.resolve({})),
    findMany: jest.fn((input: PermissionFindManyInput) =>
      Promise.resolve(
        input.where.code.in.map((code) => ({ id: `permission:${code}`, code })),
      ),
    ),
  };
  const role = {
    findFirst: jest.fn(() => Promise.resolve(null)),
    update: jest.fn(() => Promise.resolve({ id: 'updated-role' })),
    create: jest.fn((input: RoleCreateInput) =>
      Promise.resolve({
        id: `role:${input.data.key}`,
      }),
    ),
  };
  const rolePermission = {
    deleteMany: jest.fn(() => Promise.resolve({ count: 0 })),
    createMany: jest.fn((input: RolePermissionCreateManyInput) =>
      Promise.resolve({
        count: input.data.length,
      }),
    ),
  };

  return {
    client: {
      permission,
      role,
      rolePermission,
    } as unknown as AuthorizationReferenceDataClient,
    permission,
    role,
    rolePermission,
  };
}

describe('development authorization reference-data seed adapters', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('preserves the exact existing runtime exports and canonical object references', () => {
    expect(Object.keys(permissionSeedAdapter).sort()).toEqual([
      'PERMISSION_CODES',
      'seedPermissions',
    ]);
    expect(Object.keys(systemRoleSeedAdapter).sort()).toEqual([
      'SYSTEM_ROLES',
      'TEACHER_PERMISSIONS',
      'seedSystemRoles',
    ]);

    expect(permissionSeedAdapter.PERMISSION_CODES).toBe(PERMISSION_CODES);
    expect(systemRoleSeedAdapter.SYSTEM_ROLES).toBe(SYSTEM_ROLES);
    expect(systemRoleSeedAdapter.TEACHER_PERMISSIONS).toBe(TEACHER_PERMISSIONS);
  });

  it('runs the permission adapter through every canonical upsert and adds only its development log', async () => {
    const fake = createFakeReferenceDataClient();
    const logger = jest
      .spyOn(console, 'log')
      .mockImplementation(() => undefined);

    await permissionSeedAdapter.seedPermissions(fake.client as never);

    expect(PERMISSIONS).toHaveLength(CURRENT_PERMISSION_COUNT);
    expect(fake.permission.upsert).toHaveBeenCalledTimes(
      CURRENT_PERMISSION_COUNT,
    );
    expect(logger).toHaveBeenCalledTimes(1);
    expect(logger).toHaveBeenCalledWith(
      `  ✔ seeded ${CURRENT_PERMISSION_COUNT} permissions`,
    );
  });

  it('runs the system-role adapter through every canonical role and grant operation and adds only its development log', async () => {
    const fake = createFakeReferenceDataClient();
    const logger = jest
      .spyOn(console, 'log')
      .mockImplementation(() => undefined);

    await systemRoleSeedAdapter.seedSystemRoles(fake.client as never);

    expect(SYSTEM_ROLES).toHaveLength(CURRENT_SYSTEM_ROLE_COUNT);
    expect(fake.role.findFirst).toHaveBeenCalledTimes(
      CURRENT_SYSTEM_ROLE_COUNT,
    );
    expect(fake.role.create).toHaveBeenCalledTimes(CURRENT_SYSTEM_ROLE_COUNT);
    expect(fake.role.update).not.toHaveBeenCalled();
    expect(fake.permission.findMany).toHaveBeenCalledTimes(
      CURRENT_SYSTEM_ROLE_COUNT,
    );
    expect(fake.rolePermission.deleteMany).toHaveBeenCalledTimes(
      CURRENT_SYSTEM_ROLE_COUNT,
    );
    expect(fake.rolePermission.createMany).toHaveBeenCalledTimes(
      CURRENT_SYSTEM_ROLE_COUNT,
    );

    const grantCount = fake.rolePermission.createMany.mock.calls.reduce(
      (total, [input]) => total + input.data.length,
      0,
    );
    expect(grantCount).toBe(CURRENT_ROLE_GRANT_COUNT);
    expect(logger).toHaveBeenCalledTimes(1);
    expect(logger).toHaveBeenCalledWith(
      `  ✔ seeded ${CURRENT_SYSTEM_ROLE_COUNT} system roles`,
    );
  });

  it('keeps both canonical apply functions silent', async () => {
    const permissionFake = createFakeReferenceDataClient();
    const roleFake = createFakeReferenceDataClient();
    const logger = jest
      .spyOn(console, 'log')
      .mockImplementation(() => undefined);

    await applyCanonicalPermissions(permissionFake.client);
    await applyCanonicalSystemRoles(roleFake.client);

    expect(logger).not.toHaveBeenCalled();
  });
});
