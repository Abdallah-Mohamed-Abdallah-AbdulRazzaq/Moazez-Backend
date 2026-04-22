import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { UserType } from '@prisma/client';
import { PUBLIC_ROUTE_METADATA } from '../decorators/public-route.decorator';
import { setActor } from '../context/request-context';
import {
  AccessTokenPayload,
  TokenService,
} from '../../modules/iam/auth/domain/token.service';
import {
  SessionRevokedException,
  TokenInvalidException,
} from '../../modules/iam/auth/domain/auth.exceptions';
import { AuthRepository } from '../../modules/iam/auth/infrastructure/auth.repository';

/**
 * Global authentication guard. Verifies the Bearer access token, checks the
 * backing session is still active, and writes the actor into RequestContext.
 * Handlers (or controllers) marked with @PublicRoute() are skipped.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokenService: TokenService,
    private readonly authRepository: AuthRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      PUBLIC_ROUTE_METADATA,
      [context.getHandler(), context.getClass()],
    );
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);
    if (!token) throw new TokenInvalidException();

    const payload: AccessTokenPayload =
      await this.tokenService.verifyAccessToken(token);

    const session = await this.authRepository.findSessionById(payload.sid);
    if (!session) throw new TokenInvalidException();
    if (session.revokedAt) throw new SessionRevokedException();

    setActor({
      id: payload.sub,
      userType: payload.userType as UserType,
    });

    (request as Request & { sessionId?: string }).sessionId = payload.sid;

    return true;
  }

  private extractToken(request: Request): string | null {
    const header = request.header('authorization');
    if (!header) return null;
    const [scheme, value] = header.split(' ');
    if (!scheme || scheme.toLowerCase() !== 'bearer' || !value) return null;
    return value;
  }
}
