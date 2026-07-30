import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { UserType } from '@prisma/client';
import { GATEWAY_OPTIONS } from '@nestjs/websockets/constants';
import { Adapter } from 'socket.io-adapter';
import {
  applicationCorsOriginDelegate,
  configureApplicationCorsOrigins,
} from '../../../bootstrap/application-cors.policy';
import { ApplicationLifecycleState } from '../../../bootstrap/application-lifecycle.state';
import { getRequestContext } from '../../../common/context/request-context';
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
    configureApplicationCorsOrigins([]);
  });

  it('uses the shared HTTP and Socket.IO CORS decision helper', () => {
    const options = Reflect.getMetadata(GATEWAY_OPTIONS, RealtimeGateway) as {
      cors: { origin: unknown; credentials: boolean };
    };

    expect(options.cors).toEqual({
      origin: applicationCorsOriginDelegate,
      credentials: true,
    });
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
      actor: actorCard(),
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

  it('stores one canonical request ID from the WebSocket handshake', async () => {
    const gateway = new RealtimeGateway(
      authServiceMock({
        authenticate: jest.fn().mockResolvedValue(authenticatedContext()),
      }),
      accessServiceMock(),
      publisherMock(),
      configServiceMock(),
      presenceServiceMock(),
      typingServiceMock(),
    );
    const client = socketMock({}, { 'x-request-id': 'socket-request-1' });

    await gateway.handleConnection(client);

    expect(client.data.requestId).toBe('socket-request-1');
  });

  it('replaces an invalid WebSocket handshake request ID', async () => {
    const gateway = new RealtimeGateway(
      authServiceMock({
        authenticate: jest.fn().mockResolvedValue(authenticatedContext()),
      }),
      accessServiceMock(),
      publisherMock(),
      configServiceMock(),
      presenceServiceMock(),
      typingServiceMock(),
    );
    const invalid = 'x'.repeat(129);
    const client = socketMock({}, { 'x-request-id': invalid });

    await gateway.handleConnection(client);

    expect(client.data.requestId).not.toBe(invalid);
    expect(client.data.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu,
    );
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
      actor: actorCard(),
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
      actor: actorCard(),
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
    const publisher = publisherMock();
    const presenceService = presenceServiceMock();
    const typingService = typingServiceMock();
    const gateway = new RealtimeGateway(
      authServiceMock(),
      accessServiceMock(),
      publisher,
      configServiceMock(),
      presenceService,
      typingService,
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
    expect(publisher.publishToConversation).not.toHaveBeenCalled();
    expect(publisher.publishToUser).not.toHaveBeenCalled();
    expect(publisher.publishToSchool).not.toHaveBeenCalled();
    expect(presenceService.registerSocket).not.toHaveBeenCalled();
    expect(typingService.startTyping).not.toHaveBeenCalled();
    expect(typingService.stopTyping).not.toHaveBeenCalled();
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
      actor: actorCard(),
    });
  });

  it('uses the canonical handshake ID for subsequent command contexts', async () => {
    const typingService = typingServiceMock();
    typingService.startTyping.mockImplementation(async () => {
      expect(getRequestContext()?.requestId).toBe('socket-request-1');
    });
    const gateway = new RealtimeGateway(
      authServiceMock(),
      accessServiceMock(),
      publisherMock(),
      configServiceMock(),
      presenceServiceMock(),
      typingService,
    );
    const client = socketMock(
      {
        ...authenticatedSocketData(),
        requestId: 'socket-request-1',
      },
      { 'x-request-id': 'later-header-must-not-replace-context' },
    );

    await gateway.handleTypingStart(client, {
      conversationId: 'conversation-1',
    });

    expect(typingService.startTyping).toHaveBeenCalledTimes(1);
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
      actor: actorCard(),
    });
  });

  it('rejects new socket connections after draining begins', async () => {
    const lifecycle = new ApplicationLifecycleState();
    lifecycle.beginDraining();
    const authService = authServiceMock({
      authenticate: jest.fn().mockResolvedValue(authenticatedContext()),
    });
    const gateway = new RealtimeGateway(
      authService,
      accessServiceMock(),
      publisherMock(),
      configServiceMock(),
      presenceServiceMock(),
      typingServiceMock(),
      lifecycle,
    );
    const client = socketMock();

    await gateway.handleConnection(client);

    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(authService.authenticate).not.toHaveBeenCalled();
  });

  it('rejects handshakes at the Socket.IO namespace after draining begins', async () => {
    const lifecycle = new ApplicationLifecycleState();
    const server = {
      use: jest.fn(),
      adapter: jest.fn(),
      disconnectSockets: jest.fn(),
    };
    const gateway = new RealtimeGateway(
      authServiceMock(),
      accessServiceMock(),
      publisherMock(),
      configServiceMock(),
      presenceServiceMock(),
      typingServiceMock(),
      lifecycle,
    );
    await gateway.afterInit(server as never);
    const handshakeGuard = server.use.mock.calls[0][0] as (
      socket: unknown,
      next: (error?: Error) => void,
    ) => void;
    const next = jest.fn();

    lifecycle.beginDraining();
    handshakeGuard({}, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect((next.mock.calls[0][0] as Error).message).toBe('realtime.shutdown');
  });

  it('rejects handshakes while the adapter is initializing', async () => {
    const server = {
      use: jest.fn(),
      adapter: jest.fn(),
      disconnectSockets: jest.fn(),
      sockets: new Map(),
    };
    const gateway = new RealtimeGateway(
      authServiceMock(),
      accessServiceMock(),
      publisherMock(),
      configServiceMock(),
      presenceServiceMock(),
      typingServiceMock(),
    );

    const initialization = gateway.afterInit(server as never);
    const handshakeGuard = server.use.mock.calls[0][0] as (
      socket: unknown,
      next: (error?: Error) => void,
    ) => void;
    const next = jest.fn();
    handshakeGuard({}, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect((next.mock.calls[0][0] as Error).message).toBe(
      'realtime.unavailable',
    );
    await initialization;
  });

  it('rechecks adapter generation after authentication before joining rooms', async () => {
    const authentication = deferred<ReturnType<typeof authenticatedContext>>();
    const presence = presenceServiceMock();
    const gateway = new RealtimeGateway(
      authServiceMock({
        authenticate: jest.fn().mockReturnValue(authentication.promise),
      }),
      accessServiceMock(),
      publisherMock(),
      configServiceMock(),
      presence,
      typingServiceMock(),
    );
    const client = socketMock();
    Object.assign(gateway, {
      server: { sockets: new Map() },
      adapterLifecycleState: 'ready',
      adapterGeneration: 1,
    });

    const connection = gateway.handleConnection(client);
    await Promise.resolve();
    Object.assign(gateway, {
      adapterLifecycleState: 'recovering',
      adapterGeneration: 2,
    });
    authentication.resolve(authenticatedContext());
    await connection;

    expect(client.join).not.toHaveBeenCalled();
    expect(presence.registerSocket).not.toHaveBeenCalled();
    expect(client.disconnect).toHaveBeenCalledWith(true);
  });

  it('rejects new commands while allowing an admitted command to finish', async () => {
    const lifecycle = new ApplicationLifecycleState();
    const completion = deferred<void>();
    const typingService = typingServiceMock();
    typingService.startTyping.mockReturnValue(completion.promise);
    const gateway = new RealtimeGateway(
      authServiceMock(),
      accessServiceMock(),
      publisherMock(),
      configServiceMock(),
      presenceServiceMock(),
      typingService,
      lifecycle,
    );
    const client = socketMock(authenticatedSocketData());

    const admitted = gateway.handleTypingStart(client, {
      conversationId: 'conversation-1',
    });
    await Promise.resolve();
    expect(lifecycle.getActiveWorkCount()).toBe(1);

    lifecycle.beginDraining();
    await expect(
      gateway.handleTypingStop(client, {
        conversationId: 'conversation-1',
      }),
    ).rejects.toThrow();

    let idle = false;
    const drain = lifecycle.waitForIdle().then(() => {
      idle = true;
    });
    await Promise.resolve();
    expect(idle).toBe(false);

    completion.resolve();
    await admitted;
    await drain;
    expect(idle).toBe(true);
  });

  it('disconnects sockets once and awaits presence cleanup during shutdown', async () => {
    const lifecycle = new ApplicationLifecycleState();
    const presenceCompletion = deferred<null>();
    const presenceService = presenceServiceMock();
    presenceService.unregisterSocket.mockReturnValue(
      presenceCompletion.promise,
    );
    const gateway = new RealtimeGateway(
      authServiceMock(),
      accessServiceMock(),
      publisherMock(),
      configServiceMock(),
      presenceService,
      typingServiceMock(),
      lifecycle,
    );
    const localSocket = localSocketFixture({
      data: authenticatedSocketData(),
      onDisconnect: (socket) => gateway.handleDisconnect(socket),
    });
    const namespace = {
      server: { adapter: jest.fn() },
      use: jest.fn(),
      sockets: new Map([[localSocket.id, localSocket]]),
      disconnectSockets: jest.fn(),
    };
    await gateway.afterInit(namespace as never);

    expect(localSocket.connected).toBe(true);
    expect(namespace.sockets.get(localSocket.id)).toBe(localSocket);

    let shutdownSettled = false;
    const first = gateway.disconnectSocketsForShutdown();
    const second = gateway.disconnectSocketsForShutdown();
    void first.then(
      () => {
        shutdownSettled = true;
      },
      () => {
        shutdownSettled = true;
      },
    );

    expect(second).toBe(first);
    expect(localSocket.disconnect).toHaveBeenCalledTimes(1);
    expect(localSocket.disconnect).toHaveBeenCalledWith(true);
    expect(namespace.disconnectSockets).not.toHaveBeenCalled();
    expect(presenceService.unregisterSocket).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    expect(shutdownSettled).toBe(false);

    presenceCompletion.resolve(null);
    await Promise.all([first, second]);
    expect(shutdownSettled).toBe(true);
    expect(localSocket.disconnect).toHaveBeenCalledTimes(1);
    expect(presenceService.unregisterSocket).toHaveBeenCalledTimes(1);
    expect(namespace.disconnectSockets).not.toHaveBeenCalled();
  });

  it('blocks new admission and waits for owned adapter recovery during shutdown', async () => {
    const recovery = deferred<boolean>();
    const authService = authServiceMock({
      authenticate: jest.fn().mockResolvedValue(authenticatedContext()),
    });
    const gateway = new RealtimeGateway(
      authService,
      accessServiceMock(),
      publisherMock(),
      configServiceMock(),
      presenceServiceMock(),
      typingServiceMock(),
    );
    const localSocket = localSocketFixture();
    const namespace = {
      server: { adapter: jest.fn() },
      use: jest.fn(),
      sockets: new Map([[localSocket.id, localSocket]]),
      disconnectSockets: jest.fn(),
    };
    Object.assign(gateway, {
      server: namespace,
      adapterLifecycleState: 'recovering',
      redisAdapterReadinessPromise: recovery.promise,
    });

    expect(localSocket.connected).toBe(true);
    const shutdown = gateway.disconnectSocketsForShutdown();
    expect(localSocket.disconnect).not.toHaveBeenCalled();

    const admissionSocket = socketMock();
    await gateway.handleConnection(admissionSocket);
    expect(admissionSocket.disconnect).toHaveBeenCalledWith(true);
    expect(authService.authenticate).not.toHaveBeenCalled();
    expect(localSocket.disconnect).not.toHaveBeenCalled();
    expect(namespace.disconnectSockets).not.toHaveBeenCalled();

    recovery.resolve(false);
    await shutdown;
    expect(localSocket.disconnect).toHaveBeenCalledTimes(1);
    expect(localSocket.disconnect).toHaveBeenCalledWith(true);
    expect(namespace.disconnectSockets).not.toHaveBeenCalled();
  });

  it('restores the in-memory adapter before closing owned Redis clients', async () => {
    const gateway = new RealtimeGateway(
      authServiceMock(),
      accessServiceMock(),
      publisherMock(),
      configServiceMock(),
      presenceServiceMock(),
      typingServiceMock(),
    );
    const socketServer = { adapter: jest.fn() };
    const namespace = {
      server: socketServer,
      use: jest.fn(),
      sockets: new Map(),
      disconnectSockets: jest.fn(),
    };
    await gateway.afterInit(namespace as never);
    const publisher = {
      status: 'end',
      disconnect: jest.fn(),
    };
    const subscriber = {
      status: 'end',
      disconnect: jest.fn(),
    };
    Object.assign(gateway, {
      redisPublisher: publisher,
      redisSubscriber: subscriber,
    });

    await gateway.onModuleDestroy();

    expect(namespace.disconnectSockets).not.toHaveBeenCalled();
    expect(socketServer.adapter).toHaveBeenCalledWith(Adapter);
    expect(socketServer.adapter.mock.invocationCallOrder[0]).toBeLessThan(
      publisher.disconnect.mock.invocationCallOrder[0],
    );
    expect(publisher.disconnect).toHaveBeenCalledTimes(1);
    expect(subscriber.disconnect).toHaveBeenCalledTimes(1);
  });
});

