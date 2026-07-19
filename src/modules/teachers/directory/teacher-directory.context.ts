import { getRequestContext } from '../../../common/context/request-context';
import type { UserType } from '@prisma/client';
import {
  ScopeMissingException,
  TokenInvalidException,
} from '../../iam/auth/domain/auth.exceptions';

export interface TeacherDirectoryScope {
  actorId: string;
  actorUserType: UserType;
  organizationId: string;
  schoolId: string;
}

export function requireTeacherDirectoryScope(): TeacherDirectoryScope {
  const context = getRequestContext();
  if (!context?.actor) throw new TokenInvalidException();
  if (!context.activeMembership?.schoolId) throw new ScopeMissingException();
  return {
    actorId: context.actor.id,
    actorUserType: context.actor.userType,
    organizationId: context.activeMembership.organizationId,
    schoolId: context.activeMembership.schoolId,
  };
}
