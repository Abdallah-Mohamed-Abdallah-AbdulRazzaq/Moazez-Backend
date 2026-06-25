import {
  AuditOutcome,
  MembershipStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import { LoginUseCase } from '../application/login.use-case';
import { PasswordService } from '../domain/password.service';
import { TokenService } from '../domain/token.service';
import { AuthRepository } from '../infrastructure/auth.repository';
import { InvalidCredentialsException } from '../domain/auth.exceptions';

describe('LoginUseCase', () => {
  const now = new Date('2026-06-25T08:00:00.000Z');

  function user() {
    return {
      id: 'user-1',
      email: 'user@example.com',
      username: 'user.one',
      contactEmail: 'contact@example.com',
      phone: null,
      passwordHash: 'hash',
      firstName: 'User',
      lastName: 'One',
      userType: UserType.SCHOOL_USER,
      status: UserStatus.ACTIVE,
      lastLoginAt: null,
      mustChangePassword: false,
      passwordChangedAt: null,
      passwordProvisionedAt: null,
      credentialVersion: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      memberships: [
        {
          id: 'membership-1',
          userId: 'user-1',
          organizationId: 'org-1',
          schoolId: 'school-1',
          roleId: 'role-1',
          userType: UserType.SCHOOL_USER,
          status: MembershipStatus.ACTIVE,
          startedAt: now,
          endedAt: null,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
          role: {
            id: 'role-1',
            schoolId: 'school-1',
            key: 'school_admin',
            name: 'School Admin',
            description: null,
            isSystem: true,
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
            rolePermissions: [],
          },
        },
      ],
    };
  }

  function buildUseCase(overrides?: {
    foundUser?: ReturnType<typeof user> | null;
  }) {
    const foundUser =
      overrides && 'foundUser' in overrides ? overrides.foundUser : user();
    const authRepository = {
      findUserByEmail: jest.fn().mockResolvedValue(foundUser),
      createSession: jest.fn().mockResolvedValue(undefined),
      updateUserLastLogin: jest.fn().mockResolvedValue(undefined),
      createAuditLog: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuthRepository & Record<string, jest.Mock>;
    const passwordService = {
      verify: jest.fn().mockResolvedValue(true),
    } as unknown as PasswordService & Record<string, jest.Mock>;
    const tokenService = {
      issueTokens: jest.fn().mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        refreshTokenHash: 'refresh-hash',
        refreshSessionId: 'session-1',
        expiresIn: 900,
        refreshExpiresAt: new Date('2026-06-26T08:00:00.000Z'),
      }),
    } as unknown as TokenService & Record<string, jest.Mock>;

    return {
      useCase: new LoginUseCase(
        authRepository,
        passwordService,
        tokenService,
      ),
      authRepository,
      passwordService,
      tokenService,
    };
  }

  it('trims and lowercases the login email before lookup', async () => {
    const mocks = buildUseCase();

    const result = await mocks.useCase.execute({
      email: '  USER@EXAMPLE.COM  ',
      password: 'UserPassword123!',
    });

    expect(mocks.authRepository.findUserByEmail).toHaveBeenCalledWith(
      'user@example.com',
    );
    expect(result.user.email).toBe('user@example.com');
    expect(mocks.authRepository.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'auth.login',
        outcome: AuditOutcome.SUCCESS,
      }),
    );
  });

  it('audits invalid unknown-user login with the normalized identifier', async () => {
    const mocks = buildUseCase({ foundUser: null });

    await expect(
      mocks.useCase.execute({
        email: '  Missing@Example.COM  ',
        password: 'whatever',
      }),
    ).rejects.toBeInstanceOf(InvalidCredentialsException);

    expect(mocks.authRepository.findUserByEmail).toHaveBeenCalledWith(
      'missing@example.com',
    );
    expect(mocks.authRepository.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: AuditOutcome.FAILURE,
        after: { reason: 'user_not_found', email: 'missing@example.com' },
      }),
    );
    expect(JSON.stringify(mocks.authRepository.createAuditLog.mock.calls)).not.toContain(
      'Missing@Example.COM',
    );
  });
});
