import type { PrismaClient } from '@prisma/client';
import { PERMISSIONS } from '../permission-catalog';
import { SYSTEM_ROLES } from '../system-role-catalog';

export type AuthorizationReferenceDataClient = Pick<
  PrismaClient,
  'permission' | 'role' | 'rolePermission'
>;

export async function applyCanonicalPermissions(
  prisma: AuthorizationReferenceDataClient,
): Promise<void> {
  for (const permission of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: permission.code },
      update: {
        module: permission.module,
        resource: permission.resource,
        action: permission.action,
        description: permission.description,
      },
      create: permission,
    });
  }
}

export async function applyCanonicalSystemRoles(
  prisma: AuthorizationReferenceDataClient,
): Promise<void> {
  for (const role of SYSTEM_ROLES) {
    const existing = await prisma.role.findFirst({
      where: { key: role.key, schoolId: null, isSystem: true },
      select: { id: true },
    });

    const record = existing
      ? await prisma.role.update({
          where: { id: existing.id },
          data: {
            name: role.name,
            description: role.description,
          },
        })
      : await prisma.role.create({
          data: {
            key: role.key,
            name: role.name,
            description: role.description,
            isSystem: true,
            schoolId: null,
          },
        });

    const permissions = await prisma.permission.findMany({
      where: { code: { in: role.permissions } },
      select: { id: true, code: true },
    });
    const foundPermissionIdsByCode = new Map(
      permissions.map((permission) => [permission.code, permission.id]),
    );
    const missingPermissions = role.permissions.filter(
      (code) => !foundPermissionIdsByCode.has(code),
    );

    if (missingPermissions.length > 0) {
      throw new Error(
        `Missing permissions for system role ${role.key}: ${missingPermissions.join(', ')}`,
      );
    }

    await prisma.rolePermission.deleteMany({ where: { roleId: record.id } });

    if (role.permissions.length > 0) {
      await prisma.rolePermission.createMany({
        data: role.permissions.map((code) => ({
          roleId: record.id,
          permissionId: foundPermissionIdsByCode.get(code)!,
        })),
        skipDuplicates: true,
      });
    }
  }
}
