import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserType } from '@prisma/client';
import { PUBLIC_ROUTE_METADATA } from '../decorators/public-route.decorator';
import {
  getRequestContext,
  setActiveMembership,
} from '../context/request-context';
import {
  ScopeMissingException,
  TokenInvalidException,
} from '../../modules/iam/auth/domain/auth.exceptions';
import { AuthRepository } from '../../modules/iam/auth/infrastructure/auth.repository';

/**
 * Resolves the caller's active membership and populates RequestContext.
 * PLATFORM_USERs are allowed through without a membership (they operate
 * against the platform scope). All other user types must have an ACTIVE
 * membership; otherwise we throw auth.scope.missing.
 */
@Injectable()
export class ScopeResolverGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authRepository: AuthRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      PUBLIC_ROUTE_METADATA,
      [context.getHandler(), context.getClass()],
    );
    if (isPublic) return true;

    const ctx = getRequestContext();
    if (!ctx?.actor) throw new TokenInvalidException();

    const user = await this.authRepository.findUserById(ctx.actor.id);
    if (!user) throw new TokenInvalidException();

    const membership = user.memberships[0];
    if (!membership) {
      if (ctx.actor.userType === UserType.PLATFORM_USER) return true;
      throw new ScopeMissingException();
    }

    const permissions = membership.role.rolePermissions.map(
      (rp) => rp.permission.code,
    );

    setActiveMembership({
      membershipId: membership.id,
      organizationId: membership.organizationId,
      schoolId: membership.schoolId,
      roleId: membership.roleId,
      permissions,
    });

    return true;
  }
}
