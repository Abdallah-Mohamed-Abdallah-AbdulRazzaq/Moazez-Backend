import { SetMetadata } from '@nestjs/common';

export const SCHOOL_MANAGEMENT_ONLY_METADATA = 'schoolManagementOnly';

/** Marks a dashboard/core controller as unavailable to app-facing actors. */
export const SchoolManagementOnly = (): ClassDecorator & MethodDecorator =>
  SetMetadata(SCHOOL_MANAGEMENT_ONLY_METADATA, true) as ClassDecorator &
    MethodDecorator;
