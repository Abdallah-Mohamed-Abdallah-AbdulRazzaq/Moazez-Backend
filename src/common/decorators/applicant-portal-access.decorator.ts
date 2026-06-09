import { SetMetadata } from '@nestjs/common';

export const APPLICANT_PORTAL_ACCESS_METADATA =
  'moazez:applicant_portal_access';

/**
 * Allows authenticated APPLICANT actors to pass ScopeResolverGuard without
 * school membership for Applicant Portal routes only.
 */
export const AllowApplicantPortalAccess = (): MethodDecorator & ClassDecorator =>
  SetMetadata(
    APPLICANT_PORTAL_ACCESS_METADATA,
    true,
  ) as MethodDecorator & ClassDecorator;
