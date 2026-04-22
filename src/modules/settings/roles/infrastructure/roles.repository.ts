import { Injectable } from '@nestjs/common';
import {
  MembershipStatus,
  Permission,
  Prisma,
  Role,
} from '@prisma/client';
import { platformBypassScope } from '../../../../infrastructure/database/platform-bypass.helper';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

const VISIBLE_SYSTEM_ROLE_KEYS = [
  'school_admin',
  'teacher',
  'parent',
  'student',
] as const;

const VISIBLE_ROLE_ARGS = Prisma.validator<Prisma.RoleDefaultArgs>()({
  include: {
    rolePermissions: {
      include: {
        permission: true,
      },
    },
    _count: {
      select: {
        memberships: {
          where: {
            status: MembershipStatus.ACTIVE,
            deletedAt: null,
          },
        },
      },
    },
  },
});

export type VisibleRoleRecord = Prisma.RoleGetPayload<typeof VISIBLE_ROLE_ARGS>;

@Injectable()
export class RolesRepository {
  constructor(private readonly prisma: PrismaService) {}

  listVisibleRoles(schoolId: string): Promise<VisibleRoleRecord[]> {
    return platformBypassScope(() =>
      this.prisma.role.findMany({
        where: this.visibleRoleWhere(schoolId),
        orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
        ...VISIBLE_ROLE_ARGS,
      }),
    );
  }

  findVisibleRoleById(
    schoolId: string,
    roleId: string,
  ): Promise<VisibleRoleRecord | null> {
    return platformBypassScope(() =>
      this.prisma.role.findFirst({
        where: {
          ...this.visibleRoleWhere(schoolId),
          id: roleId,
        },
        ...VISIBLE_ROLE_ARGS,
      }),
    );
  }

  findVisibleRoleByKey(
    schoolId: string,
    key: string,
    excludeRoleId?: string,
  ): Promise<Role | null> {
    return platformBypassScope(() =>
      this.prisma.role.findFirst({
        where: {
          ...this.visibleRoleWhere(schoolId),
          key,
          ...(excludeRoleId ? { id: { not: excludeRoleId } } : {}),
        },
        select: { id: true, key: true, schoolId: true, name: true, description: true, isSystem: true, createdAt: true, updatedAt: true, deletedAt: true },
      }),
    );
  }

  listPermissionsByCodes(codes: string[]): Promise<Permission[]> {
    return this.prisma.permission.findMany({
      where: { code: { in: codes } },
      orderBy: { code: 'asc' },
    });
  }

  createCustomRole(data: {
    schoolId: string;
    key: string;
    name: string;
    description?: string;
    permissionIds?: string[];
  }): Promise<VisibleRoleRecord> {
    return this.prisma.$transaction(async (tx) => {
      const role = await tx.role.create({
        data: {
          schoolId: data.schoolId,
          key: data.key,
          name: data.name,
          description: data.description,
          isSystem: false,
        },
      });

      if (data.permissionIds && data.permissionIds.length > 0) {
        await tx.rolePermission.createMany({
          data: data.permissionIds.map((permissionId) => ({
            roleId: role.id,
            permissionId,
          })),
          skipDuplicates: true,
        });
      }

      return tx.role.findUniqueOrThrow({
        where: { id: role.id },
        ...VISIBLE_ROLE_ARGS,
      });
    });
  }

  cloneRole(data: {
    schoolId: string;
    key: string;
    name: string;
    description?: string | null;
    permissionIds: string[];
  }): Promise<VisibleRoleRecord> {
    return this.createCustomRole({
      schoolId: data.schoolId,
      key: data.key,
      name: data.name,
      description: data.description ?? undefined,
      permissionIds: data.permissionIds,
    });
  }

  updateCustomRole(
    roleId: string,
    data: { key?: string; name?: string; description?: string | null },
  ): Promise<VisibleRoleRecord> {
    return this.prisma.$transaction(async (tx) => {
      await tx.role.update({
        where: { id: roleId },
        data,
      });

      return tx.role.findUniqueOrThrow({
        where: { id: roleId },
        ...VISIBLE_ROLE_ARGS,
      });
    });
  }

  replaceRolePermissions(
    roleId: string,
    permissionIds: string[],
  ): Promise<void> {
    return this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId } });

      if (permissionIds.length > 0) {
        await tx.rolePermission.createMany({
          data: permissionIds.map((permissionId) => ({
            roleId,
            permissionId,
          })),
          skipDuplicates: true,
        });
      }
    });
  }

  softDeleteRole(roleId: string): Promise<void> {
    return this.prisma.role
      .update({
        where: { id: roleId },
        data: { deletedAt: new Date() },
      })
      .then(() => undefined);
  }

  private visibleRoleWhere(schoolId: string): Prisma.RoleWhereInput {
    return {
      deletedAt: null,
      OR: [
        { schoolId },
        {
          schoolId: null,
          isSystem: true,
          key: { in: [...VISIBLE_SYSTEM_ROLE_KEYS] },
        },
      ],
    };
  }
}
