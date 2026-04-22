import { RolePermissionsResponseDto, RoleResponseDto } from '../dto/role-response.dto';
import { VisibleRoleRecord } from '../infrastructure/roles.repository';

function sortPermissions(permissions: string[]): string[] {
  return [...permissions].sort((left, right) => left.localeCompare(right));
}

export function presentRole(role: VisibleRoleRecord): RoleResponseDto {
  return {
    id: role.id,
    name: role.name,
    description: role.description ?? null,
    isSystem: role.isSystem,
    memberCount: role._count.memberships,
    permissions: sortPermissions(
      role.rolePermissions.map((rolePermission) => rolePermission.permission.code),
    ),
  };
}

export function presentRolePermissions(
  roleId: string,
  permissions: string[],
): RolePermissionsResponseDto {
  return {
    id: roleId,
    permissions: sortPermissions(permissions),
  };
}
