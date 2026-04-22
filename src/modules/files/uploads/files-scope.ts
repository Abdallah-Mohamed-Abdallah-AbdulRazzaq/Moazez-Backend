import { UserType } from '@prisma/client';
import { getRequestContext } from '../../../common/context/request-context';
import {
  ScopeMissingException,
  TokenInvalidException,
} from '../../iam/auth/domain/auth.exceptions';

export interface FilesScope {
  actorId: string;
  userType: UserType;
  organizationId: string;
  schoolId: string;
  roleId: string;
}

export function requireFilesScope(): FilesScope {
  const ctx = getRequestContext();

  if (!ctx?.actor) {
    throw new TokenInvalidException();
  }

  if (!ctx.activeMembership?.schoolId) {
    throw new ScopeMissingException();
  }

  return {
    actorId: ctx.actor.id,
    userType: ctx.actor.userType,
    organizationId: ctx.activeMembership.organizationId,
    schoolId: ctx.activeMembership.schoolId,
    roleId: ctx.activeMembership.roleId,
  };
}
