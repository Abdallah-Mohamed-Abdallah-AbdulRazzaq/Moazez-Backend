import { SetMetadata } from '@nestjs/common';

export const REQUIRED_PERMISSIONS_METADATA = 'moazez:required_permissions';

/**
 * Declares the permission codes a handler requires. The global PermissionsGuard
 * reads this metadata and verifies the active membership carries every listed
 * permission. Omitting the decorator (or passing zero permissions) implies the
 * handler only requires authentication + an active scope.
 */
export const RequiredPermissions = (
  ...permissions: string[]
): MethodDecorator & ClassDecorator =>
  SetMetadata(
    REQUIRED_PERMISSIONS_METADATA,
    permissions,
  ) as MethodDecorator & ClassDecorator;
