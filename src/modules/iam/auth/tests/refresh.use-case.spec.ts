import { UserStatus, UserType } from '@prisma/client';
import { RefreshUseCase } from '../application/refresh.use-case';
import { TokenService } from '../domain/token.service';
import { AuthRepository } from '../infrastructure/auth.repository';

describe('RefreshUseCase', () => {
  it('persists the observational client IP on the rotated replacement session', async () => {
    const authRepository = {
      findSessionById: jest.fn().mockResolvedValue({
        id: 'old-session',
        userId: 'user-1',
        refreshTokenHash: 'submitted-hash',
        revokedAt: null,
        expiresAt: new Date('2099-01-01T00:00:00.000Z'),
      }),
      findUserById: jest.fn().mockResolvedValue({
        id: 'user-1',
        email: 'user@example.test',
        username: 'user.one',
        contactEmail: 'contact@example.test',
        firstName: 'User',
        lastName: 'One',
        userType: UserType.SCHOOL_USER,
        status: UserStatus.ACTIVE,
        mustChangePassword: false,
      }),
      revokeSession: jest.fn().mockResolvedValue(undefined),
      revokeUserSessions: jest.fn().mockResolvedValue(undefined),
      createSession: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuthRepository & Record<string, jest.Mock>;
    const tokenService = {
      verifyRefreshToken: jest.fn().mockResolvedValue({ sid: 'old-session' }),
      hashRefreshToken: jest.fn().mockReturnValue('submitted-hash'),
      issueTokens: jest.fn().mockResolvedValue({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        refreshTokenHash: 'new-refresh-hash',
        refreshSessionId: 'new-session',
        expiresIn: 900,
        refreshExpiresAt: new Date('2099-01-08T00:00:00.000Z'),
      }),
    } as unknown as TokenService & Record<string, jest.Mock>;
    const useCase = new RefreshUseCase(authRepository, tokenService);

    await useCase.execute({
      refreshToken: 'submitted-token',
      userAgent: 'jest-agent',
      ipAddress: '2001:db8::41',
    });

    expect(authRepository.revokeSession).toHaveBeenCalledWith('old-session');
    expect(authRepository.createSession).toHaveBeenCalledWith({
      sessionId: 'new-session',
      userId: 'user-1',
      refreshTokenHash: 'new-refresh-hash',
      userAgent: 'jest-agent',
      ipAddress: '2001:db8::41',
      expiresAt: new Date('2099-01-08T00:00:00.000Z'),
    });
  });
});
