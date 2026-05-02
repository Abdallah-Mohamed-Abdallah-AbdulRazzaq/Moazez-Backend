import { Injectable } from '@nestjs/common';
import { UserType } from '@prisma/client';
import {
  setActiveMembership,
  setActor,
} from '../../common/context/request-context';
import {
  ScopeMissingException,
  SessionRevokedException,
  TokenInvalidException,
} from '../../modules/iam/auth/domain/auth.exceptions';
import {
  AccessTokenPayload,
  TokenService,
} from '../../modules/iam/auth/domain/token.service';
import { AuthRepository } from '../../modules/iam/auth/infrastructure/auth.repository';
import type {
  RealtimeAuthenticatedContext,
  RealtimeSocket,
} from './realtime.types';

@Injectable()
export class RealtimeAuthService {
  constructor(
    private readonly tokenService: TokenService,
    private readonly authRepository: AuthRepository,
  ) {}

  async authenticate(
    client: Pick<RealtimeSocket, 'handshake'>,
  ): Promise<RealtimeAuthenticatedContext> {
    const token = this.extractToken(client);
    if (!token) throw new TokenInvalidException();

    const payload: AccessTokenPayload =
      await this.tokenService.verifyAccessToken(token);

    const session = await this.authRepository.findSessionById(payload.sid);
    if (!session) throw new TokenInvalidException();
    if (session.revokedAt) throw new SessionRevokedException();

    const user = await this.authRepository.findUserById(payload.sub);
    if (!user || user.userType !== (payload.userType as UserType)) {
      throw new TokenInvalidException();
    }

    const membership = user.memberships[0];
    if (!membership?.schoolId) {
      throw new ScopeMissingException();
    }

    const permissions = membership.role.rolePermissions.map(
      (rolePermission) => rolePermission.permission.code,
    );

    setActor({
      id: user.id,
      userType: user.userType,
    });
    setActiveMembership({
      membershipId: membership.id,
      organizationId: membership.organizationId,
      schoolId: membership.schoolId,
      roleId: membership.roleId,
      permissions,
    });

    return {
      actorId: user.id,
      userType: user.userType,
      membershipId: membership.id,
      schoolId: membership.schoolId,
      organizationId: membership.organizationId,
      roleId: membership.roleId,
      permissions,
      sessionId: payload.sid,
    };
  }

  private extractToken(
    client: Pick<RealtimeSocket, 'handshake'>,
  ): string | null {
    const authToken = this.extractAuthToken(client.handshake.auth);
    if (authToken) return authToken;

    const authorization = client.handshake.headers.authorization;
    const header = Array.isArray(authorization)
      ? authorization[0]
      : authorization;
    if (!header) return null;

    const [scheme, value] = header.split(' ');
    if (!scheme || scheme.toLowerCase() !== 'bearer' || !value) return null;

    const token = value.trim();
    return token.length > 0 ? token : null;
  }

  private extractAuthToken(auth: unknown): string | null {
    if (!auth || typeof auth !== 'object') return null;

    const token = (auth as { token?: unknown }).token;
    if (typeof token !== 'string') return null;

    const trimmed = token.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
}
