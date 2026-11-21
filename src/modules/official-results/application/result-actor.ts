import { UserType } from '@prisma/client';
import { getRequestContext } from '../../../common/context/request-context';
import { NotFoundDomainException } from '../../../common/exceptions/domain-exception';

const managementActorTypes: ReadonlySet<UserType> = new Set([
  UserType.SCHOOL_USER,
  UserType.ORGANIZATION_USER,
  UserType.TEACHER,
]);

export function requireResultActor(surface?: 'SCHOOL' | 'TEACHER') {
  const context = getRequestContext();
  const actor = context?.actor;
  const membership = context?.activeMembership;
  if (
    !actor ||
    !membership?.schoolId ||
    context.bypass.bypassSchoolScope ||
    !managementActorTypes.has(actor.userType) ||
    (surface === 'SCHOOL' && actor.userType === UserType.TEACHER) ||
    (surface === 'TEACHER' && actor.userType !== UserType.TEACHER)
  ) {
    throw new NotFoundDomainException();
  }
  return {
    schoolId: membership.schoolId,
    organizationId: membership.organizationId,
    membershipId: membership.membershipId,
    roleId: membership.roleId,
    actorId: actor.id,
    userType: actor.userType,
  };
}

export type ResultActor = ReturnType<typeof requireResultActor>;
