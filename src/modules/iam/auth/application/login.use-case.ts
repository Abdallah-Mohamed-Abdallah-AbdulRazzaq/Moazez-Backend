import { Injectable } from '@nestjs/common';
import { AuditOutcome, UserStatus } from '@prisma/client';
import type { LoginResponseDto } from '../dto/login-response.dto';
import {
  AccountDisabledException,
  InvalidCredentialsException,
} from '../domain/auth.exceptions';
import { PasswordService } from '../domain/password.service';
import { TokenService } from '../domain/token.service';
import { AuthRepository } from '../infrastructure/auth.repository';

export interface LoginCommand {
  email: string;
  password: string;
  userAgent?: string | null;
  ipAddress?: string | null;
}

@Injectable()
export class LoginUseCase {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
  ) {}

  async execute(command: LoginCommand): Promise<LoginResponseDto> {
    const user = await this.authRepository.findUserByEmail(command.email);

    if (!user || !user.passwordHash) {
      await this.authRepository.createAuditLog({
        module: 'iam',
        action: 'auth.login',
        resourceType: 'session',
        outcome: AuditOutcome.FAILURE,
        ipAddress: command.ipAddress,
        userAgent: command.userAgent,
        after: { reason: 'user_not_found', email: command.email },
      });
      throw new InvalidCredentialsException();
    }

    const passwordValid = await this.passwordService.verify(
      user.passwordHash,
      command.password,
    );
    if (!passwordValid) {
      await this.authRepository.createAuditLog({
        actorId: user.id,
        userType: user.userType,
        module: 'iam',
        action: 'auth.login',
        resourceType: 'session',
        outcome: AuditOutcome.FAILURE,
        ipAddress: command.ipAddress,
        userAgent: command.userAgent,
        after: { reason: 'invalid_password' },
      });
      throw new InvalidCredentialsException();
    }

    if (user.status !== UserStatus.ACTIVE) {
      await this.authRepository.createAuditLog({
        actorId: user.id,
        userType: user.userType,
        module: 'iam',
        action: 'auth.login',
        resourceType: 'session',
        outcome: AuditOutcome.FAILURE,
        ipAddress: command.ipAddress,
        userAgent: command.userAgent,
        after: { reason: 'account_disabled', status: user.status },
      });
      throw new AccountDisabledException();
    }

    const tokens = await this.tokenService.issueTokens(user.id, user.userType);

    const membership = user.memberships[0];

    await this.authRepository.createSession({
      sessionId: tokens.refreshSessionId,
      userId: user.id,
      refreshTokenHash: tokens.refreshTokenHash,
      userAgent: command.userAgent,
      ipAddress: command.ipAddress,
      expiresAt: tokens.refreshExpiresAt,
    });

    await this.authRepository.updateUserLastLogin(user.id);

    await this.authRepository.createAuditLog({
      actorId: user.id,
      userType: user.userType,
      organizationId: membership?.organizationId ?? null,
      schoolId: membership?.schoolId ?? null,
      module: 'iam',
      action: 'auth.login',
      resourceType: 'session',
      resourceId: tokens.refreshSessionId,
      outcome: AuditOutcome.SUCCESS,
      ipAddress: command.ipAddress,
      userAgent: command.userAgent,
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
