import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { PLATFORM_ADMIN_ROLE_CODE } from '../../../platform-admin/bootstrap/platform-admin-bootstrap.constants';
import { PERMISSIONS } from '../permission-catalog';
import { SYSTEM_ROLES } from '../system-role-catalog';
import {
  applyCanonicalPermissions,
  applyCanonicalSystemRoles,
} from './authorization-reference-data.apply';

export interface AuthorizationReferenceDataVerification {
  ready: boolean;
  permissionsReady: boolean;
  systemRolesReady: boolean;
  platformSuperAdminReady: boolean;
  permissionCount: number;
  systemRoleCount: number;
  platformSuperAdminPermissionCount: number;
}

@Injectable()
export class AuthorizationReferenceDataRepository {
  constructor(private readonly prisma: PrismaService) {}

  async converge(): Promise<void> {
    await applyCanonicalPermissions(this.prisma);
    await applyCanonicalSystemRoles(this.prisma);
  }

  async verify(): Promise<AuthorizationReferenceDataVerification> {
    const canonicalPermissionCodes = PERMISSIONS.map(
      (permission) => permission.code,
    );
    const canonicalRoleKeys = SYSTEM_ROLES.map((role) => role.key);

    const [
      canonicalPermissions,
      permissionCount,
      canonicalRoles,
      systemRoleCount,
    ] = await Promise.all([
      this.prisma.permission.findMany({
        where: { code: { in: canonicalPermissionCodes } },
        select: {
          code: true,
          module: true,
          resource: true,
          action: true,
          description: true,
        },
      }),
      this.prisma.permission.count(),
      this.prisma.role.findMany({
        where: {
          key: { in: canonicalRoleKeys },
          schoolId: null,
          isSystem: true,
          deletedAt: null,
        },
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
      this.prisma.role.count({
        where: { schoolId: null, isSystem: true, deletedAt: null },
      }),
    ]);

    const permissionByCode = new Map(
      canonicalPermissions.map((permission) => [permission.code, permission]),
    );
    const permissionsReady =
      canonicalPermissions.length === PERMISSIONS.length &&
      PERMISSIONS.every((definition) => {
        const permission = permissionByCode.get(definition.code);
        return (
          permission?.module === definition.module &&
          permission.resource === definition.resource &&
          permission.action === definition.action &&
          permission.description === definition.description
        );
      });

    const rolesByKey = new Map<string, (typeof canonicalRoles)[number][]>();
    for (const role of canonicalRoles) {
      const matchingRoles = rolesByKey.get(role.key) ?? [];
      matchingRoles.push(role);
      rolesByKey.set(role.key, matchingRoles);
    }

    const systemRolesReady = SYSTEM_ROLES.every((definition) => {
      const matchingRoles = rolesByKey.get(definition.key) ?? [];
      if (matchingRoles.length !== 1) return false;

      const role = matchingRoles[0];
      const actualPermissionCodes = role.rolePermissions.map(
        (rolePermission) => rolePermission.permission.code,
      );
      return (
        role.name === definition.name &&
        role.description === definition.description &&
        sameValues(actualPermissionCodes, definition.permissions)
      );
    });

    const platformRoles = rolesByKey.get(PLATFORM_ADMIN_ROLE_CODE) ?? [];
    const platformRole = platformRoles.length === 1 ? platformRoles[0] : null;
    const platformPermissionCodes =
      platformRole?.rolePermissions.map(
        (rolePermission) => rolePermission.permission.code,
      ) ?? [];
    const platformSuperAdminPermissionCount = platformPermissionCodes.length;
    const platformSuperAdminReady =
      platformRole !== null &&
      permissionCount > 0 &&
      platformSuperAdminPermissionCount === permissionCount &&
      canonicalPermissionCodes.every((code) =>
        platformPermissionCodes.includes(code),
      );

    return {
      ready: permissionsReady && systemRolesReady && platformSuperAdminReady,
      permissionsReady,
      systemRolesReady,
      platformSuperAdminReady,
      permissionCount,
      systemRoleCount,
      platformSuperAdminPermissionCount,
    };
  }
}

function sameValues(
  actual: readonly string[],
  expected: readonly string[],
): boolean {
  if (actual.length !== expected.length) return false;
  const actualValues = new Set(actual);
  return (
    actualValues.size === actual.length &&
    expected.every((value) => actualValues.has(value))
  );
}
