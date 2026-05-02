import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { UserType } from '@prisma/client';
import { TokenInvalidException } from '../../../modules/iam/auth/domain/auth.exceptions';
import { RealtimeAuthService } from '../realtime-auth.service';
import { RealtimeCommunicationAccessService } from '../realtime-communication-access.service';
import { RealtimePresenceService } from '../realtime-presence.service';
import { RealtimeGateway } from '../realtime.gateway';
import { RealtimePublisherService } from '../realtime-publisher.service';
import { RealtimeTypingService } from '../realtime-typing.service';
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
      presenceServiceMock(),
      typingServiceMock(),
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
      presenceServiceMock(),
      typingServiceMock(),
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

  it('registers authenticated socket presence when presence is enabled', async () => {
    const presenceService = presenceServiceMock();
    const gateway = new RealtimeGateway(
      authServiceMock({
        authenticate: jest.fn().mockResolvedValue(authenticatedContext()),
      }),
      accessServiceMock(),
      publisherMock(),
      configServiceMock(),
      presenceService,
      typingServiceMock(),
    );
    const client = socketMock();

    await gateway.handleConnection(client);

    expect(presenceService.registerSocket).toHaveBeenCalledWith({
      schoolId: 'school-1',
      userId: 'user-1',
      socketId: 'socket-1',
    });
  });

  it('does not register socket presence when presence is disabled by policy', async () => {
    const presenceService = presenceServiceMock();
    const gateway = new RealtimeGateway(
      authServiceMock({
        authenticate: jest.fn().mockResolvedValue(authenticatedContext()),
      }),
      accessServiceMock({
        isOnlinePresenceEnabled: jest.fn().mockResolvedValue(false),
      }),
      publisherMock(),
      configServiceMock(),
      presenceService,
      typingServiceMock(),
    );
    const client = socketMock();

    await gateway.handleConnection(client);

    expect(presenceService.registerSocket).not.toHaveBeenCalled();
  });

  it('unregisters socket presence on authenticated disconnects', async () => {
    const presenceService = presenceServiceMock();
    const gateway = new RealtimeGateway(
      authServiceMock(),
      accessServiceMock(),
      publisherMock(),
      configServiceMock(),
      presenceService,
      typingServiceMock(),
    );
    const client = socketMock(authenticatedSocketData());

    await gateway.handleDisconnect(client);

    expect(presenceService.unregisterSocket).toHaveBeenCalledWith({
      schoolId: 'school-1',
      userId: 'user-1',
      socketId: 'socket-1',
    });
  });

  it('ignores disconnects with incomplete socket context', async () => {
    const presenceService = presenceServiceMock();
    const gateway = new RealtimeGateway(
      authServiceMock(),
      accessServiceMock(),
      publisherMock(),
      configServiceMock(),
      presenceService,
      typingServiceMock(),
    );

    await expect(
      gateway.handleDisconnect(socketMock()),
    ).resolves.toBeUndefined();
    expect(presenceService.unregisterSocket).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated conversation joins', async () => {
    const gateway = new RealtimeGateway(
      authServiceMock(),
      accessServiceMock(),
      publisherMock(),
      configServiceMock(),
      presenceServiceMock(),
      typingServiceMock(),
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
      presenceServiceMock(),
      typingServiceMock(),
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
      presenceServiceMock(),
      typingServiceMock(),
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
      presenceServiceMock(),
      typingServiceMock(),
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

  it('rejects unauthenticated typing start commands', async () => {
    const typingService = typingServiceMock();
    const gateway = new RealtimeGateway(
      authServiceMock(),
      accessServiceMock(),
      publisherMock(),
      configServiceMock(),
      presenceServiceMock(),
      typingService,
    );
    const client = socketMock();

    await expect(
      gateway.handleTypingStart(client, { conversationId: 'conversation-1' }),
    ).rejects.toThrow();
    expect(typingService.startTyping).not.toHaveBeenCalled();
  });

  it('passes authenticated typing start commands to the typing service', async () => {
    const typingService = typingServiceMock();
    const gateway = new RealtimeGateway(
      authServiceMock(),
      accessServiceMock(),
      publisherMock(),
      configServiceMock(),
      presenceServiceMock(),
      typingService,
    );
    const client = socketMock(authenticatedSocketData());

    await expect(
      gateway.handleTypingStart(client, { conversationId: 'conversation-1' }),
    ).resolves.toEqual({ ok: true });

    expect(typingService.startTyping).toHaveBeenCalledWith({
      schoolId: 'school-1',
      conversationId: 'conversation-1',
      userId: 'user-1',
      permissions: ['communication.messages.view'],
    });
  });

  it('passes authenticated typing stop commands to the typing service', async () => {
    const typingService = typingServiceMock();
    const gateway = new RealtimeGateway(
      authServiceMock(),
      accessServiceMock(),
      publisherMock(),
      configServiceMock(),
      presenceServiceMock(),
      typingService,
    );
    const client = socketMock(authenticatedSocketData());

    await expect(
      gateway.handleTypingStop(client, { conversationId: 'conversation-1' }),
    ).resolves.toEqual({ ok: true });

    expect(typingService.stopTyping).toHaveBeenCalledWith({
      schoolId: 'school-1',
      conversationId: 'conversation-1',
      userId: 'user-1',
      permissions: ['communication.messages.view'],
    });
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
  return authenticatedContext();
}

function authenticatedContext() {
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

function authServiceMock(
  overrides?: Partial<jest.Mocked<RealtimeAuthService>>,
): jest.Mocked<RealtimeAuthService> {
  return {
    authenticate: jest.fn(),
    ...(overrides ?? {}),
  } as unknown as jest.Mocked<RealtimeAuthService>;
}

function accessServiceMock(
  overrides?: Partial<jest.Mocked<RealtimeCommunicationAccessService>>,
): jest.Mocked<RealtimeCommunicationAccessService> {
  return {
    canJoinConversationRoom: jest.fn().mockResolvedValue(true),
    isOnlinePresenceEnabled: jest.fn().mockResolvedValue(true),
    ...(overrides ?? {}),
  } as unknown as jest.Mocked<RealtimeCommunicationAccessService>;
}

function publisherMock(): RealtimePublisherService {
  return {
    bindServer: jest.fn(),
  } as unknown as RealtimePublisherService;
}

function presenceServiceMock(): jest.Mocked<RealtimePresenceService> {
  return {
    registerSocket: jest.fn().mockResolvedValue(null),
    unregisterSocket: jest.fn().mockResolvedValue(null),
    getPresenceSnapshot: jest.fn(),
    onModuleDestroy: jest.fn(),
  } as unknown as jest.Mocked<RealtimePresenceService>;
}

function typingServiceMock(): jest.Mocked<RealtimeTypingService> {
  return {
    startTyping: jest.fn().mockResolvedValue(undefined),
    stopTyping: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<RealtimeTypingService>;
}

function configServiceMock(): ConfigService {
  return {
    get: jest.fn(),
  } as unknown as ConfigService;
}
