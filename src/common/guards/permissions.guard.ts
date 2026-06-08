import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PUBLIC_ROUTE_METADATA } from '../decorators/public-route.decorator';
import { REQUIRED_PERMISSIONS_METADATA } from '../decorators/required-permissions.decorator';
import { getRequestContext } from '../context/request-context';
import {
  ScopeMissingException,
  TokenInvalidException,
} from '../../modules/iam/auth/domain/auth.exceptions';

/**
 * Enforces @RequiredPermissions() on handlers. School-scoped actors use their
 * active membership permissions; platform actors without a membership use the
 * platform permission bundle resolved by ScopeResolverGuard.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      PUBLIC_ROUTE_METADATA,
      [context.getHandler(), context.getClass()],
    );
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<string[] | undefined>(
      REQUIRED_PERMISSIONS_METADATA,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const ctx = getRequestContext();
    if (!ctx?.actor) throw new TokenInvalidException();

    const granted =
      ctx.activeMembership?.permissions ?? ctx.platformPermissions ?? [];
    const missing = required.filter((code) => !granted.includes(code));
    if (missing.length > 0) {
      throw new ScopeMissingException({ missingPermissions: missing });
    }

    return true;
  }
}
