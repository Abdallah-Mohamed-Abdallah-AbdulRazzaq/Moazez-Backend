import { UserType } from '@prisma/client';
import { getRequestContext } from '../../common/context/request-context';
import {
  ScopeMissingException,
  TokenInvalidException,
} from '../iam/auth/domain/auth.exceptions';

export interface PlatformAdminScope {
  actorId: string;
  userType: UserType;
  permissions: string[];
}

export function requirePlatformAdminScope(): PlatformAdminScope {
  const ctx = getRequestContext();

  if (!ctx?.actor) {
    throw new TokenInvalidException();
  }

  if (ctx.actor.userType !== UserType.PLATFORM_USER) {
    throw new ScopeMissingException({
      requiredUserType: UserType.PLATFORM_USER,
    });
  }

  return {
    actorId: ctx.actor.id,
    userType: UserType.PLATFORM_USER,
    permissions:
      ctx.activeMembership?.permissions ?? ctx.platformPermissions ?? [],
  };
}
