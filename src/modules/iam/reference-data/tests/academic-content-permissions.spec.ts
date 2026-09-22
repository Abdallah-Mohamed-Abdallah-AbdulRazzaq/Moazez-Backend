import { PERMISSIONS, type PermissionSeed } from '../permission-catalog';
import { SYSTEM_ROLES, type SystemRoleSeed } from '../system-role-catalog';
import {
  applyCanonicalPermissions,
  applyCanonicalSystemRoles,
  type AuthorizationReferenceDataClient,
} from '../infrastructure/authorization-reference-data.apply';

const ACADEMIC_CONTENT_PERMISSIONS = [
  {
    code: 'academics.academic_content.view',
    module: 'academics',
    resource: 'academic_content',
    action: 'view',
  },
  {
    code: 'academics.academic_content.manage',
    module: 'academics',
    resource: 'academic_content',
    action: 'manage',
  },
  {
    code: 'academics.academic_content.publish',
    module: 'academics',
    resource: 'academic_content',
    action: 'publish',
  },
  {
    code: 'academics.academic_content.approve',
    module: 'academics',
    resource: 'academic_content',
    action: 'approve',
  },
  {
    code: 'academics.academic_content.analytics.view',
    module: 'academics',
    resource: 'academic_content.analytics',
    action: 'view',
  },
  {
    code: 'academics.academic_content.settings.manage',
    module: 'academics',
    resource: 'academic_content.settings',
    action: 'manage',
  },
] as const;

const ACADEMIC_CONTENT_PERMISSION_CODES = ACADEMIC_CONTENT_PERMISSIONS.map(
  ({ code }) => code,
);

type PermissionRecord = PermissionSeed & { id: string };
type RoleRecord = Omit<SystemRoleSeed, 'permissions'> & { id: string };
type PermissionUpsertInput = {
  where: { code: string };
  update: Omit<PermissionSeed, 'code'>;
  create: PermissionSeed;
};
type PermissionFindManyInput = { where: { code: { in: string[] } } };
type RoleFindFirstInput = { where: { key: string } };
type RoleUpdateInput = {
  where: { id: string };
  data: Pick<SystemRoleSeed, 'name' | 'description'>;
};
type RoleCreateInput = {
  data: Pick<SystemRoleSeed, 'key' | 'name' | 'description'>;
};
type RolePermissionDeleteManyInput = { where: { roleId: string } };
type RolePermissionCreateManyInput = {
  data: Array<{ roleId: string; permissionId: string }>;
};

describe('Academic Content authorization reference data', () => {
  it('defines all six canonical permissions exactly once', () => {
    const definitions = PERMISSIONS.filter((permission) =>
      permission.code.startsWith('academics.academic_content'),
    );

    expect(definitions).toHaveLength(6);
    expect(new Set(definitions.map(({ code }) => code)).size).toBe(6);
    expect(
      definitions.map(({ code, module, resource, action }) => ({
        code,
        module,
        resource,
        action,
      })),
    ).toEqual(ACADEMIC_CONTENT_PERMISSIONS);
  });

  it('grants management roles through canonical derivation only', () => {
    for (const roleKey of [
      'platform_super_admin',
      'organization_admin',
      'school_admin',
    ]) {
      const role = SYSTEM_ROLES.find(({ key }) => key === roleKey);
      expect(role?.permissions).toEqual(
        expect.arrayContaining(ACADEMIC_CONTENT_PERMISSION_CODES),
      );
    }

    for (const roleKey of ['teacher', 'parent', 'student', 'dismissal_staff']) {
      const role = SYSTEM_ROLES.find(({ key }) => key === roleKey);
      for (const permission of ACADEMIC_CONTENT_PERMISSION_CODES) {
        expect(role?.permissions).not.toContain(permission);
      }
    }
  });

  it('converges permissions and system-role grants idempotently', async () => {
    const fake = createInMemoryReferenceDataClient();

    await applyCanonicalPermissions(fake.client);
    await applyCanonicalSystemRoles(fake.client);
    const firstSnapshot = fake.snapshot();

    await applyCanonicalPermissions(fake.client);
    await applyCanonicalSystemRoles(fake.client);

    expect(fake.snapshot()).toEqual(firstSnapshot);
    expect(firstSnapshot.permissions).toHaveLength(PERMISSIONS.length);
    expect(
      firstSnapshot.permissions.filter((code) =>
        code.startsWith('academics.academic_content'),
      ),
    ).toEqual([...ACADEMIC_CONTENT_PERMISSION_CODES].sort());
  });
});

function createInMemoryReferenceDataClient() {
  const permissions = new Map<string, PermissionRecord>();
  const roles = new Map<string, RoleRecord>();
  const grants = new Map<string, Set<string>>();

  const client = {
    permission: {
      upsert: jest.fn((input: PermissionUpsertInput) => {
        const { where, update, create } = input;
        const existing = permissions.get(where.code);
        const record = existing
          ? { ...existing, ...update }
          : { id: `permission:${create.code}`, ...create };
        permissions.set(where.code, record);
        return Promise.resolve(record);
      }),
      findMany: jest.fn((input: PermissionFindManyInput) => {
        const records = input.where.code.in.flatMap((code) => {
          const permission = permissions.get(code);
          return permission ? [permission] : [];
        });
        return Promise.resolve(records);
      }),
    },
    role: {
      findFirst: jest.fn((input: RoleFindFirstInput) =>
        Promise.resolve(roles.get(input.where.key) ?? null),
      ),
      update: jest.fn((input: RoleUpdateInput) => {
        const { where, data } = input;
        const role = [...roles.values()].find(({ id }) => id === where.id);
        if (!role) throw new Error('Role not found');
        const updated = { ...role, ...data };
        roles.set(updated.key, updated);
        return Promise.resolve(updated);
      }),
      create: jest.fn((input: RoleCreateInput) => {
        const role: RoleRecord = {
          id: `role:${input.data.key}`,
          ...input.data,
        };
        roles.set(input.data.key, role);
        return Promise.resolve(role);
      }),
    },
    rolePermission: {
      deleteMany: jest.fn((input: RolePermissionDeleteManyInput) => {
        const count = grants.get(input.where.roleId)?.size ?? 0;
        grants.set(input.where.roleId, new Set());
        return Promise.resolve({ count });
      }),
      createMany: jest.fn((input: RolePermissionCreateManyInput) => {
        const roleId = input.data[0]?.roleId;
        if (!roleId) return Promise.resolve({ count: 0 });
        const roleGrants = grants.get(roleId) ?? new Set<string>();
        for (const grant of input.data) roleGrants.add(grant.permissionId);
        grants.set(roleId, roleGrants);
        return Promise.resolve({ count: input.data.length });
      }),
    },
  } as unknown as AuthorizationReferenceDataClient;

  return {
    client,
    snapshot: () => ({
      permissions: [...permissions.keys()].sort(),
      roles: [...roles.keys()].sort(),
      grants: [...grants.entries()]
        .map(([roleId, permissionIds]) => [roleId, [...permissionIds].sort()])
        .sort(([left], [right]) => String(left).localeCompare(String(right))),
    }),
  };
}
