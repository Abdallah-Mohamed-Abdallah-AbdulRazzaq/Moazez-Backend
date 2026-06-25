import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserStatus, UserType } from '@prisma/client';
import { APPLICANT_PORTAL_ACCESS_METADATA } from '../decorators/applicant-portal-access.decorator';
import { PUBLIC_ROUTE_METADATA } from '../decorators/public-route.decorator';
import {
  getRequestContext,
  setActiveMembership,
  setPlatformPermissions,
} from '../context/request-context';
import {
  AccountDisabledException,
  ScopeMissingException,
  TokenInvalidException,
} from '../../modules/iam/auth/domain/auth.exceptions';
import { AuthRepository } from '../../modules/iam/auth/infrastructure/auth.repository';

/**
 * Resolves the caller's active membership and populates RequestContext.
 * PLATFORM_USERs are allowed through without a membership (they operate
 * against the platform scope). APPLICANT users may pass only on routes
 * explicitly marked for Applicant Portal access. All other user types must
 * have an ACTIVE membership; otherwise we throw auth.scope.missing.
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

    const allowsApplicantPortalAccess = this.reflector.getAllAndOverride<boolean>(
      APPLICANT_PORTAL_ACCESS_METADATA,
      [context.getHandler(), context.getClass()],
    );

    const ctx = getRequestContext();
    if (!ctx?.actor) throw new TokenInvalidException();

    const user = await this.authRepository.findUserById(ctx.actor.id);
    if (!user) throw new TokenInvalidException();
    if (user.status !== UserStatus.ACTIVE) {
      await this.authRepository.revokeUserSessions(user.id);
      throw new AccountDisabledException();
    }

    const membership = user.memberships[0];
    if (!membership) {
      if (ctx.actor.userType === UserType.PLATFORM_USER) {
        const platformPermissions =
          await this.authRepository.findSystemRolePermissionCodes(
            'platform_super_admin',
          );
        setPlatformPermissions(platformPermissions);
        return true;
      }
      if (
        ctx.actor.userType === UserType.APPLICANT &&
        allowsApplicantPortalAccess
      ) {
        return true;
      }
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
