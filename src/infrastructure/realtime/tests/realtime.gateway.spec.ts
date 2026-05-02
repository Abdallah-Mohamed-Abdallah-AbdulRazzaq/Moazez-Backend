import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { UserType } from '@prisma/client';
import { TokenInvalidException } from '../../../modules/iam/auth/domain/auth.exceptions';
import { RealtimeAuthService } from '../realtime-auth.service';
import { RealtimeCommunicationAccessService } from '../realtime-communication-access.service';
import { RealtimeGateway } from '../realtime.gateway';
import { RealtimePublisherService } from '../realtime-publisher.service';
import type { RealtimeSocket } from '../realtime.types';

describe('RealtimeGateway', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('disconnects unauthenticated sockets without joining tenant rooms', async () => {
    const authService = {
      authenticate: jest.fn().mockRejectedValue(new TokenInvalidException()),
    } as unknown as RealtimeAuthService;
    const gateway = new RealtimeGateway(
      authService,
      accessServiceMock(),
      publisherMock(),
      configServiceMock(),
    );
    const client = socketMock();

    await gateway.handleConnection(client);

    expect(client.join).not.toHaveBeenCalled();
    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(client.data).toEqual({});
  });

  it('joins authenticated sockets to school and user baseline rooms', async () => {
    const authenticated = {
      actorId: 'user-1',
      userType: UserType.SCHOOL_USER,
      membershipId: 'membership-1',
      schoolId: 'school-1',
      organizationId: 'organization-1',
      roleId: 'role-1',
      permissions: ['communication.messages.view'],
      sessionId: 'session-1',
    };
    const authService = {
      authenticate: jest.fn().mockResolvedValue(authenticated),
    } as unknown as RealtimeAuthService;
    const gateway = new RealtimeGateway(
      authService,
      accessServiceMock(),
      publisherMock(),
      configServiceMock(),
    );
    const client = socketMock();

    await gateway.handleConnection(client);

    expect(client.data).toMatchObject(authenticated);
    expect(client.join).toHaveBeenCalledWith([
      'school:school-1',
      'school:school-1:user:user-1',
    ]);
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated conversation joins', async () => {
    const gateway = new RealtimeGateway(
      authServiceMock(),
      accessServiceMock(),
      publisherMock(),
      configServiceMock(),
    );
    const client = socketMock();

    await expect(
      gateway.handleConversationJoin(client, {
        conversationId: 'conversation-1',
      }),
    ).rejects.toThrow();
    expect(client.join).not.toHaveBeenCalled();
  });

  it('validates conversation access before joining a conversation room', async () => {
    const accessService = accessServiceMock({
      canJoinConversationRoom: jest.fn().mockResolvedValue(false),
    });
    const gateway = new RealtimeGateway(
      authServiceMock(),
      accessService,
      publisherMock(),
      configServiceMock(),
    );
    const client = socketMock(authenticatedSocketData());

    await expect(
      gateway.handleConversationJoin(client, {
        conversationId: 'conversation-1',
      }),
    ).rejects.toThrow();

    expect(accessService.canJoinConversationRoom).toHaveBeenCalledWith({
      conversationId: 'conversation-1',
      actorId: 'user-1',
      permissions: ['communication.messages.view'],
    });
    expect(client.join).not.toHaveBeenCalledWith(
      'school:school-1:conversation:conversation-1',
    );
  });

  it('joins authorized sockets to the expected conversation room', async () => {
    const gateway = new RealtimeGateway(
      authServiceMock(),
      accessServiceMock(),
      publisherMock(),
      configServiceMock(),
    );
    const client = socketMock(authenticatedSocketData());

    await expect(
      gateway.handleConversationJoin(client, {
        conversationId: 'conversation-1',
      }),
    ).resolves.toEqual({ ok: true });

    expect(client.join).toHaveBeenCalledWith(
      'school:school-1:conversation:conversation-1',
    );
  });

  it('leaves the expected conversation room for authenticated sockets', async () => {
    const gateway = new RealtimeGateway(
      authServiceMock(),
      accessServiceMock(),
      publisherMock(),
      configServiceMock(),
    );
    const client = socketMock(authenticatedSocketData());

    await expect(
      gateway.handleConversationLeave(client, {
        conversationId: 'conversation-1',
      }),
    ).resolves.toEqual({ ok: true });

    expect(client.leave).toHaveBeenCalledWith(
      'school:school-1:conversation:conversation-1',
    );
  });
});

function socketMock(data: RealtimeSocket['data'] = {}): RealtimeSocket {
  return {
    id: 'socket-1',
    data,
    handshake: {
      auth: {},
      headers: {},
    },
    join: jest.fn().mockResolvedValue(undefined),
    leave: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn(),
  } as unknown as RealtimeSocket;
}

function authenticatedSocketData(): RealtimeSocket['data'] {
  return {
    actorId: 'user-1',
    userType: UserType.SCHOOL_USER,
    membershipId: 'membership-1',
    schoolId: 'school-1',
    organizationId: 'organization-1',
    roleId: 'role-1',
    permissions: ['communication.messages.view'],
    sessionId: 'session-1',
  };
}

function authServiceMock(): RealtimeAuthService {
  return {
    authenticate: jest.fn(),
  } as unknown as RealtimeAuthService;
}

function accessServiceMock(
  overrides?: Partial<jest.Mocked<RealtimeCommunicationAccessService>>,
): jest.Mocked<RealtimeCommunicationAccessService> {
  return {
    canJoinConversationRoom: jest.fn().mockResolvedValue(true),
    ...(overrides ?? {}),
  } as unknown as jest.Mocked<RealtimeCommunicationAccessService>;
}

function publisherMock(): RealtimePublisherService {
  return {
    bindServer: jest.fn(),
  } as unknown as RealtimePublisherService;
}

function configServiceMock(): ConfigService {
  return {
    get: jest.fn(),
  } as unknown as ConfigService;
}
