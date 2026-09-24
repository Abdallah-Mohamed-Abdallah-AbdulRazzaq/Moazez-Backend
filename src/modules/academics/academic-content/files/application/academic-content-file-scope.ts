import { HttpStatus } from '@nestjs/common';
import { getRequestContext } from '../../../../../common/context/request-context';
import { DomainException } from '../../../../../common/exceptions/domain-exception';
import { canManageAcademicContent } from '../../domain/academic-content-authoring.policy';

export function academicContentFileScope() {
  const context = getRequestContext();
  const actor = context?.actor;
  const membership = context?.activeMembership;
  if (
    !actor ||
    !membership?.schoolId ||
    !membership.organizationId ||
    !canManageAcademicContent(actor.userType, membership.permissions)
  ) {
    throw new DomainException({
      code: 'auth.scope.missing',
      message: 'Academic content management scope is required',
      httpStatus: HttpStatus.FORBIDDEN,
    });
  }
  return {
    actorId: actor.id,
    schoolId: membership.schoolId,
    organizationId: membership.organizationId,
  };
}
