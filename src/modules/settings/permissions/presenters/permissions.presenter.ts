import { Permission } from '@prisma/client';
import { PermissionResponseDto } from '../dto/permission-response.dto';

function titleCase(value: string): string {
  return value
    .split(/[_\-.]+/g)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

export function presentPermission(permission: Permission): PermissionResponseDto {
  return {
    key: permission.code,
    module: permission.module,
    resource: permission.resource,
    action: permission.action,
    label: `${titleCase(permission.resource)} ${titleCase(permission.action)}`,
    description: permission.description ?? null,
  };
}
