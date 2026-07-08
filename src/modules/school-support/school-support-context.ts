import { UserType } from '@prisma/client';
import { getRequestContext } from '../../common/context/request-context';
import {
  ScopeMissingException,
  TokenInvalidException,
} from '../iam/auth/domain/auth.exceptions';
import { PlatformSupportInvalidActorException } from './domain/school-support.errors';

export interface SchoolSupportScope {
  actorId: string;
  userType: UserType;
  organizationId: string;
  schoolId: string;
  membershipId: string;
  roleId: string;
}

export interface PlatformSupportScope {
  actorId: string;
  userType: UserType;
}

export function requireSchoolSupportScope(): SchoolSupportScope {
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
    membershipId: ctx.activeMembership.membershipId,
    roleId: ctx.activeMembership.roleId,
  };
}

export function requirePlatformSupportScope(): PlatformSupportScope {
  const ctx = getRequestContext();

  if (!ctx?.actor) {
    throw new TokenInvalidException();
  }

  if (
    ctx.actor.userType !== UserType.PLATFORM_USER ||
    ctx.activeMembership
  ) {
    throw new PlatformSupportInvalidActorException();
  }

  return {
    actorId: ctx.actor.id,
    userType: UserType.PLATFORM_USER,
  };
}
