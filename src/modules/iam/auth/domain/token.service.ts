import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomUUID } from 'node:crypto';
import type { Env } from '../../../../config/env.validation';
import {
  RefreshRotatedException,
  TokenExpiredException,
  TokenInvalidException,
} from './auth.exceptions';

export interface AccessTokenPayload {
  sub: string;
  type: 'access';
  userType: string;
  sid: string;
}

export interface RefreshTokenPayload {
  sub: string;
  type: 'refresh';
  sid: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  refreshTokenHash: string;
  refreshSessionId: string;
  expiresIn: number;
  refreshExpiresAt: Date;
}

const ACCESS_TTL_SECONDS_FALLBACK = 15 * 60;
const REFRESH_TTL_SECONDS_FALLBACK = 7 * 24 * 60 * 60;

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async issueTokens(
    userId: string,
    userType: string,
  ): Promise<TokenPair> {
    const sessionId = randomUUID();
    const accessTtl = this.parseTtl(
      this.config.get('JWT_ACCESS_TTL', { infer: true }),
      ACCESS_TTL_SECONDS_FALLBACK,
    );
    const refreshTtl = this.parseTtl(
      this.config.get('JWT_REFRESH_TTL', { infer: true }),
      REFRESH_TTL_SECONDS_FALLBACK,
    );

    const accessToken = await this.jwt.signAsync(
      {
        sub: userId,
        type: 'access',
        userType,
        sid: sessionId,
      } satisfies AccessTokenPayload,
      {
        secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
        expiresIn: accessTtl,
      },
    );

    const refreshToken = await this.jwt.signAsync(
      { sub: userId, type: 'refresh', sid: sessionId } satisfies RefreshTokenPayload,
      {
        secret: this.config.get('JWT_REFRESH_SECRET', { infer: true }),
        expiresIn: refreshTtl,
      },
    );

    return {
      accessToken,
      refreshToken,
      refreshTokenHash: this.hashRefreshToken(refreshToken),
      refreshSessionId: sessionId,
      expiresIn: accessTtl,
      refreshExpiresAt: new Date(Date.now() + refreshTtl * 1000),
    };
  }

  async verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    return this.verify<AccessTokenPayload>(
      token,
      this.config.get('JWT_ACCESS_SECRET', { infer: true }),
      'access',
    );
  }

  async verifyRefreshToken(token: string): Promise<RefreshTokenPayload> {
    return this.verify<RefreshTokenPayload>(
      token,
      this.config.get('JWT_REFRESH_SECRET', { infer: true }),
      'refresh',
    );
  }

  hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private async verify<T extends { type: 'access' | 'refresh' }>(
    token: string,
    secret: string,
    expectedType: T['type'],
  ): Promise<T> {
    try {
      const decoded = await this.jwt.verifyAsync<T>(token, { secret });
      if (decoded.type !== expectedType) {
        throw new TokenInvalidException();
      }
      return decoded;
    } catch (error) {
      if (error instanceof TokenInvalidException) throw error;
      if (error instanceof RefreshRotatedException) throw error;
      const name = (error as { name?: string } | undefined)?.name;
      if (name === 'TokenExpiredError') {
        throw new TokenExpiredException();
      }
      throw new TokenInvalidException();
    }
  }

  private parseTtl(value: string | undefined, fallback: number): number {
    if (!value) return fallback;
    const trimmed = value.trim();
    const match = trimmed.match(/^(\d+)([smhd])?$/i);
    if (!match) {
      const asNumber = Number(trimmed);
      return Number.isFinite(asNumber) && asNumber > 0 ? asNumber : fallback;
    }
    const amount = Number(match[1]);
    const unit = (match[2] ?? 's').toLowerCase();
    const multipliers: Record<string, number> = {
      s: 1,
      m: 60,
      h: 3600,
      d: 86400,
    };
    return amount * (multipliers[unit] ?? 1);
  }
}