function socketMock(
  data: RealtimeSocket['data'] = {},
  headers: Record<string, string | string[]> = {},
): RealtimeSocket {
  return {
    id: 'socket-1',
    data,
    handshake: {
      auth: {},
      headers,
    },
    join: jest.fn().mockResolvedValue(undefined),
    leave: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn(),
  } as unknown as RealtimeSocket;
}

type LocalSocketDouble = RealtimeSocket & {
  connected: boolean;
  once: jest.Mock;
  disconnect: jest.Mock;
};

function localSocketFixture(options?: {
  id?: string;
  data?: RealtimeSocket['data'];
  onDisconnect?: (socket: RealtimeSocket) => void | Promise<void>;
}): LocalSocketDouble {
  const disconnectListeners = new Set<(...args: unknown[]) => void>();
  const socket = {
    id: options?.id ?? 'local-socket-1',
    data: options?.data ?? {},
    handshake: {
      auth: {},
      headers: {},
    },
    connected: true,
    join: jest.fn().mockResolvedValue(undefined),
    leave: jest.fn().mockResolvedValue(undefined),
  } as unknown as LocalSocketDouble;

  socket.once = jest.fn(
    (event: string, listener: (...args: unknown[]) => void) => {
      if (event === 'disconnect') {
        disconnectListeners.add(listener);
      }
      return socket;
    },
  );
  socket.disconnect = jest.fn((close?: boolean) => {
    if (!socket.connected) return socket;

    socket.connected = false;
    const listeners = [...disconnectListeners];
    disconnectListeners.clear();
    for (const listener of listeners) {
      listener('server namespace disconnect');
    }
    void options?.onDisconnect?.(socket);
    return socket;
  });

  return socket;
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
    actor: actorCard(),
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
    listPresenceConversationIdsForActor: jest.fn(),
    ...(overrides ?? {}),
  } as unknown as jest.Mocked<RealtimeCommunicationAccessService>;
}

function publisherMock(): jest.Mocked<RealtimePublisherService> {
  return {
    bindServer: jest.fn(),
    publishToSchool: jest.fn().mockReturnValue(true),
    publishToUser: jest.fn().mockReturnValue(true),
    publishToConversation: jest.fn().mockReturnValue(true),
  } as unknown as jest.Mocked<RealtimePublisherService>;
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

function actorCard() {
  return {
    displayName: 'Test User',
    userType: 'admin' as const,
    avatarUrl: null,
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
