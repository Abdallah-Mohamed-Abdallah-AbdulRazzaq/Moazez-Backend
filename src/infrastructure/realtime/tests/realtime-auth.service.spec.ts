import { UserType } from '@prisma/client';
import {
  createRequestContext,
  getRequestContext,
  runWithRequestContext,
} from '../../../common/context/request-context';
import {
  ScopeMissingException,
  SessionRevokedException,
  TokenInvalidException,
} from '../../../modules/iam/auth/domain/auth.exceptions';
import type { TokenService } from '../../../modules/iam/auth/domain/token.service';
import type { AuthRepository } from '../../../modules/iam/auth/infrastructure/auth.repository';
import { RealtimeAuthService } from '../realtime-auth.service';
import type { RealtimeSocket } from '../realtime.types';

describe('RealtimeAuthService', () => {
  it('rejects a missing handshake token', async () => {
    const service = new RealtimeAuthService(
      tokenServiceMock(),
      authRepositoryMock(),
    );

    await expect(
      service.authenticate(socketWithAuth({})),
    ).rejects.toBeInstanceOf(TokenInvalidException);
  });

  it('rejects a revoked session', async () => {
    const tokenService = tokenServiceMock({
      verifyAccessToken: jest.fn().mockResolvedValue(accessPayload()),
    });
    const authRepository = authRepositoryMock({
      findSessionById: jest.fn().mockResolvedValue({
        id: 'session-1',
        revokedAt: new Date(),
      }),
    });
    const service = new RealtimeAuthService(tokenService, authRepository);

    await expect(
      service.authenticate(socketWithAuth({ token: 'access-token' })),
    ).rejects.toBeInstanceOf(SessionRevokedException);
  });

  it('requires a school-scoped active membership', async () => {
    const tokenService = tokenServiceMock({
      verifyAccessToken: jest.fn().mockResolvedValue(accessPayload()),
    });
    const authRepository = authRepositoryMock({
      findSessionById: jest.fn().mockResolvedValue({
        id: 'session-1',
        revokedAt: null,
      }),
      findUserById: jest.fn().mockResolvedValue(userWithMembership(null)),
    });
    const service = new RealtimeAuthService(tokenService, authRepository);

    await expect(
      service.authenticate(socketWithAuth({ token: 'access-token' })),
    ).rejects.toBeInstanceOf(ScopeMissingException);
  });

  it('accepts a valid token and writes the socket request context', async () => {
    const tokenService = tokenServiceMock({
      verifyAccessToken: jest.fn().mockResolvedValue(accessPayload()),
    });
    const authRepository = authRepositoryMock({
      findSessionById: jest.fn().mockResolvedValue({
        id: 'session-1',
        revokedAt: null,
      }),
      findUserById: jest.fn().mockResolvedValue(userWithMembership('school-1')),
    });
    const service = new RealtimeAuthService(tokenService, authRepository);

    await runWithRequestContext(
      createRequestContext('socket-test'),
      async () => {
        const authenticated = await service.authenticate(
          socketWithAuth({ token: 'access-token' }),
        );

        expect(authenticated).toEqual({
          actorId: 'user-1',
          userType: UserType.SCHOOL_USER,
          membershipId: 'membership-1',
          schoolId: 'school-1',
          organizationId: 'organization-1',
          roleId: 'role-1',
          permissions: [
            'communication.conversations.view',
            'communication.messages.view',
          ],
          sessionId: 'session-1',
        });
        expect(getRequestContext()).toMatchObject({
          actor: { id: 'user-1', userType: UserType.SCHOOL_USER },
          activeMembership: {
            membershipId: 'membership-1',
            schoolId: 'school-1',
            organizationId: 'organization-1',
            roleId: 'role-1',
            permissions: [
              'communication.conversations.view',
              'communication.messages.view',
            ],
          },
        });
      },
    );
  });

  it('accepts a bearer authorization header', async () => {
    const tokenService = tokenServiceMock({
      verifyAccessToken: jest.fn().mockResolvedValue(accessPayload()),
    });
    const authRepository = authRepositoryMock({
      findSessionById: jest.fn().mockResolvedValue({
        id: 'session-1',
        revokedAt: null,
      }),
      findUserById: jest.fn().mockResolvedValue(userWithMembership('school-1')),
    });
    const service = new RealtimeAuthService(tokenService, authRepository);

    await service.authenticate(
      socketWithAuth({}, { authorization: 'Bearer header-token' }),
    );

    expect(tokenService.verifyAccessToken).toHaveBeenCalledWith('header-token');
  });
});

function accessPayload() {
  return {
    sub: 'user-1',
    type: 'access',
    userType: UserType.SCHOOL_USER,
    sid: 'session-1',
  };
}

function userWithMembership(schoolId: string | null) {
  return {
    id: 'user-1',
    userType: UserType.SCHOOL_USER,
    memberships: [
      {
        id: 'membership-1',
        schoolId,
        organizationId: 'organization-1',
        roleId: 'role-1',
        role: {
          rolePermissions: [
            { permission: { code: 'communication.conversations.view' } },
            { permission: { code: 'communication.messages.view' } },
          ],
        },
      },
    ],
  };
}

function socketWithAuth(
  auth: Record<string, unknown>,
  headers: Record<string, string> = {},
): Pick<RealtimeSocket, 'handshake'> {
  return {
    handshake: {
      auth,
      headers,
    },
  } as unknown as Pick<RealtimeSocket, 'handshake'>;
}

function tokenServiceMock(
  overrides?: Partial<jest.Mocked<TokenService>>,
): jest.Mocked<TokenService> {
  return {
    verifyAccessToken: jest.fn(),
    verifyRefreshToken: jest.fn(),
    issueTokens: jest.fn(),
    hashRefreshToken: jest.fn(),
    ...overrides,
  } as unknown as jest.Mocked<TokenService>;
}

function authRepositoryMock(
  overrides?: Partial<jest.Mocked<AuthRepository>>,
): jest.Mocked<AuthRepository> {
  return {
    findSessionById: jest.fn(),
    findUserById: jest.fn(),
    findUserByEmail: jest.fn(),
    createSession: jest.fn(),
    findActiveSessionByHash: jest.fn(),
    revokeSession: jest.fn(),
    updateUserLastLogin: jest.fn(),
    createAuditLog: jest.fn(),
    ...overrides,
  } as unknown as jest.Mocked<AuthRepository>;
}
