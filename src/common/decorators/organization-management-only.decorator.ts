import { SetMetadata } from '@nestjs/common';

export const ORGANIZATION_MANAGEMENT_ONLY_METADATA =
  'moazez:organization_management_only';

/** Marks a route as requiring the exact trusted Organization Admin scope. */
export const OrganizationManagementOnly = (): ClassDecorator &
  MethodDecorator =>
  SetMetadata(ORGANIZATION_MANAGEMENT_ONLY_METADATA, true) as ClassDecorator &
    MethodDecorator;
