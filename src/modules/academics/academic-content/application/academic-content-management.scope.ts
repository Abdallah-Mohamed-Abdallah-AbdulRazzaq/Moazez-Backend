import { HttpStatus } from '@nestjs/common';
import { UserType } from '@prisma/client';
import { getRequestContext } from '../../../../common/context/request-context';
import { DomainException } from '../../../../common/exceptions/domain-exception';

export type AcademicContentManagementPermission =
  | 'academics.academic_content.view'
  | 'academics.academic_content.settings.manage';

export function academicContentManagementScope(
  permission: AcademicContentManagementPermission,
) {
  const context = getRequestContext();
  const actor = context?.actor;
  const membership = context?.activeMembership;
  if (
    !actor ||
    (actor.userType !== UserType.SCHOOL_USER &&
      actor.userType !== UserType.ORGANIZATION_USER) ||
    !membership?.schoolId ||
    !membership.organizationId ||
    !membership.permissions.includes(permission)
  ) {
    throw new DomainException({
      code: 'auth.scope.missing',
      message: 'Academic content management scope is required',
      httpStatus: HttpStatus.FORBIDDEN,
    });
  }
  return {
    schoolId: membership.schoolId,
    organizationId: membership.organizationId,
    actorId: actor.id,
  };
}
