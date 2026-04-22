import { Injectable } from '@nestjs/common';
import type { LoginResponseDto } from '../dto/login-response.dto';
import {
  RefreshRotatedException,
  SessionRevokedException,
  TokenExpiredException,
  TokenInvalidException,
} from '../domain/auth.exceptions';
import { TokenService } from '../domain/token.service';
import { AuthRepository } from '../infrastructure/auth.repository';

export interface RefreshCommand {
  refreshToken: string;
  userAgent?: string | null;
  ipAddress?: string | null;
}

@Injectable()
export class RefreshUseCase {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly tokenService: TokenService,
  ) {}

  async execute(command: RefreshCommand): Promise<LoginResponseDto> {
    const payload = await this.tokenService.verifyRefreshToken(
      command.refreshToken,
    );

    const session = await this.authRepository.findSessionById(payload.sid);
    if (!session) {
      throw new TokenInvalidException();
    }
    if (session.revokedAt) {
      throw new RefreshRotatedException();
    }
    if (session.expiresAt.getTime() <= Date.now()) {
      throw new TokenExpiredException();
    }

    const submittedHash = this.tokenService.hashRefreshToken(
      command.refreshToken,
    );
    if (session.refreshTokenHash !== submittedHash) {
      throw new SessionRevokedException();
    }

    const user = await this.authRepository.findUserById(session.userId);
    if (!user) {
      throw new TokenInvalidException();
    }

    await this.authRepository.revokeSession(session.id);

    const tokens = await this.tokenService.issueTokens(user.id, user.userType);

    await this.authRepository.createSession({
      sessionId: tokens.refreshSessionId,
      userId: user.id,
      refreshTokenHash: tokens.refreshTokenHash,
      userAgent: command.userAgent,
      ipAddress: command.ipAddress,
      expiresAt: tokens.refreshExpiresAt,
    });

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        userType: user.userType,
      },
    };
  }
}
